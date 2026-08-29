// golden-image diff 逻辑验证（无需 build/ 产物——自构造 PNG 夹具）：
//   1. sameParams：渲染参数一致性判定（决定能否直接对比基线）
//   2. inventoryFrames：帧清单差异（缺失/新增帧）
//   3. pixelDiffMany：单像素差异检测 + 差异框（浏览器 canvas 逐像素比）
//   4. pixelDiffMany：tolerance 容差（换内核调试时放宽）
//   5. pixelDiffMany：尺寸不一致标记
// 注意：3/4/5 需要浏览器（与其它测试一致，走 chromium）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { sameParams, inventoryFrames, pixelDiffMany } from '../src/golden.js';

// ---- 最小 PNG 构造（8bit RGBA，无第三方库）----
const CRC_TABLE = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/** 构造 PNG：pixels = [r,g,b,a] 数组（长度 width*height） */
function makePng(width, height, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = pixels[y * width + x];
      const o = row + 1 + x * 4;
      raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2]; raw[o + 3] = p[3];
    }
  }
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

test('sameParams：参数一致判定（决定能否直接对比基线）', () => {
  const base = { width: 430, height: 932, dpr: 2, fps: 12, frames: 12, clip: null };
  assert.ok(sameParams(base, { ...base }));
  assert.ok(sameParams({ ...base, clip: [0, 0, 300, 200] }, { ...base, clip: [0, 0, 300, 200] }));
  assert.ok(!sameParams(base, { ...base, width: 512 }), '宽度不同应不一致');
  assert.ok(!sameParams(base, { ...base, frames: 24 }), '帧数不同应不一致');
  assert.ok(!sameParams({ ...base, clip: [0, 0, 10, 10] }, { ...base, clip: [0, 0, 20, 10] }), 'clip 不同应不一致');
  assert.ok(!sameParams(base, { ...base, clip: [0, 0, 10, 10] }), 'clip null vs 有值应不一致');
});

test('inventoryFrames：帧清单差异（缺失/新增帧）', () => {
  assert.deepEqual(
    inventoryFrames(['f000.png', 'f001.png'], ['f000.png', 'f002.png']),
    { common: ['f000.png'], goldenOnly: ['f001.png'], currentOnly: ['f002.png'] });
  assert.deepEqual(
    inventoryFrames(['f000.png', 'f001.png'], ['f000.png', 'f001.png']),
    { common: ['f000.png', 'f001.png'], goldenOnly: [], currentOnly: [] });
  assert.deepEqual(
    inventoryFrames([], ['f000.png']),
    { common: [], goldenOnly: [], currentOnly: ['f000.png'] });
});

test('pixelDiffMany：单像素差异检测 + 差异框', async () => {
  const a = makePng(2, 2, [RED, RED, RED, RED]);
  const b = makePng(2, 2, [RED, RED, RED, BLUE]); // 右下角 1 像素变蓝
  const [r] = await pixelDiffMany([{ name: 'f000.png', a: a.toString('base64'), b: b.toString('base64') }], { tolerance: 0 });
  assert.equal(r.sizeMismatch, false);
  assert.equal(r.diffPixels, 1);
  assert.equal(r.diffRatio, 0.25);
  assert.deepEqual(r.box, { x: 1, y: 1, w: 1, h: 1 });
  assert.ok(r.diffDataURL, '应产出差异叠加图');
  // 完全相同的帧 → 不进入浏览器路径（字节相等），此处验证字节层差异确实被 pixels 捕获
  const [r2] = await pixelDiffMany([{ name: 'f000.png', a: a.toString('base64'), b: a.toString('base64') }], { tolerance: 0 });
  assert.equal(r2.diffPixels, 0);
  assert.equal(r2.box, null);
});

test('pixelDiffMany：tolerance 容差（单通道差 ≤ tolerance 不算差异）', async () => {
  const a = makePng(2, 2, [RED, RED, RED, RED]);
  const b = makePng(2, 2, [[254, 0, 0, 255], RED, RED, RED]); // 1 像素 R 差 1
  const [strict] = await pixelDiffMany([{ name: 'f000.png', a: a.toString('base64'), b: b.toString('base64') }], { tolerance: 0 });
  assert.equal(strict.diffPixels, 1, 'tolerance=0 时差 1 也应算差异');
  const [loose] = await pixelDiffMany([{ name: 'f000.png', a: a.toString('base64'), b: b.toString('base64') }], { tolerance: 1 });
  assert.equal(loose.diffPixels, 0, 'tolerance=1 时应容忍 1 通道差');
  assert.equal(loose.box, null);
});

test('pixelDiffMany：尺寸不一致标记', async () => {
  const a = makePng(2, 2, [RED, RED, RED, RED]);
  const b = makePng(3, 3, [RED, RED, RED, RED, RED, RED, RED, RED, RED]);
  const [r] = await pixelDiffMany([{ name: 'f000.png', a: a.toString('base64'), b: b.toString('base64') }], { tolerance: 0 });
  assert.equal(r.sizeMismatch, true);
  assert.equal(r.diffPixels, -1);
  assert.equal(r.diffDataURL, null);
});
