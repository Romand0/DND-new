// 探针：怪物图鉴攻击近远程分类——「触及/射程」前缀权威性的数据级断言
// 覆盖 isRangedWeapon 四副本中可直接导入的两份（reactionRules / advantageRules）；
// CombatAttackModal / CombatantInfoPanel 为组件内闭包副本，同口径补丁，UI 链留人工验收。
// 运行：QUIET=1 node scripts/probes/probe-monster-attack-classify.cjs（只输出 FAIL 与汇总）
const path = require('path');
const { createJiti } = require('jiti');

const QUIET = !!process.env.QUIET;
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; if (!QUIET) console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + ' :: ' + JSON.stringify(detail)); }
}

// node 下补 localStorage 桩（jiti 加载 store 链时字段兜底需要）
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
}

const jiti = createJiti(__filename, { alias: { '@': path.resolve(__dirname, '../../src') } });

/** 怪物图鉴提取器产出形态（parse-monsters.mjs）：近战恒填 normalRange/maxRange，range 前缀触及/射程 */
const monsterMelee5 = { name: '弯刀', attackBonus: '+4', damage: '1d6+2', damageType: '挥砍', range: '触及5尺', properties: ['精细'], normalRange: 5, maxRange: 5 };
const monsterMelee10 = { name: '尾击', attackBonus: '+7', damage: '2d8+5', damageType: '钝击', range: '触及10尺', properties: [], normalRange: 10, maxRange: 10 };
const monsterRanged = { name: '轻弩', attackBonus: '+3', damage: '1d8+1', damageType: '穿刺', range: '射程80/320尺', properties: ['装填', '双手'], normalRange: 80, maxRange: 320 };
const pcMelee = { name: '长剑', attackBonus: '+5', damage: '1d8+3', damageType: '挥砍', range: '5 尺', properties: [], subtype: '军用近战' };
const pcRanged = { name: '长弓', attackBonus: '+5', damage: '1d8+3', damageType: '穿刺', properties: ['弹药', '双手'], normalRange: 150, maxRange: 600, subtype: '军用远程' };
const pcThrown = { name: '标枪', attackBonus: '+5', damage: '1d6+3', damageType: '穿刺', range: '5 尺', properties: ['投掷'], normalRange: 30, maxRange: 120, subtype: '军用近战' };

async function main() {
  const { getMeleeReachCells } = await jiti.import('@/data/reactionRules');
  const { detectAdvantage } = await jiti.import('@/data/advantageRules');

  // ---- 副本 1：reactionRules.getMeleeReachCells（借机攻击资格） ----
  check('触及5尺怪物近战有借机资格(1格)', getMeleeReachCells(monsterMelee5) === 1, getMeleeReachCells(monsterMelee5));
  check('触及10尺怪物近战长触及(2格)', getMeleeReachCells(monsterMelee10) === 2, getMeleeReachCells(monsterMelee10));
  check('射程怪物纯远程无借机资格', getMeleeReachCells(monsterRanged) === null, getMeleeReachCells(monsterRanged));
  check('PC纯近战不受影响(1格)', getMeleeReachCells(pcMelee) === 1, getMeleeReachCells(pcMelee));
  check('PC远程不受影响(无资格)', getMeleeReachCells(pcRanged) === null, getMeleeReachCells(pcRanged));
  check('PC投掷武器保留近战使用方式', getMeleeReachCells(pcThrown) === 1, getMeleeReachCells(pcThrown));

  // ---- 副本 2：advantageRules.detectAdvantage（5尺远程劣势） ----
  const baseCtx = {
    currentRound: 1,
    attacker: { id: 'a', name: '攻击者' },
    target: { id: 'b', name: '目标' },
    attackerPos: { col: 0, row: 0 },
    targetPos: { col: 1, row: 0 },
    distanceCells: 1,
    combatantPositions: [],
    roster: [],
    recordId: 'probe',
    roundCtx: {},
  };
  const noDisadv = (r) => !(r.disadvantage || []).some(d => d.kind === 'positional');
  const hasDisadv = (r) => (r.disadvantage || []).some(d => d.kind === 'positional' && d.label.includes('5 尺'));

  // 修复点：怪物近战即使被调用方误标 attack_ranged 场景，触及前缀也不产生 5 尺劣势
  const r1 = detectAdvantage({ ...baseCtx, scene: 'attack_ranged', attack: monsterMelee5 });
  check('怪物近战(触及5尺)不产生5尺远程劣势', noDisadv(r1), r1.disadvantage);
  const r2 = detectAdvantage({ ...baseCtx, scene: 'attack_ranged', attack: monsterMelee10, targetPos: { col: 2, row: 0 } });
  check('怪物长触及(10尺)不产生远程劣势', noDisadv(r2), r2.disadvantage);
  // 正例：真远程怪物攻击 5 尺内劣势保留
  const r3 = detectAdvantage({ ...baseCtx, scene: 'attack_ranged', attack: monsterRanged });
  check('怪物远程(射程)5尺内仍有劣势', hasDisadv(r3), r3.disadvantage);
  // PC 近战场景不受影响
  const r4 = detectAdvantage({ ...baseCtx, scene: 'attack_melee', attack: pcMelee });
  check('PC近战场景无位置劣势', noDisadv(r4), r4.disadvantage);
  // PC 投掷武器 5 尺劣势保留（5e 投掷在近战距离仍有劣势，走 usageMode=thrown 场景）
  const r5 = detectAdvantage({ ...baseCtx, scene: 'attack_thrown', attack: pcThrown });
  check('PC投掷5尺内劣势保留', hasDisadv(r5), r5.disadvantage);

  console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILED'}: ${pass} pass, ${fail} fail`);
  if (fail > 0) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
}

main().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(1); });
