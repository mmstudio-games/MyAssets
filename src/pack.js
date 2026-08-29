// 图集打包（MVP 一刀）：多个 PNG → 一张 atlas + 坐标清单 + Cocos .plist
//
// 两种用例：
//   1. 序列帧精灵图：一个动画的 N 帧合成一张 sprite sheet（引擎按 frame 尺寸切帧播放）
//   2. 多资产图集：多个按钮/贴图合成一张 atlas（省 DrawCall / 省内存）
//
// 排布算法：贪心 shelf（按高度降序，逐行放置）。MVP 够用；后续可换 maxrects。
// 输出：
//   atlas.png         合成大图（透明底）
//   atlas.json        引擎无关坐标（name → {x,y,w,h}）
//   atlas.plist       Cocos 图集描述（TexturePacker 兼容格式）

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { resolveLaunchOptions, assertExecutablePath } from './browser.js';

const MAX_ATLAS = 2048; // 纹理上限（常见 GPU 限制），可配置

/**
 * 贪心 shelf 排布：按高度降序逐行放置。
 * @param {Array<{name:string,w:number,h:number}>} items
 * @param {number} [maxW=2048] 单行最大宽度
 * @returns {{w:number,h:number,placements:Array<{name,x,y,w,h}>}}
 */
export function packRects(items, maxW = MAX_ATLAS) {
  const sorted = [...items].sort((a, b) => b.h - a.h);
  const placements = [];
  let x = 0, y = 0, rowH = 0, rowMaxX = 0;
  for (const it of sorted) {
    if (x + it.w > maxW) {          // 换行
      x = 0; y += rowH; rowH = 0;
    }
    placements.push({ name: it.name, x, y, w: it.w, h: it.h });
    x += it.w;
    rowH = Math.max(rowH, it.h);
    rowMaxX = Math.max(rowMaxX, x);
  }
  return { w: Math.max(1, rowMaxX), h: Math.max(1, y + rowH), placements };
}

