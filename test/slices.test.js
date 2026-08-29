// 九宫格切图验证：
//   1. 9 张切片拼接回 contentBox 区域，必须与源帧逐像素一致（精确拷贝断言）
//   2. 边框参数自洽：left+midW+right = 内容宽，top+midH+bottom = 内容高
//   3. 角落切片应含圆角（tl 的右下角像素不透明、tl 的左上角透明）
// 前置条件：先运行 `myassets render scenes/button && myassets slice scenes/button`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(__dirname, '..', 'build', 'button');

test('九宫格切图断言（拼接一致/边框自洽/圆角）', async () => {
  const framePath = path.join(build, 'frames', 'f000.png');
  const metaPath = path.join(build, 'slices', 'ninegrid.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error('缺少 slices/ninegrid.json：请先运行 "npm run demo"');
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  const browser = await chromium.launch({ channel: process.env.HAF_CHANNEL || 'chromium' });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async ({ frameB64, slicesB64, meta }) => {
      async function load(b64) {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        return img;
      }
      const srcImg = await load(frameB64);
      const src = document.createElement('canvas');
      src.width = srcImg.naturalWidth; src.height = srcImg.naturalHeight;
      const sctx = src.getContext('2d');
      sctx.drawImage(srcImg, 0, 0);
      const srcData = sctx.getImageData(0, 0, src.width, src.height).data;

      const slices = {};
      for (const [name, b64] of Object.entries(slicesB64)) {
        const img = await load(b64);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        slices[name] = { img: c, data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
      }

      const box = { x: meta.contentBox.x, y: meta.contentBox.y, w: meta.contentBox.w, h: meta.contentBox.h };
      const stitched = document.createElement('canvas');
      stitched.width = box.w; stitched.height = box.h;
      const stctx = stitched.getContext('2d');
      const { left, top, right, bottom } = meta.borders;
      const midW = box.w - left - right, midH = box.h - top - bottom;

      const cells = {
        tl: [0, 0], t: [left, 0], tr: [left + midW, 0],
        l: [0, top], c: [left, top], r: [left + midW, top],
        bl: [0, top + midH], b: [left, top + midH], br: [left + midW, top + midH],
      };
      for (const [name, [dx, dy]] of Object.entries(cells)) {
        stctx.drawImage(slices[name].img, dx, dy);
      }
      const stData = stctx.getImageData(0, 0, box.w, box.h).data;

      let diff = 0;
      const total = box.w * box.h;
      for (let i = 0; i < total; i++) {
        const si = ((box.y + Math.floor(i / box.w)) * src.width + (box.x + (i % box.w))) * 4;
        const di = i * 4;
        if (srcData[si] !== stData[di] || srcData[si+1] !== stData[di+1] ||
            srcData[si+2] !== stData[di+2] || srcData[si+3] !== stData[di+3]) diff++;
      }

      const tl = slices.tl;
      const tlCornerA = tl.data[3];
      const tlInnerA = tl.data[((tl.h - 1) * tl.w + (tl.w - 1)) * 4 + 3];
      const br = slices.br;
      const brCornerA = br.data[((br.h - 1) * br.w + (br.w - 1)) * 4 + 3];

      return {
        borders: meta.borders, box,
        sliceSizes: Object.fromEntries(Object.entries(slices).map(([k, v]) => [k, `${v.w}×${v.h}`])),
        diff, total, tlCornerA, tlInnerA, brCornerA, midW, midH,
      };
    }, {
      frameB64: fs.readFileSync(framePath).toString('base64'),
      meta,
      slicesB64: Object.fromEntries(
        Object.entries(meta.slices).map(([k]) => [k, fs.readFileSync(path.join(build, 'slices', `slice-${k}.png`)).toString('base64')])),
    });

    assert.ok(result.midW > 0 && result.midH > 0, '边框参数应自洽（中间格为正）');
    assert.equal(result.diff, 0, `9 切片拼接应逐像素一致，差异 ${result.diff}/${result.total}`);
    assert.ok(result.tlCornerA < 32, 'tl 左上角应透明（圆角外）');
    assert.ok(result.tlInnerA > 200, 'tl 右下角应不透明（圆角内）');
    assert.ok(result.brCornerA < 32, 'br 右下角应透明（圆角外）');
    assert.notEqual(result.sliceSizes.c, '0×0', '中间切片宽高应为正');
  } finally {
    await browser.close();
  }
});
