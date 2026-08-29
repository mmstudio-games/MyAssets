# MyAssets 架构文档

> 面向**开发者/贡献者**：模块职责、渲染管线、九宫格算法、确定性实现。
> 配合 [AGENTS.md](../../AGENTS.md)（纪律与陷阱）和 [testing.md](testing.md)（测试体系）阅读。

## 系统总览

```
┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌───────────────┐
│ scenes/*.html│ → │ render（确定性渲染）│ → │ slice（九宫格切图）│ → │ import（引擎导入）│
│ + scene.yaml │   │   PNG 序列帧      │   │   9 切片 + 参数   │   │  Cocos/Unity  │
└─────────────┘   └──────────────────┘   └──────────────────┘   └───────────────┘
```

三个命令串成流水线：`render` 出帧 → `slice` 拿第 0 帧切九宫格 → `import` 打包成引擎格式。

## 模块职责（src/）

| 模块 | 职责 | 关键导出 |
|---|---|---|
| `cli.js` | CLI 参数解析、三个命令编排、场景解析 | `run()` / `resolveScene()` |
| `render.js` | 确定性逐帧渲染（核心地基） | `renderScene()` |
| `slice.js` | 九宫格边框自动检测 + 3×3 切片 | `detectNineSlice()` / `sliceNineGrid()` / `locateTarget()` |
| `pack.js` | 图集打包（贪心 shelf + trim + plist） | `buildAtlas()` / `packRects()` / `buildPlist()` |
| `import.js` | 引擎导入目录生成 | `exportImportDir()` |
| `config.js` | scene.yaml 解析（极简 YAML 子集） | `loadSceneConfig()` / `parseYaml()` |
| `browser.js` | 浏览器内核三档选择 + 路径预检 | `resolveLaunchOptions()` / `resolveBrowserArgs()` |
| `index.js` | 库入口，导出全部 API | — |

**CLI 与库分离**：`cli.js` 的命令执行在 `run()` 内，仅当直接运行（`import.meta.url === pathToFileURL(process.argv[1]).href`）时触发。作为库 `import { resolveScene } from 'myassets'` 必须静默。

**CLI 错误包装**：所有命令失败统一输出简洁 `✘ 消息`（不抛堆栈），退出码 1——用户侧不暴露堆栈。

## 确定性渲染（render.js）—— 技术文档 3.2/3.3 节实现

纪律要点，逐条对应实现：

1. **字体就绪**：`page.evaluate(() => document.fonts.ready)`
2. **暂停动画，时间轴驱动**：`document.getAnimations().forEach(a => a.pause())`，每帧 `a.currentTime = t`
3. **强制同步布局**：每帧 `void document.body.offsetHeight`
4. **双 rAF 门控**：`requestAnimationFrame(() => requestAnimationFrame(res))`——确保该帧已提交合成器
5. **串行 await**：帧间严格串行，浏览器不会并发渲染
6. **透明 PNG**：截图 `omitBackground: true`
7. **禁副作用**：注入 CSS 禁滚动条/光标/hover/媒体播放

### 逐帧渲染骨架（实现参考）

```js
await page.goto(url);
await page.evaluate(() => document.fonts.ready);   // ① 字体就绪（否则整批帧回退字体）
await page.evaluate(() => {
  document.getAnimations().forEach(a => a.pause()); // ② 暂停所有动画，时间轴驱动
});

for (let i = 0; i < 24; i++) {
  await page.evaluate((t) => {                       // ③ 精确跳帧
    document.getAnimations().forEach(a => a.currentTime = t);
    document.body.offsetHeight;                       // 强制同步布局
  }, i / 24 * 1000);

  await page.evaluate(() => new Promise(res =>       // ④ rAF 双门控：确保该帧已提交合成器
    requestAnimationFrame(() => requestAnimationFrame(res))
  ));

  await page.screenshot({ path: `f${i}.png`, clip }); // ⑤ 读的就是刚渲染完的帧
}
```

**确定性验证**：同输入两次渲染 12 帧逐字节一致（MD5 全同）；静态场景帧间零抖动。

## 九宫格检测算法（slice.js）—— 三层结构

