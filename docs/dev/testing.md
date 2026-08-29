# MyAssets 测试体系

> 面向**开发者/贡献者**：测试怎么组织、每个测试断言什么、怎么跑。
> 测试策略核心：**程序化断言，不依赖 AI 看图**（对应产品三层验证架构的确定性层）。

## 运行

```bash
npm test    # node --test "test/**/*.test.js"
```

前置条件：`npm run demo`（或手动 `myassets render scenes/button && myassets slice scenes/button`）生成 build 产物。测试读 build/ 产物做断言。

## 测试文件（test/*.test.js）

| 文件 | 验证内容 | 关键断言 |
|---|---|---|
| `render.test.js` | 渲染帧 | 尺寸 860×1864@2x、背景透明、内容居中、动画帧有差异、按钮尺寸合理 |
| `slices.test.js` | 九宫格切图 | **9 切片拼回原图逐像素一致（差异 0）**、边框自洽、角切片圆角正确 |
| `stretch.test.js` | 引擎拉伸重建 | **四角固定区 0 变形**、中间格无缝、中间格被正确拉伸 |
| `target.test.js` | 多元素 target 切图 | contentBox 与 targetBox 一致、切片是目标元素颜色、拼接逐像素一致 |

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
