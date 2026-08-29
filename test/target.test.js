// 多按钮场景 target 切图验证：
//   1. scene.yaml 声明 slices.target: .btn-a，切片内容应只含 .btn-a（蓝色）而非整页
//   2. 9 切片拼回 .btn-a 区域逐像素一致
// 前置条件：先运行 `myassets render scenes/multi && myassets slice scenes/multi`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(__dirname, '..', 'build', 'multi');

test('target 切图断言（只切指定元素 + 拼接一致）', async () => {
  const metaPath = path.join(build, 'slices', 'ninegrid.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error('缺少 scenes/multi 切图结果：请先运行 "myassets render scenes/multi && myassets slice scenes/multi"');
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const frameB64 = fs.readFileSync(path.join(build, 'frames', 'f000.png')).toString('base64');
  const slicesB64 = Object.fromEntries(
    Object.keys(meta.slices).map((k) => [k, fs.readFileSync(path.join(build, 'slices', `slice-${k}.png`)).toString('base64')]));

  const browser = await chromium.launch({ channel: process.env.HAF_CHANNEL || 'chromium' });
  try {
    const page = await browser.newPage();
    const r = await page.evaluate(async ({ meta, frameB64, slicesB64 }) => {
      async function load(b64) {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        return c;
      }
      const cImg = await load(slicesB64.c);
      const cD = cImg.getContext('2d').getImageData(0, 0, cImg.width, cImg.height).data;
      let rs = 0, gs = 0, bs = 0, n = 0;
      for (let i = 0; i < cD.length; i += 4) {
        if (cD[i + 3] > 128) { rs += cD[i]; gs += cD[i + 1]; bs += cD[i + 2]; n++; }
      }
      const avg = [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)];

      const src = await load(frameB64);
      const srcD = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
      const slices = {};
      for (const [k, b64] of Object.entries(slicesB64)) slices[k] = await load(b64);
      const box = meta.contentBox;
      const st = document.createElement('canvas');
      st.width = box.w; st.height = box.h;
      const ctx = st.getContext('2d');
      const { left, top, right, bottom } = meta.borders;
      const midW = box.w - left - right, midH = box.h - top - bottom;
      const cells = {
        tl: [0, 0], t: [left, 0], tr: [left + midW, 0],
        l: [0, top], c: [left, top], r: [left + midW, top],
        bl: [0, top + midH], b: [left, top + midH], br: [left + midW, top + midH],
      };
      for (const [name, [dx, dy]] of Object.entries(cells)) ctx.drawImage(slices[name], dx, dy);
      const stD = ctx.getImageData(0, 0, box.w, box.h).data;
      let diff = 0;
      for (let i = 0; i < box.w * box.h; i++) {
        const si = ((box.y + (i / box.w | 0)) * src.width + (box.x + i % box.w)) * 4;
        const di = i * 4;
        if (srcD[si] !== stD[di] || srcD[si + 1] !== stD[di + 1] || srcD[si + 2] !== stD[di + 2] || srcD[si + 3] !== stD[di + 3]) diff++;
      }
      return { avg, diff, total: box.w * box.h, contentBox: box, targetBox: meta.targetBox };
    }, { meta, frameB64, slicesB64 });

    const [r_, g_, b_] = r.avg;
    assert.ok(
      r.contentBox.x === r.targetBox.x && r.contentBox.y === r.targetBox.y &&
      r.contentBox.w === r.targetBox.w && r.contentBox.h === r.targetBox.h,
      'contentBox 应与 targetBox 一致（只切目标元素）');
    assert.ok(r_ < 200 && g_ > 150 && b_ > 200 && r_ < b_, `切片应为蓝色 .btn-a，实测 RGB ${r.avg.join(',')}`);
    assert.equal(r.diff, 0, `拼接应逐像素一致，差异 ${r.diff}/${r.total}`);
  } finally {
    await browser.close();
  }
});