```
┌─────────────────────────────────────────────────────┐
│ 1. 内容 bbox：alpha ≥ 32（低阈值）                    │
│    范围保守完整，含投影/抗锯齿                          │
│ 2. 实体掩码 + 实体 bbox：alpha ≥ 128（高阈值）         │
│    排除 box-shadow 投影（峰值 α≈89）与光晕             │
│ 3. 边框 = max(圆角半径, 纯色边框线, minBorder 兜底)     │
│    - 圆角半径：实体 bbox 内"全连续"行/列               │
│    - 纯色边框线：实体占比 ≥95% 且颜色范围 <24           │
└─────────────────────────────────────────────────────┘
```

### 为什么双阈值？

box-shadow 投影 alpha 峰值约 89（rgba(0,0,0,0.35)）。若只用低阈值 32 检测连续性，投影模糊边缘会污染 bbox，把真实圆角 40px 测成 61px。用 α≥128 的实体掩码可彻底排除投影。

### 为什么"纯色边框线"检测要实体占比 ≥95%？

渐变按钮的圆角弧线行：行内颜色 range 极小（垂直渐变行内同色）但实体占比只有 0.74-0.86——若不检查占比，弧线行会被误判为"纯色边框线"，把 top 边框顶高。占比条件从第一行排除弧线区。

### targetBox 支持

scene.yaml 声明 `slices.target` 时，`locateTarget()` 用 Playwright 按 CSS 选择器定位元素物理 bbox，**内容 bbox 和实体 bbox 都限定在该区域内**——否则同页其他元素会污染实体检测（实测 entityBox 高度翻倍 bug）。

**注意**：`locateTarget` 必须与 render 使用相同 viewport + DPR，否则布局不同坐标错位。

### 边框来源可插拔（L0 / L1）

`detectNineSlice` 的边框来源三档，优先级：`border`（手动）> `hookBorders`（HTML 钩子）> 内置自动检测：

1. **L0 手动**：`--border 30,30,30,30` 或 scene.yaml `slices.border`——跳过检测直接用指定值
2. **L1 HTML 钩子**：`callDetectHook()` 加载场景 HTML，若定义了 `window.__MYASSETS_DETECT__(imageData, {width,height})` 且返回合法整数边框则采用。纯函数约定（只读像素、返回数字），缺失/抛错/非法值返回 null 回退内置
3. **内置自动**：`detectBordersAuto()`——原双阈值 + 边框线算法，抽成独立函数

ninegrid.json 记录 `borderSource`（manual / html-hook / auto）供追溯。

### 已验证场景（回归基线，实测边框 L/T/R/B）

| 场景 | 实测边框 | 说明 |
|---|---|---|
| 渐变圆角 + 文字 + 发光 | 38/32/38/50 | 含投影/文字，双阈值 + 边框线 |
| 直角 + 3px 边框 | 6/6/6/6 | 边框线 @2x 精确测出 |
| 纯渐变圆角 | 41/41/41/41 | 无文字无投影 |
| 静态面板 | 12/8/12/15 | 面板类 |
| 多按钮 target 切图 | 蓝 26/26/26/26、红 12/12/12/12 | `slices.target` 分别切，拼接逐像素一致 |

## 图集打包（pack.js）

- **排布**：贪心 shelf（按高度降序逐行放置），`--maxw` 控制单行宽度（GPU 纹理上限）。MVP 够用，后续可换 maxrects。
- **trim**：打包前逐图裁掉透明边（alpha 阈值 16），记录 `sourceSize` + `offset` 到 meta。**必须做**——整页截图透明边极大（实测 12 帧从 11184px 高降到 894px），不裁会超纹理上限。
- **plist**：Cocos TexturePacker 兼容 format 2，offset 按 `(sourceSize - frameSize)/2 - trimOffset` 计算（坐标系 y 翻转规则）。

## 引擎导入（import.js）

输出：单图（Cocos/Unity Sliced 模式）+ 引擎无关参数 JSON + Cocos `.png.meta`（borderTop/Bottom/Left/Right）+ Unity `.unitymeta`（spriteBorder）+ 各引擎 README。

## 浏览器内核选择（browser.js）

三档来源统一解析：内置 Chromium（默认）/ 系统浏览器 channel / 手动 executablePath。所有模块的 `chromium.launch()` 必须走 `resolveLaunchOptions()`，禁止手写 launch 选项。
