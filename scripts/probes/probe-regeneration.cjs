// 探针：再生（Regeneration）——纯函数 + combatStore 回合开始结算，无 UI
// 运行：QUIET=1 node scripts/probes/probe-regeneration.cjs
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

async function main() {
  const regen = await jiti.import('@/data/regeneration');
  const combatStore = (await jiti.import('@/data/combatStore')).default;
  const npc = require('../../src/data/npcTemplates.json');

  // ---- 否定条件解析 ----
  check('强酸或火焰 → 两类型', JSON.stringify(regen.regenNegateTypes('强酸或火焰')) === '["强酸","火焰"]', regen.regenNegateTypes('强酸或火焰'));
  check('火焰或光耀 → 两类型', JSON.stringify(regen.regenNegateTypes('火焰或光耀')) === '["火焰","光耀"]', regen.regenNegateTypes('火焰或光耀'));
  check('「或者」也能拆', JSON.stringify(regen.regenNegateTypes('强酸或者火焰')) === '["强酸","火焰"]', regen.regenNegateTypes('强酸或者火焰'));
  check('空值 → 空数组', regen.regenNegateTypes(undefined).length === 0);

  // ---- 伤害是否触发失效 ----
  check('强酸命中', regen.isRegenSuppressedBy('强酸或火焰', '强酸') === true);
  check('火焰命中', regen.isRegenSuppressedBy('强酸或火焰', '火焰') === true);
  check('闪电不命中', regen.isRegenSuppressedBy('强酸或火焰', '闪电') === false);
  check('无伤害类型不命中', regen.isRegenSuppressedBy('强酸或火焰', undefined) === false);
  check('无否定条件不命中', regen.isRegenSuppressedBy(undefined, '火焰') === false);
  check('伤害类型含子串（火焰伤害）命中', regen.isRegenSuppressedBy('强酸或火焰', '火焰伤害') === true);

  // ---- 回合开始计划 ----
  const P = regen.planTurnStartRegeneration;
  check('无再生 → null', P({ currentHp: 10, maxHp: 20 }) === null);
  check('已死亡 → null', P({ regenAmount: 10, currentHp: 0, maxHp: 20, isDead: true }) === null);
  check('满血 → heal 0', (() => { const p = P({ regenAmount: 10, currentHp: 20, maxHp: 20 }); return p.heal === 0 && p.dies === false; })());
  check('受伤回满额', (() => { const p = P({ regenAmount: 10, currentHp: 30, maxHp: 60 }); return p.heal === 10 && !p.dies; })());
  check('接近满血截断', (() => { const p = P({ regenAmount: 10, currentHp: 55, maxHp: 60 }); return p.heal === 5; })());
  check('0 生命值未失效 → 复活回血', (() => { const p = P({ regenAmount: 10, currentHp: 0, maxHp: 60 }); return p.heal === 10 && !p.dies && p.note.includes('自 0 生命值回复'); })());
  check('0 生命值 + 失效 → 死亡', (() => { const p = P({ regenAmount: 10, currentHp: 0, maxHp: 60, regenSuppressed: true, regenNegate: '火焰' }); return p.dies === true && p.heal === 0; })());
  check('有生命值 + 失效 → 不回血', (() => { const p = P({ regenAmount: 10, currentHp: 20, maxHp: 60, regenSuppressed: true }); return !p.dies && p.heal === 0 && p.suppressed === true; })());

  // ---- combatStore 集成：真正落库 ----
  const rec = combatStore.create('探针再生', [
    { name: '巨魔', isMonster: true, currentHp: 40, maxHp: 60, regenAmount: 10, regenNegate: '强酸或火焰' },
    { name: '史拉蟾', isMonster: true, currentHp: 60, maxHp: 60, regenAmount: 10 },
    { name: '还魂鬼', isMonster: true, currentHp: 0, maxHp: 60, regenAmount: 10, regenNegate: '火焰或光耀' },
    { name: '普通兵', isMonster: true, currentHp: 20, maxHp: 20 },
  ]);
  const [troll, slaad, ghost, plain] = rec.combatants;

  const p1 = combatStore.applyTurnStartRegeneration(rec.id, troll.id);
  let after = combatStore.get(rec.id);
  check('巨魔回合开始回 10', p1?.heal === 10 && after.combatants[0].currentHp === 50, after.combatants[0].currentHp);
  check('再生事件入 combatEvents', (after.combatEvents ?? []).some(e => e.kind === 'heal' && e.targetId === troll.id), after.combatEvents?.length);

  const p2 = combatStore.applyTurnStartRegeneration(rec.id, slaad.id);
  after = combatStore.get(rec.id);
  check('满血再生不溢出', p2?.heal === 0 && after.combatants[1].currentHp === 60, after.combatants[1].currentHp);

  const p3 = combatStore.applyTurnStartRegeneration(rec.id, ghost.id);
  after = combatStore.get(rec.id);
  check('0 HP 未失效 → 复活到 10', p3?.heal === 10 && after.combatants[2].currentHp === 10 && !after.combatants[2].isUnconscious, after.combatants[2]);

  check('无再生特性 → null', combatStore.applyTurnStartRegeneration(rec.id, plain.id) === null);

  // 失效标记消费：置位 → 不回血，且标记清除
  combatStore.update(rec.id, {
    combatants: combatStore.get(rec.id).combatants.map(c => c.id === troll.id ? { ...c, regenSuppressed: true } : c),
  });
  const p4 = combatStore.applyTurnStartRegeneration(rec.id, troll.id);
  after = combatStore.get(rec.id);
  check('失效回合不回血', p4?.heal === 0 && p4?.suppressed === true && after.combatants[0].currentHp === 50, after.combatants[0].currentHp);
  check('失效标记消费后清除', after.combatants[0].regenSuppressed === false, after.combatants[0].regenSuppressed);

  // 0 HP + 失效 → 死亡
  combatStore.update(rec.id, {
    combatants: combatStore.get(rec.id).combatants.map(c => c.id === ghost.id ? { ...c, currentHp: 0, regenSuppressed: true } : c),
  });
  const p5 = combatStore.applyTurnStartRegeneration(rec.id, ghost.id);
  after = combatStore.get(rec.id);
  check('0 HP + 失效 → 死亡', p5?.dies === true && after.combatants[2].isDead === true && after.combatants[2].currentHp === 0, after.combatants[2]);

  // ---- 种子数据：否定条件已解析 ----
  const trollT = npc.find(m => m.name === '巨魔').regeneration;
  check('巨魔再生 10/强酸或火焰', trollT?.amount === 10 && trollT?.negate === '强酸或火焰', trollT);
  const ghostT = npc.find(m => m.name === '还魂鬼').regeneration;
  check('还魂鬼再生 10/火焰或光耀', ghostT?.amount === 10 && ghostT?.negate === '火焰或光耀', ghostT);
  check('再生条目 9 条均有恢复量', npc.filter(m => m.regeneration).length === 9 && npc.filter(m => m.regeneration).every(m => m.regeneration.amount > 0), npc.filter(m => m.regeneration).length);

  console.log(`\n=== 再生探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(', ')); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
