// 视觉回归（golden-image diff）
//
// 原理：场景渲染产物（PNG 序列帧）与入库基线逐像素对比。
//   - check 模式（默认）：渲染 → 与 golden/<场景>/ 基线逐帧对比 → 报告差异（有差异时退出码 1）
//   - update 模式（--update）：渲染 → 刷新基线（有意变更时用，基线入库 git 跟踪）
//
// 为什么可靠：确定性渲染纪律（同输入必同输出）+ 版本锁定 Chromium——
//   同参数下两次渲染产物逐像素一致，因此默认 tolerance=0 严格相等。
// 基线 manifest.json 记录渲染参数快照：参数变了会报错提示重新生成基线，避免拿不同参数的产物误判。
//
// 范围：只对 render 输出帧做基线。video（VBR 编码字节级不确定）与派生资产
//   （切片/图集由帧推导）不做基线——锁帧即锁全部。

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { renderScene } from './render.js';
import { resolveLaunchOptions, assertExecutablePath } from './browser.js';

/** 归一化渲染参数（clip 序列化：兼容对象 {x,y,w,h} 与数组 [x,y,w,h]），供参数一致性比对 */
function normParams(p) {
  const clip = Array.isArray(p.clip)
    ? p.clip.join(',')
    : (p.clip ? `${p.clip.x},${p.clip.y},${p.clip.w},${p.clip.h}` : null);
  return {
    width: p.width, height: p.height, dpr: p.dpr, fps: p.fps, frames: p.frames,
    clip,
  };
}

/** 两组渲染参数是否一致（决定能否直接与基线对比） */
export function sameParams(a, b) {
  return JSON.stringify(normParams(a)) === JSON.stringify(normParams(b));
}

/**
 * 帧清单差异：基线帧名 vs 当前帧名。
 * @param {string[]} goldenNames 基线帧（f000.png ...）
 * @param {string[]} currentNames 当前渲染帧
 * @returns {{common:string[],goldenOnly:string[],currentOnly:string[]}}
 */
export function inventoryFrames(goldenNames, currentNames) {
  const gs = new Set(goldenNames), cs = new Set(currentNames);
  return {
    common: goldenNames.filter((n) => cs.has(n)),
    goldenOnly: goldenNames.filter((n) => !cs.has(n)),
    currentOnly: currentNames.filter((n) => !gs.has(n)),
  };
}

/**
 * 逐像素对比一组帧（浏览器 canvas，与 render 同内核通道）。
 * 差异判定：任一 RGBA 通道差的绝对值 > tolerance 即算差异像素。
 * @param {Array<{name:string,a:string,b:string}>} pairs 两张图 base64（a=基线，b=当前）
 * @param {{channel?:string,executablePath?:string|null,tolerance?:number}} opts
 * @returns {Promise<Array<{name:string,sizeMismatch:boolean,diffPixels:number,diffRatio:number,box:object|null,diffDataURL:string|null}>>}
 */
export async function pixelDiffMany(pairs, { channel = 'chromium', executablePath = null, tolerance = 0 } = {}) {
  if (pairs.length === 0) return [];
  const browser = await chromium.launch({ ...resolveLaunchOptions({ channel, executablePath }) });
  try {
    const page = await browser.newPage();
    const results = [];
    for (const p of pairs) {
      const r = await page.evaluate(async ({ a, b, tolerance }) => {
        const load = async (b64) => {
          const img = new Image();
          img.src = 'data:image/png;base64,' + b64;
          await img.decode();
          return img;
        };
        const ia = await load(a);
        const ib = await load(b);
        const W = ia.naturalWidth, H = ia.naturalHeight;
        if (W !== ib.naturalWidth || H !== ib.naturalHeight) {
          return { sizeMismatch: true, diffPixels: -1, diffRatio: 1, box: null, diffDataURL: null };
        }
        const ca = document.createElement('canvas'); ca.width = W; ca.height = H;
        const cb = document.createElement('canvas'); cb.width = W; cb.height = H;
        ca.getContext('2d').drawImage(ia, 0, 0);
        cb.getContext('2d').drawImage(ib, 0, 0);
        const da = ca.getContext('2d').getImageData(0, 0, W, H).data;
        const db = cb.getContext('2d').getImageData(0, 0, W, H).data;

        // 差异叠加图：底 = 基线帧，差异像素标红
        const diffCanvas = document.createElement('canvas'); diffCanvas.width = W; diffCanvas.height = H;
        const dctx = diffCanvas.getContext('2d');
        dctx.drawImage(ia, 0, 0);
        const diffData = dctx.getImageData(0, 0, W, H);
        const dd = diffData.data;

        let diffPixels = 0;
        let minX = W, minY = H, maxX = -1, maxY = -1;
        for (let i = 0; i < da.length; i += 4) {
          const dr = Math.abs(da[i] - db[i]), dg = Math.abs(da[i + 1] - db[i + 1]);
          const dbv = Math.abs(da[i + 2] - db[i + 2]), daa = Math.abs(da[i + 3] - db[i + 3]);
          if (dr > tolerance || dg > tolerance || dbv > tolerance || daa > tolerance) {
            diffPixels++;
            const x = (i / 4) % W, y = Math.floor(i / 4 / W);
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            dd[i] = 255; dd[i + 1] = 0; dd[i + 2] = 0; dd[i + 3] = 255;
          }
        }
        dctx.putImageData(diffData, 0, 0);
        const total = W * H;
        return {
          sizeMismatch: false,
          diffPixels,
          diffRatio: total > 0 ? diffPixels / total : 0,
          box: diffPixels > 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null,
          diffDataURL: diffCanvas.toDataURL('image/png'),
        };
      }, { a: p.a, b: p.b, tolerance });
      results.push({ name: p.name, ...r });
    }
    return results;
  } finally {
    await browser.close();
  }
}

