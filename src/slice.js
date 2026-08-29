// 九宫格自动切图（MVP 第一刀）
//
// 目标：给一张渲染帧（如 f000.png），自动测出 3×3 边框，输出 9 张切片 + 边框参数。
//
// 算法（针对"按钮类资产"，文档第六节第 4 条）：
//   1. alpha 阈值掩码 → 内容 bbox（忽略微弱发光阴影/透明杂质）
//   2. 边框检测 = "圆角结束的位置"：
//        逐行检查 [bbox.left, bbox.right] 是否全部不透明（连续性）。
//        圆角区行有缺口（不连续）；进入直边区后全连续。
//        top  = 第一个全连续行  - bbox.top
//        bottom = bbox.bottom - 最后一个全连续行
//        left/right 用逐列对称检测。
//       - 文字不影响：文字像素 alpha>0，行内仍"全连续"
//       - 渐变不影响：连续性只看 alpha，不看颜色
//       - 无圆角（全连续）时退化：给一个最小边框（默认 4px，可配置）
//   3. 按边框把 bbox 切成 3×3，逐切片从源图像抠出（canvas 精确拷贝，无缩放）

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { resolveLaunchOptions, assertExecutablePath } from './browser.js';

// 从环境变量解析浏览器启动选项（CLI 在调用前设置 HAF_CHANNEL / HAF_BROWSER_PATH）
function launchOptions() {
  const opts = resolveLaunchOptions({
    channel: process.env.HAF_CHANNEL || 'chromium',
    executablePath: process.env.HAF_BROWSER_PATH || null,
  });
  assertExecutablePath(opts.executablePath);
  return opts;
}

/**
 * 用 CSS 选择器在场景 HTML 中定位目标元素，返回其物理像素 bbox。
 * 供 scene.yaml 的 slices.target 使用（AI 一个 HTML 放多个按钮时，指定切哪一个）。
 * 注意：必须与 render 使用相同的 viewport + DPR，否则布局不同、坐标错位。
 * @param {string} htmlPath 场景 HTML 路径
 * @param {string} selector CSS 选择器
 * @param {number} dpr 渲染 DPR（boundingBox 是 CSS px，×dpr 得物理 px）
 * @param {number} [width=430] viewport 宽（CSS px，须与 render 一致）
 * @param {number} [height=932] viewport 高（CSS px，须与 render 一致）
 * @returns {Promise<{x:number,y:number,w:number,h:number}>} 物理像素 bbox（相对 viewport 原点）
 */
export async function locateTarget(htmlPath, selector, dpr = 2, width = 430, height = 932) {
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`选择器未匹配到元素: ${selector}`);
    return {
      x: Math.round(box.x * dpr),
      y: Math.round(box.y * dpr),
      w: Math.round(box.width * dpr),
      h: Math.round(box.height * dpr),
    };
  } finally {
    await browser.close();
  }
}

/**
 * 在场景 HTML 页面内调用用户钩子 window.__MYASSETS_DETECT__（L1）。
 * 约定签名：__MYASSETS_DETECT__(imageData, {width, height}) => {left,top,right,bottom}
 * 纯函数约定：只读像素数据、只返回数字；不依赖 DOM 时无需 viewport 匹配。
 * 缺失 / 非函数 / 抛错 / 返回非法值 → 返回 null（调用方回退内置算法）。
 * @param {import('playwright').Browser} browser
 * @param {string} htmlPath 场景 HTML 路径
 * @param {string} frameB64 源帧 base64
 * @returns {Promise<{left:number,top:number,right:number,bottom:number}|null>}
 */
async function callDetectHook(browser, htmlPath, frameB64) {
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    return await page.evaluate(async ({ b64 }) => {
      const hook = window.__MYASSETS_DETECT__;
      if (typeof hook !== 'function') return null;
      try {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, c.width, c.height);
        const r = hook(imageData, { width: c.width, height: c.height });
        const valid = r && ['left', 'top', 'right', 'bottom']
          .every((k) => Number.isInteger(r[k]) && r[k] >= 0);
        return valid ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
      } catch {
        return null; // 钩子抛错 → 回退
      }
    }, { b64: frameB64 });
  } finally {
    await page.close();
  }
}

