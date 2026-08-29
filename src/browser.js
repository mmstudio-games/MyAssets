// 浏览器启动选项统一解析
// MyAssets 支持三种内核来源：
//   1. 内置 Chromium（默认，版本锁定，确定性锚点）     —— channel: 'chromium'
//   2. 系统浏览器自动发现（chrome / msedge）           —— channel: 'chrome' | 'msedge'
//   3. 手动指定任意 Chromium 系内核可执行文件          —— executablePath（QQ/夸克/私有内核等）
//      （任何基于 Chromium/Blink 的浏览器都可用；非 Chromium 内核如 Safari 不保证像素一致）

import { existsSync } from 'node:fs';

/**
 * 解析 Playwright 启动参数。
 * @param {object} opts
 * @param {string} [opts.channel='chromium']  Playwright 认识的浏览器通道
 * @param {string|null} [opts.executablePath] 手动指定的浏览器可执行文件路径（优先于 channel）
 * @returns {{channel?: string, executablePath?: string}} 传给 chromium.launch() 的选项
 */
export function resolveLaunchOptions({ channel = 'chromium', executablePath = null } = {}) {
  if (executablePath) {
    return { executablePath };
  }
  return { channel };
}

/**
 * 预检手动指定的浏览器路径是否存在（给出友好错误，而非 Playwright 底层报错）。
 * @param {string|null} executablePath
 * @throws 路径不存在时
 */
export function assertExecutablePath(executablePath) {
  if (executablePath && !existsSync(executablePath)) {
    throw new Error(`指定的浏览器内核不存在: ${executablePath}`);
  }
}

/**
 * 从 CLI 参数（--channel / --executable-path）和 scene.yaml 生成统一的启动选项。
 * @param {object} args CLI 解析结果
 * @returns {{channel: string, executablePath: string|null}}
 */
export function resolveBrowserArgs(args) {
  return {
    channel: args.channel ?? process.env.HAF_CHANNEL ?? 'chromium',
    executablePath: args['executable-path'] ?? process.env.HAF_BROWSER_PATH ?? null,
  };
}
