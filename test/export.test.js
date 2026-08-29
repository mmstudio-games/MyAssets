// 多资产编排导出验证（export）：
//   1. scene.yaml assets 列表解析正确（含行内注释剥离）
//   2. 九宫格资产产出切片 + ninegrid.json + 边框参数
//   3. 整图贴图资产产出单 PNG
//   4. manifest.json 汇总完整
// 前置条件：先运行 render + export（main-menu 场景）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml } from '../src/config.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(__dirname, '..', 'build', 'main-menu', 'export');
const scenes = path.join(__dirname, '..', 'scenes', 'main-menu');

test('yaml 列表解析 + 行内注释剥离', () => {
  const yaml = fs.readFileSync(path.join(scenes, 'scene.yaml'), 'utf8');
  const c = parseYaml(yaml);
  assert.ok(Array.isArray(c.assets), 'assets 应为数组');
  assert.equal(c.assets.length, 3, '应有 3 个资产');
  assert.deepEqual(c.assets.map((a) => a.name), ['start-btn', 'title-glow', 'deco-bar'], '名称不应含行内注释');
  assert.equal(c.assets[0].nine, true, 'start-btn 应为九宫格');
  assert.equal(c.assets[1].nine, false, 'title-glow 应为整图');
});

test('多资产导出：九宫格切片 + 整图贴图 + manifest', () => {
  const manifestPath = path.join(build, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('缺少 export 产物：先运行 myassets export scenes/main-menu');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.assets.length, 3);
  // start-btn：九宫格 → 9 切片 + ninegrid
  const btn = manifest.assets.find((a) => a.name === 'start-btn');
  assert.equal(btn.type, 'nine-slice');
  assert.ok(btn.borders.left > 0 && btn.borders.top > 0, '按钮边框应为正');
  const btnMeta = path.join(build, 'start-btn', 'ninegrid.json');
  assert.ok(fs.existsSync(btnMeta), '应有 ninegrid.json');
  const slices = fs.readdirSync(path.join(build, 'start-btn')).filter((f) => f.startsWith('slice-'));
  assert.equal(slices.length, 9, '应有 9 张切片');
  // title-glow：整图贴图 → 单 PNG
  const glow = manifest.assets.find((a) => a.name === 'title-glow');
  assert.equal(glow.type, 'texture');
  assert.ok(fs.existsSync(path.join(build, 'title-glow.png')), '应有 title-glow.png');
  // deco-bar：九宫格
  const bar = manifest.assets.find((a) => a.name === 'deco-bar');
  assert.equal(bar.type, 'nine-slice');
  assert.ok(bar.borders.left >= 30, `装饰条渐变端边框应大（L=${bar.borders.left}）`);
});
