// MyAssets 库入口
// 除了 CLI（bin/myassets.js），也暴露可编程 API，供脚本/工具链集成。
//
// 典型用法：
//   import { renderScene, sliceNineGrid, exportImportDir } from 'myassets';
//   const result = await renderScene({ htmlPath, outDir });
//   await sliceNineGrid(result.files[0], outDir);
//   await exportImportDir(meta, framePath, importDir);

export { renderScene } from './render.js';
export { renderVideo } from './video.js';
export { detectNineSlice, sliceNineGrid, locateTarget } from './slice.js';
export { exportScene } from './export.js';
export { exportImportDir } from './import.js';
export { buildAtlas, packRects, buildPlist } from './pack.js';
export { loadSceneConfig, parseYaml } from './config.js';
export { resolveLaunchOptions, resolveBrowserArgs } from './browser.js';
export { resolveScene } from './cli.js';
