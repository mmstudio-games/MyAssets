# 参与贡献（Contributing Guide）

欢迎贡献！无论是提 bug、改进文档、加功能还是做代码评审，都感谢你的时间。

## 快速开始

```bash
git clone <repo-url>
cd myassets
npm install
npx playwright install chromium   # 安装内置渲染内核（版本锁定）
npm run demo                      # 跑通全链路（render + slice button 场景）
npm test                          # 4/4 全绿
```

## 提 Issue

- **Bug**：附上场景 HTML（或最小复现）、运行命令、产物截图/日志、Node 版本、平台
- **功能请求**：说明使用场景和期望行为；优先看 [路线图](README.md) 是否已规划
- **文档问题**：指出文档位置和不清楚之处

## 提 PR

1. 从 `main` 切分支，命名 `feature/xxx` 或 `fix/xxx`
2. 改动遵守 [AGENTS.md](AGENTS.md) 的核心纪律（确定性渲染、CLI-库分离、全自研）
3. 新功能/改动必须配套测试（`test/*.test.js`），`npm test` 全绿
4. 更新对应文档（用户变化 → `docs/user/`，架构/算法 → `docs/dev/`）
5. 行为变化更新 [CHANGELOG.md](CHANGELOG.md)
6. 版本号按 [版本纪律](AGENTS.md)（唯一版本号）递增：代码/契约/skill 变动 → 末 +1；新增工程规划 → 次 +1；人为定档 → 主 +1，并同步 `package-lock.json`
7. PR 描述：改了什么、为什么、怎么验证的

## 编码规范

- ESM（`"type": "module"`），Node ≥ 20
- 中文注释（项目语言约定），公共 API 用 JSDoc
- 测试用 node:test + `node:assert/strict`
- 浏览器启动一律走 `src/browser.js` 的 `resolveLaunchOptions()`
- 提交前：`node --check` 语法 + `npm test` 全绿

## 架构速览

见 [docs/dev/architecture.md](docs/dev/architecture.md)（模块职责、渲染管线、九宫格算法）和 [docs/dev/testing.md](docs/dev/testing.md)（测试体系）。开发前务必读 [AGENTS.md](AGENTS.md)（含常见陷阱）。

## 许可说明

项目采用 [MIT License](LICENSE)。贡献即表示同意你的代码以 MIT 协议发布。
