// 场景多资产编排导出（export）
//
// 一个界面场景通常由多个资产组成：按钮（九宫格）+ 面板（九宫格）+ 光晕（贴图）...
// scene.yaml 用 assets 声明，export 一次导出整套到引擎可导入目录。
//
// scene.yaml 示例：
//   name: main-menu
//   assets:
//     - name: start-btn        # 输出名（start-btn.png / start-btn/ninegrid.json）
//       selector: .btn-start   # CSS 选择器定位元素
//       nine: true             # true=九宫格切片（含边框参数）；false=整图贴图
//     - name: title-glow
//       selector: .glow
//       nine: false
//
// 输出结构（build/<场景>/export/）：
//   manifest.json          所有资产清单（名称/类型/尺寸/边框）
//   <name>.png             整图贴图（nine: false）或九宫格源图
//   <name>/ninegrid.json   九宫格参数（nine: true）
//   <name>/slice-*.png     九张切片（nine: true）

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveLaunchOptions, assertExecutablePath } from './browser.js';
import { detectNineSlice, locateTarget } from './slice.js';

/**
 * 导出场景的全部资产。
 * @param {object} opts
 * @param {string} opts.htmlPath    场景 HTML
 * @param {string} opts.framePath   源帧 PNG（f000.png）
 * @param {string} opts.outDir      输出目录（build/<场景>/export）
 * @param {Array<{name:string,selector:string,nine?:boolean}>} opts.assets
 * @param {object} opts.config      scene.yaml 配置（width/height/dpr）
 * @param {object} [opts.browser]   { channel, executablePath }
 * @returns {Promise<{manifest:object, files:string[]}>}
 */
export async function exportScene({
  htmlPath, framePath, outDir, assets, config,
  browser: browserOpts = {},
}) {
  if (!assets || assets.length === 0) throw new Error('scene.yaml 缺少 assets 声明');
  fs.mkdirSync(outDir, { recursive: true });
  const { channel = 'chromium', executablePath = null } = browserOpts;
  assertExecutablePath(executablePath);

  const launch = await chromium.launch(resolveLaunchOptions({ channel, executablePath }));
  const frameB64 = fs.readFileSync(framePath).toString('base64');
  const manifest = { scene: config.name ?? path.basename(path.dirname(htmlPath)), assets: [] };
  const files = [];

  try {
    const page = await launch.newPage();
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);

    for (const asset of assets) {
      const aOutDir = path.join(outDir, asset.name);
      fs.mkdirSync(aOutDir, { recursive: true });
      const assetInfo = { name: asset.name, selector: asset.selector, nine: !!asset.nine };

      if (asset.nine) {
        // 九宫格：定位元素 → 切片
        const box = await locateTarget(htmlPath, asset.selector, config.dpr, config.width, config.height);
        const result = await detectNineSlice(framePath, {
          targetBox: box,
          channel, executablePath,
        });
        // 写 9 张切片
        for (const [sname, dataURL] of Object.entries(result.slices)) {
          const f = path.join(aOutDir, `slice-${sname}.png`);
          fs.writeFileSync(f, Buffer.from(dataURL.split(',')[1], 'base64'));
          files.push(f);
        }
        // 写 ninegrid.json
        const meta = {
          asset: asset.name, selector: asset.selector,
          borders: result.borders,
          contentBox: result.contentBox,
          slices: Object.fromEntries(
            Object.entries(result.rects).map(([k, v]) => [k, { x: v[0], y: v[1], w: v[2], h: v[3] }])),
        };
        const mf = path.join(aOutDir, 'ninegrid.json');
        fs.writeFileSync(mf, JSON.stringify(meta, null, 2));
        files.push(mf);
        assetInfo.borders = result.borders;
        assetInfo.type = 'nine-slice';
        assetInfo.size = { w: result.contentBox.w, h: result.contentBox.h };
      } else {
        // 整图贴图：定位元素 → 裁剪内容区 → 单 PNG
        const box = await locateTarget(htmlPath, asset.selector, config.dpr, config.width, config.height);
        const crop = await page.evaluate(async ({ frameB64, box }) => {
          const img = new Image();
          img.src = 'data:image/png;base64,' + frameB64;
          await img.decode();
          // 元素区域内的内容 bbox（alpha≥32 收紧）
          const src = document.createElement('canvas');
          src.width = img.naturalWidth; src.height = img.naturalHeight;
          const sctx = src.getContext('2d');
          sctx.drawImage(img, 0, 0);
          const d = sctx.getImageData(0, 0, src.width, src.height).data;
          let minX = box.x + box.w, minY = box.y + box.h, maxX = box.x - 1, maxY = box.y - 1;
          for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
            if (d[(y * src.width + x) * 4 + 3] >= 32) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
          if (maxX < minX) { minX = box.x; minY = box.y; maxX = box.x + box.w - 1; maxY = box.y + box.h - 1; }
          const c = document.createElement('canvas');
          c.width = maxX - minX + 1; c.height = maxY - minY + 1;
          c.getContext('2d').drawImage(src, minX, minY, c.width, c.height, 0, 0, c.width, c.height);
          return c.toDataURL('image/png');
        }, { frameB64, box });
        const f = path.join(outDir, `${asset.name}.png`);
        fs.writeFileSync(f, Buffer.from(crop.split(',')[1], 'base64'));
        files.push(f);
        assetInfo.type = 'texture';
        assetInfo.size = { w: box.w, h: box.h };
      }
      manifest.assets.push(assetInfo);
    }

    const mf = path.join(outDir, 'manifest.json');
    fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
    files.push(mf);
    return { manifest, files };
  } finally {
    await launch.close();
  }
}
