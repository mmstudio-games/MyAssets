// scene.yaml 极简解析 —— 只支持本项目用到的子集：
//   键值对、两级缩进嵌套、字符串 / 数字 / 布尔 / 行内数组
// 目标：AI 不写 yaml 也能零配置渲染；yaml 只是可选覆盖。

import fs from 'node:fs';
import path from 'node:path';

function parseValue(raw) {
  // 剥离行内注释（值里的 " #" 后是注释，如 `name: start-btn # 按钮`）
  let v = raw.trim();
  const hashIdx = v.indexOf(' #');
  if (hashIdx >= 0) v = v.slice(0, hashIdx).trim();
  if (v === '') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => {
      const t = s.trim().replace(/^['"]|['"]$/g, '');
      const n = Number(t);
      return Number.isNaN(n) ? t : n;
    });
  }
  return v.replace(/^['"]|['"]$/g, '');
}

/** 解析 yaml 文本（本项目子集：键值对 / 嵌套对象 / 行内数组 / 对象列表） */
export function parseYaml(text) {
  const root = {};
  // 栈：{ indent, obj } —— 记录缩进层级对应的容器对象
  const stack = [{ indent: -1, obj: root }];
  let lastList = null; // { parentObj, key } 正在收集的列表

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const listM = line.match(/^(\s*)-\s+(.*)$/);
    const kvM = line.match(/^(\s*)([\w.-]+):\s*(.*)$/);
    if (!listM && !kvM) continue;
    const indent = (listM || kvM)[1].length;
    const rest = (listM || kvM)[2];

    // 弹出缩进大于等于当前行的栈顶（回到当前行的父容器）
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;

    if (listM) {
      // 列表项
      const itemM = rest.match(/^([\w.-]+):\s*(.*)$/);
      if (itemM) {
        const item = { [itemM[1]]: itemM[2] === '' ? {} : parseValue(itemM[2]) };
        if (!Array.isArray(parent)) {
          // 首次遇到列表项：parent 应是某 key 指向的容器，把它转成数组
          // （简化：仅支持 "key:\n  - ..." 结构，parent 为 root[key] 的空对象或已有数组）
          const key = stack[stack.length - 1].key;
          if (key) {
            parent.__list = parent.__list || [];
            parent.__list.push(item);
          }
        } else {
          parent.push(item);
        }
        stack.push({ indent, obj: item, key: itemM[1] });
      } else {
        // 纯值列表项
        const arr = parent.__list || (parent.__list = []);
        arr.push(parseValue(rest));
        stack.push({ indent, obj: parent });
      }
      lastList = { obj: parent };
      continue;
    }

    // 键值对
    const key = kvM[2];
    const val = kvM[3];
    if (rest === '' || (rest === key && val === '')) {
      // 无值 → 嵌套容器（可能是列表容器）
      const child = {};
      // 若父对象有 __list 收集且当前 key 是列表（场景：key: 后直接跟 - 项）
      // 简化：普通嵌套对象
      parent[key] = child;
      stack.push({ indent, obj: child, key });
      lastList = null;
    } else {
      parent[key] = parseValue(val);
      stack.push({ indent, obj: parent, key });
      lastList = null;
    }
  }

  // 规整：把 __list 挂到真实 key
  // 实现：在遇到 "assets:" 无值行时，若后续是列表，需要把 child 换成数组。
  // 上面的简化实现无法完美处理，改为后处理：遍历所有对象，把 __list 数组挂到正确位置。
  normalizeLists(root);
  return root;
}

/** 后处理：把解析过程中收集的 __list 数组挂到父对象的对应 key */
function normalizeLists(obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      if (value.__list) {
        obj[key] = value.__list;   // 该 key 是列表
      } else {
        normalizeLists(value);
      }
    }
  }
}

const DEFAULTS = {
  width: 430,
  height: 932,
  dpr: 2,
  fps: 12,
  frames: null,     // null = 按动画时长自动
  duration: null,   // video 时长 ms（null = 取最长动画时长）
  clip: null,       // [x, y, w, h] 裁剪区（CSS px）
  format: 'png',
  slices: {         // slice 检测参数（CLI 对应：--threshold/--continuity/--min-border/--border）
    threshold: 32,
    continuity: 128,
    minBorder: 4,
  },
  atlas: {          // pack 图集参数（CLI 对应：--name/--maxw）
    name: 'atlas',
    maxW: 2048,
  },
};

/** 浅合并 + 已知嵌套 key 深度合并（slices/atlas 子字段保留默认值） */
function mergeConfig(defaults, file) {
  const out = { ...defaults, ...file };
  for (const key of ['slices', 'atlas']) {
    if (file[key] && typeof file[key] === 'object' && defaults[key]) {
      out[key] = { ...defaults[key], ...file[key] };
    }
  }
  return out;
}

/**
 * 加载场景配置：scene.yaml（可选）覆盖默认值。
 * @param {string} sceneDir 场景目录（含 index.html / scene.html）
 */
export function loadSceneConfig(sceneDir) {
  const yamlPath = path.join(sceneDir, 'scene.yaml');
  const file = fs.existsSync(yamlPath) ? parseYaml(fs.readFileSync(yamlPath, 'utf8')) : {};
  return mergeConfig(DEFAULTS, file);
}
