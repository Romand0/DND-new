#!/usr/bin/env node
/**
 * 种子数据校验器 —— 结构不变量断言，作为构建门禁（npm run build 前置）
 *
 * 硬错误（退出码 1）：结构破坏，必须修数据
 *   - 各库 ID 唯一、name 非空
 *   - 怪物：cr/ac/maxHp/size/type/proficiencyBonus/六维 必填且类型正确
 *   - 怪物 size 值域合法（微型/小型/中型/大型/巨型/超巨型）
 *   - 怪物 multiattack / traits / attacks 条目结构
 *   - 选项库：classes/features、races/traits 结构
 *   - 法术：id/name/level/school 必填
 * 警告（不阻断）：完整度提示（traits 为空的怪物等）
 *
 * 用法：node scripts/validate-seed.cjs
 */
const { loadMonsters, loadOptions, loadSpells, SIZE_VALUES } = require('./lib/seedQuery.cjs');

const errors = [];
const warnings = [];
const err = (path, msg) => errors.push(`${path}: ${msg}`);
const warn = (path, msg) => warnings.push(`${path}: ${msg}`);

const isPosInt = (v) => Number.isFinite(v) && v > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function validateMonsters(list) {
  const ids = new Set();
  list.forEach((m, i) => {
    const p = `monsters[${i}](${m.name || m.templateId || '无ID'})`;
    if (!m.templateId) err(p, 'templateId 缺失');
    else if (ids.has(m.templateId)) err(p, `templateId 重复: ${m.templateId}`);
    else ids.add(m.templateId);
    if (typeof m.name !== 'string' || m.name.trim() === '') err(p, 'name 缺失或为空');
    if (m.cr === undefined || m.cr === null || String(m.cr) === '') err(p, 'cr 缺失');
    if (!isNum(m.ac)) err(p, `ac 应为数字, 实际 ${JSON.stringify(m.ac)}`);
    if (!isPosInt(m.maxHp)) err(p, `maxHp 应为正数, 实际 ${JSON.stringify(m.maxHp)}`);
    if (!SIZE_VALUES.includes(m.size)) err(p, `size 非法: ${JSON.stringify(m.size)}（值域: ${SIZE_VALUES.join('/')}）`);
    if (typeof m.type !== 'string' || m.type.trim() === '') err(p, 'type 缺失或为空');
    if (!isNum(m.proficiencyBonus)) err(p, `proficiencyBonus 应为数字, 实际 ${JSON.stringify(m.proficiencyBonus)}`);
    for (const ability of ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']) {
      if (!isNum(m[ability])) err(p, `${ability} 应为数字, 实际 ${JSON.stringify(m[ability])}`);
    }
    if (m.multiattack !== undefined) {
      if (!Array.isArray(m.multiattack)) err(p, 'multiattack 应为数组');
      else m.multiattack.forEach((e, j) => {
        if (!e || !isPosInt(e.count) || typeof e.name !== 'string' || !e.name.trim()) err(p, `multiattack[${j}] 应为 {count:正数, name:字符串}, 实际 ${JSON.stringify(e)}`);
      });
    }
    if (!Array.isArray(m.traits)) err(p, 'traits 应为数组');
    else {
      if (m.traits.length === 0) warn(p, 'traits 为空');
      m.traits.forEach((t, j) => {
        if (!t || typeof t.name !== 'string' || !t.name.trim() || typeof t.text !== 'string') err(p, `traits[${j}] 应为 {name, text}, 实际 ${JSON.stringify(t).slice(0, 80)}`);
      });
    }
    if (!Array.isArray(m.attacks)) err(p, 'attacks 应为数组');
    else m.attacks.forEach((a, j) => {
      if (!a || typeof a.name !== 'string' || !a.name.trim()) err(p, `attacks[${j}] 缺少 name`);
    });
  });
}

function validateOptions(options) {
  for (const [kind, list, arrayFields] of [
    ['classes', options.classes, ['features']],
    ['races', options.races, ['traits']],
    ['backgrounds', options.backgrounds, []],
  ]) {
    const ids = new Set();
    list.forEach((o, i) => {
      const p = `${kind}[${i}](${o.name || o.id || '无ID'})`;
      if (!o.id) err(p, 'id 缺失');
      else if (ids.has(o.id)) err(p, `id 重复: ${o.id}`);
      else ids.add(o.id);
      if (typeof o.name !== 'string' || o.name.trim() === '') err(p, 'name 缺失或为空');
      for (const field of arrayFields) {
        if (!Array.isArray(o[field])) err(p, `${field} 应为数组`);
      }
      if (Array.isArray(o.features)) o.features.forEach((f, j) => {
        if (!f || typeof f.name !== 'string' || !f.name.trim()) err(p, `features[${j}] 缺少 name`);
      });
      if (Array.isArray(o.traits)) o.traits.forEach((t, j) => {
        if (!t || typeof t.name !== 'string' || !t.name.trim()) err(p, `traits[${j}] 缺少 name`);
      });
    });
  }
}

function validateSpells(list) {
  const ids = new Set();
  list.forEach((s, i) => {
    const p = `spells[${i}](${s.name || s.id || '无ID'})`;
    if (!s.id) err(p, 'id 缺失');
    else if (ids.has(s.id)) err(p, `id 重复: ${s.id}`);
    else ids.add(s.id);
    if (typeof s.name !== 'string' || s.name.trim() === '') err(p, 'name 缺失或为空');
    if (!Number.isInteger(s.level) || s.level < 0 || s.level > 9) err(p, `level 应为 0-9, 实际 ${JSON.stringify(s.level)}`);
    if (typeof s.school !== 'string' || s.school.trim() === '') err(p, 'school 缺失或为空');
    if (!Array.isArray(s.classes)) err(p, 'classes 应为数组');
  });
}

validateMonsters(loadMonsters());
validateOptions(loadOptions());
validateSpells(loadSpells());

console.log(`种子校验: 错误 ${errors.length}, 警告 ${warnings.length}`);
if (warnings.length > 0) {
  console.log('---- 警告 ----');
  warnings.forEach(w => console.log('  WARN ' + w));
}
if (errors.length > 0) {
  console.log('---- 错误 ----');
  errors.forEach(e => console.log('  ERROR ' + e));
  process.exit(1);
}
