# MyAssets 帧装配器（Unreal Engine 5.x）—— 单文件，导入即可用
#
# 作用：把 myassets 导出的序列帧（build/<场景>/frames/f000.png ~ f00N.png）
#       调 UE 原生 API（unreal Python Editor Script）装配成 Paper2D Flipbook，
#       引擎原生播放（PaperFlipbookComponent）。
#
# 用法（在 UE 编辑器的 Python 控制台或 Execute Python Script 中运行）：
#   1. 先把 frames/ 的 PNG 导入 UE 内容浏览器（会生成 Texture2D）
#   2. 调用装配函数：
#      from my_assets_builder import build_flipbook
#      build_flipbook(
#          frames_dir="/Game/UI/ButtonFrames",   # 内容浏览器中的帧目录
#          out_path="/Game/UI/ButtonFlipbook",   # 输出 Flipbook 资产路径
#          fps=12.0,
#          loop=True,
#      )
#
# 实现：全部调 unreal 原生 API（Texture2D / Flipbook / AssetToolsHelpers），
#       不手写 .uasset 文件，保证资产是一等公民。

import unreal


def _collect_frame_textures(frames_dir: str):
    """收集帧目录下的 Texture2D 资产（f000 ~ f00N，按名排序）"""
    asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()
    filter = unreal.ARFilter(
        class_names=["Texture2D"],
        package_paths=[frames_dir],
        recursive=False,
    )
    assets = asset_registry.get_assets(filter)
    textures = []
    for asset_data in assets:
        asset = asset_data.get_asset()
        if asset:
            textures.append((asset_data.asset_name, asset))
    # 按帧名自然排序（f000 < f001 < ... < f009 < f010）
    textures.sort(key=lambda x: x[0])
    return [t[1] for t in textures]


def build_flipbook(
    frames_dir: str,
    out_path: str,
    fps: float = 12.0,
    loop: bool = True,
    collision_source: int = unreal.Paper2DSubsystem.SpriteCollisionDomain.NONE,
):
    """
    装配 myassets 帧目录 → Paper2D Flipbook（调 UE 原生 API）

    Args:
        frames_dir: 内容浏览器中帧所在的目录（如 "/Game/UI/ButtonFrames"）
        out_path:   输出 Flipbook 资产路径（如 "/Game/UI/ButtonFlipbook"）
        fps:        播放帧率（应与 myassets render 的 fps 一致）
        loop:       是否循环
    """
    textures = _collect_frame_textures(frames_dir)
    if not textures:
        raise RuntimeError(f"MyAssets: 帧目录没有 Texture2D: {frames_dir}")

    # 创建 Sprite（Paper2D 需要先有 Sprite 才能做 Flipbook）
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    editor_subsystem = unreal.get_editor_subsystem(unreal.Paper2DSubsystem)

    sprites = []
    for i, tex in enumerate(textures):
        # 用 Texture2D 生成 Sprite
        sprite = unreal.Sprite(
            outer=tex.get_outer(),
            name=f"{tex.get_name()}_Sprite",
            flags=unreal.ObjectFlags.RF_PUBLIC | unreal.ObjectFlags.RF_STANDALONE,
        )
        sprite.set_editor_property("source_texture", tex)
        # 裁剪成 Sprite（默认整张纹理）
        editor_subsystem.make_sprite_from_texture(sprite, tex, 0, 0, tex.blueprint_get_size())
        sprites.append(sprite)

    # 创建 Flipbook 并填帧
    flipbook = unreal.PaperFlipbook()
    flipbook.set_editor_property("fps", fps)
    flipbook.set_editor_property("loop", loop)
    # 逐帧添加 Sprite
    for i, sprite in enumerate(sprites):
        frame = unreal.PaperFlipbookKeyFrame()
        frame.sprite = sprite
        frame.duration = 1.0 / fps
        unreal.PaperFlipbookLibrary.add_key_frame_at(flipbook, i, frame)

    # 保存为资产
    result = asset_tools.create_asset(
        out_path.rsplit("/", 1)[-1],
        out_path.rsplit("/", 1)[0],
        unreal.PaperFlipbook,
        None,
    )
    if result is None:
        # 若已存在则覆盖
        result = unreal.load_asset(out_path)
    unreal.PaperFlipbookLibrary.copy_flipbook(flipbook, result)
    unreal.EditorAssetLibrary.save_asset(out_path)

    print(f"MyAssets: Flipbook 已装配 → {out_path} ({len(sprites)} 帧 @{fps}fps)")
    return result