/** 生成 Cocos plist（TexturePacker 兼容 format 2，含 trim 信息） */
export function buildPlist(meta) {
  const trim = meta.trim || null;
  const frames = Object.entries(meta.frames)
    .map(([name, f]) => {
      const src = trim?.sourceSize?.[name] || { w: f.w, h: f.h };
      const off = trim?.offset?.[name] || { x: 0, y: 0 };
      // Cocos 的 offset = (sourceSize - frameSize)/2 - trimOffset，且坐标系 y 翻转
      const ox = Math.round((src.w - f.w) / 2 - off.x);
      const oy = Math.round((src.h - f.h) / 2 - off.y);
      return `\t<key>${name}</key>\n\t<dict>\n\t\t<key>frame</key>\n\t\t<string>{{${f.x},${f.y}},{${f.w},${f.h}}}</string>\n\t\t<key>offset</key>\n\t\t<string>{${ox},${oy}}</string>\n\t\t<key>rotated</key>\n\t\t<false/>\n\t\t<key>sourceColorRect</key>\n\t\t<string>{{${off.x},${off.y}},{${f.w},${f.h}}}</string>\n\t\t<key>sourceSize</key>\n\t\t<string>{${src.w},${src.h}}</string>\n\t</dict>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>frames</key>
\t<dict>
${frames}
\t</dict>
\t<key>metadata</key>
\t<dict>
\t\t<key>format</key>
\t\t<integer>2</integer>
\t\t<key>realTextureFileName</key>
\t\t<string>${meta.textureName}</string>
\t\t<key>size</key>
\t\t<string>{${meta.w},${meta.h}}</string>
\t\t<key>textureFileName</key>
\t\t<string>${meta.textureName}</string>
\t</dict>
</dict>
</plist>
`;
}

/**
 * 打包一组 PNG 为图集（自动裁剪每张图的透明边）。
 * @param {Array<{name:string, file:string}>} inputs PNG 文件 + 名字
 * @param {string} outDir 输出目录
 * @param {object} [opts] { maxW, channel, executablePath, textureName, trim=true }
 * @returns {Promise<{atlas:string,json:string,plist:string,meta:object}>}
 */
export async function buildAtlas(inputs, outDir, { maxW = MAX_ATLAS, channel = 'chromium', executablePath = null, textureName = 'atlas', trim = true } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  assertExecutablePath(executablePath);

  const browser = await chromium.launch(resolveLaunchOptions({ channel, executablePath }));
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async ({ inputsB64, maxW, trim }) => {
      async function load(b64) {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        return img;
      }
      // 读尺寸 + 透明边裁剪（alpha 阈值 16）
      const items = [];
      const imgs = {};
      for (const [name, b64] of Object.entries(inputsB64)) {
        const img = await load(b64);
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (trim && img.naturalWidth > 0) {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
          for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
            if (d[(y * c.width + x) * 4 + 3] >= 16) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
          if (maxX >= 0) { sx = minX; sy = minY; sw = maxX - minX + 1; sh = maxY - minY + 1; }
        }
        // 裁剪后画到干净 canvas（保留透明度）
        const trimmed = document.createElement('canvas');
        trimmed.width = sw; trimmed.height = sh;
        const tctx = trimmed.getContext('2d');
        tctx.clearRect(0, 0, sw, sh);
        tctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        imgs[name] = { img: trimmed, ox: sx, oy: sy, ow: img.naturalWidth, oh: img.naturalHeight };
        items.push({ name, w: sw, h: sh });
      }
      // 贪心 shelf 排布
      const sorted = [...items].sort((a, b) => b.h - a.h);
      const placements = [];
      let x = 0, y = 0, rowH = 0, rowMaxX = 0;
      for (const it of sorted) {
        if (x + it.w > maxW) { x = 0; y += rowH; rowH = 0; }
        placements.push({ name: it.name, x, y, w: it.w, h: it.h });
        x += it.w; rowH = Math.max(rowH, it.h); rowMaxX = Math.max(rowMaxX, x);
      }
      const W = Math.max(1, rowMaxX), H = Math.max(1, y + rowH);

      // 合成
      const atlas = document.createElement('canvas');
      atlas.width = W; atlas.height = H;
      const ctx = atlas.getContext('2d');
      ctx.clearRect(0, 0, W, H);
      for (const p of placements) ctx.drawImage(imgs[p.name].img, p.x, p.y);

      return {
        W, H, placements,
        sourceSize: Object.fromEntries(Object.entries(imgs).map(([k, v]) => [k, { w: v.ow, h: v.oh }])),
        trimOffset: Object.fromEntries(Object.entries(imgs).map(([k, v]) => [k, { x: v.ox, y: v.oy }])),
        dataURL: atlas.toDataURL('image/png'),
      };
    }, {
      inputsB64: Object.fromEntries(inputs.map((i) => [i.name, fs.readFileSync(i.file).toString('base64')])),
      maxW,
      trim,
    });

    const atlasPath = path.join(outDir, `${textureName}.png`);
    fs.writeFileSync(atlasPath, Buffer.from(result.dataURL.split(',')[1], 'base64'));

    const frames = Object.fromEntries(result.placements.map((p) => [p.name, { x: p.x, y: p.y, w: p.w, h: p.h }]));
    const meta = {
      w: result.W, h: result.H, textureName: `${textureName}.png`,
      frames, placements: result.placements,
      trim: trim ? { sourceSize: result.sourceSize, offset: result.trimOffset } : null,
    };

    const jsonPath = path.join(outDir, `${textureName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(meta, null, 2));

    const plistPath = path.join(outDir, `${textureName}.plist`);
    fs.writeFileSync(plistPath, buildPlist(meta));

    return { atlas: atlasPath, json: jsonPath, plist: plistPath, meta };
  } finally {
    await browser.close();
  }
}
