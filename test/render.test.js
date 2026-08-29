// 渲染帧程序化断言（对应文档 3.5 节——验证不依赖 AI 看图）
// 验证：尺寸 / 透明背景 / 动画帧差异 / 内容居中
// 前置条件：先运行 `myassets render scenes/button`（或 npm run demo）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const framesDir = path.join(__dirname, '..', 'build', 'button', 'frames');

function requireFrame(name) {
  const p = path.join(framesDir, name);
  if (!fs.existsSync(p)) {
    throw new Error(`缺少 ${name}：请先运行 "npm run demo" 渲染 button 场景`);
  }
  return fs.readFileSync(p).toString('base64');
}

test('渲染帧断言（尺寸/透明/动画/居中）', async () => {
  const f000 = requireFrame('f000.png');
  const f005 = requireFrame('f005.png');

  const browser = await chromium.launch({ channel: process.env.HAF_CHANNEL || 'chromium' });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async ({ f000, f005 }) => {
      async function analyze(b64) {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let opaque = 0, transparent = 0, minX = c.width, maxX = -1, minY = c.height, maxY = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const a = d[(y * c.width + x) * 4 + 3];
          if (a > 0) { opaque++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
          else transparent++;
        }
        return { w: c.width, h: c.height, opaque, transparent, bbox: [minX, minY, maxX, maxY] };
      }
      async function px(b64) {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      }
      const a = await px(f000);
      const b = await px(f005);
      let diff = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i+1] !== b[i+1] || a[i+2] !== b[i+2] || a[i+3] !== b[i+3]) diff++;
      }
      return { f0: await analyze(f000), f5: await analyze(f005), diffPx: diff };
    }, { f000, f005 });

    assert.equal(result.f0.w, 860, '尺寸宽应为 860 (430×2 @2x)');
    assert.equal(result.f0.h, 1864, '尺寸高应为 1864 (932×2 @2x)');
    assert.ok(result.f0.transparent / (result.f0.w * result.f0.h) > 0.5, '背景应透明（透明像素占比 >50%）');
    assert.ok(result.f0.bbox[0] > 100 && result.f0.bbox[1] > 200 && result.f0.bbox[2] < 760 && result.f0.bbox[3] < 1700, '内容应居中');
    assert.ok(result.diffPx > 1000, '动画帧应有差异（呼吸发光生效）');
    const wCss = (result.f0.bbox[2] - result.f0.bbox[0]) / 2;
    assert.ok(wCss > 280 && wCss < 340, `按钮 CSS 宽应在 280-340px 区间，实测 ${wCss}`);
  } finally {
    await browser.close();
  }
});
