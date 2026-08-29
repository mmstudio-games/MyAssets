#!/usr/bin/env node
// MyAssets CLI（核心逻辑）
// 用法：
//   myassets render <scene> [--out DIR] [--width W] [--height H] [--dpr D]
//                  [--fps F] [--frames N] [--clip x,y,w,h]
//   myassets slice <scene> [--frame N]
// scene 可为目录（内含 index.html / scene.html）或单个 .html 文件路径。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderScene } from './render.js';
import { loadSceneConfig } from './config.js';
import { sliceNineGrid, locateTarget } from './slice.js';
import { exportImportDir } from './import.js';
import { buildAtlas } from './pack.js';
import { renderVideo } from './video.js';
import { exportScene } from './export.js';
import { resolveBrowserArgs } from './browser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log(`MyAssets — 你和 AI 聊天产出的 HTML 页面，都可以在这里工程化变成游戏的位图资产

用法:
  myassets render <scene> [选项]
  myassets slice  <scene> [--frame N]
  myassets import <scene> [--name 资源名]
  myassets pack   <场景|PNG>... [--name 图集名] [--maxw 2048]
  myassets video  <scene> [--out FILE] [--fps N] [--duration MS]
  myassets export <scene> [--out DIR]

场景: 目录（内含 index.html / scene.html）或单个 .html 文件

render 选项:
  --out DIR    输出目录（默认 build/<场景名>/frames）
  --width W    viewport 宽，默认 430
  --height H   viewport 高，默认 932
  --dpr D      像素密度，默认 2
  --fps F      帧率，默认 12
  --frames N   帧数（默认按动画时长×fps 自动覆盖完整周期）
  --clip x,y,w,h  只截取该区域（CSS px）
  --channel NAME  浏览器通道：chromium（内置，默认）/ chrome / msedge
  --executable-path PATH  手动指定浏览器可执行文件（QQ/夸克等任意 Chromium 系内核；优先于 --channel）

slice 选项:
  --frame N       用第 N 帧切图（默认 0，即 f000.png）
  --threshold T   bbox alpha 阈值（默认 32，忽略微弱阴影/杂质）
  --continuity C  边框检测 alpha 阈值（默认 128，排除投影/光晕，只认实体）
  --min-border P  无圆角时的最小边框（默认 4px）
  --border L,T,R,B  手动指定九宫格边框（跳过自动检测）
  --channel NAME / --executable-path PATH  浏览器选择（默认同 render）

import 选项:
  --name NAME  资源名（默认取场景名）
  --channel NAME / --executable-path PATH  浏览器选择（默认同 render）

pack 选项:
  --name NAME  图集名（默认 atlas）
  --maxw N     单行最大宽度（纹理上限，默认 2048）
  --channel NAME / --executable-path PATH  浏览器选择（默认同 render）

video 选项:
  --out FILE    输出 .webm 路径（默认 build/<场景名>/<场景名>.webm）
  --width W     视频宽（CSS px，默认取 scene.yaml）
  --height H    视频高（CSS px，默认取 scene.yaml）
  --fps N       帧率（默认 12）
  --duration MS 时长 ms（默认取最长动画时长）
  --channel NAME / --executable-path PATH  浏览器选择（默认同 render）

export 选项:
  --out DIR     输出目录（默认 build/<场景名>/export）
  --channel NAME / --executable-path PATH  浏览器选择（默认同 render）

示例:
  myassets render scenes/button          # 渲染按钮场景 → 序列帧
  myassets slice scenes/button           # 第 0 帧 → 九宫格切片
  myassets import scenes/button          # → Cocos/Unity 可导入目录
  myassets pack scenes/button            # 12 帧 → 精灵图 sprite sheet
  myassets pack scenes/button scenes/glow-rare   # 多资产 → 图集 atlas
  myassets video scenes/button           # 动画 → 透明 WebM

配置优先级: CLI 参数 > scene.yaml > 默认值
yaml 对应（与 CLI 对齐）:
  width/height/dpr/fps/frames         → render/video
  clip: [x,y,w,h]                     → render 裁剪
  duration: ms                        → video 时长
  slices.target/threshold/continuity/minBorder/border → slice
  atlas.name/maxW                     → pack
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

