# MyAssets 帧装配器（Godot 4.x）—— 单文件，导入项目即可用
#
# 作用：把 myassets 导出的序列帧（build/<场景>/frames/f000.png ~ f00N.png）
#       调 Godot 原生 API 装配成 SpriteFrames 资产（.tres），引擎原生播放。
#
# 用法（二选一）：
#   方式 A（编辑器内，推荐）：把本文件拖进项目 → 打开 Godot 编辑器 → 运行下方装配
#       （在 Godot 脚本编辑器中执行，或挂到任意节点用 _ready 触发）
#   方式 B（命令行）：
#       godot --headless --script res://my_assets_builder.gd -- --frames "res://frames" --out "res://anim.tres" --fps 12
#
# 实现：全部调用 Godot 原生接口（SpriteFrames.new / add_frame / ResourceSaver.save），
#       不做任何文件格式手写，保证资产是引擎一等公民。

extends SceneTree
# @tool 保证编辑器环境也能运行（装配在编辑器中直接生效）

## 装配 myassets 帧目录 → SpriteFrames 资产
## @param frames_dir  帧目录路径（如 "res://build/button/frames" 或绝对路径）
## @param out_path    输出 .tres 路径（如 "res://button_frames.tres"）
## @param fps         播放帧率（应与 myassets render 的 fps 一致）
## @param loop        是否循环
## @return 生成的 SpriteFrames 资源（或 null）
func build_sprite_frames(frames_dir: String, out_path: String = "", fps: float = 12.0, loop: bool = true) -> SpriteFrames:
	var dir := DirAccess.open(frames_dir)
	if dir == null:
		push_error("MyAssets: 无法打开帧目录: " + frames_dir)
		return null

	# 收集 f000.png ~ f00N.png（按文件名自然排序）
	var files: Array[String] = []
	dir.list_dir_begin()
	var f := dir.get_next()
	while f != "":
		if not dir.current_is_dir() and f.ends_with(".png"):
			files.append(f)
		f = dir.get_next()
	dir.list_dir_end()
	files.sort()

	if files.is_empty():
		push_error("MyAssets: 帧目录中没有 PNG: " + frames_dir)
		return null

	# 调原生 API 装配 SpriteFrames
	var sf := SpriteFrames.new()
	sf.add_animation("default")
	sf.set_animation_speed("default", fps)
	sf.set_animation_loop("default", loop)
	for file in files:
		var tex := load(frames_dir.path_join(file)) as Texture2D
		if tex:
			sf.add_frame("default", tex)

	if out_path != "":
		var err := ResourceSaver.save(sf, out_path)
		if err != OK:
			push_error("MyAssets: 保存 SpriteFrames 失败: " + out_path + " (err " + str(err) + ")")
			return null
		print("MyAssets: SpriteFrames 已装配 → " + out_path + " (" + str(files.size()) + " 帧 @" + str(fps) + "fps)")
	return sf

## 命令行入口：godot --headless --script 本文件 -- --frames X --out Y [--fps N] [--no-loop]
func _initialize() -> void:
	# 仅在命令行直接运行时执行装配（编辑器内调用走 build_sprite_frames）
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		return
	var frames_dir := ""
	var out_path := ""
	var fps := 12.0
	var loop := true
	var i := 0
	while i < args.size():
		match args[i]:
			"--frames": frames_dir = args[i + 1]; i += 1
			"--out": out_path = args[i + 1]; i += 1
			"--fps": fps = float(args[i + 1]); i += 1
			"--no-loop": loop = false
		i += 1
	if frames_dir == "" or out_path == "":
		printerr("用法: --frames <目录> --out <输出.tres> [--fps N] [--no-loop]")
		quit(1)
		return
	var ok := build_sprite_frames(frames_dir, out_path, fps, loop)
	quit(0 if ok != null else 1)
