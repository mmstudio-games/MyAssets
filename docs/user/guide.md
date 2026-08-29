# MyAssets 用户指南

> 面向**使用者**（游戏开发者 / 独立开发者 / AI 写场景的人）。安装、用法、场景编写纪律、内核选择都在这里。
> 想参与开发？看 [开发者文档](../dev/architecture.md) 和 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

## 先读：资产生成方向决策

不确定某个资产该用什么方式生成？看 [资产生成方向决策指南](asset-sourcing.md)——技术美术 / MyAssets / AI 文生图 三分法 + 决策树，帮你在动手前选对方向。

## 安装

```bash
npm install                    # 安装依赖（playwright）
npx playwright install chromium  # 首次安装内置渲染内核（版本锁定）
# 可选：npm link 注册全局命令 myassets
```

## 快速开始（30 秒出第一张图）

```bash
# 1. 渲染：HTML 场景 → PNG 序列帧
myassets render scenes/button

# 2. 切图：第 0 帧 → 九宫格 3×3 切片 + 边框参数
myassets slice scenes/button

# 3. 导入：生成引擎可导入目录（Cocos .meta / Unity / 参数 JSON / 说明）
myassets import scenes/button
```

产物在 `build/<场景名>/`：

```
build/button/
├─ frames/   12 帧 PNG 序列帧（动画胶片）
├─ slices/   9 张九宫格切片 + ninegrid.json（边框参数）
└─ import/   单图 + 引擎 meta + 导入说明
```

## 程序化贴图（P0：渐变/光晕/辉光/遮罩）

游戏里大量"贴图"其实是纯几何 + 渐变，CSS 一行就能出，MyAssets 确定性渲染成透明 PNG。内置场景示例：

| 场景 | 资产 | 用法 |
|---|---|---|
| `scenes/glow-rare` | 卡牌稀有度光晕 | 径向渐变 + blur，透明 PNG，512×512 |
| `scenes/bar-track` | 血条/进度条渐变底 | 线性渐变 + 高光，九宫格可拉伸 |
| `scenes/vfx-masks` | 技能光晕底 + 按钮按下遮罩 | 多元素同页，`slices.target` 分别切 |

```bash
myassets render scenes/glow-rare   # 光晕贴图（静态 1 帧，scene.yaml 已配 frames: 1）
myassets render scenes/bar-track && myassets slice scenes/bar-track   # 血条底 + 九宫格
```

**要点**：
- 贴图场景在 `scene.yaml` 设 `frames: 1`（静态单帧，不需要动画）
- 半透明资产（遮罩/光晕）的边框检测会退化为 minBorder 兜底——半透明不适合实体连续性检测，属预期行为
- 哪些该用 MyAssets 做、哪些该用文生图/TA 做，见 [资产生成方向决策指南](asset-sourcing.md)

## CLI 命令

| 命令 | 作用 |
|---|---|
| `myassets render <scene>` | 确定性逐帧渲染 → PNG 序列帧 |
| `myassets slice <scene>` | 九宫格自动切图 → 9 切片 + 边框参数 |
| `myassets import <scene>` | 生成引擎可导入目录 |

运行 `myassets`（无参数）查看全部选项。

### 尺寸控制（任意比例）

```bash
myassets render scenes/button --width 512 --height 512 --dpr 2   # 1:1 正方形
myassets render scenes/button --width 1024 --height 512          # 横屏
```

优先级：CLI 参数 > scene.yaml > 默认（430×932 @2x）。

## 场景（scenes/）：一个 .html 就是一个场景

AI 只需写自包含 HTML（内联 CSS、keyframes 动画、透明背景、系统字体），零配置即可出图。可选 `scene.yaml` 覆盖参数——**所有 CLI 参数都有 yaml 对应**（优先级：CLI > yaml > 默认）：

