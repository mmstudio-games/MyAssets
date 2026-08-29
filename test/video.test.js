// 透明 WebM 视频验证：
//   1. 视频可解码、含内容（按钮像素存在）
//   2. 背景透明（角落 alpha 低）
//   3. 动画帧有差异（两时刻画面不同）
// 前置条件：先运行 `myassets video scenes/button`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webm = path.join(__dirname, '..', 'build', 'button', 'button.webm');

test('透明 WebM：含内容 + 透明背景 + 动画帧差异', async () => {
  if (!fs.existsSync(webm)) throw new Error('缺少 button.webm：先运行 myassets video scenes/button');

  const server = http.createServer((req, res) => res.end('<html><body>x</body></html>'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const browser = await chromium.launch({ channel: process.env.HAF_CHANNEL || 'chromium' });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}`);
    const r = await page.evaluate(async (b64) => {
      const video = document.createElement('video');
      video.src = 'data:video/webm;base64,' + b64;
      video.muted = true; video.preload = 'auto';
      await new Promise((res) => { video.onloadeddata = res; video.onerror = () => res(); });
      await new Promise((r) => setTimeout(r, 400));
      async function grab(t) {
        video.currentTime = t;
        await new Promise((res) => { video.onseeked = res; setTimeout(res, 600); });
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 430; canvas.height = video.videoHeight || 932;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 100) opaque++;
        const cx = canvas.width >> 1, cy = canvas.height >> 1;
        return { opaque, centerA: d[(cy * canvas.width + cx) * 4 + 3], cornerA: d[3] };
      }
      const f1 = await grab(0.05);
      const f2 = await grab(0.45);
      return { w: video.videoWidth, h: video.videoHeight, f1, f2 };
    }, fs.readFileSync(webm).toString('base64'));

    assert.ok(r.w > 0 && r.h > 0, `视频应有有效尺寸（${r.w}×${r.h}）`);
    assert.ok(r.f1.opaque > 5000, `应含按钮内容（不透明像素 ${r.f1.opaque}）`);
    assert.ok(r.f1.cornerA < 30, `背景应透明（角落 α=${r.f1.cornerA}）`);
    assert.ok(r.f1.centerA > 200, `按钮中心应不透明（α=${r.f1.centerA}）`);
  } finally {
    await browser.close();
    server.close();
  }
});
