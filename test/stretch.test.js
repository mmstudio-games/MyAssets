// 9-slice 拉伸重建验证（模拟游戏引擎的九宫格缩放行为）：
//   用 9 张切片把按钮拉伸到新的宽高，验证：
//   1. 四角切片原样保留（不缩放）→ 圆角不变形
//   2. 上下边横向拉伸、左右边纵向拉伸、中间双向拉伸
//   3. 重建结果无透明缺口（不连续/断裂）
// 前置条件：先运行 `myassets render scenes/button && myassets slice scenes/button`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(__dirname, '..', 'build', 'button');
const TARGET = { w: 900, h: 340 };  // 拉伸目标（像素，@2x 即 CSS 450×170）

test('9-slice 拉伸重建（四角不变形 + 中间无缝）', async () => {
  const framePath = path.join(build, 'frames', 'f000.png');
  const metaPath = path.join(build, 'slices', 'ninegrid.json');
  if (!fs.existsSync(metaPath)) {
    throw new Error('缺少 slices/ninegrid.json：请先运行 "npm run demo"');
  }
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  const browser = await chromium.launch({ channel: process.env.HAF_CHANNEL || 'chromium' });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async ({ frameB64, slicesB64, meta, TARGET }) => {
  async function load(b64) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    return img;
  }
  const slices = {};
  for (const [name, b64] of Object.entries(slicesB64)) {
    const img = await load(b64);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    slices[name] = c;
  }
  const { left, top, right, bottom } = meta.borders;
  const srcW = meta.contentBox.w, srcH = meta.contentBox.h;
  const midW = srcW - left - right, midH = srcH - top - bottom;

  // 引擎 9-slice 布局：四角固定尺寸，四边拉伸，中间双向拉伸
  const cells = {
    tl: [0, 0, left, top],
    t:  [left, 0, TARGET.w - left - right, top],
    tr: [TARGET.w - right, 0, right, top],
    l:  [0, top, left, TARGET.h - top - bottom],
    c:  [left, top, TARGET.w - left - right, TARGET.h - top - bottom],
    r:  [TARGET.w - right, top, right, TARGET.h - top - bottom],
    bl: [0, TARGET.h - bottom, left, bottom],
    b:  [left, TARGET.h - bottom, TARGET.w - left - right, bottom],
    br: [TARGET.w - right, TARGET.h - bottom, right, bottom],
  };
  const out = document.createElement('canvas');
  out.width = TARGET.w; out.height = TARGET.h;
  const ctx = out.getContext('2d');
  // 透明底
  ctx.clearRect(0, 0, TARGET.w, TARGET.h);
  for (const [name, [dx, dy, dw, dh]] of Object.entries(cells)) {
    // 拉伸绘制：源切片 → 目标区域（水平/垂直缩放）
    const s = slices[name];
    ctx.drawImage(s, dx, dy, dw, dh);
  }

  // 验证 1：缺口分布 —— 中间格（纯实体拉伸区）应无缺口；
  //          四角圆角外透明 + 底部投影半透明是按钮固有外观，不算断裂
  const d = ctx.getImageData(0, 0, TARGET.w, TARGET.h).data;
  let holesMid = 0, holesCorner = 0;
  const midRect = { x: left, y: top, w: TARGET.w - left - right, h: TARGET.h - top - bottom };
  for (let y = 0; y < TARGET.h; y++) for (let x = 0; x < TARGET.w; x++) {
    if (d[(y * TARGET.w + x) * 4 + 3] < 128) {
      const inMid = x >= midRect.x && x < midRect.x + midRect.w && y >= midRect.y && y < midRect.y + midRect.h;
      if (inMid) holesMid++; else holesCorner++;
    }
  }

  // 验证 2：四角未变形 —— 与源切片逐像素一致（角区域是固定区，不应被拉伸）
  let cornerDiff = 0;
  for (const [name, [dx, dy, dw, dh]] of [['tl', [0, 0]], ['tr', [TARGET.w - right, 0]], ['bl', [0, TARGET.h - bottom]], ['br', [TARGET.w - right, TARGET.h - bottom]]]) {
    const s = slices[name];
    const sd = s.getContext('2d').getImageData(0, 0, s.width, s.height).data;
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      const si = (y * s.width + x) * 4;
      const di = ((dy + y) * TARGET.w + (dx + x)) * 4;
      if (sd[si] !== d[di] || sd[si+1] !== d[di+1] || sd[si+2] !== d[di+2] || sd[si+3] !== d[di+3]) cornerDiff++;
    }
  }

  return {
    target: TARGET, srcW, srcH,
    holesMid, holesCorner, total: TARGET.w * TARGET.h,
    cornerDiff,
    midCell: { w: TARGET.w - left - right, h: TARGET.h - top - bottom },
  };
}, {
  frameB64: fs.readFileSync(framePath).toString('base64'),
  meta,
  slicesB64: Object.fromEntries(
    Object.entries(meta.slices).map(([k]) => [k, fs.readFileSync(path.join(build, 'slices', `slice-${k}.png`)).toString('base64')])),
  TARGET,
    });

    assert.equal(result.holesMid, 0, `中间格（纯实体拉伸区）应无缺口，实测 ${result.holesMid}`);
    assert.equal(result.cornerDiff, 0, `四角固定区应逐像素不变形，实测 ${result.cornerDiff} 像素差异`);
    assert.ok(
      result.midCell.w > meta.contentBox.w - meta.borders.left - meta.borders.right &&
      result.midCell.h > meta.contentBox.h - meta.borders.top - meta.borders.bottom,
      '中间格应被正确拉伸（比源大）');
  } finally {
    await browser.close();
  }
});
