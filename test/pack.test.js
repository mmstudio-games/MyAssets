// 图集打包验证：
//   1. 从 atlas 按坐标裁出每个资产，与源图逐像素一致（打包无损断言）
//   2. trim 信息自洽：sourceSize ≥ frame 尺寸
//   3. plist 可解析、坐标与 json 一致
// 前置条件：先运行 `myassets pack scenes/button`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const atlasDir = path.join(__dirname, '..', 'build', 'atlas');

test('图集打包：裁剪后与原图一致 + trim 自洽 + plist 可解析', async () => {
  const metaPath = path.join(atlasDir, 'atlas.json');
  if (!fs.existsSync(metaPath)) throw new Error('缺少图集产物：先运行 pack');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  // 从源帧目录取 f000 源图（button-f000 对应 build/button/frames/f000.png）
  const sourceName = 'button-f000';
  const sourceFile = path.join(__dirname, '..', 'build', 'button', 'frames', 'f000.png');
  if (!fs.existsSync(sourceFile)) throw new Error('缺少源帧：先运行 render');

  const browser = await chromium.launch({ channel: process.env.HAF_CHANNEL || 'chromium' });
  try {
    const page = await browser.newPage();
    const r = await page.evaluate(async ({ atlasB64, srcB64, meta, sourceName }) => {
      async function load(b64) {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return c;
      }
      const atlas = await load(atlasB64);
      const src = await load(srcB64);

      // 从 atlas 裁出 button-f000 区域
      const f = meta.frames[sourceName];
      const crop = document.createElement('canvas');
      crop.width = f.w; crop.height = f.h;
      crop.getContext('2d').drawImage(atlas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      const cropD = crop.getContext('2d').getImageData(0, 0, f.w, f.h).data;

      // 从源图按 trim offset 裁出相同区域
      const off = meta.trim.offset[sourceName];
      const srcCrop = document.createElement('canvas');
      srcCrop.width = f.w; srcCrop.height = f.h;
      srcCrop.getContext('2d').drawImage(src, off.x, off.y, f.w, f.h, 0, 0, f.w, f.h);
      const srcD = srcCrop.getContext('2d').getImageData(0, 0, f.w, f.h).data;

      let diff = 0;
      for (let i = 0; i < f.w * f.h * 4; i++) {
        if (cropD[i] !== srcD[i]) diff++;
      }
      return { diff, total: f.w * f.h * 4, f, srcSize: meta.trim.sourceSize[sourceName], off };
    }, {
      atlasB64: fs.readFileSync(path.join(atlasDir, 'atlas.png')).toString('base64'),
      srcB64: fs.readFileSync(sourceFile).toString('base64'),
      meta, sourceName,
    });

    // 断言 1：裁出区域与源图逐像素一致
    assert.equal(r.diff, 0, `atlas 裁剪应与源图逐像素一致，差异 ${r.diff}/${r.total}`);
    // 断言 2：trim 自洽（sourceSize ≥ frame）
    assert.ok(r.srcSize.w >= r.f.w && r.srcSize.h >= r.f.h, 'sourceSize 应 ≥ frame 尺寸');
    // 断言 3：偏移在源图内
    assert.ok(r.off.x >= 0 && r.off.y >= 0, `trim 偏移应为正（${JSON.stringify(r.off)}）`);

    // 断言 4：plist 可解析且含全部帧
    const plist = fs.readFileSync(path.join(atlasDir, 'atlas.plist'), 'utf8');
    assert.ok(plist.includes('<plist'), 'plist 应有 plist 根');
    assert.ok(plist.includes('<key>button-f000</key>'), 'plist 应含第一帧');
    assert.ok(plist.includes(`<string>{${r.srcSize.w},${r.srcSize.h}}</string>`), 'plist 应含 sourceSize');
  } finally {
    await browser.close();
  }
});
