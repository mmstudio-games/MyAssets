// 透明 WebM 视频导出
//
// 架构（双页面）：
//   场景页（驱动动画 + CDP 截图，与 render 同确定性通道）
//     ↓ 每帧 PNG buffer（omitBackground 透明）
//   录制页（canvas + captureStream + MediaRecorder 常驻录制，保留 alpha）
//
// 透明通道关键：--enable-features=CanvasCaptureStreamTransparent（VP9 alpha）
// 确定性：帧内容与 render 完全一致（同时间轴 + 双 rAF + CDP 截图）
// 注意：视频编码为 VBR，字节级不确定（行业常态），帧内容确定

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { resolveLaunchOptions, assertExecutablePath } from './browser.js';

/**
 * 把场景渲染成透明 WebM。
 * @param {object} opts
 * @param {string} opts.htmlPath 场景 HTML 路径
 * @param {string} opts.outFile  输出 .webm 路径
 * @param {number} [opts.width=430]  viewport 宽
 * @param {number} [opts.height=932] viewport 高
 * @param {number} [opts.fps=12]     帧率
 * @param {number} [opts.loopMs]     时长 ms（默认取最长动画时长）
 * @param {string} [opts.channel='chromium']
 * @param {string|null} [opts.executablePath]
 * @returns {Promise<{file:string,fps:number,loopMs:number,sizeBytes:number,durationSec:number,mime:string}>}
 */
export async function renderVideo({
  htmlPath, outFile,
  width = 430, height = 932,
  fps = 12, loopMs: loopMsOpt = null,
  channel = 'chromium', executablePath = null,
}) {
  if (!fs.existsSync(htmlPath)) throw new Error(`场景不存在: ${htmlPath}`);
  assertExecutablePath(executablePath);

  const browser = await chromium.launch({
    ...resolveLaunchOptions({ channel, executablePath }),
    args: ['--enable-features=CanvasCaptureStreamTransparent'], // 透明通道关键 flag
  });
  try {
    // ---- 场景页：驱动动画（与 render 相同纪律）----
    const sceneCtx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const scenePage = await sceneCtx.newPage();
    await scenePage.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `
        html, body { overflow: hidden !important; }
        * { cursor: none !important; }
        video, audio, iframe { visibility: hidden !important; }
      `;
      document.head.appendChild(style);
    });
    await scenePage.goto(pathToFileURL(htmlPath).href);
    await scenePage.evaluate(() => document.fonts.ready);
    const anim = await scenePage.evaluate(() => {
      const anims = document.getAnimations();
      anims.forEach((a) => a.pause());
      let maxDur = 0;
      for (const a of anims) {
        const d = a.effect?.getTiming?.().duration;
        if (typeof d === 'number' && d > 0) maxDur = Math.max(maxDur, d);
      }
      return { count: anims.length, duration: maxDur };
    });
    const loopMs = loopMsOpt ?? (anim.duration > 0 ? anim.duration : 1000);

    // ---- 测实际可达帧率（两遍法：先测速，再按可达值定帧数）----
    // headless 软渲染下 CDP 截图约 40-100ms/帧（场景复杂度相关），
    // 请求 fps 超过可达值时帧数会膨胀、时长失真。测速后用 min(请求, 可达) 采样。
    const measureFps = async () => {
      const warmup = Math.min(3, 5);
      for (let i = 0; i < warmup; i++) {
        await scenePage.evaluate(async (tt) => {
          document.getAnimations().forEach((a) => { a.currentTime = tt; });
          void document.body.offsetHeight;
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        }, 0);
        await scenePage.screenshot({ omitBackground: true });
      }
      const t0 = Date.now();
      const n = 5;
      for (let i = 0; i < n; i++) {
        await scenePage.evaluate(async (tt) => {
          document.getAnimations().forEach((a) => { a.currentTime = tt; });
          void document.body.offsetHeight;
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        }, 0);
        await scenePage.screenshot({ omitBackground: true });
      }
      const per = (Date.now() - t0) / n;
      return Math.min(fps, Math.round(1000 / per));
    };
    const effectiveFps = await measureFps();
    const totalFrames = Math.max(1, Math.ceil((loopMs / 1000) * effectiveFps));

    // ---- 录制页：canvas + MediaRecorder（保留 alpha）----
    const recCtx = await browser.newContext({ viewport: { width, height } });
    const recPage = await recCtx.newPage();
    await recPage.goto('data:text/html,<html><body></body></html>');
    await recPage.evaluate(({ width, height, fps }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.id = 'rec-canvas';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      window.__MYASSETS_CTX__ = ctx;
      const stream = canvas.captureStream(fps);
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      window.__MYASSETS_CHUNKS__ = [];
      rec.ondataavailable = (e) => e.data.size && window.__MYASSETS_CHUNKS__.push(e.data);
      window.__MYASSETS_STOPPED__ = new Promise((res) => (rec.onstop = res));
      window.__MYASSETS_MIME__ = mime;
      rec.start();
      window.__MYASSETS_REC__ = rec;
    }, { width, height, fps });

    // 帧搬运：场景页截图 → 录制页画入 canvas（预算补偿式）
    // 优化：每帧合并为 1 次场景页 evaluate（时间轴+双 rAF）+ 1 次截图 + 1 次录制页绘制
    const frameBudget = 1000 / fps;
    for (let i = 0; i < totalFrames; i++) {
      const t0 = Date.now();
      const t = (i / totalFrames) * loopMs;
      // 场景页：一次 evaluate 完成时间轴定位 + 双 rAF 门控
      await scenePage.evaluate(async (tt) => {
        document.getAnimations().forEach((a) => { a.currentTime = tt; });
        void document.body.offsetHeight;
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      }, t);

      const shot = await scenePage.screenshot({ omitBackground: true });
      const b64 = shot.toString('base64');
      await recPage.evaluate((b64) => {
        return new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            const ctx = window.__MYASSETS_CTX__;
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
            res();
          };
          img.src = 'data:image/png;base64,' + b64;
        });
      }, b64);
      // 预算补偿：等待到本帧预算边界（帧搬运已耗时部分从预算中扣除）
      const elapsed = Date.now() - t0;
      const wait = Math.max(0, frameBudget - elapsed);
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    }

    // 收尾：停止录制，取回 blob
    await recPage.evaluate(() => window.__MYASSETS_REC__.stop());
    const result = await recPage.evaluate(async () => {
      await window.__MYASSETS_STOPPED__;
      const blob = new Blob(window.__MYASSETS_CHUNKS__, { type: window.__MYASSETS_MIME__ });
      const reader = new FileReader();
      const b64 = await new Promise((res) => {
        reader.onload = () => res(String(reader.result).split(',')[1]);
        reader.readAsDataURL(blob);
      });
      return { mime: window.__MYASSETS_MIME__, b64 };
    });

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, Buffer.from(result.b64, 'base64'));

    return {
      file: outFile,
      fps, effectiveFps, loopMs, totalFrames,
      sizeBytes: fs.statSync(outFile).size,
      durationSec: totalFrames / effectiveFps,
      mime: result.mime,
      animCount: anim.count,
    };
  } finally {
    await browser.close();
  }
}
