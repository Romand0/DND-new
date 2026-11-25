/**
 * 种子数据统一查询层 —— CLI（scripts/seed.cjs）与探针共用
 *
 * 用途：开发期精确查询 src/data 下三个种子库（怪物图鉴 / 角色选项 / 法术），
 * 探针直接 import 本模块拿 fixture，保证探针数据与真实种子一致。
 *
 * 用法（模块）：
 *   const { findMonster, searchMonsters, searchOptions, searchSpells, seedStats } =
 *     require('<repo>/scripts/lib/seedQuery.cjs');
 *   findMonster('werewolf') / searchMonsters({ cr: '1/2', size: '小型' })
 *   searchOptions({ kind: 'class', name: '战士' }) / searchSpells({ level: 3 })
 *
 * 用法（CLI）：
 *   node scripts/seed.cjs monster --name 哥布林 --fields name,ac,maxHp
 *   node scripts/seed.cjs option --class 战士
 *   node scripts/seed.cjs spell --level 3 --count
 *   node scripts/seed.cjs stats
 */
const MONSTERS = require('../../src/data/npcTemplates.json');
const OPTIONS = require('../../src/data/options.json');
const SPELLS = require('../../src/data/spells.json');

/** 怪物体型值域（与 CombatSession validSizes 对齐） */
const SIZE_VALUES = ['微型', '小型', '中型', '大型', '巨型', '超巨型'];

/** 字段存在且非空：数组要求长度 > 0，字符串要求 trim 后非空 */
function fieldHas(entity, key) {
  const v = entity ? entity[key] : undefined;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim() !== '';
  return v !== undefined && v !== null;
}

/** 字段投影：fields 为逗号分隔字符串或数组 */
function project(entity, fields) {
  if (!fields) return entity;
  const keys = Array.isArray(fields) ? fields : String(fields).split(',').map(s => s.trim()).filter(Boolean);
  const out = {};
  for (const k of keys) {
    if (entity && entity[k] !== undefined) out[k] = entity[k];
  }
  return out;
}

/** 名称子串匹配（name + nameEn，不区分大小写） */
function nameMatch(entity, keyword) {
  if (!keyword) return true;
  const kw = keyword.toLowerCase();
  return [entity.name, entity.nameEn].some(n => typeof n === 'string' && n.toLowerCase().includes(kw));
}

/** 通用筛选器（all 为全集，f 为筛选条件对象；fields 投影在筛选后应用） */
function filterAll(all, f = {}) {
  let list = all;
  if (f.id) list = list.filter(x => x.templateId === f.id || x.id === f.id);
  if (f.name) list = list.filter(x => nameMatch(x, f.name));
  if (f.cr !== undefined) list = list.filter(x => String(x.cr) === String(f.cr));
  if (f.type) list = list.filter(x => x.type === f.type);
  if (f.size) list = list.filter(x => x.size === f.size);
  if (f.level !== undefined && f.level !== null && f.level !== '') list = list.filter(x => x.level === Number(f.level));
  if (f.school) list = list.filter(x => x.school === f.school);
  if (f.forClass) list = list.filter(x => Array.isArray(x.classes) && x.classes.some(c => typeof c === 'string' && c.includes(f.forClass)));
  if (f.has) list = list.filter(x => fieldHas(x, f.has));
  if (f.limit !== undefined && f.limit !== null && Number.isFinite(Number(f.limit))) list = list.slice(0, Number(f.limit));
  if (f.fields) list = list.map(x => project(x, f.fields));
  return list;
}

const searchMonsters = (f = {}) => filterAll(MONSTERS, f);
const searchSpells = (f = {}) => filterAll(SPELLS, f);
/** 选项库查询：kind（class/race/background）先收窄数据池，其余条件通用 */
const searchOptions = (f = {}) => {
  const kind = f.kind ? normalizeOptionKind(f.kind) : null;
  const pool = kind ? OPTIONS[kind] : [...OPTIONS.classes, ...OPTIONS.races, ...OPTIONS.backgrounds];
  return filterAll(pool, { ...f, kind: undefined });
};

/** 选项库分类名归一：class/race/background ↔ 职业/种族/背景 */
function normalizeOptionKind(kind) {
  const map = { class: 'classes', race: 'races', background: 'backgrounds', 职业: 'classes', 种族: 'races', 背景: 'backgrounds' };
  return map[kind] || null;
}

/** 按 ID 或名称取单条：精确 ID → 名称精确 → nameEn 精确 → null */
function findOne(idOrName, pool) {
  const byId = pool.find(x => x.templateId === idOrName || x.id === idOrName);
  if (byId) return byId;
  const lower = String(idOrName).toLowerCase();
  return pool.find(x => x.name === idOrName) || pool.find(x => typeof x.nameEn === 'string' && x.nameEn.toLowerCase() === lower) || null;
}

const findMonster = (idOrName) => findOne(idOrName, MONSTERS);
const findSpell = (idOrName) => findOne(idOrName, SPELLS);

/** 三库统计概览：数量 + 关键字段覆盖率 */
function seedStats() {
  return {
    monsters: {
      total: MONSTERS.length,
      withMultiattack: MONSTERS.filter(m => fieldHas(m, 'multiattack')).length,
      withTraits: MONSTERS.filter(m => fieldHas(m, 'traits')).length,
      bySize: MONSTERS.reduce((acc, m) => { acc[m.size] = (acc[m.size] || 0) + 1; return acc; }, {}),
      byCr: MONSTERS.reduce((acc, m) => { const k = String(m.cr); acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    },
    options: {
      classes: OPTIONS.classes.length,
      races: OPTIONS.races.length,
      backgrounds: OPTIONS.backgrounds.length,
    },
    spells: SPELLS.length,
  };
}

module.exports = {
  SIZE_VALUES,
  loadMonsters: () => MONSTERS,
  loadOptions: () => OPTIONS,
  loadSpells: () => SPELLS,
  findMonster,
  findSpell,
  findOne,
  searchMonsters,
  searchOptions,
  searchSpells,
  normalizeOptionKind,
  fieldHas,
  project,
  seedStats,
};
