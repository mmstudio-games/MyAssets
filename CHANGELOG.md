# Changelog

本文件记录 MyAssets 的行为变化。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

> **唯一版本号：v0.1.2**（权威来源：`package.json` 的 `version`，纯 semver 不带 `v`；对外显示带 `v` 前缀）。
> 代码 / 契约 / skill 的任何变动都递增它：人为定档 → 主 +1；新增工程规划 → 次 +1；落地 / 修 bug → 末 +1。规则见 [AGENTS.md](AGENTS.md)。

## [v0.1.2] - 2026-08-29

### 变更
- **包名 / CLI 命令改名**：npm 包名 `my-assets` → `myassets`，CLI 命令由 `my-assets render/slice/import/pack/video/export` 统一改为 `myassets ...`，bin 入口 `bin/my-assets.js` → `bin/myassets.js`（与产品名 MyAssets 小写一致、用户打字更简；`my-assets` 与 `myassets` 在 npm 均未被占用）
- 产品用户 skill 目录 `skills/my-assets/` → `skills/myassets/`（SKILL.md 的 `name` / description / 命令示例 / 安装路径同步更新）
- 文档（README / 用户指南 / 架构 / 测试 / 设计决策）、测试注释、演示场景（console-ui）同步更新
- engine-libs 脚本文件名（如 `cocos/my-assets-builder.ts`）作为引擎侧标识保持不变，仅更新正文中的 CLI 引用

## [v0.1.1] - 2026-08-28

### 新增
- 确定性逐帧渲染（render）：HTML 场景 → PNG 序列帧，同输入必同输出
- 九宫格自动切图（slice）：双阈值边框检测 + 3×3 切片 + 引擎参数
- 引擎导入目录（import）：Cocos / Unity meta + 参数 + 说明
- 多元素 target 切图定位
- 浏览器内核三档选择（内置 Chromium / 系统浏览器 / 手动指定路径）
- node:test 测试体系（5 个测试文件 / 6 个用例）
- **程序化贴图**：渐变/光晕/辉光/遮罩贴图场景 + 验证（稀有度光晕、血条底、技能光晕、按下遮罩）
- **图集打包**（pack）：序列帧精灵图 / 多资产图集，自动裁透明边（trim），输出坐标 JSON + Cocos `.plist`
- **自定义九宫格边框**：三档来源（--border 手动 / HTML 内嵌钩子 `__MYASSETS_DETECT__` / 内置自动检测），钩子失败自动回退
- **透明 WebM 导出**（video）：VP9 + alpha（Chromium CanvasCaptureStreamTransparent），帧内容与 render 确定性一致；支持 --width/--height/--fps/--duration，fps 超本机截图上限时自动降级（时长保持正确）
- **多资产编排导出**（export）：scene.yaml `assets` 声明，一个界面一次导出整套（九宫格 + 整图贴图 + manifest）
- **引擎帧装配器**（engine-libs/）：Godot/Cocos/UE5 单文件脚本，调各引擎原生 API（ResourceSaver / AnimationClip / PaperFlipbook）一键把 my-assets 帧装配成原生播放资产
- **CLI 与 scene.yaml 全参数对齐**：clip / duration / slices.threshold / slices.continuity / slices.minBorder / atlas.name / atlas.maxW 均支持 yaml 配置（优先级 CLI > yaml > 默认）
- **资产生成方向决策指南**（docs/user/asset-sourcing.md）：TA / MyAssets / AI 文生图 三分法
- **标准展示场景**（scenes/console-ui）：黑绿控制台 UI + MyAssets 功能清单，循环叙事"开机亮屏（电子束展开）→ 显示内容 → 被攻击（像素噪点渐入 + 模糊渐大）→ 关机黑屏 → 循环重播"；纯 CSS 8000ms 共享时间轴，`my-assets video scenes/console-ui` 直出 WebM 无缝演示（内容级变更，不递增版本号）

### 工程
- 文档结构重组：根目录《技术方案与交接文档》拆分迁入 `docs/dev/`（架构 / 设计决策 / 测试 / 环境备忘）与 `.agents/skills/dev-workflow/`（内部开发 skill），产品用户 skill 位于 `skills/my-assets/`
- 版本纪律：全项目统一唯一版本号（`package.json` 为权威来源），代码 / 契约 / skill 变动按 主 / 次 / 末 递增（规则见 AGENTS.md）
