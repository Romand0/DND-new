// 探针：PC 额外攻击（Extra Attack）——推导规则 + 序列集成（纯引擎断言，无 UI）
// 运行：QUIET=1 node scripts/probes/probe-pc-extra-attack.cjs（只输出 FAIL 与汇总）
const path = require('path');
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

function mkChar(overrides) {
  return {
    id: 'c1', name: '测试卡', gender: 'other', profession: { class: '战士' }, level: 1,
    race: '人类', background: '士兵', alignment: '守序善良', experience: 0, size: '中型',
    abilities: {}, proficiencyBonus: 2, passivePerception: 10, armorClass: 16, speed: 30,
    maxHp: 20, currentHp: 20, tempHp: 0, hitDice: { d10: { max: 1, used: 0 } },
    attacks: [], spells: { cantrips: [], custom: [], spellSlots: [] },
    equipment: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    skills: {}, proficiencies: {}, features: [], appearance: '',
    ...overrides,
  };
}

async function main() {
  const { derivePcAttacksPerAction } = await jiti.import('@/lib/pcExtraAttack');
  const combatStore = (await jiti.import('@/data/combatStore')).default;

  const ea = (level, cls = '战士') => ({ name: '额外攻击', description: '', category: '职业特性', source: cls, level });

  // ---- 主路径：features 命中 ----
  check('战士5级 features 双击', derivePcAttacksPerAction(mkChar({ level: 5, features: [ea(5)] })) === 2);
  check('战士11级 features 三击', derivePcAttacksPerAction(mkChar({ level: 11, features: [ea(5)] })) === 3);
  check('战士20级 features 四击', derivePcAttacksPerAction(mkChar({ level: 20, features: [ea(5)] })) === 4);
  check('僧5级 features 双击（无递进）', derivePcAttacksPerAction(mkChar({ level: 11, profession: { class: '武僧' }, features: [ea(5)] })) === 2);
  check('游侠5级 features 双击', derivePcAttacksPerAction(mkChar({ level: 5, profession: { class: '游侠' }, features: [ea(5)] })) === 2);
  check('勇武诗人6级 features 双击', derivePcAttacksPerAction(mkChar({ level: 6, profession: { class: '吟游诗人' }, features: [ea(6, '吟游诗人')] })) === 2);
  check('渴刃邪术师 features 双击', derivePcAttacksPerAction(mkChar({ level: 5, profession: { class: '术士' }, features: [{ name: '渴刃 Thirsting Blade', description: '', category: '魔能祈法' }] })) === 2);
  check('特性等级未达不生效（3级战士）', derivePcAttacksPerAction(mkChar({ level: 3, features: [ea(5)] })) === 1);
  check('英文名 Extra Attack 命中', derivePcAttacksPerAction(mkChar({ level: 5, features: [{ name: 'Extra Attack', description: '', category: '', level: 5 }] })) === 2);

  // ---- 兜底：无 features 按 class+level ----
  check('兜底 战士5级双击', derivePcAttacksPerAction(mkChar({ level: 5, features: [] })) === 2);
  check('兜底 战士11级三击', derivePcAttacksPerAction(mkChar({ level: 11, features: [] })) === 3);
  check('兜底 战士20级四击', derivePcAttacksPerAction(mkChar({ level: 20, features: [] })) === 4);
  check('兜底 野蛮人5级双击', derivePcAttacksPerAction(mkChar({ level: 5, profession: { class: '野蛮人' }, features: [] })) === 2);
  check('兜底 圣武士5级双击', derivePcAttacksPerAction(mkChar({ level: 5, profession: { class: '圣武士' }, features: [] })) === 2);
  check('兜底 法师5级单击（无子职业特例数据）', derivePcAttacksPerAction(mkChar({ level: 5, profession: { class: '法师' }, features: [] })) === 1);
  check('兜底 4级战士单击', derivePcAttacksPerAction(mkChar({ level: 4, features: [] })) === 1);

  // ---- 边界 ----
  check('null 卡单击', derivePcAttacksPerAction(null) === 1);
  check('缺 profession 单击', derivePcAttacksPerAction(mkChar({ profession: undefined })) === 1);

  // ---- 序列集成：PC 队列（空哨兵）走完整生命周期 ----
  const rec = combatStore.create('探针PC额外攻击', [
    { name: '战士', isPc: true, characterId: 'pc-char', actions: 1, bonusActions: 0, hp: 30, maxHp: 30 },
    { name: '哥布林', actions: 1, bonusActions: 0, hp: 7, maxHp: 7 },
  ]);
  const pcId = rec.combatants[0].id;
  const queue = Array.from({ length: 2 }, () => '');
  check('PC 空哨兵队列可开', combatStore.startMultiattack(rec.id, pcId, queue) === true);
  let after = combatStore.get(rec.id);
  check('队列哨兵为空串', after.multiattackProgress[pcId].queue[0] === '', after.multiattackProgress[pcId]);
  combatStore.advanceMultiattack(rec.id, pcId);
  after = combatStore.get(rec.id);
  check('推进到第2击', after.multiattackProgress[pcId].pos === 1, after.multiattackProgress[pcId]);
  combatStore.advanceMultiattack(rec.id, pcId);
  after = combatStore.get(rec.id);
  check('越尾自动清序列', after.multiattackProgress?.[pcId] === undefined, after.multiattackProgress);
  combatStore.startMultiattack(rec.id, pcId, queue);
  combatStore.resetActions(rec.id, pcId);
  check('回合开始清序列', combatStore.get(rec.id).multiattackProgress?.[pcId] === undefined, combatStore.get(rec.id).multiattackProgress);

  combatStore.delete(rec.id);
  check('记录清理', combatStore.get(rec.id) === null, rec.id);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