/**
 * golden 命令核心：渲染 → 对比 / 刷新基线。
 * @param {object} opts
 * @param {string} opts.htmlPath      场景 HTML 路径
 * @param {string} opts.framesOutDir  本次渲染输出目录（build/<场景>/frames）
 * @param {string} opts.goldenDir     基线目录（golden/<场景>）
 * @param {string} opts.diffOutDir    差异叠加图输出目录（build/golden-diff/<场景>）
 * @param {boolean} [opts.update=false] 刷新基线（默认 check 对比）
 * @param {number} [opts.tolerance=0]   单通道容差
 * @param {object} opts.renderOpts    renderScene 参数（width/height/dpr/fps/frames/clip/channel/executablePath）
 * @returns {Promise<object>} 报告：{ mode, scene, params, frames[], passed, goldenDir, diffOutDir, manifest? }
 */
export async function goldenRun({
  htmlPath, framesOutDir, goldenDir, diffOutDir,
  update = false, tolerance = 0, renderOpts,
}) {
  const scene = path.basename(goldenDir);
  assertExecutablePath(renderOpts.executablePath);
  const rendered = await renderScene({ htmlPath, outDir: framesOutDir, ...renderOpts });
  const params = normParams({
    width: rendered.width, height: rendered.height, dpr: rendered.dpr,
    fps: rendered.fps, frames: rendered.frames, clip: renderOpts.clip ?? null,
  });

  // ---- update：刷新基线 ----
  if (update) {
    const framesDir = path.join(goldenDir, 'frames');
    fs.mkdirSync(framesDir, { recursive: true });
    const names = rendered.files.map((f) => path.basename(f)).sort();
    for (const f of rendered.files) {
      fs.copyFileSync(f, path.join(framesDir, path.basename(f)));
    }
    // 清理基线里已不存在的旧帧（帧数减少时）
    const keep = new Set(names);
    for (const old of fs.readdirSync(framesDir)) {
      if (!keep.has(old)) fs.unlinkSync(path.join(framesDir, old));
    }
    const manifest = { scene, params, frames: names.length, updatedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(goldenDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return { mode: 'update', scene, params, frames: names.length, goldenDir, manifest };
  }

  // ---- check：与基线对比 ----
  const manifestPath = path.join(goldenDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`缺少基线 ${goldenDir}/：先运行 myassets golden scenes/${scene} --update 生成基线`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!sameParams(manifest.params, params)) {
    throw new Error(
      `渲染参数与基线不一致（基线 ${JSON.stringify(manifest.params)} vs 当前 ${JSON.stringify(params)}）。` +
      `参数变更后需重新生成基线：myassets golden scenes/${scene} --update`);
  }

  const goldenNames = fs.readdirSync(path.join(goldenDir, 'frames')).filter((n) => n.endsWith('.png')).sort();
  const currentNames = rendered.files.map((f) => path.basename(f)).sort();
  const inv = inventoryFrames(goldenNames, currentNames);

  const frames = [];
  const diffPairs = [];
  for (const n of inv.common) {
    const g = fs.readFileSync(path.join(goldenDir, 'frames', n));
    const c = fs.readFileSync(path.join(framesOutDir, n));
    if (g.equals(c)) {
      frames.push({ name: n, status: 'equal', diffPixels: 0, diffRatio: 0, box: null, diffFile: null });
    } else {
      diffPairs.push({ name: n, a: g.toString('base64'), b: c.toString('base64') });
    }
  }
  for (const n of inv.goldenOnly) {
    frames.push({ name: n, status: 'removed', diffPixels: -1, diffRatio: 1, box: null, diffFile: null });
  }
  for (const n of inv.currentOnly) {
    frames.push({ name: n, status: 'added', diffPixels: -1, diffRatio: 1, box: null, diffFile: null });
  }

  if (diffPairs.length > 0) {
    fs.mkdirSync(diffOutDir, { recursive: true });
    const diffs = await pixelDiffMany(diffPairs, {
      channel: renderOpts.channel, executablePath: renderOpts.executablePath, tolerance,
    });
    for (const d of diffs) {
      let status = 'pixel-equal';                       // 字节不同但像素一致（罕见）
      if (d.sizeMismatch) status = 'size-mismatch';
      else if (d.diffPixels > 0) status = 'diff';
      let diffFile = null;
      if (status !== 'pixel-equal' && d.diffDataURL) {
        diffFile = path.join(diffOutDir, `diff-${d.name}`);
        fs.writeFileSync(diffFile, Buffer.from(d.diffDataURL.split(',')[1], 'base64'));
      }
      frames.push({ name: d.name, status, diffPixels: d.diffPixels, diffRatio: d.diffRatio, box: d.box, diffFile });
    }
  }

  frames.sort((a, b) => a.name.localeCompare(b.name));
  const failed = ['diff', 'size-mismatch', 'added', 'removed'];
  const passed = !frames.some((f) => failed.includes(f.status));
  return { mode: 'check', scene, params, frames, passed, goldenDir, diffOutDir, manifest };
}