```yaml
# scene.yaml 完整参数（与 CLI 对齐）
name: button
width: 430        # render/video 宽（CSS px）
height: 932       # render/video 高
dpr: 2            # render 像素密度（2 = 物理像素 ×2）
fps: 12           # render/video 帧率
frames: 24        # render 帧数（默认按动画时长×fps 自动覆盖完整周期）
duration: 2000    # video 时长 ms（默认取最长动画时长）
clip: [0, 0, 300, 200]   # render 裁剪区 [x, y, w, h]（CSS px）
slices:           # slice 切图参数
  target: .btn    #   指定切图目标元素（一个 HTML 多个按钮时用 CSS 选择器）
  threshold: 32   #   bbox alpha 阈值（--threshold）
  continuity: 128 #   边框检测 alpha 阈值（--continuity）
  minBorder: 4    #   无圆角时的最小边框（--min-border）
  border: [16, 16, 16, 16]   # 手动边框 [L, T, R, B]（--border，跳过自动检测）
atlas:            # pack 图集参数
  name: ui-pack   #   图集名（--name）
  maxW: 2048      #   单行最大宽度（--maxw）
```

## 场景编写纪律（AI 只需遵守这几点）

1. 动画用 `@keyframes` / Web Animations API，**禁用 transition**（跳帧时 transition 直接跳终点）
2. 动画内禁用 `Math.random()` / 真实时间（确定性用固定时间轴）
3. `body` 背景透明（游戏资产需要透明 PNG）
4. 字体用系统字体或授权 Web 字体（避免商用授权问题）
5. 按钮类元素建议显式 `border: none`（`<button>` 有浏览器默认 2px 边框，会影响圆角检测精度）

## 渲染内核选择（三档）

| 内核来源 | 用法 | 适用场景 |
|---|---|---|
| **内置 Chromium**（默认） | 不加参数 | **正式出资产**。版本锁定，同输入必同输出（确定性锚点） |
| **系统浏览器自动发现** | `--channel chrome` / `--channel msedge` | 日常调试。macOS/Linux/Windows 自动找已装浏览器 |
| **手动指定任意 Chromium 系内核** | `--executable-path <路径>` | QQ 浏览器/夸克/私有内核等 Playwright 不认识但基于 Chromium/Blink 的浏览器 |

```bash
myassets render scenes/button                                   # 内置 Chromium
myassets render scenes/button --channel chrome                  # 系统 Chrome（自动发现）
myassets render scenes/button --channel msedge                  # 系统 Edge
myassets render scenes/button --executable-path "C:\QQBrowser\QQ.exe"  # 手动指定
```

**要点**：
- 三个通道当前渲染逐字节一致（同一 Blink 内核）；但**系统浏览器升级后可能变化**，正式出资产建议用内置 Chromium
- `--executable-path` 优先于 `--channel`；路径不存在会给出友好错误
- 非 Chromium 内核（如 Safari/WebKit）不保证像素一致，不建议使用
- slice / import 同样支持 `--channel` / `--executable-path`（保持与 render 一致的内核）

## 自定义九宫格边框（三档来源）

自动检测不满足时，可用两种方式自定义边框：

### 方式 1：手动指定（--border / scene.yaml）

```bash
myassets slice scenes/button --border 30,30,30,30   # L,T,R,B
```

或 scene.yaml：

```yaml
slices:
  target: .btn
  border: [30, 30, 30, 30]   # 跳过自动检测，直接用指定边框
```

### 方式 2：HTML 内嵌钩子（自定义算法，AI 工作流友好）

在场景 HTML 里实现约定函数 `window.__MYASSETS_DETECT__`，MyAssets 检测到就调用它替代内置算法：

```html
<script>
  window.__MYASSETS_DETECT__ = function (imageData, ctx) {
    // imageData: 帧的 RGBA 像素数据（可自定义检测逻辑）
    // 返回 {left, top, right, bottom} 四个边框整数
    return { left: 24, top: 24, right: 24, bottom: 24 };
  };
</script>
```

**用法**：直接对你的 AI 说"我的按钮边框固定 24px，在 HTML 里加上 `__MYASSETS_DETECT__` 钩子"，它就会帮你写。

### 优先级与回退

```
--border CLI > scene.yaml border > HTML 钩子 > 内置自动检测
```

- 钩子缺失 / 抛错 / 返回非法值 → 自动回退内置算法（不会崩溃）
- ninegrid.json 记录 `borderSource`：manual / html-hook / auto，方便追溯

