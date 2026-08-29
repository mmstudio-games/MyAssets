---
name: dev-workflow
description: MyAssets 仓库的开发工作流。当需要修改 src/ 代码、新增或修改测试、或按"读上下文→定位→改→测→回归→更新文档"的标准循环完成一次开发任务时使用。
whenToUse: 用户在 my-assets 仓库中要求开发/修改功能、修 bug、加测试、或完成一次标准的开发任务时。
---

# MyAssets 开发工作流

> 配合根目录 `AGENTS.md` 使用。这里定义**一次开发任务从接单到交付的完整流程**。

## 标准开发循环（每次任务走一遍）

```
① 读上下文 → ② 定位改动点 → ③ 改代码 → ④ 写/更新测试 → ⑤ 全量回归 → ⑥ 更新文档
```

### ① 读上下文（必做，不要跳）

- 读 `AGENTS.md`（纪律 + 陷阱 + 版本纪律 + Skill 目录约定）
- 读相关模块源码 + 现有测试，理解当前行为
- 若涉及渲染/切图语义，回看 `docs/dev/architecture.md` 的算法说明
- 本机环境限制（网络 / 浏览器 / 模型读图）见同目录 [environment-notes.md](environment-notes.md)

### ② 定位改动点

- 用 `grep` / `glob` 找相关代码，先读再改（禁止凭猜测改）
- 区分三层：CLI（`src/cli.js`）→ 逻辑（`src/*.js`）→ 验证（`test/*.test.js`）
- 涉及浏览器启动的改动，必须走 `src/browser.js` 的 `resolveLaunchOptions`

### ③ 改代码

- 遵守 `AGENTS.md` 核心纪律（确定性 / 版本锁定 / CLI-库分离 / 全自研禁令）
- 改动后立即 `node --check <file>` 查语法
- 警惕 page.evaluate 闭包陷阱（浏览器上下文无 Node API）

### ④ 写/更新测试

- 测试用 node:test：`test('描述', async () => { assert... })`
- 程序化断言优先（像素统计 / 哈希对比），不依赖 AI 看图
- 新功能必有测试；改行为必改断言

### ⑤ 全量回归（交付前必须）

```bash
npm test          # 全绿
npm run demo      # 端到端：render + slice
```

- 确定性相关改动：额外做"两次渲染逐字节一致"验证
- 浏览器相关改动：验证默认 chromium 通道可用

### ⑥ 更新文档

- 用户可见变化 → `docs/user/guide.md`
- 架构/算法变化 → `docs/dev/architecture.md`
- 行为变化 → `CHANGELOG.md`
- 纪律/陷阱变化 → `AGENTS.md`
- **版本号**：本次若涉及代码 / 契约（API、scene.yaml、engine-libs）/ skill 变更，按 `AGENTS.md` 版本纪律递增唯一版本号（人为定档 → 主 +1；新增工程规划 → 次 +1；落地 / 修 bug → 末 +1），并同步 `package-lock.json` 与 CHANGELOG

## 交付检查清单

- [ ] `npm test` 全绿
- [ ] 语法检查通过（`node --check`）
- [ ] 用户文档/开发者文档已同步
- [ ] CHANGELOG 已更新（如行为变化）
- [ ] 版本号已按版本纪律递增（如本次是代码/契约/skill 变更）
- [ ] 未破坏确定性（同输入必同输出）
- [ ] 未引入第三方渲染代码（全自研纪律）