/**
 * 从 PNG 文件读像素，跑检测，返回 { borders, slices }。
 * 边框来源优先级（可插拔）：
 *   1. border（手动指定，L0）
 *   2. hookBorders（HTML 内嵌钩子 window.__MYASSETS_DETECT__，L1）
 *   3. 内置自动检测（双阈值算法）
 */
export async function detectNineSlice(framePath, {
  alphaThreshold = 32, continuityThreshold = 128, minBorder = 4,
  targetBox = null, border = null, hookHtmlPath = null,
} = {}) {
  const b64 = fs.readFileSync(framePath).toString('base64');
  const browser = await chromium.launch(launchOptions());
  try {
    // L1：尝试调用 HTML 钩子（手动 border 优先，则跳过钩子）
    let hookBorders = null;
    if (hookHtmlPath && !border) {
      hookBorders = await callDetectHook(browser, hookHtmlPath, b64);
    }
    const page = await browser.newPage();
    return await page.evaluate(async ({ b64, alphaThreshold, continuityThreshold, minBorder, targetBox, borderOverride, hookBorders }) => {
      // ---- 载入源图 ----
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      const src = document.createElement('canvas');
      src.width = W; src.height = H;
      const sctx = src.getContext('2d');
      sctx.drawImage(img, 0, 0);
      const data = sctx.getImageData(0, 0, W, H).data;

      const alphaAt = (x, y) => data[(y * W + x) * 4 + 3];

      // ---- 内置自动检测：双阈值 + 纯色边框线 ----
      // 圆角区行/列在实体 bbox 两端有缺口（不连续）；直边区全连续。
      // 文字不破坏连续性（文字 alpha 高）；渐变不破坏（连续性只看 alpha 不看颜色）
      function detectBordersAuto(data, W, H, alphaAt, minX, minY, maxX, maxY,
        eminX, eminY, emaxX, emaxY, continuityThreshold, minBorder) {
        const rowCont = new Array(H).fill(false);
        for (let y = eminY; y <= emaxY; y++) {
          let ok = true;
          for (let x = eminX; x <= emaxX; x++) { if (alphaAt(x, y) < continuityThreshold) { ok = false; break; } }
          rowCont[y] = ok;
        }
        const colCont = new Array(W).fill(false);
        for (let x = eminX; x <= emaxX; x++) {
          let ok = true;
          for (let y = eminY; y <= emaxY; y++) { if (alphaAt(x, y) < continuityThreshold) { ok = false; break; } }
          colCont[x] = ok;
        }

        let topRow = -1, bottomRow = -1;
        for (let y = eminY; y <= emaxY; y++) if (rowCont[y]) { topRow = y; break; }
        for (let y = emaxY; y >= eminY; y--) if (rowCont[y]) { bottomRow = y; break; }
        let leftCol = -1, rightCol = -1;
        for (let x = eminX; x <= emaxX; x++) if (colCont[x]) { leftCol = x; break; }
        for (let x = emaxX; x >= eminX; x--) if (colCont[x]) { rightCol = x; break; }

        // 纯色边框线检测（补充圆角半径检测的盲区）
        // 两个条件同时满足才计为边框线：
        //   a) 实体像素占比 ≥ 95%（排除圆角弧线行——弧线行部分实体，range 虽小但不是边框）
        //   b) 颜色范围 < COLOR_FLAT（纯色；渐变主体行内同色 range 也小，但占比条件先挡住弧线区）
        const COLOR_FLAT = 24; // 行/列内颜色范围 < 24 视为纯色（抗锯齿/微噪容忍）
        const MIN_FILL = 0.95; // 实体像素占比下限

        const isFlatRow = (y) => {
          let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0, n = 0;
          const span = emaxX - eminX + 1;
          for (let x = eminX; x <= emaxX; x++) {
            const i = (y * W + x) * 4;
            if (data[i + 3] < continuityThreshold) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r < rmin) rmin = r; if (r > rmax) rmax = r;
            if (g < gmin) gmin = g; if (g > gmax) gmax = g;
            if (b < bmin) bmin = b; if (b > bmax) bmax = b;
            n++;
          }
          return n / span >= MIN_FILL && Math.max(rmax - rmin, gmax - gmin, bmax - bmin) < COLOR_FLAT;
        };
        const isFlatCol = (x) => {
          let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0, n = 0;
          const span = emaxY - eminY + 1;
          for (let y = eminY; y <= emaxY; y++) {
            const i = (y * W + x) * 4;
            if (data[i + 3] < continuityThreshold) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r < rmin) rmin = r; if (r > rmax) rmax = r;
            if (g < gmin) gmin = g; if (g > gmax) gmax = g;
            if (b < bmin) bmin = b; if (b > bmax) bmax = b;
            n++;
          }
          return n / span >= MIN_FILL && Math.max(rmax - rmin, gmax - gmin, bmax - bmin) < COLOR_FLAT;
        };

        let lineLeft = 0;
        for (let x = eminX; x <= emaxX; x++) { if (isFlatCol(x)) lineLeft++; else break; }
        let lineRight = 0;
        for (let x = emaxX; x >= eminX; x--) { if (isFlatCol(x)) lineRight++; else break; }
        let lineTop = 0;
        for (let y = eminY; y <= emaxY; y++) { if (isFlatRow(y)) lineTop++; else break; }
        let lineBottom = 0;
        for (let y = emaxY; y >= eminY; y--) { if (isFlatRow(y)) lineBottom++; else break; }

        // 整体纯色按钮（所有列都"纯色"）→ 边框线检测失效，退回 minBorder
        const entityW = emaxX - eminX + 1, entityH = emaxY - eminY + 1;
        if (lineLeft >= entityW * 0.8) lineLeft = 0;
        if (lineRight >= entityW * 0.8) lineRight = 0;
        if (lineTop >= entityH * 0.8) lineTop = 0;
        if (lineBottom >= entityH * 0.8) lineBottom = 0;

        // 最终边框 = max(圆角半径, 纯色边框线, minBorder 兜底)
        const clamp = (v) => Math.max(v, minBorder);
        return {
          top:    topRow >= 0 ? clamp(Math.max(topRow - minY, lineTop)) : Math.min(minBorder, maxY - minY),
          bottom: bottomRow >= 0 ? clamp(Math.max(maxY - bottomRow, lineBottom)) : Math.min(minBorder, maxY - minY),
          left:   leftCol >= 0 ? clamp(Math.max(leftCol - minX, lineLeft)) : Math.min(minBorder, maxX - minX),
          right:  rightCol >= 0 ? clamp(Math.max(maxX - rightCol, lineRight)) : Math.min(minBorder, maxX - minX),
        };
      }

      // ---- 1. 内容 bbox（低阈值：范围保守完整，含半透明装饰/投影）----
      // 有 targetBox 时：检测范围限定在目标元素区域内（物理像素），其余区域忽略
      const scanX0 = targetBox ? Math.max(0, targetBox.x) : 0;
      const scanY0 = targetBox ? Math.max(0, targetBox.y) : 0;
      const scanX1 = targetBox ? Math.min(W - 1, targetBox.x + targetBox.w - 1) : W - 1;
      const scanY1 = targetBox ? Math.min(H - 1, targetBox.y + targetBox.h - 1) : H - 1;
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = scanY0; y <= scanY1; y++) for (let x = scanX0; x <= scanX1; x++) {
        if (alphaAt(x, y) >= alphaThreshold) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) throw new Error('画面中没有找到不透明内容（alpha 阈值 ' + alphaThreshold + '）');

      // ---- 2. 实体掩码 + 实体 bbox（高阈值：排除投影模糊/光晕，只认不透明实体）----
      // 同样限定在 targetBox 扫描范围内，避免把同页其他元素扫进来
      let eminX = W, eminY = H, emaxX = -1, emaxY = -1;
      for (let y = scanY0; y <= scanY1; y++) for (let x = scanX0; x <= scanX1; x++) {
        if (alphaAt(x, y) >= continuityThreshold) {
          if (x < eminX) eminX = x; if (x > emaxX) emaxX = x;
          if (y < eminY) eminY = y; if (y > emaxY) emaxY = y;
        }
      }
      if (emaxX < 0) throw new Error('实体检测失败：没有像素达到实体阈值 ' + continuityThreshold);

      // ---- 3. 边框来源（可插拔）----
      let borders;
      if (borderOverride) {
        borders = { ...borderOverride };   // L0：手动指定
      } else if (hookBorders) {
        borders = { ...hookBorders };      // L1：HTML 钩子
      } else {
        // 内置自动检测（双阈值 + 边框线）
        borders = detectBordersAuto(data, W, H, alphaAt, minX, minY, maxX, maxY,
          eminX, eminY, emaxX, emaxY, continuityThreshold, minBorder);
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const midW = bw - borders.left - borders.right, midH = bh - borders.top - borders.bottom;
      if (midW < 2 || midH < 2) {
        throw new Error(`可拉伸中间区域过小 (${midW}×${midH})，检查边框值或资产是否适合九宫格`);
      }

      // ---- 4. 3×3 切片（从源图精确拷贝）----
      const { left, top, right, bottom } = borders;
      const rects = {
        tl: [minX, minY, left, top],
        t:  [minX + left, minY, midW, top],
        tr: [maxX - right + 1, minY, right, top],
        l:  [minX, minY + top, left, midH],
        c:  [minX + left, minY + top, midW, midH],
        r:  [maxX - right + 1, minY + top, right, midH],
        bl: [minX, maxY - bottom + 1, left, bottom],
        b:  [minX + left, maxY - bottom + 1, midW, bottom],
        br: [maxX - right + 1, maxY - bottom + 1, right, bottom],
      };

      const slices = {};
      for (const [name, [sx, sy, sw, sh]] of Object.entries(rects)) {
        const c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        const ctx = c.getContext('2d');
        ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
        slices[name] = c.toDataURL('image/png');
      }

      return {
        borders,
        sourceSize: { w: W, h: H },
        contentBox: { x: minX, y: minY, w: bw, h: bh },
        entityBox: { x: eminX, y: eminY, w: emaxX - eminX + 1, h: emaxY - eminY + 1 },
        rects,
        slices,
      };
    }, { b64, alphaThreshold, continuityThreshold, minBorder, targetBox, borderOverride: border, hookBorders });
  } finally {
    await browser.close();
  }
}