## 图集打包（pack：序列帧精灵图 / 多资产图集）

把多个 PNG 合成一张大图，减少 DrawCall 和内存。自动裁剪每张图的透明边（trim）。

```bash
# 序列帧精灵图：button 12 帧 → 一张 sprite sheet
myassets pack scenes/button

# 多资产图集：多个场景混合打包
myassets pack scenes/button scenes/glow-rare scenes/bar-track --name ui-atlas

# 也可以直接传 PNG 文件
myassets pack assets/a.png assets/b.png
```

产物在 `build/atlas/`：

```
atlas.png       合成大图（透明底，自动 trim）
atlas.json      引擎无关坐标（name → {x,y,w,h} + trim 信息）
atlas.plist     Cocos 图集描述（TexturePacker 兼容，含 sourceSize/offset）
```

**要点**：
- 场景输入优先级：frames 全部帧（序列帧精灵图）> import 单图（静态单帧）
- `--maxw 2048` 可调单行宽度（GPU 纹理上限）；`--name` 改图集名
- **trim 很重要**：整页截图的透明边会被裁掉（实测 12 帧从 11184px 高降到 894px），否则超出纹理上限

## 透明视频（video：动画 → WebM）

UI 动效（抽卡金光、转场、呼吸发光）用序列帧 PNG 包体太大时，导出透明 WebM：

```bash
myassets video scenes/button                              # → build/button/button.webm（VP9 + alpha）
myassets video scenes/button --fps 24 --duration 2000     # 自定义帧率/时长
myassets video scenes/button --width 540 --height 960     # 自定义宽高（竖屏等）
```

- **透明背景**：VP9 alpha 通道保留（Chromium `CanvasCaptureStreamTransparent` flag）
- **宽高/帧率/时长均可设**：CLI 参数 > scene.yaml > 默认
- **fps 自动降级**：headless 渲染下截图有速率上限（约 10-26fps，视场景复杂度）。请求 fps 超过上限时自动按实际可达值采样，**时长保持正确**，并提示实际帧率
- **帧内容确定性**：与 render 同时间轴/同截图通道；视频编码为 VBR 字节级不确定（行业常态）
- 引擎用 VideoPlayer 播放即可，无需序列帧组件

## 多资产编排（export：一个界面一次导出整套）

主菜单/结算屏由多个资产组成，scene.yaml 声明后一次导出：

```yaml
name: main-menu
assets:
  - name: start-btn      # 九宫格按钮
    selector: .start-btn
    nine: true
  - name: title-glow     # 整图贴图
    selector: .title-glow
    nine: false
```

```bash
myassets render scenes/main-menu
myassets export scenes/main-menu   # → build/main-menu/export/（每资产一个目录 + manifest.json）
```

## 引擎帧装配器（engine-libs/）

把 myassets 的帧**调各引擎原生 API** 一键装配成原生播放资产（Godot SpriteFrames / Cocos AnimationClip / UE5 Flipbook）——单文件脚本，导入项目调用即可，无需做插件。见 [engine-libs/README.md](../../engine-libs/README.md)。

## 编程 API

```js
import { renderScene, sliceNineGrid, exportImportDir } from 'myassets';

const result = await renderScene({ htmlPath: 'scenes/button/index.html', outDir: 'build/button/frames' });
await sliceNineGrid(result.files[0], 'build/button/slices');
await exportImportDir(meta, result.files[0], 'build/button/import');
```

## 常见问题

**Q: 输出 PNG 背景不是透明的？**
场景里 `body { background: transparent }`，且渲染器已强制 `omitBackground`。检查场景是否设置了背景色。

**Q: 切出来的九宫格边框值看不懂？**
`ninegrid.json` 的 `borders`（left/top/right/bottom）是物理像素值，直接给引擎 Sliced 模式用。若按 Pixels Per Unit 缩放需同比换算。

**Q: 一个 HTML 里有多个按钮，切图切到整个页面了？**
在 `scene.yaml` 声明 `slices: target: .btn-a`（CSS 选择器）指定切图目标。

**Q: 想用自己装的浏览器（QQ/夸克）？**
用 `--executable-path <浏览器exe路径>`，任何 Chromium 系内核都行。