/** 场景参数 → { htmlPath, sceneDir, name, config } */
export function resolveScene(sceneArg) {
  let sceneDir, htmlPath;
  if (fs.existsSync(sceneArg) && fs.statSync(sceneArg).isDirectory()) {
    sceneDir = sceneArg;
    const candidates = ['index.html', 'scene.html'];
    const found = candidates.find((c) => fs.existsSync(path.join(sceneDir, c)));
    if (!found) throw new Error(`场景目录缺少 index.html / scene.html: ${sceneArg}`);
    htmlPath = path.join(sceneDir, found);
  } else {
    htmlPath = path.resolve(sceneArg);
    sceneDir = path.dirname(htmlPath);
    if (!fs.existsSync(htmlPath)) throw new Error(`场景不存在: ${sceneArg}`);
  }
  const name = path.basename(sceneDir);
  const config = loadSceneConfig(sceneDir);
  return { htmlPath, sceneDir, name, config };
}

async function cmdRender(args) {
  if (args._.length < 1) return usage();
  const { htmlPath, name, config } = resolveScene(args._[0]);
  const outDir = path.resolve(
    args.out ?? path.join(__dirname, '..', 'build', name, 'frames'));

  // clip：CLI "--clip x,y,w,h" > yaml "clip: [x,y,w,h]" > 无
  const clip = (() => {
    let v = null;
    if (args.clip) {
      const [x, y, w, h] = args.clip.split(',').map(Number);
      if (![x, y, w, h].every(Number.isFinite)) throw new Error(`--clip 需为 "x,y,w,h" 四个数字`);
      v = { x, y, w, h };
    } else if (Array.isArray(config.clip) && config.clip.length === 4) {
      const [x, y, w, h] = config.clip.map(Number);
      v = { x, y, w, h };
    }
    return v;
  })();

  const browserOpts = resolveBrowserArgs(args);
  const result = await renderScene({
    htmlPath,
    outDir,
    width: args.width ? Number(args.width) : config.width,
    height: args.height ? Number(args.height) : config.height,
    dpr: args.dpr ? Number(args.dpr) : config.dpr,
    fps: args.fps ? Number(args.fps) : config.fps,
    frames: args.frames ? Number(args.frames) : config.frames,
    clip,
    channel: browserOpts.channel,
    executablePath: browserOpts.executablePath,
  });

  console.log(`✔ 渲染完成: ${result.files.length} 帧 → ${result.outDir}`);
  console.log(`  时长 ${result.loopMs}ms @${result.fps}fps | viewport ${result.width}×${result.height} @${result.dpr}x | 动画 ${result.animCount} 个`);
}

async function cmdSlice(args) {
  if (args._.length < 1) return usage();
  const { htmlPath, name, config } = resolveScene(args._[0]);
  const frameN = args.frame ? Number(args.frame) : 0;
  const framePath = path.resolve(
    path.join(__dirname, '..', 'build', name, 'frames', `f${String(frameN).padStart(3, '0')}.png`));
  if (!fs.existsSync(framePath)) {
    throw new Error(`帧不存在: ${framePath}（先运行 render）`);
  }
  const outDir = path.resolve(path.join(__dirname, '..', 'build', name, 'slices'));

  // 透传浏览器选项给 slice.js（内部从环境变量读取）
  const browserOpts = resolveBrowserArgs(args);
  process.env.HAF_CHANNEL = browserOpts.channel;
  if (browserOpts.executablePath) process.env.HAF_BROWSER_PATH = browserOpts.executablePath;

  // scene.yaml 可声明 slices.target 指定切图目标元素（AI 一个 HTML 放多个按钮时用）
  let targetBox = null;
  const targetSel = config.slices?.target;
  if (targetSel) {
    targetBox = await locateTarget(htmlPath, targetSel, config.dpr, config.width, config.height);
    console.log(`  目标元素 ${targetSel} → 物理区域 ${targetBox.x},${targetBox.y} ${targetBox.w}×${targetBox.h}`);
  }

  // 边框来源优先级：--border CLI > scene.yaml slices.border > HTML 钩子 > 内置自动
  let border = null;
  if (args.border) {
    const [l, t, r, b] = args.border.split(',').map(Number);
    if (![l, t, r, b].every(Number.isInteger)) throw new Error(`--border 需为 "left,top,right,bottom" 四个整数`);
    border = { left: l, top: t, right: r, bottom: b };
  } else if (Array.isArray(config.slices?.border) && config.slices.border.length === 4) {
    const [l, t, r, b] = config.slices.border.map(Number);
    border = { left: l, top: t, right: r, bottom: b };
  }
  if (border) console.log(`  边框来源: 手动指定 L${border.left} T${border.top} R${border.right} B${border.bottom}`);
  else console.log(`  边框来源: ${config.slices?.target ? 'target 定位 + ' : ''}自动检测（HTML 钩子或内置算法）`);

  const result = await sliceNineGrid(framePath, outDir, {
    alphaThreshold: args.threshold ? Number(args.threshold) : config.slices?.threshold ?? 32,
    continuityThreshold: args.continuity ? Number(args.continuity) : config.slices?.continuity ?? 128,
    minBorder: args['min-border'] ? Number(args['min-border']) : config.slices?.minBorder ?? 4,
    targetBox,
    border,
    hookHtmlPath: htmlPath,   // 自动探测 HTML 里的 __MYASSETS_DETECT__（手动 border 时跳过）
  });

  const b = result.borders;
  console.log(`✔ 九宫格切图完成 → ${outDir}`);
  console.log(`  边框 left=${b.left} top=${b.top} right=${b.right} bottom=${b.bottom}px（来源: ${result.borderSource}）`);
  console.log(`  内容区 ${result.contentBox.w}×${result.contentBox.h} | 9 张切片 + ninegrid.json`);
}

