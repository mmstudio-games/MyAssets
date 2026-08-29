# MyAssets 测试体系

> 面向**开发者/贡献者**：测试怎么组织、每个测试断言什么、怎么跑。
> 测试策略核心：**程序化断言，不依赖 AI 看图**（对应产品验证架构的确定性层）。

## 运行

```bash
npm test    # node --test "test/**/*.test.js"
```

前置条件：先用 `myassets` 跑出各测试依赖的 build/ 产物（`npm run demo` 只覆盖 button 场景；target / textures / pack / custom-borders / export / video 测试还需 render 对应场景：multi、glow-rare、bar-track、btn-custom-hook、btn-square、main-menu，video 测试需先 `myassets video scenes/button`）。测试读 build/ 产物做断言，缺失时按报错提示先跑对应命令。**例外：golden.test.js 自构造 PNG 夹具，不需要 build/ 产物**（浏览器相关用例仍需 chromium）。

## 测试文件（test/*.test.js）

| 文件 | 验证内容 | 关键断言 |
|---|---|---|
| `render.test.js` | 渲染帧 | 尺寸 860×1864@2x、背景透明、内容居中、动画帧有差异、按钮尺寸合理 |
| `slices.test.js` | 九宫格切图 | **9 切片拼回原图逐像素一致（差异 0）**、边框自洽、角切片圆角正确 |
| `stretch.test.js` | 引擎拉伸重建 | **四角固定区 0 变形**、中间格无缝、中间格被正确拉伸 |
| `target.test.js` | 多元素 target 切图 | contentBox 与 targetBox 一致、切片是目标元素颜色、拼接逐像素一致 |
| `textures.test.js` | 程序化贴图 | 光晕/血条底透明背景、尺寸对、九宫格拼接一致 |
| `pack.test.js` | 图集打包 | **从 atlas 按坐标裁回与源图逐像素一致（打包无损）**、trim 自洽、plist 可解析 |
| `custom-borders.test.js` | 自定义边框三档来源 | L0 手动值被采用且标记 manual、L1 钩子值被采用、无钩子/钩子抛错回退自动检测 |
| `export.test.js` | 多资产编排导出 | yaml assets 解析（含行内注释剥离）、manifest 汇总、九宫格+整图产物齐全 |
| `video.test.js` | 透明 WebM | 可解码、含内容、背景透明（角落 alpha 低）、动画帧有差异 |
| `golden.test.js` | 视觉回归 diff 逻辑 | sameParams 参数一致性、帧清单差异（缺失/新增）、**像素 diff 单像素检测 + 差异框**、tolerance 容差、尺寸不一致标记 |

## 最强正确性断言

- **slices.test.js 的"拼接差异 0"**：把 9 张切片按边框参数拼回 contentBox 区域，与源帧逐像素对比。差异必须为 0——证明切片是源图的精确拷贝，无信息丢失。
- **stretch.test.js 的"四角 0 变形"**：模拟引擎 9-slice 拉伸，四角固定区（不缩放）与源切片逐像素一致，中间格无缝——证明边框参数可直接给引擎用。

## 写测试的约定

1. 用 node:test：`test('描述', async () => { assert... })`，`assert` 用 `node:assert/strict`
2. 像素验证统一模式：`page.evaluate` 内用 canvas 解码 PNG → `getImageData` 统计 → 返回数据 → Node 侧 assert
3. **闭包陷阱**：`page.evaluate` 浏览器上下文里不能用 Node 的 `fs`/`path`——文件读取必须在 evaluate 外完成（`fs.readFileSync` 在 Node 侧），只把 base64 数据传进去
4. 测试读 `build/` 产物，缺失时报错提示先运行 demo（不要自动渲染，保持测试快速且确定性）
5. 浏览器通道：`process.env.HAF_CHANNEL || 'chromium'`——CI/本机默认内置 Chromium，调试可设环境变量换 chrome

## 确定性专项验证（非 node:test，人工/CI 步骤）

同场景两次渲染逐字节一致（MD5 对比），属于确定性纪律的专项验收，不在 npm test 内（避免重复渲染拖慢测试）。