/**
 * 完整切图流程：检测 + 写文件。
 * @param {string} framePath 源帧 PNG
 * @param {string} outDir    输出目录（写入 9 张切片 + ninegrid.json）
 */
export async function sliceNineGrid(framePath, outDir, opts = {}) {
  const result = await detectNineSlice(framePath, opts);
  fs.mkdirSync(outDir, { recursive: true });

  const written = [];
  for (const [name, dataURL] of Object.entries(result.slices)) {
    const file = path.join(outDir, `slice-${name}.png`);
    fs.writeFileSync(file, Buffer.from(dataURL.split(',')[1], 'base64'));
    written.push(file);
  }

  const meta = {
    source: framePath,
    targetBox: opts.targetBox ?? null,   // 指定切图目标元素时记录（scene.yaml slices.target）
    borders: result.borders,           // { left, top, right, bottom } —— 引擎 9-slice 参数
    borderSource: opts.border ? 'manual' : (opts.hookHtmlPath ? 'html-hook' : 'auto'),
    contentBox: result.contentBox,
    sourceSize: result.sourceSize,
    slices: Object.fromEntries(
      Object.entries(result.rects).map(([k, v]) => [k, { x: v[0], y: v[1], w: v[2], h: v[3] }])),
  };
  const metaFile = path.join(outDir, 'ninegrid.json');
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

  return { ...meta, files: written, metaFile };
}
