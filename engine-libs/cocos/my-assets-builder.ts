/**
 * MyAssets 帧装配器（Cocos Creator 3.x）—— 单文件，导入项目即可用
 *
 * 作用：把 myassets 导出的序列帧（build/<场景>/frames/f000.png ~ f00N.png）
 *       调 Cocos 原生 API 装配成 AnimationClip + SpriteFrame 资产，引擎原生播放。
 *
 * 用法：
 *   1. 把本文件放进项目的 assets/ 目录（如 assets/my-assets-builder.ts）
 *   2. 在任意脚本中调用：
 *      import { buildMyAssetsAnimation } from './my-assets-builder';
 *      await buildMyAssetsAnimation('db://assets/frames/button', 12, true);
 *
 * 说明：
 *   - 依赖 Cocos Creator 3.x 的编辑器/运行时资源 API（resources / assetManager）
 *   - 装配逻辑调原生接口（SpriteFrame、AnimationClip、Animation 组件），不做文件手写
 *   - 帧目录需先导入为 SpriteFrame 资产（把 PNG 拖入 Cocos 自动生成）
 */

import { AnimationClip, SpriteFrame, Animation, Component, assetManager, resources } from 'cc';

/** 收集帧目录下的全部 SpriteFrame（f000 ~ f00N，按名排序） */
export async function collectFrames(dir: string): Promise<SpriteFrame[]> {
  return new Promise((resolve, reject) => {
    resources.loadDir(dir, SpriteFrame, (err, frames) => {
      if (err) { reject(err); return; }
      // 按 f000/f001... 自然排序
      frames.sort((a, b) => (a.name < b.name ? -1 : 1));
      resolve(frames);
    });
  });
}

/**
 * 装配 myassets 帧 → AnimationClip（调 Cocos 原生 API）
 * @param framesDir  帧资产目录（db://assets/... 或 resources 内路径）
 * @param fps        播放帧率（应与 myassets render 的 fps 一致）
 * @param loop       是否循环
 * @returns AnimationClip 资产（挂到 Animation 组件即可播）
 */
export async function buildMyAssetsAnimation(
  framesDir: string,
  fps: number = 12,
  loop: boolean = true,
): Promise<AnimationClip> {
  const frames = await collectFrames(framesDir);
  if (frames.length === 0) {
    throw new Error(`MyAssets: 帧目录为空: ${framesDir}`);
  }

  // 调 Cocos 原生 API 生成 AnimationClip
  const clip = new AnimationClip();
  clip.duration = frames.length / fps;
  clip.sample = 1 / fps;
  clip.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;

  // 逐帧设置 SpriteFrame（spriteFrame 属性曲线）
  const track = new AnimationClip.AnimationTrack();
  track.path = 'spriteFrame';
  frames.forEach((frame, i) => {
    const key = new AnimationClip.Keyframe();
    key.time = i / fps;
    key.value = frame;
    track.keyframes.push(key);
  });
  track.type = AnimationClip.AnimationType.SpriteFrame;
  clip.tracks.push(track);

  return clip;
}

/**
 * 一键装配：给节点挂 Animation 组件并播放
 * @param target     目标节点组件（如 this）
 * @param framesDir  帧资产目录
 * @param fps        帧率
 * @param loop       循环
 */
export async function attachMyAssetsAnimation(
  target: Component,
  framesDir: string,
  fps: number = 12,
  loop: boolean = true,
): Promise<void> {
  const clip = await buildMyAssetsAnimation(framesDir, fps, loop);
  const anim = target.getComponent(Animation) || target.addComponent(Animation);
  anim.clips = [clip];
  anim.playOnLoad = true;
  anim.play(clip.name || 'default');
}