async function cmdImport(args) {
  if (args._.length < 1) return usage();
  const { name, config } = resolveScene(args._[0]);
  const slicesMeta = path.resolve(path.join(__dirname, '..', 'build', name, 'slices', 'ninegrid.json'));
  const framePath = path.resolve(path.join(__dirname, '..', 'build', name, 'frames', 'f000.png'));
  if (!fs.existsSync(slicesMeta)) throw new Error(`缺少切图结果: ${slicesMeta}（先运行 slice）`);
  const meta = JSON.parse(fs.readFileSync(slicesMeta, 'utf8'));
  const outDir = path.resolve(path.join(__dirname, '..', 'build', name, 'import'));

  const browserOpts = resolveBrowserArgs(args);
  process.env.HAF_CHANNEL = browserOpts.channel;
  if (browserOpts.executablePath) process.env.HAF_BROWSER_PATH = browserOpts.executablePath;
  const res = await exportImportDir(meta, framePath, outDir, {
    name: args.name ?? config.name ?? name,
    channel: browserOpts.channel,
    executablePath: browserOpts.executablePath,
  });
  console.log(`✔ 导入资源目录生成 → ${outDir}`);
  for (const f of res.files) console.log(`  ${path.basename(f)}`);
  const b = meta.borders;
  console.log(`  九宫格边框 L${b.left} T${b.top} R${b.right} B${b.bottom}px`);
}

/**
 * 解析 pack 输入：场景名或 PNG 路径 → [{name, file}]
 * 场景解析优先级：frames 全部帧（序列帧精灵图）> import 单图（静态单帧）
 *   - pack scenes/button      → 12 帧精灵图
 *   - pack scenes/glow-rare   → 只有 1 帧，退化为单图
 */
function resolvePackInputs(args) {
  const inputs = [];
  for (const arg of args._) {
    const p = path.resolve(arg);
    if (fs.existsSync(p) && fs.statSync(p).isFile() && p.endsWith('.png')) {
      inputs.push({ name: path.basename(p, '.png'), file: p });
      continue;
    }
    // 场景目录（scenes/xxx）→ 产物在 build/<name>/ 下
    const sceneDir = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : null;
    const name = sceneDir ? path.basename(sceneDir) : arg;
    const buildDir = path.resolve(path.join(__dirname, '..', 'build', name));
    const framesDir = path.join(buildDir, 'frames');
    const importSingle = path.join(buildDir, 'import', `${name}.png`);
    if (fs.existsSync(framesDir)) {
      const frames = fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).sort();
      for (const f of frames) inputs.push({ name: `${name}-${path.basename(f, '.png')}`, file: path.join(framesDir, f) });
    } else if (fs.existsSync(importSingle)) {
      inputs.push({ name: `${name}.png`, file: importSingle });
    } else {
      throw new Error(`场景 ${arg} 没有可打包的产物（先 render/import）`);
    }
  }
  return inputs;
}

