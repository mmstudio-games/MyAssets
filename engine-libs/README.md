# engine-libs —— 引擎帧装配器（单文件，导入即用）

把 myassets 导出的序列帧（`build/<场景>/frames/f000.png ~ f00N.png`）**调各引擎原生 API**
装配成引擎原生播放资产。**不做插件，不做文件格式手写**——每个引擎一个脚本，用户导入项目、
调用封装好的函数即可，资产是引擎一等公民。

## 为什么是"装配器"而不是"播放器"

三家引擎原生都有序列帧播放能力（Cocos Animation System / Godot AnimatedSprite2D /
UE5 Paper2D Flipbook）——**播放器引擎有了，我们只负责"把帧变成引擎原生资产"**。

## 脚本清单

| 引擎 | 文件 | 调用的原生 API | 用法 |
|---|---|---|---|
| **Godot 4.x** | `godot/my_assets_builder.gd` | SpriteFrames / ResourceSaver | 拖进项目，调 `build_sprite_frames(dir, out, fps, loop)`；或命令行 `godot --headless --script 本文件 -- --frames X --out Y --fps 12` |
| **Cocos Creator 3.x** | `cocos/my-assets-builder.ts` | SpriteFrame / AnimationClip / Animation | 放进 assets/，`import { attachMyAssetsAnimation } ...` 调封装函数 |
| **UE5** | `ue5/my_assets_builder.py` | Texture2D / PaperFlipbook / AssetTools | 编辑器 Python 控制台，`from my_assets_builder import build_flipbook` |

## 工作流

```bash
# 1. myassets 出帧（用户唯一要做的命令行操作）
myassets render scenes/button

# 2. 把 build/button/frames/ 的 PNG 导入引擎（拖入即可）

# 3. 在引擎里调用装配器函数 → 原生资产生成
Godot:  build_sprite_frames("res://frames", "res://button_frames.tres", 12, true)
Cocos:  attachMyAssetsAnimation(this, "frames", 12, true)
UE5:    build_flipbook("/Game/UI/ButtonFrames", "/Game/UI/ButtonFlipbook", 12, true)

# 4. 引擎原生播放（Animation / AnimatedSprite2D / Flipbook 组件）
```

## 约定

- **fps 必须与 myassets render 的 fps 一致**（默认 12），否则播放速度不对
- 帧命名固定 `f000.png ~ f00N.png`（脚本按名自然排序）
- 各脚本均调用引擎官方 API（Godot ResourceSaver / Cocos resources+AnimationClip / UE AssetTools），
  资产含引擎元数据，引擎升级由引擎自身迁移

## 目录命名说明

原 `engine-runtime/`（运行时播放器组件）已删除——播放是引擎原生能力，我们只做"装配"，
故更名为 `engine-libs/`（引擎侧库，单文件脚本形态）。
