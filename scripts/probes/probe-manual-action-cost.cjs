// 探针：手动记录动作经济（攻击次数归一 + 动作/附赠/反应消费与回合重置）
// 运行：QUIET=1 node scripts/probes/probe-manual-action-cost.cjs
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
  const { normalizeManualAttackCount, MANUAL_ACTION_COST_LABELS } = await jiti.import('@/data/manualAttack');
  const combatStore = (await jiti.import('@/data/combatStore')).default;

  // ---- 次数归一 ----
  check('次数：3 保留', normalizeManualAttackCount('3') === 3);
  check('次数：空串按 1', normalizeManualAttackCount('') === 1);
  check('次数：非数字按 1', normalizeManualAttackCount('abc') === 1);
  check('次数：0 下限 1', normalizeManualAttackCount(0) === 1);
  check('次数：负数下限 1', normalizeManualAttackCount(-4) === 1);
  check('次数：上限 10', normalizeManualAttackCount(99) === 10);
  check('次数：小数向下取整', normalizeManualAttackCount(2.9) === 2);
  check('次数：undefined 按 1', normalizeManualAttackCount(undefined) === 1);

  // ---- 成本标签 ----
  check('成本标签齐全',
    MANUAL_ACTION_COST_LABELS.action === '动作'
    && MANUAL_ACTION_COST_LABELS.bonus === '附赠动作'
    && MANUAL_ACTION_COST_LABELS.reaction === '反应'
    && MANUAL_ACTION_COST_LABELS.free === '不消耗',
    MANUAL_ACTION_COST_LABELS);

  // ---- 资源消费与回合重置（放映模式语义） ----
  const rec = combatStore.create('探针动作经济', [
    { name: '测试兵', isMonster: true, currentHp: 20, maxHp: 20 },
  ]);
  const id = rec.combatants[0].id;

  check('初始动作 1', combatStore.get(rec.id).combatants[0].actions === 1);
  const afterAction = combatStore.consumeAction(rec.id, id, 'playback');
  check('消耗动作为 0', afterAction === 0, afterAction);
  const afterBonus = combatStore.consumeBonusAction(rec.id, id, 'playback');
  check('消耗附赠动作为 0', afterBonus === 0, afterBonus);
  combatStore.consumeReaction(rec.id, id);
  check('消耗反应置 reactionUsed', combatStore.get(rec.id).combatants[0].reactionUsed === true);

  combatStore.resetActions(rec.id, id);
  const reset = combatStore.get(rec.id).combatants[0];
  check('回合开始恢复动作/附赠/反应',
    reset.actions === 1 && reset.bonusActions === 1 && reset.reactionUsed === false,
    reset);

  // 模拟模式（非资源消耗）动作不会耗尽
  const sim = combatStore.create('探针动作经济-模拟', [
    { name: '测试兵', isMonster: true, currentHp: 20, maxHp: 20 },
  ]);
  const simId = sim.combatants[0].id;
  const simNext = combatStore.consumeAction(sim.id, simId, 'simulation');
  check('模拟模式动作不会归零', simNext === 1, simNext);

  console.log(`=== 手动动作经济探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(err => { console.error(err); process.exit(1); });
