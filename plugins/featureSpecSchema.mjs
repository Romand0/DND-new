// 特性 spec 数据校验器（feature-fullcycle P1）。
// 单一实现，两处消费：vite buildStart（构建期门禁，失败即 build 失败）+ 探针 14 段断言。
// 口径：spec 文件键 = 种子特性名（孤儿即错）；channel 白名单 = JSON 侧可表达渠道；
//       代码注册表（featureCapabilities REGISTRY）可覆盖同名条目，属运行时优先级，此处不查。
import fs from 'node:fs';
import path from 'node:path';

const SEED_DIR = 'public/seed/玩家手册2014/角色选项/';
const SEED_FILES = ['种族.json', '职业.json', '背景.json'];

export const SPEC_CHANNELS = ['heal', 'resource_conv'];
export const SPEC_SOURCES = ['extractor', 'seed_batch', 'manual'];
const DICE_RE = /^\d*d\d+(\s*[+＋-]\s*\d+)?$/;
const CONV_TARGETS = ['action', 'dash', 'disengage', 'hide', 'bonus'];

/** 逐条校验 spec entry，返回错误清单（空 = 合法）。raw 任意，避免恶意/手残数据炸模块。 */
export function validateFeatureSpecDb(raw) {
  const errors = [];
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['根节点必须为对象（键 = 特性名）'];
  }
  for (const [name, entry] of Object.entries(raw)) {
    const tag = `[${name}]`;
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${tag} entry 必须为对象`);
      continue;
    }
    if (!SPEC_CHANNELS.includes(entry.channel)) {
      errors.push(`${tag} channel 非法：${String(entry.channel)}（白名单：${SPEC_CHANNELS.join('/')}）`);
      continue;
    }
    if (entry.source != null && !SPEC_SOURCES.includes(entry.source)) {
      errors.push(`${tag} source 非法：${String(entry.source)}（白名单：${SPEC_SOURCES.join('/')}）`);
    }
    if (entry.confidence != null && (typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1)) {
      errors.push(`${tag} confidence 必须为 0-1 数值`);
    }
    if (entry.spec == null || typeof entry.spec !== 'object' || Array.isArray(entry.spec)) {
      errors.push(`${tag} spec 必须为对象`);
      continue;
    }
    errors.push(...validateSpecBody(name, entry.channel, entry.spec));
  }
  return errors;
}

function validateSpecBody(name, channel, spec) {
  const tag = `[${name}]`;
  const errors = [];
  if (channel === 'heal') {
    const hasSource = spec.dice != null || spec.flat != null || spec.levelFactor != null;
    if (!hasSource) errors.push(`${tag} heal spec 缺数值来源（dice/flat/levelFactor 至少一项）`);
    if (spec.dice != null && (typeof spec.dice !== 'string' || !DICE_RE.test(spec.dice))) {
      errors.push(`${tag} heal.dice 骰式非法：${String(spec.dice)}`);
    }
    if (spec.flat != null && typeof spec.flat !== 'number') errors.push(`${tag} heal.flat 必须为数值`);
    if (spec.levelFactor != null && typeof spec.levelFactor !== 'number') errors.push(`${tag} heal.levelFactor 必须为数值`);
    if (spec.levelAttr != null && typeof spec.levelAttr !== 'string') errors.push(`${tag} heal.levelAttr 必须为字符串`);
    if (spec.type !== 'hp' && spec.type !== 'temp') errors.push(`${tag} heal.type 必须为 hp/temp`);
  } else if (channel === 'resource_conv') {
    const c = spec.convert;
    if (c == null || typeof c !== 'object' || Array.isArray(c)) {
      errors.push(`${tag} resource_conv.convert 必填`);
    } else {
      if (c.from !== 'bonus' && c.from !== 'action') errors.push(`${tag} convert.from 必须为 bonus/action`);
      const to = c.to;
      if (!Array.isArray(to) || to.length === 0) {
        errors.push(`${tag} convert.to 必须为非空数组`);
      } else {
        for (const t of to) {
          if (!CONV_TARGETS.includes(t)) errors.push(`${tag} convert.to 元素非法：${String(t)}（白名单：${CONV_TARGETS.join('/')}）`);
        }
      }
    }
  }
  return errors;
}

/** 收集种子特性名全集（三种角色选项文件 traits[].name），供孤儿交叉检查。 */
export function collectSeedFeatureNames(root = process.cwd()) {
  const names = new Set();
  for (const file of SEED_FILES) {
    const p = path.join(root, SEED_DIR, file);
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const walk = (node) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node && typeof node === 'object') {
        if (Array.isArray(node.traits)) node.traits.forEach((t) => { if (t && typeof t.name === 'string') names.add(t.name); });
        Object.values(node).forEach(walk);
      }
    };
    walk(data);
  }
  return names;
}

/** 全量校验（条目规则 + 孤儿交叉检查），返回错误清单。 */
export function validateFull(root = process.cwd()) {
  const specPath = path.join(root, 'src/data/featureSpecs/phb2014.json');
  if (!fs.existsSync(specPath)) return [`spec 文件缺失：${specPath}`];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    return [`spec 文件 JSON 解析失败：${e.message}`];
  }
  const errors = validateFeatureSpecDb(raw);
  if (errors.length) return errors;
  const names = collectSeedFeatureNames(root);
  for (const key of Object.keys(raw)) {
    if (!names.has(key)) errors.push(`[${key}] 孤儿 spec：种子特性名集中不存在该键`);
  }
  return errors;
}
