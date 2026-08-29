// 确定性逐帧渲染器 —— 实现技术文档 3.2/3.3 节纪律
// 纪律要点：
//   ① fonts.ready 等待字体就绪（否则整批帧回退字体）
//   ② 暂停所有动画，时间轴驱动（currentTime 精确跳帧）
//   ③ 强制同步布局（offsetHeight 读）
//   ④ 双 rAF 门控：确保该帧已提交合成器
//   ⑤ 串行 await，固定 viewport + DPR，clip 裁准
//   禁：滚动条/光标/hover/媒体播放；transition（跳帧直接跳终点）

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { resolveLaunchOptions, assertExecutablePath } from './browser.js';

/**
 * 渲染一个 HTML 场景为 PNG 序列帧（确定性）。
 * @param {object} opts
 * @param {string} opts.htmlPath   场景 HTML 绝对路径
 * @param {string} opts.outDir     输出目录（帧写入 f000.png, f001.png ...）
 * @param {number} [opts.width=430]   viewport 宽（CSS px）
 * @param {number} [opts.height=932]  viewport 高（CSS px）
 * @param {number} [opts.dpr=2]       deviceScaleFactor（像素密度）
 * @param {number} [opts.fps=12]      帧率
 * @param {number} [opts.frames]      帧数（默认按动画时长×fps 自动覆盖一个完整周期）
 * @param {number} [opts.loopMs]      循环时长 ms（默认取页面最长动画时长，无动画时 1000）
 * @param {{x:number,y:number,w:number,h:number}|null} [opts.clip] 裁剪区（CSS px，相对 viewport 原点）
 * @param {boolean} [opts.headless=true]
 * @param {'chromium'|'chrome'|'msedge'} [opts.channel='chromium'] 浏览器通道；'chrome' 复用系统 Chrome
 * @param {string|null} [opts.executablePath] 手动指定浏览器可执行文件（QQ/夸克等任意 Chromium 系）
 */
export async function renderScene(opts) {
  const {
    htmlPath,
    outDir,
    width = 430,
    height = 932,
    dpr = 2,
    fps = 12,
    frames: framesOpt,
    loopMs: loopMsOpt,
    clip = null,
    headless = true,
    channel = 'chromium',
    executablePath = null,
  } = opts;

  if (!fs.existsSync(htmlPath)) throw new Error(`场景不存在: ${htmlPath}`);
  fs.mkdirSync(outDir, { recursive: true });
  assertExecutablePath(executablePath);

  const browser = await chromium.launch({ headless, ...resolveLaunchOptions({ channel, executablePath }) });
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: dpr,
    });
    const page = await context.newPage();

    // 纪律：禁滚动条 / 光标 / 媒体 / hover 副作用
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `
        html, body { overflow: hidden !important; }
        * { cursor: none !important; }
        video, audio, iframe { visibility: hidden !important; }
      `;
      document.head.appendChild(style);
    });

    await page.goto(pathToFileURL(htmlPath).href);

    // ① 字体就绪
    await page.evaluate(() => document.fonts.ready);

    // ② 暂停所有动画，读取最长动画时长（时间轴驱动）
    const anim = await page.evaluate(() => {
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
    const frames = framesOpt ?? Math.max(1, Math.ceil((loopMs / 1000) * fps));

    const seq = [];
    for (let i = 0; i < frames; i++) {
      // ③ 精确跳帧：时间轴定位 + 强制同步布局
      const t = (i / frames) * loopMs;
      await page.evaluate((tt) => {
        document.getAnimations().forEach((a) => { a.currentTime = tt; });
        void document.body.offsetHeight; // 强制同步布局（style→layout→paint）
      }, t);

      // ④ 双 rAF 门控：确保该帧已提交合成器缓冲
      await page.evaluate(() => new Promise((res) =>
        requestAnimationFrame(() => requestAnimationFrame(res))));

      // ⑤ 读帧（CDP captureScreenshot，读合成帧缓冲，无副作用）
      const shotOpts = { path: path.join(outDir, `f${String(i).padStart(3, '0')}.png`), omitBackground: true };
      if (clip) {
        shotOpts.clip = { x: clip.x, y: clip.y, width: clip.w, height: clip.h };
      }
      await page.screenshot(shotOpts);
      seq.push(shotOpts.path);
    }

    return {
      frames, fps, loopMs, width, height, dpr,
      animCount: anim.count, animDuration: anim.duration,
      outDir, files: seq,
    };
  } finally {
    await browser.close();
  }
}
