// 探针：怪物天生施法「N/日」解析 + 存量重算迁移结果（纯引擎/数据断言，无 UI）
// 运行：QUIET=1 node scripts/probes/probe-npc-spellcasting-perday.cjs（只输出 FAIL 与汇总）
const path = require('path');
const fs = require('fs');
const { createJiti } = require('jiti');

const QUIET = !!process.env.QUIET;
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; if (!QUIET) console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + ' :: ' + JSON.stringify(detail)); }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
}

const jiti = createJiti(__filename, { alias: { '@': path.resolve(__dirname, '../../src') } });
const ROOT = path.resolve(__dirname, '../..');

async function main() {
  const { parseSpellcasting } = await jiti.import('../../scripts/parse-monsters.mjs');

  // ---- 解析器直调：真实语料形态 ----
  // 样本 1：恶猿魔（纯 每项N/日 结构，修复前整组丢失）
  const yuanmo = parseSpellcasting([{ name: '天生施法Innate Spellcasting', text: '恶猿魔天生施法属性为感知（法术豁免DC13），它天生即可施展以下法术且无需任何材料成分：每项1/日：纠缠术entangle，魅影之力phantasmalforce每项2/日：易容术disguiseself，隐形术invisibility（仅自身）' }]);
  check('纯每项N/日结构解析出 spellcasting', !!yuanmo, yuanmo);
  check('恶猿魔 ability/dc', yuanmo?.ability === '感知' && yuanmo?.dc === 13, yuanmo);
  check('恶猿魔 两组 perDayEach', yuanmo?.groups?.length === 2 && yuanmo.groups[0].ring === '每项1/日' && yuanmo.groups[0].usage?.kind === 'perDayEach' && yuanmo.groups[0].usage?.count === 1, yuanmo?.groups);
  check('恶猿魔 第二组 count 2', yuanmo?.groups?.[1]?.usage?.count === 2, yuanmo?.groups?.[1]);
  check('恶猿魔 法术名提取（英文名剥离）', yuanmo?.groups?.[0]?.spells?.join('、') === '纠缠术、魅影之力', yuanmo?.groups?.[0]?.spells);

  // 样本 2：寇涛大祭司（施法 + 环阶法术位注记，回归验证）
  const kouTao = parseSpellcasting([{ name: '施法Spellcasting', text: '寇涛作为10级施法者，其施法属性为感知（法术豁免DC 14，法术攻击命中+6）。寇涛准备了以下牧师法术：戏法（随意）：神导术guidance，圣火术sacred flame，奇术thaumaturgy1环（4法术位）：侦测魔法detect magic，庇护术sanctuary，虔诚护盾shield of faith2环（3法术位）：定身类人hold person，灵体武器spiritual weapon3环（3法术位）：灵体卫士spirit guardians，巧言术tongues4环（3法术位）：操控水体control water，预言术divination5环（2法术位）：群体疗伤术mass cure wounds，探知术scrying' }]);
  check('寇涛 戏法 atWill', kouTao?.groups?.[0]?.usage?.kind === 'atWill', kouTao?.groups?.[0]);
  check('寇涛 1环 slots 4（回归）', kouTao?.groups?.[1]?.usage?.kind === 'slots' && kouTao.groups[1].usage.count === 4, kouTao?.groups?.[1]);
  check('寇涛 dc14/命中6/感知（回归）', kouTao?.dc === 14 && kouTao?.attackBonus === 6 && kouTao?.ability === '感知', kouTao);

  // 样本 3：混合 随意 + 每项N/日 + 裸 N/日（拉迷亚/毒虫罗斯魔/妖精龙形态）
  const mixed = parseSpellcasting([{ name: '天生施法Innate Spellcasting', text: '属性为魅力（法术豁免DC15，法术攻击命中+7）：随意：隐形术invisibility每项3/日：魅惑人类charm person3/日：雷鸣波thunderwave' }]);
  check('混合结构三组', mixed?.groups?.length === 3, mixed?.groups);
  check('随意组 atWill', mixed?.groups?.[0]?.usage?.kind === 'atWill', mixed?.groups?.[0]);
  check('每项3/日 perDayEach 3', mixed?.groups?.[1]?.usage?.kind === 'perDayEach' && mixed.groups[1].usage.count === 3, mixed?.groups?.[1]);
  check('裸 3/日 perDay 3', mixed?.groups?.[2]?.ring === '3/日' && mixed.groups[2].usage?.kind === 'perDay' && mixed.groups[2].usage.count === 3, mixed?.groups?.[2]);

  // 样本 4：无 DC 保留 undefined（回归）
  const noDc = parseSpellcasting([{ name: '天生施法Innate Spellcasting', text: '随意：隐形术' }]);
  check('无DC原文保留 traits', noDc === undefined, noDc);

  // ---- 存量迁移结果断言 ----
  const templates = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/npcTemplates.json'), 'utf8'));
  const withSc = templates.filter((t) => t.spellcasting);
  check('模板库 spellcasting 数量 >= 63', withSc.length >= 63, withSc.length);
  const ym = templates.find((t) => t.name === '恶猿魔');
  check('恶猿魔已入账 perDayEach', ym?.spellcasting?.groups?.[0]?.usage?.kind === 'perDayEach', ym?.spellcasting);
  const drow = templates.find((t) => t.name === '卓尔' && t.spellcasting);
  check('卓尔 随意+每项1/日 两组', drow?.spellcasting?.groups?.length === 2, drow?.spellcasting?.groups);
  const lich = templates.find((t) => t.name === '巫妖');
  check('巫妖 slots 注记已补（1环4法术位）', lich?.spellcasting?.groups?.some((g) => g.ring === '1环' && g.usage?.kind === 'slots' && g.usage.count === 4), lich?.spellcasting?.groups);
  const usageCount = templates.reduce((n, t) => n + (t.spellcasting?.groups ?? []).filter((g) => g.usage).length, 0);
  check('模板库带 usage 分组 >= 200', usageCount >= 200, usageCount);

  // 降级保护：原文确实未印 DC 的模板保持 spellcasting 缺省（留 traits 手动补足）
  for (const name of ['云巨人', '吉斯洋基武者', '吉斯泽莱武僧', '螳螂人']) {
    const t = templates.find((x) => x.name === name);
    check(`无DC模板保留 traits（${name}）`, !t?.spellcasting, t?.spellcasting ?? undefined);
  }

  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/seed/怪物图鉴2014/怪物/亡灵.json'), 'utf8'));
  const mLich = (Array.isArray(seed) ? seed : [seed]).find((t) => t?.name === '巫妖');
  check('种子巫妖 slots 已补', (mLich?.spellcasting?.groups ?? []).some((g) => g.usage?.kind === 'slots'), mLich?.spellcasting?.groups);

  console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILED'}: ${pass} pass, ${fail} fail`);
  if (fail > 0) { failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }
}

main().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