async function cmdPack(args) {
  if (args._.length < 1) return usage();
  const inputs = resolvePackInputs(args);
  const browserOpts = resolveBrowserArgs(args);
  const outDir = path.resolve(path.join(__dirname, '..', 'build', 'atlas'));

  // 图集参数：CLI > 第一个场景的 scene.yaml atlas > 默认
  let atlasCfg = { name: 'atlas', maxW: 2048 };
  try {
    const firstScene = args._[0];
    const p = path.resolve(firstScene);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const cfg = loadSceneConfig(p);
      atlasCfg = { name: cfg.atlas?.name ?? 'atlas', maxW: cfg.atlas?.maxW ?? 2048 };
    }
  } catch { /* 非场景输入（PNG 文件）时用默认 */ }
  const textureName = args.name ?? atlasCfg.name;

  const res = await buildAtlas(inputs, outDir, {
    maxW: args.maxw ? Number(args.maxw) : atlasCfg.maxW,
    channel: browserOpts.channel,
    executablePath: browserOpts.executablePath,
    textureName,
  });

  console.log(`✔ 图集打包完成 → ${outDir}`);
  console.log(`  图集 ${res.meta.w}×${res.meta.h} | ${inputs.length} 个资产 | ${path.basename(res.atlas)}`);
  console.log(`  坐标 ${path.basename(res.json)} | Cocos ${path.basename(res.plist)}`);
}

async function cmdVideo(args) {
  if (args._.length < 1) return usage();
  const { htmlPath, name, config } = resolveScene(args._[0]);
  const outFile = path.resolve(
    args.out ?? path.join(__dirname, '..', 'build', name, `${name}.webm`));
  const browserOpts = resolveBrowserArgs(args);

  const result = await renderVideo({
    htmlPath,
    outFile,
    width: args.width ? Number(args.width) : config.width,
    height: args.height ? Number(args.height) : config.height,
    fps: args.fps ? Number(args.fps) : config.fps,
    loopMs: args.duration ? Number(args.duration) : config.duration ?? null,
    channel: browserOpts.channel,
    executablePath: browserOpts.executablePath,
  });

  console.log(`✔ 透明视频导出完成 → ${result.file}`);
  console.log(`  ${(result.sizeBytes / 1024).toFixed(0)}KB | ${result.effectiveFps}fps（请求 ${result.fps}fps）| ${result.durationSec.toFixed(2)}s | ${result.mime} | 动画 ${result.animCount} 个`);
  if (result.effectiveFps < result.fps) {
    console.log(`  ⚠ 请求 ${result.fps}fps 超过本机截图速率上限，已按实际可达 ${result.effectiveFps}fps 采样（帧数=${result.totalFrames}，时长正确）`);
  }
}

async function cmdExport(args) {
  if (args._.length < 1) return usage();
  const { htmlPath, name, config } = resolveScene(args._[0]);
  const framePath = path.resolve(path.join(__dirname, '..', 'build', name, 'frames', 'f000.png'));
  if (!fs.existsSync(framePath)) throw new Error(`帧不存在: ${framePath}（先运行 render）`);
  if (!config.assets || !Array.isArray(config.assets) || config.assets.length === 0) {
    throw new Error(`场景 ${name} 的 scene.yaml 缺少 assets 声明（多资产编排）`);
  }
  const outDir = path.resolve(args.out ?? path.join(__dirname, '..', 'build', name, 'export'));
  const browserOpts = resolveBrowserArgs(args);

  const res = await exportScene({
    htmlPath, framePath, outDir,
    assets: config.assets, config,
    browser: browserOpts,
  });

  console.log(`✔ 场景导出完成 → ${outDir}`);
  for (const a of res.manifest.assets) {
    const extra = a.type === 'nine-slice' ? ` 边框 L${a.borders.left} T${a.borders.top} R${a.borders.right} B${a.borders.bottom}` : '';
    console.log(`  ${a.name} [${a.type}] ${a.size.w}×${a.size.h}${extra}`);
  }
  console.log(`  manifest.json`);
}

/** CLI 入口（bin/myassets.js 与直接 node src/cli.js 共用） */
export async function run(argv = process.argv.slice(2)) {
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  try {
    switch (cmd) {
      case 'render':
        await cmdRender(args);
        break;
      case 'slice':
        await cmdSlice(args);
        break;
      case 'import':
        await cmdImport(args);
        break;
      case 'pack':
        await cmdPack(args);
        break;
      case 'video':
        await cmdVideo(args);
        break;
      case 'export':
        await cmdExport(args);
        break;
      default:
        usage();
    }
  } catch (e) {
    console.error(`✘ ${e.message}`);
    process.exitCode = 1;
  }
}

// 仅当直接运行本文件（node src/cli.js 或 node bin/myassets.js）时才执行 CLI；
// 作为库被 import 时（如 src/index.js 导出 resolveScene）不应触发命令执行。
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  await run();
}

