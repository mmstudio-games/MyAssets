# AGENTS.md — AI 开发协作指南

> 本文件是 AI 代理（Claude Code / Cursor / DSH 等）在本仓库工作时的**第一入口**。
> 开始任何开发任务前先读本文件；变更设计决策时同步更新本文件。

## 项目一句话

**MyAssets**：你和 AI 聊天产出的 HTML 页面，都可以在这里工程化变成游戏的位图资产——用浏览器内核把 HTML/CSS **确定性渲染**成游戏引擎资产（PNG 序列帧 / 九宫格切图 / 引擎导入目录）。

## 常用命令

```bash
npm install                          # 安装依赖
npx playwright install chromium      # 首次安装内置渲染内核（版本锁定）
npm run demo                         # 一键：render + slice button 场景
npm test                             # node:test 全套回归（必须全绿再交付）
myassets render/slice/import/pack <scene>  # CLI 四命令（bin/myassets.js 入口）
```

## 项目结构

```
bin/myassets.js     CLI 可执行入口（薄壳 → src/cli.js run()）
src/
  index.js           库入口（导出全部 API；import 它不应触发 CLI 执行）
  cli.js             CLI 逻辑（resolveScene / run；仅直接运行时执行）
  render.js          确定性逐帧渲染器
  slice.js           九宫格自动切图（detectNineSlice / locateTarget）
  import.js          引擎导入目录生成
  pack.js            图集打包（贪心 shelf 排布 + trim + Cocos plist）
  video.js           透明 WebM 导出（双页面：场景页截图 → 录制页 MediaRecorder）
  export.js          多资产编排导出（scene.yaml assets）
  config.js          scene.yaml 解析（含对象列表）
  browser.js         浏览器内核选择（channel / executablePath）
engine-libs/        引擎帧装配器（Godot/Cocos/UE5 单文件脚本，调原生 API 装配帧资产）
test/*.test.js       node:test 测试（8 个文件 / 14 个用例：render / slices / stretch / target / textures / pack / custom-borders / export / video）
scenes/              示例场景（按钮/面板/九宫格 + 程序化贴图：光晕/血条/遮罩）
build/               产物（gitignore，不入库）
```

## 核心纪律（改动代码时必须遵守）

1. **确定性渲染纪律**（技术文档第三节）：动画用 keyframes/WAAPI、禁 transition、禁 Math.random/真实时间、固定 viewport+DPR、双 rAF 门控。渲染管线任何改动不得破坏"同输入必同输出"。
2. **版本锁定内核**：正式出资产默认内置 Chromium（`channel: 'chromium'`）；`--channel chrome/msedge`、`--executable-path` 是用户可选覆盖，不得改成默认。
3. **浏览器启动统一走 `src/browser.js` 的 `resolveLaunchOptions`**，不要在各模块手写 launch 选项。
4. **CLI 与库分离**：`src/cli.js` 的命令执行逻辑必须在 `run()` 内、且仅当 `import.meta.url === pathToFileURL(process.argv[1]).href`（直接运行）时触发——作为库被 import 必须静默。
5. **全自研纪律**：本项目全部自研，禁止 fork/复制第三方渲染产品的代码（含其衍生品）或改造成产品出售；只可借鉴思路，不得直接引入他人受限制代码。
6. **测试驱动**：任何功能改动必须配套更新 `test/` 并保持 `npm test` 全绿。

## 版本纪律（全项目唯一版本号）

- **全项目只存在一个版本号**：`package.json` 的 `version` 是唯一权威来源（当前 `0.1.2`，纯 semver 不带 `v`）；对外显示统一带 `v` 前缀（`v0.1.2`）。`package-lock.json`、CHANGELOG、README 等处的版本必须与之一致，**不得另设其他版本号**。
- **代码 / 契约（API、scene.yaml 约定、engine-libs 脚本）/ skill 的任何变动都递增版本号**，按变更类别决定递增位置：
  - **人为定档**（人为发布定版）→ 主版本 +1（如 `0.1.1` → `1.0.0`）
  - **新增工程规划**（立项 / 新能力规划）→ 次版本 +1（如 `0.1.1` → `0.2.0`）
  - **落地 / 修 bug**（实现新功能、修复缺陷）→ 末版本 +1（如 `0.1.1` → `0.1.2`）
- 递增后同步更新 `CHANGELOG.md`（新版本条目）与 `package-lock.json`（`npm install --package-lock-only` 或手动同步）。

## Skill 目录约定

- **对内使用的 skill**（面向本项目开发者 / AI 代理的开发流程类，如 dev-workflow）→ 放 `.agents/skills/<name>/`
- **对外面向产品用户的 skill**（教用户使用 myassets 的工作流，如 myassets）→ 放 `skills/<name>/`
- 新增 skill 先判断受众再选目录；SKILL.md 的 `description` / `whenToUse` 决定 AI 何时自动加载。

## 常见陷阱（AI 最容易踩的坑）

- **`<button>` 默认 2px border**：检测到的圆角 = border-radius − border 宽度。场景里建议 `border: none`。
- **locateTarget 必须与 render 同 viewport+DPR**：坐标是物理像素，尺寸不同会错位。
- **box-shadow 投影污染边框检测**：内容 bbox 用低阈值 α≥32、实体连续性用高阈值 α≥128（投影峰值 α≈89 被排除），双阈值缺一不可。
- **实体 bbox 也要限定在 targetBox 内**：否则同页其他元素会污染实体检测（entityBox 高度翻倍）。
- **边框来源可插拔**：`slice.js` 的 `detectNineSlice` 支持 `border`（手动）/ `hookHtmlPath`（HTML 钩子 `window.__MYASSETS_DETECT__`）/ 内置自动三档；钩子必须纯函数（只读像素数据返回数字），失败自动回退内置。
- **page.evaluate 闭包陷阱**：浏览器上下文里不能用 Node 的 `fs`/`path`——文件读取必须在 evaluate 外完成，只传数据进去。
- **PowerShell 执行策略**：本机 `npm.ps1` 被禁，用 `npm.cmd` / `myassets.cmd`。
- **输出中文乱码**：PowerShell 控制台 GBK 解码 UTF-8 是显示问题，文件本身是好的——用 Node 读文件验证，不要信控制台。

## 完成标准

- `npm test` 全绿
- 新功能有对应测试断言（程序化验证，不依赖 AI 看图）
- 用户文档（docs/user/）与开发者文档（docs/dev/）同步更新
- 行为变化更新 CHANGELOG.md
- 代码 / 契约 / skill 变动已按"版本纪律"递增唯一版本号
