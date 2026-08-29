// 程序化贴图验证：
//   1. glow-rare：透明背景、光晕中心亮边缘透明、尺寸 512×512
//   2. bar-track：九宫格切片拼接一致、边框对称
// 前置条件：npm run demo 后运行
//   myassets render scenes/glow-rare && myassets render scenes/bar-track && myassets slice scenes/bar-track
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(__dirname, '..', 'build');

test('程序化贴图：光晕（透明/中心亮/尺寸）', async () => {
  const f = path.join(build, 'glow-rare', 'frames', 'f000.png');
  if (!fs.existsSync(f)) throw new Error('缺少 glow-rare 帧：先运行 render');
  const b64 = fs.readFileSync(f).toString('base64');

  const browser = await chromium.launch({ channel: process.env.HAF_CHANNEL || 'chromium' });
  try {
    const page = await browser.newPage();
    const r = await page.evaluate(async ({ b64 }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const at = (x, y) => d[(y * c.width + x) * 4 + 3];
      const center = at(c.width / 2, c.height / 2);       // 中心应高亮
      const edge = at(0, 0);                                // 角落应透明
      let transparent = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 16) transparent++;
      return { w: c.width, h: c.height, center, edge, transparent, total: c.width * c.height };
    }, { b64 });
    assert.equal(r.w, 512, '宽 512');
    assert.equal(r.h, 512, '高 512');
    assert.ok(r.center > 200, `中心应高亮（α=${r.center}）`);
    assert.ok(r.edge < 16, `角落应透明（α=${r.edge}）`);
    assert.ok(r.transparent / r.total > 0.15, '圆外区域透明（光晕边缘渐隐）');
  } finally {
    await browser.close();
  }
});

test('程序化贴图：血条九宫格（拼接一致/边框对称）', async () => {
  const metaPath = path.join(build, 'bar-track', 'slices', 'ninegrid.json');
  if (!fs.existsSync(metaPath)) throw new Error('缺少 bar-track 切图：先运行 slice');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

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
      return { diff, total: box.w * box.h, borders: meta.borders };
    }, {
      meta,
      frameB64: fs.readFileSync(path.join(build, 'bar-track', 'frames', 'f000.png')).toString('base64'),
      slicesB64: Object.fromEntries(
        Object.keys(meta.slices).map((k) => [k, fs.readFileSync(path.join(build, 'bar-track', 'slices', `slice-${k}.png`)).toString('base64')])),
    });
    assert.equal(r.diff, 0, `拼接应逐像素一致，差异 ${r.diff}/${r.total}`);
    const b = r.borders;
    assert.ok(Math.abs(b.left - b.right) <= 1 && Math.abs(b.top - b.bottom) <= 2, `边框应对称 L${b.left} T${b.top} R${b.right} B${b.bottom}`);
  } finally {
    await browser.close();
  }
});
