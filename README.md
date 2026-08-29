# MyAssets

**你和 AI 聊天产出的 HTML 页面，都可以在这里工程化变成游戏的位图资产。**

用浏览器渲染内核把 AI 生成的 HTML/CSS **确定性渲染**成游戏引擎可直接使用的资产：PNG 序列帧、九宫格切图、引擎可导入目录（Cocos / Unity）。无论你用 Claude Code、Codex、DeepSeek Harness 还是其他任何 AI 编程工具，产出的 HTML 都能直接进这条管线。

> 设计理念：AI 不擅长写引擎 shader/粒子参数，但极其擅长写 HTML/CSS。MyAssets 把"HTML 场景"变成"引擎资产"，并内置确定性纪律（同输入必同输出），让资产管线可依赖、可验证。
>
> 当前版本：**v0.1.2**（全项目唯一版本号，权威来源 `package.json`；代码/契约/skill 任何变动均按 主/次/末 递增，规则见 [AGENTS.md](AGENTS.md)，历史见 [CHANGELOG.md](CHANGELOG.md)）

## 快速开始

```bash
npm install
npx playwright install chromium   # 首次安装内置渲染内核（版本锁定）

# 一条链路出全部产物
myassets render scenes/button    # 1. HTML 场景 → PNG 序列帧
myassets slice  scenes/button    # 2. 第 0 帧 → 九宫格 3×3 切片 + 边框参数
myassets import scenes/button    # 3. → 引擎可导入目录（Cocos .meta / Unity / 说明）
```

产物在 `build/<场景名>/`：`frames/`（序列帧）、`slices/`（九宫格 + ninegrid.json）、`import/`（引擎导入）。

## 核心特性

- **一个 .html 就是一个场景**：AI 只写自包含 HTML（内联 CSS、keyframes 动画、透明背景），零配置出图
- **确定性渲染**：同输入必同输出（两次渲染逐字节一致），资产管线可依赖
- **九宫格自动切图**：自动测边框（渐变/圆角/文字/投影/直角全覆盖），多元素 `slices.target` 定位
- **程序化贴图**：渐变/光晕/辉光/遮罩等贴图，CSS 一行即出透明 PNG（稀有度光晕、血条底、技能光晕、按下遮罩等场景）
- **图集打包**：序列帧精灵图 / 多资产图集合成一张（自动裁透明边）+ 坐标 JSON + Cocos `.plist`
- **引擎导入**：Cocos Creator 3.x / Unity / Godot 可直接使用
- **多内核选择**：内置 Chromium（默认，版本锁定）/ 系统 Chrome/Edge / 手动指定任意 Chromium 系内核

## 文档

| 读者 | 文档 |
|---|---|
| **使用者**（游戏开发者 / AI 写场景） | [用户指南](docs/user/guide.md) · **AI 工作流 Skill**（`skills/myassets/`） |
| **开发者 / 贡献者** | [架构文档](docs/dev/architecture.md) · [测试体系](docs/dev/testing.md) · [参与贡献](CONTRIBUTING.md) |
| **AI 代理**（开发时） | [AGENTS.md](AGENTS.md) |
| **变更记录** | [CHANGELOG.md](CHANGELOG.md) |

## 路线图

- [x] 最小实践：HTML → 确定性渲染 → PNG 序列帧（两次渲染逐字节一致）
- [x] 九宫格自动切图（渐变/圆角/文字/投影/直角全覆盖，多元素 target 定位）
- [x] 引擎导入目录（Cocos / Unity meta + 参数 + 说明）
- [ ] 精灵图/图集打包 + Cocos `.plist` 输出
- [ ] golden-image diff 视觉回归
- [ ] AI 视觉评审闭环
- [x] 引擎帧装配器（engine-libs/：Godot/Cocos/UE5 调原生 API 一键装配帧资产）
- [ ] 透明 WebM 视频导出

## 许可

[MIT License](LICENSE)。
