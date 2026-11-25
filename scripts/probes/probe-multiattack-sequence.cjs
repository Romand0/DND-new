// 探针：多重攻击序列引擎（方案A：1 动作内按配方出 N 击）——纯 combatStore 断言，无 UI
// 运行：QUIET=1 node scripts/probes/probe-multiattack-sequence.cjs（只输出 FAIL 与汇总）
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
  const combatStore = (await jiti.import('@/data/combatStore')).default;

  // ---- resolveMultiattackStep：配方步骤名 → 攻击对象三态 ----
  const attacks = [
    { name: '爪击', attackBonus: '+4', damage: '1d6+2', damageType: '挥砍' },
    { name: '啮咬', attackBonus: '+4', damage: '1d8+2', damageType: '穿刺' },
    { name: '鞭击', attackBonus: '+4', damage: '1d4+2', damageType: '挥砍' },
  ];

  const exact = combatStore.resolveMultiattackStep('爪击', attacks);
  check('精确匹配命中爪击', exact?.name === '爪击', exact);

  // 配方名与攻击名一方包含另一方（CHM 噪声「鞭攻击」 vs 攻击表「鞭击」）→ 锁定
  const superset = combatStore.resolveMultiattackStep('鞭攻击', attacks);
  check('无包含关系不锁定（鞭攻击 vs 鞭击 → 自选步）', superset === null, superset);
  const subset = combatStore.resolveMultiattackStep('击', attacks);
  check('子串多义匹配拒绝（击 同时命中多个）', subset === null, subset);

  const miss = combatStore.resolveMultiattackStep('投掷烈焰', attacks);
  check('失配返回 null（该步自选攻击）', miss === null, miss);

  const emptyAttacks = combatStore.resolveMultiattackStep('爪击', []);
  check('攻击表为空返回 null', emptyAttacks === null, emptyAttacks);

  // ---- expandMultiattackQueue：配方展开 ----
  const queue = combatStore.expandMultiattackQueue([
    { name: '啮咬', count: 1 },
    { name: '爪击', count: 2 },
  ]);
  check('配方展开顺序与次数', JSON.stringify(queue) === JSON.stringify(['啮咬', '爪击', '爪击']), queue);

  // ---- startMultiattack：建立队列 ----
  const rec = combatStore.create('探针多重攻击', [
    { name: '巨魔', isMonster: true, actions: 1, bonusActions: 0, hp: 60, maxHp: 60, attacks, multiattack: [{ name: '啮咬', count: 1 }, { name: '爪击', count: 2 }] },
    { name: '战士', actions: 1, bonusActions: 0, hp: 30, maxHp: 30 },
  ]);
  const monId = rec.combatants[0].id;
  const pcId = rec.combatants[1].id;
  check('记录创建成功', !!rec?.id, rec?.id);

  const ok = combatStore.startMultiattack(rec.id, monId, queue);
  let after = combatStore.get(rec.id);
  const seq0 = after?.multiattackProgress?.[monId];
  check('startMultiattack 返回 true', ok === true, ok);
  check('队列写入 record', JSON.stringify(seq0?.queue) === JSON.stringify(['啮咬', '爪击', '爪击']), seq0);
  check('起始位置 0', seq0?.pos === 0, seq0);

  check('无配方参战者 startMultiattack 拒绝', combatStore.startMultiattack(rec.id, pcId, ['爪击']) === false);
  check('配方拒绝不产生脏状态', combatStore.get(rec.id).multiattackProgress?.[pcId] === undefined, combatStore.get(rec.id).multiattackProgress);

  // ---- advanceMultiattack：推进 + 越尾自动清除 ----
  combatStore.advanceMultiattack(rec.id, monId);
  after = combatStore.get(rec.id);
  check('推进后 pos=1', after.multiattackProgress[monId].pos === 1, after.multiattackProgress[monId]);

  combatStore.advanceMultiattack(rec.id, monId);
  after = combatStore.get(rec.id);
  check('推进后 pos=2', after.multiattackProgress[monId].pos === 2, after.multiattackProgress[monId]);

  combatStore.advanceMultiattack(rec.id, monId);
  after = combatStore.get(rec.id);
  check('越尾自动清序列', after.multiattackProgress?.[monId] === undefined, after.multiattackProgress);

  check('无序列参战者 advance 无副作用', combatStore.advanceMultiattack(rec.id, pcId).done === true && combatStore.get(rec.id).multiattackProgress?.[pcId] === undefined, combatStore.get(rec.id).multiattackProgress);

  // ---- endMultiattack：中途放弃 ----
  combatStore.startMultiattack(rec.id, monId, queue);
  combatStore.endMultiattack(rec.id, monId);
  after = combatStore.get(rec.id);
  check('endMultiattack 清序列', after.multiattackProgress?.[monId] === undefined, after.multiattackProgress);

  // ---- resetActions：回合开始清序列（防跨回合残留）----
  combatStore.startMultiattack(rec.id, monId, queue);
  combatStore.resetActions(rec.id, monId);
  after = combatStore.get(rec.id);
  check('resetActions 清序列', after.multiattackProgress?.[monId] === undefined, after.multiattackProgress);
  check('resetActions 动作回满', combatStore.get(rec.id).combatants.find(c => c.id === monId).actions === 1, combatStore.get(rec.id).combatants.find(c => c.id === monId).actions);

  // ---- actionConsumed 语义：整序列仅扣 1 次动作由宿主置位，store 侧保证字段持久 ----
  combatStore.startMultiattack(rec.id, monId, queue);
  const seq = combatStore.get(rec.id).multiattackProgress[monId];
  combatStore.update(rec.id, {
    multiattackProgress: {
      ...(combatStore.get(rec.id).multiattackProgress ?? {}),
      [monId]: { ...seq, actionConsumed: true },
    },
  });
  after = combatStore.get(rec.id);
  check('actionConsumed 置位持久', after.multiattackProgress[monId].actionConsumed === true, after.multiattackProgress[monId]);
  combatStore.advanceMultiattack(rec.id, monId);
  after = combatStore.get(rec.id);
  check('推进保留 actionConsumed', after.multiattackProgress[monId].actionConsumed === true, after.multiattackProgress[monId]);
  combatStore.endMultiattack(rec.id, monId);

  combatStore.delete(rec.id);
  check('记录清理', combatStore.get(rec.id) === null, rec.id);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
