// 资源导入目录生成：九宫格资产 → 引擎可导入格式
//   1. button.png        —— 裁好的内容区单图（Cocos/Unity Sliced 模式用）
//   2. button.meta.json  —— 引擎无关的九宫格参数（border + 网格布局）
//   3. cocos.meta        —— Cocos Creator 3.x sprite-frame 元数据（含 borderTop 等）
//   4. unity.meta        —— Unity .meta 同目录占位 + 参数说明
//   5. README.md         —— 各引擎导入指引
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveLaunchOptions, assertExecutablePath } from './browser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 生成引擎可导入资源目录。
 * @param {object} meta  sliceNineGrid 的返回（含 borders/contentBox/slices rects）
 * @param {string} framePath 源帧
 * @param {string} outDir 输出目录（build/<name>/import）
 * @param {object} opts { name='asset', channel, executablePath }
 */
export async function exportImportDir(meta, framePath, outDir, { name = 'asset', channel = 'chromium', executablePath = null } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  assertExecutablePath(executablePath);

  // ---- 1. 单图：从源帧裁剪 contentBox 区域 ----
  const browser = await chromium.launch(resolveLaunchOptions({ channel, executablePath }));
  const png = await (async () => {
    try {
      const page = await browser.newPage();
      const frameB64 = fs.readFileSync(framePath).toString('base64');
      const rect = meta.contentBox;
      return await page.evaluate(async ({ b64, rect }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = rect.w; c.height = rect.h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        return c.toDataURL('image/png');
      }, { b64: frameB64, rect });
    } finally {
      await browser.close();
    }
  })();
  const singlePath = path.join(outDir, `${name}.png`);
  fs.writeFileSync(singlePath, Buffer.from(png.split(',')[1], 'base64'));

  // ---- 2. 引擎无关参数 ----
  const params = {
    name,
    format: 'nine-slice',
    image: `${name}.png`,
    size: { w: meta.contentBox.w, h: meta.contentBox.h },
    borders: meta.borders,   // { left, top, right, bottom } 物理像素（= 源图像素）
    grid: {
      // 9 格在源图内的矩形（引擎 Sliced 模式只需 borders；传统 Scale9 用 grid）
      rows: [
        [meta.slices.tl, meta.slices.t, meta.slices.tr],
        [meta.slices.l, meta.slices.c, meta.slices.r],
        [meta.slices.bl, meta.slices.b, meta.slices.br],
      ],
    },
    engineHints: {
      cocos: 'spriteFrame: 设 spriteType=Sliced，border 用 borders 值',
      unity: 'SpriteEditor: border 用 borders 值（L/R/T/B）',
      godot: 'NinePatchRect: patch_margin_* 用 borders 值',
    },
  };
  const paramsPath = path.join(outDir, `${name}.meta.json`);
  fs.writeFileSync(paramsPath, JSON.stringify(params, null, 2));

  // ---- 3. Cocos Creator 3.x .meta（sprite-frame importer）----
  // Cocos 会在导入时识别 borderLeft/Right/Top/Bottom 为九宫格边框
  const cocosMeta = {
    ver: '1.0.25',
    importer: 'sprite-frame',
    imported: true,
    uuid: null, // 由 Cocos 首次导入时分配
    files: ['.json'],
    subMetas: {},
    userData: {
      trimType: 'auto',
      trimThreshold: 1,
      rotate: false,
      offsetX: 0,
      offsetY: 0,
      trimX: 0,
      trimY: 0,
      width: meta.contentBox.w,
      height: meta.contentBox.h,
      rawWidth: meta.contentBox.w,
      rawHeight: meta.contentBox.h,
      borderTop: meta.borders.top,
      borderBottom: meta.borders.bottom,
      borderLeft: meta.borders.left,
      borderRight: meta.borders.right,
      meshType: 0,
      packable: true,
    },
  };
  fs.writeFileSync(path.join(outDir, `${name}.png.meta`), JSON.stringify(cocosMeta, null, 2));

  // ---- 4. Unity .meta 占位 + 说明 ----
  const unityMeta = `fileFormatVersion: 2
guid: 00000000000000000000000000000000
TextureImporter:
  spriteMode: 9
  spriteBorder: {x: ${meta.borders.left}, y: ${meta.borders.bottom}, z: ${meta.borders.right}, w: ${meta.borders.top}}
  spritePixelsPerUnit: 100
  textureType: Sprite
`;
  fs.writeFileSync(path.join(outDir, `${name}.png.unitymeta`), unityMeta);

  // ---- 5. README ----
  const readme = `# ${name} — 九宫格资源导入说明

由 MyAssets 自动生成（源帧: ${path.basename(framePath)}）。你和 AI 聊天产出的 HTML 页面，都可以在这里工程化变成游戏的位图资产。

## 边框参数（像素）
- left=${meta.borders.left}  top=${meta.borders.top}
- right=${meta.borders.right}  bottom=${meta.borders.bottom}

## 各引擎用法
| 引擎 | 文件 | 操作 |
|---|---|---|
| Cocos Creator 3.x | ${name}.png（旁有 .meta） | 资源管理器选中 → SpriteFrame 属性：Type 设为 Sliced，Size Mode 选 Custom；边框已写入 .meta 的 borderTop/Bottom/Left/Right |
| Unity | ${name}.png | Sprite Editor → 拖出 9-slice 边框线（值见上），或直接用同目录 .unitymeta 的 spriteBorder |
| Godot | ${name}.png | 用 NinePatchRect 节点，patch_margin_left/top/right/bottom 填上表值 |
| Cocos2d-x (传统) | slices/ 下 9 张切片 | CCScale9Sprite::create 依次传入 tl/t/tr/l/c/r/bl/b/br |

## 注意
- 边框值 = 渲染帧物理像素（@DPR）。Cocos/Unity 中如源图按 1:1 导入，直接使用即可；
  若按 Pixels Per Unit 缩放，边框值需同比换算。
- 文字"开始游戏"属于按钮底图的一部分，拉伸时中间格会横向拉长文字——
  引擎里建议把文字拆成独立 Label 叠在按钮上方（标准做法）。
`;
  const readmePath = path.join(outDir, 'README.md');
  fs.writeFileSync(readmePath, readme);

  return { singlePath, paramsPath, files: [singlePath, paramsPath, path.join(outDir, `${name}.png.meta`), path.join(outDir, `${name}.png.unitymeta`), readmePath] };
}
