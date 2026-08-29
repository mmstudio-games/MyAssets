---
name: myassets
description: 面向游戏开发者的 MyAssets 资产生成工作流。当用户想把 HTML/CSS 页面（含 AI 生成的）变成游戏引擎可用的位图资产（PNG 序列帧 / 九宫格切图 / 精灵图 / 透明 WebM / 引擎导入目录）时使用。指导 AI 写出符合 MyAssets 纪律的场景 HTML，并正确调用 myassets CLI 完成 render / slice / pack / video / export / import / golden 全流程。
whenToUse: 用户提到"游戏资产""序列帧""九宫格""精灵图""贴图""按钮素材""UI 素材""抽卡动画""透明视频""接入 Cocos/Godot/UE5"，或要求把 HTML/CSS 变成游戏引擎可用的位图资产时。
---

# MyAssets —— 给游戏开发者：把 HTML/CSS 变成游戏引擎资产

## 这是什么

**MyAssets** 是一款 CLI 工具：**你和 AI 聊天产出的 HTML 页面，都可以在这里工程化变成游戏的位图资产**。

它用浏览器内核（Chromium）把 HTML/CSS **确定性渲染**成游戏引擎可直接使用的资产：

| 命令 | 作用 | 产物 |
|---|---|---|
| `myassets render <scene>` | 确定性逐帧渲染 | PNG 序列帧（f000.png ~ f00N.png） |
| `myassets slice <scene>` | 九宫格自动切图 | 9 张切片 + 边框参数 |
| `myassets pack <scene>...` | 图集打包 | 精灵图 + 坐标 + Cocos .plist |
| `myassets video <scene>` | 透明视频 | WebM（VP9 + alpha） |
| `myassets export <scene>` | 多资产编排 | 一个界面整套资产 + manifest |
| `myassets import <scene>` | 引擎导入 | Cocos .meta / Unity meta |
| `myassets golden <scene>` | 视觉回归 | 渲染 vs 基线逐像素对比（`--update` 刷新基线） |

**核心价值**：
- **确定性**：同输入必同输出（两次渲染逐字节一致）——AI 反复调整也不怕资产漂移
- **零配置**：一个 .html 就是一个场景，AI 写完直接出图
- **引擎直通**：Cocos / Godot / UE5 都能用（帧装配器在 engine-libs/）

## 你（AI）的职责：帮用户写出"符合纪律的场景 HTML"

用户是游戏开发者，不是前端工程师。**你要替用户把 HTML/CSS 写好**，遵循以下纪律：

### 场景编写纪律（5 条铁律）

1. **动画用 `@keyframes` / Web Animations API**，**禁用 transition**（跳帧时 transition 直接跳终点，会出 bug）
2. **动画内禁用 `Math.random()` / 真实时间**（确定性用固定时间轴；想随机变化就用 CSS 动画本身）
3. **`body { background: transparent }`**（游戏资产需要透明 PNG）
4. **字体用系统字体**（`system-ui, sans-serif`）或授权 Web 字体（避免商用授权问题）
5. **按钮类元素显式 `border: none`**（`<button>` 有浏览器默认 2px 边框，影响圆角检测精度）

