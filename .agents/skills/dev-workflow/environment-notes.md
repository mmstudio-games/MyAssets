# 本机 / 会话环境备忘（内部，可能过时）

> **读者**：在本机接手的 AI 代理 / 开发者。本文件是机器与会话相关的环境备忘，**不属于产品文档**，随环境变化随时更新或删除。
> 来源：原《技术方案与交接文档》第八、十节，随文档拆分迁入 `.agents/skills/dev-workflow/`（内部开发知识）。

## 网络与工具（实测）

- **web_search 工具不可用**：`DEEPSEEK_API_KEY` 失效（凭证文件 `C:\Users\Administrator\.dsh\.credentials.yaml` 中该 key 后四位 72Q4，与报错吻合）。修复：DeepSeek 开放平台检查 key/余额 → 更新该文件 → 重启 DSH。**不影响 LLM 对话**（对话走 YOUCHU_API_KEY / youchu provider）。
- **命令行联网替代方案（实测可用）**：
  - Bing RSS：`https://www.bing.com/search?format=rss&q=<urlencoded>` → 返回结构化 XML（标题/链接/摘要），PowerShell `Invoke-WebRequest` + `[xml]` 解析
  - GitHub API：`api.github.com` 匿名可用（速率限制 60 次/小时）；仓库搜索 `search/repositories?q=`；Contents API 读文件内容（base64）
  - **`raw.githubusercontent.com` 被墙**（超时）→ 用 Contents API 替代
  - DuckDuckGo / Google / 百度 均不可达
- **沙箱**：`danger-full-access`，文件操作无限制；pwsh 可用，网络正常。

## Node 与浏览器（实测）

- Node v24.19.0 可用；PowerShell 禁 `.ps1` 脚本 → 用 `npm.cmd` / `npx.cmd` / `myassets.cmd`。
- 内置内核已装：`npx playwright install chromium` 成功（缓存在 `%LOCALAPPDATA%\ms-playwright`），默认 `channel: 'chromium'` 可用；系统 Chrome（`channel: 'chrome'`）也是可用替代。
- 模型不支持读图（deepseek-v4-flash 无 image input）→ 视觉验证一律用**程序化断言**（canvas 解码 + 像素统计），这也正是产品三层验证架构里的确定性层。
