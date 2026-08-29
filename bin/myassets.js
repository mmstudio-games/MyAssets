#!/usr/bin/env node
// MyAssets CLI 可执行入口（npm bin 惯例：package.json bin 指向这里）
// 实际逻辑在 src/cli.js 的 run()，这里只负责触发执行。
import { run } from '../src/cli.js';

await run();
