// 自定义边框来源验证（L0 手动 border + L1 HTML 钩子）：
//   1. L0: border 参数手动指定 → 采用指定值，borderSource=manual
//   2. L1: HTML 里 window.__MYASSETS_DETECT__ 返回合法值 → 采用钩子值
//   3. 回退: 无钩子 / 钩子抛错 → 自动检测（borderSource=auto）
// 前置条件：先运行 render（button + btn-custom-hook + btn-square）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectNineSlice } from '../src/slice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(__dirname, '..', 'build');
const scenes = path.join(__dirname, '..', 'scenes');

function frame(name) {
  const p = path.join(build, name, 'frames', 'f000.png');
  if (!fs.existsSync(p)) throw new Error(`缺少 ${name} 帧：先运行 render`);
  return p;
}

test('L0 手动 border：指定值被采用且标记 manual', async () => {
  const r = await detectNineSlice(frame('button'), {
    border: { left: 30, top: 30, right: 30, bottom: 30 },
    targetBox: { x: 158, y: 851, w: 544, h: 162 },
  });
  assert.deepEqual(r.borders, { left: 30, top: 30, right: 30, bottom: 30 });
  // 手动 border 也能正常切片（rects 基于指定值）
  assert.ok(r.rects.c[2] > 0 && r.rects.c[3] > 0, '中间切片应为正');
});

test('L1 HTML 钩子：__MYASSETS_DETECT__ 返回值被采用', async () => {
  const r = await detectNineSlice(frame('btn-custom-hook'), {
    hookHtmlPath: path.join(scenes, 'btn-custom-hook', 'index.html'),
    targetBox: { x: 164, y: 850, w: 532, h: 164 },
  });
  assert.deepEqual(r.borders, { left: 24, top: 24, right: 24, bottom: 24 }, '应使用钩子返回的固定边框 24');
});

test('回退：无钩子时自动检测', async () => {
  const r = await detectNineSlice(frame('button'), {
    hookHtmlPath: path.join(scenes, 'button', 'index.html'), // 该场景无钩子
    targetBox: { x: 158, y: 851, w: 544, h: 162 },
  });
  assert.ok(r.borders.left > 0 && r.borders.top > 0, '应回退到自动检测的正值');
  assert.notDeepEqual(r.borders, { left: 24, top: 24, right: 24, bottom: 24 }, '不应是钩子值');
});

test('回退：钩子抛错时自动检测（不崩溃）', async () => {
  const badHook = path.join(scenes, '_hook-bad-test.html');
  fs.writeFileSync(badHook, `<!DOCTYPE html><html><head><style>html,body{margin:0;background:transparent}body{display:flex;align-items:center;justify-content:center}.b{width:200px;height:80px;background:#f00;border-radius:8px}</style></head><body><div class="b"></div><script>window.__MYASSETS_DETECT__=function(){throw new Error('boom')}</script></body></html>`);
  try {
    const r = await detectNineSlice(frame('btn-square'), { hookHtmlPath: badHook });
    assert.ok(r.borders.left > 0, '钩子抛错应回退自动检测，边框应为正');
  } finally {
    fs.unlinkSync(badHook);
  }
});