### 一个标准场景模板（直接照此写）

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: transparent; width: 100%; height: 100%; }
  body { display: flex; align-items: center; justify-content: center; }
  .btn {
    font-family: system-ui, sans-serif;
    font-size: 32px; font-weight: 700; color: #6b3f00;
    letter-spacing: 6px;
    padding: 18px 56px;
    border: none;               /* 纪律 5 */
    border-radius: 18px;
    background: linear-gradient(180deg, #ffe9a8 0%, #ffd25e 45%, #f5a623 100%);
    box-shadow: inset 0 3px 0 rgba(255,255,255,0.7), inset 0 -4px 0 rgba(160,90,0,0.3),
                0 6px 16px rgba(0,0,0,0.4);
    animation: breathe 1s ease-in-out infinite;   /* 纪律 1：keyframes */
  }
  @keyframes breathe {
    0%   { transform: scale(1); }
    50%  { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
</style>
</head>
<body>
  <button class="btn">开始游戏</button>
</body>
</html>
```

> **更多模板**：按钮 / 抽卡金光 / 血条 / 光晕 / 遮罩 / 整屏界面 → 见同目录 [templates.md](templates.md)，按需选取改样式。

## 完整工作流（按需引导用户）

### 场景目录结构

```
mygame/
├─ scenes/            ← 你的场景 HTML 放这里（每个场景一个子目录）
│  ├─ button/index.html + scene.yaml（可选）
│  └─ gold-anim/index.html
├─ build/             ← 产物自动生成（gitignore）
```

### 步骤 1：安装

```bash
npm install myassets
npx playwright install chromium    # 首次装内置渲染内核（版本锁定）
```

### 步骤 2：写场景（AI 代劳）

按上面的模板写 HTML。可选 `scene.yaml` 覆盖参数：

```yaml
# scenes/button/scene.yaml
name: button
width: 430          # 渲染宽（CSS px）
height: 932         # 渲染高
dpr: 2              # 像素密度
fps: 12             # 帧率（video 也用它）
slices:
  target: .btn      # 切图目标元素（一个页面多个按钮时指定）
  border: [16,16,16,16]   # 可选：手动指定九宫格边框
```

### 步骤 3：跑命令

```bash
myassets render scenes/button     # 序列帧
myassets slice scenes/button      # 九宫格切图
myassets video scenes/button      # 透明 WebM（UI 动效用）
myassets pack scenes/button scenes/gold-anim   # 多场景打包成图集
myassets export scenes/main-menu  # 一个界面整套资产（scene.yaml 配 assets）
myassets import scenes/button     # 引擎导入目录
myassets golden scenes/button     # 视觉回归：与基线逐像素对比（首次/有意变更后加 --update）
```

### 步骤 4：接入引擎

| 引擎 | 用法 |
|---|---|
| **Cocos**（小游戏/页游） | 透明 WebM 直接播（浏览器原生支持 VP9 alpha）；序列帧用 engine-libs/cocos/my-assets-builder.ts 装配 AnimationClip |
| **Godot**（独立游戏） | 序列帧用 engine-libs/godot/my_assets_builder.gd 装配 SpriteFrames（Godot 原生无透明视频） |
| **UE5**（3A/电影） | 序列帧用 engine-libs/ue5/my_assets_builder.py 装配 Flipbook |

## 常见需求 → 做法对照

| 用户说 | 你该做什么 |
|---|---|
| "做一个开始游戏按钮" | 写按钮 HTML（圆角+渐变+发光）→ render + slice → 引导 import |
| "要抽卡金光动画" | 写 1-2s keyframes 动画（金光扫过/粒子感用 CSS 渐变+模糊）→ render 序列帧 或 video WebM |
| "血条/进度条底图" | 写可拉伸渐变条 → slice 九宫格 |
| "卡牌稀有度光晕" | 写 radial-gradient 光晕 div → render 单帧（scene.yaml 设 frames:1）→ 直接当贴图 |
| "整个主菜单界面" | 一个 HTML 多个元素 → scene.yaml 写 assets 列表 → export 一次导出整套 |
| "想用 60fps" | `--fps 60`（序列帧可；视频会按本机上限自动降级并提示） |

## 关键注意事项（避免踩坑）

1. **先 render 再 slice/export**：slice 读 build/<scene>/frames/f000.png，没渲染会报错；golden 首次运行需 `--update` 生成基线（缓存在 build/golden/，不入库）
2. **fps 一致性**：引擎播放器 fps 必须 = render 的 fps（默认 12），否则播放速度不对
3. **半透明资产的九宫格边框**：遮罩/光晕等半透明元素，边框检测会退化为最小边框（预期行为，可手动 `slices.border` 指定）
4. **包体**：24 帧全屏 430×932@2x PNG ≈ 70MB+，长动画用 video WebM 或图集
5. **多按钮同页**：切图时用 `slices.target` 指定要切哪个元素
6. **不要改 build/**：那是产物目录，改了下次 render 会覆盖

## 验证产物是否成功

- render 成功：`build/<scene>/frames/` 有 f000.png 且控制台显示帧数
- slice 成功：`build/<scene>/slices/` 有 9 张 slice-*.png + ninegrid.json
- video 成功：`build/<scene>/<scene>.webm` 且提示透明 VP9
- export 成功：`build/<scene>/export/manifest.json` 列出所有资产
- golden 通过：`build/golden/<scene>/` 有基线（--update 生成），check 输出 ✔ 且退出码 0；有差异时逐帧报像素数/区域并写 `build/golden-diff/<scene>/diff-*.png`

## 安装到你的 AI 工具（接入工作流）

把这个 skill 文件夹复制/链接到你的 AI 工具能识别的位置：

| AI 工具 | 位置 |
|---|---|
| **Claude Code** | `~/.claude/skills/myassets/`（全局）或 `<项目>/.claude/skills/myassets/`（项目级） |
| **DSH / DeepSeek Harness** | `~/.agents/skills/myassets/` 或 `<项目>/.agents/skills/myassets/` |
| **Cursor** | `.cursor/skills/` 或按工具文档放置 |

复制后，AI 工具会自动发现该 skill；当你的请求匹配 `description`/`whenToUse` 时（如"做游戏按钮素材""要序列帧"），AI 会自动加载并按照本文件指导你完成资产生成。

**一句话用法**：装好后，直接对 AI 说——"用 MyAssets 做一个开始游戏按钮"或"把这段 HTML 变成九宫格切图"，AI 会按本 skill 的纪律写场景、跑命令、引导你接入引擎。
