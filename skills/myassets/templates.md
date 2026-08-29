# MyAssets 场景模板集（AI 参考用）

> 本文件是 myassets skill 的配套参考：不同游戏资产的 HTML 模板。
> AI 写场景时，按目标资产类型选取对应模板改样式即可。全部遵守纪律：
> keyframes 动画 / 无 transition / 无随机 / 透明背景 / 系统字体 / 按钮 border:none。

---

## 1. 按钮（九宫格切图）

```html
<button class="btn" style="border:none;
  font-family:system-ui,sans-serif; font-size:32px; font-weight:700; color:#6b3f00;
  letter-spacing:6px; padding:18px 56px; border-radius:18px;
  background:linear-gradient(180deg,#ffe9a8 0%,#ffd25e 45%,#f5a623 100%);
  box-shadow:inset 0 3px 0 rgba(255,255,255,.7), inset 0 -4px 0 rgba(160,90,0,.3), 0 6px 16px rgba(0,0,0,.4);
  animation:pulse 1s ease-in-out infinite">开始游戏</button>
<style>@keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}</style>
```

**用途**：render → slice（九宫格）→ import。按钮文字由引擎 Label 叠加，底图拉伸不变形。

## 2. 抽卡金光动画（序列帧 / WebM）

```html
<div style="position:relative;width:430px;height:932px;overflow:hidden">
  <!-- 金光扫过 -->
  <div style="position:absolute;top:0;left:-100%;width:100%;height:100%;
    background:linear-gradient(100deg,transparent 0%,rgba(255,220,120,.9) 45%,rgba(255,255,255,.95) 50%,rgba(255,220,120,.9) 55%,transparent 100%);
    filter:blur(2px);
    animation:sweep 1.2s ease-in-out infinite"></div>
  <!-- 中心爆闪 -->
  <div style="position:absolute;top:50%;left:50%;width:60px;height:60px;transform:translate(-50%,-50%);
    background:radial-gradient(circle,#fff 0%,rgba(255,220,120,.8) 40%,transparent 70%);
    animation:flash 1.2s ease-in-out infinite"></div>
</div>
<style>
@keyframes sweep{0%,100%{left:-100%}50%{left:100%}}
@keyframes flash{0%,100%{opacity:0;transform:translate(-50%,-50%) scale(.6)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.6)}}
</style>
```

**用途**：render 序列帧（引擎播）或 video WebM（Cocos 小游戏直接播透明）。

## 3. 血条 / 进度条底（九宫格可拉伸）

```html
<div style="width:400px;height:64px;border-radius:32px;
  background:linear-gradient(180deg,#3a2a1a 0%,#1a0e05 40%,#0d0502 100%);
  box-shadow:inset 0 2px 0 rgba(255,255,255,.35), inset 0 -3px 0 rgba(0,0,0,.6), inset 0 0 12px rgba(255,120,0,.25)"></div>
```

**用途**：slice 九宫格 → 引擎拉伸任意长度。填充条由引擎另一张图控制宽度。

## 4. 卡牌稀有度光晕（单帧贴图）

```html
<div style="width:512px;height:512px;border-radius:50%;
  background:radial-gradient(circle,
    rgba(255,215,100,.95) 0%, rgba(255,180,60,.55) 30%,
    rgba(255,140,40,.22) 55%, rgba(255,120,30,.06) 78%, transparent 100%);
  filter:blur(2px)"></div>
```

**用途**：render 单帧（scene.yaml 设 `frames: 1`）→ 直接当透明贴图叠在卡牌下。

## 5. 技能图标光晕底（单帧贴图）

```html
<div style="width:256px;height:256px;border-radius:50%;
  background:radial-gradient(circle,
    rgba(90,220,255,.9) 0%, rgba(60,160,255,.5) 35%,
    rgba(40,100,255,.18) 65%, transparent 100%)"></div>
```

## 6. 按钮按下遮罩（半透明，九宫格）

```html
<div style="width:300px;height:120px;border-radius:24px;
  background:rgba(0,0,0,.45); box-shadow:inset 0 0 24px rgba(0,0,0,.5)"></div>
```

**注意**：半透明资产的边框检测退化为最小边框，可手动 `slices.border` 指定。

## 7. 静态界面（整屏出图）

```html
<body style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;background:transparent">
  <!-- 标题光晕 -->
  <div style="width:520px;height:140px;background:radial-gradient(ellipse at center,rgba(255,215,100,.9) 0%,rgba(255,170,50,.4) 55%,transparent 100%);filter:blur(4px)"></div>
  <!-- 开始按钮 -->
  <button style="border:none;font-family:system-ui,sans-serif;font-size:34px;font-weight:700;color:#6b3f00;letter-spacing:8px;padding:18px 64px;border-radius:18px;background:linear-gradient(180deg,#ffe9a8 0%,#ffd25e 45%,#f5a623 100%)">开始游戏</button>
  <!-- 装饰条 -->
  <div style="width:360px;height:16px;border-radius:8px;opacity:.8;background:linear-gradient(90deg,transparent,#ffd25e 30%,#fff3c4 50%,#ffd25e 70%,transparent)"></div>
</body>
```

**用途**：主菜单/结算屏整屏出图。scene.yaml 用 `assets` 列表声明每个元素分别导出。

---

## scene.yaml 参考（多资产界面）

```yaml
name: main-menu
width: 720
height: 640
dpr: 1
frames: 1
assets:
  - name: start-btn        # 九宫格按钮
    selector: .start-btn
    nine: true
  - name: title-glow       # 整图贴图
    selector: .title-glow
    nine: false
```
