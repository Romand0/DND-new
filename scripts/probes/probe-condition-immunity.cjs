// 探针：条件免疫拦截（conditionImmunity 归一 + 种子数据值域）——纯引擎断言，无 UI
// 运行：QUIET=1 node scripts/probes/probe-condition-immunity.cjs
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
  const m = await jiti.import('@/data/conditionImmunity');
  const npc = require('../../src/data/npcTemplates.json');

  // ---- 条件名归一（种子变体 → 状态库标准名）----
  check('受擒 → 擒抱', m.normalizeConditionName('受擒') === '擒抱');
  check('恐慌 → 恐惧', m.normalizeConditionName('恐慌') === '恐惧');
  check('惊恐 → 恐惧', m.normalizeConditionName('惊恐') === '恐惧');
  check('标准名原样（中毒）', m.normalizeConditionName('中毒') === '中毒');
  check('去空格', m.normalizeConditionName('  石化 ') === '石化');
  check('空值安全', m.normalizeConditionName(undefined) === '');

  // ---- 状态 ID → 标准条件名 ----
  check('poisoned → 中毒', m.conditionNameOf('poisoned') === '中毒');
  check('stunned → 震慑', m.conditionNameOf('stunned') === '震慑');
  check('grappled → 擒抱', m.conditionNameOf('grappled') === '擒抱');
  check('frightened → 恐惧', m.conditionNameOf('frightened') === '恐惧');
  check('prone → 倒地', m.conditionNameOf('prone') === '倒地');
  check('不存在 ID → null', m.conditionNameOf('not_a_status') === null);

  // ---- 免疫判定 ----
  const poisonImmune = { conditionImmunities: ['中毒'] };
  check('免疫中毒：poisoned 被拦截', m.isImmuneToStatus(poisonImmune, 'poisoned') === true);
  check('免疫中毒：stunned 不拦', m.isImmuneToStatus(poisonImmune, 'stunned') === false);
  check('无免疫字段 → 不拦', m.isImmuneToStatus({}, 'poisoned') === false);
  check('空数组 → 不拦', m.isImmuneToStatus({ conditionImmunities: [] }, 'poisoned') === false);
  check('null 参战者 → 不拦', m.isImmuneToStatus(null, 'poisoned') === false);

  // 别名双向归一：数据写「受擒」也能拦 grappled
  const grappleImmune = { conditionImmunities: ['受擒'] };
  check('数据「受擒」拦 grappled', m.isImmuneToStatus(grappleImmune, 'grappled') === true);
  const fearImmune = { conditionImmunities: ['恐慌'] };
  check('数据「恐慌」拦 frightened', m.isImmuneToStatus(fearImmune, 'frightened') === true);

  // ---- 提示文案（返回标准名）----
  check('提示文案取标准名（受擒→擒抱）', m.immunityLabelFor(grappleImmune, 'grappled') === '擒抱');
  check('未免疫 → null', m.immunityLabelFor(poisonImmune, 'stunned') === null);

  // ---- 种子数据值域回归（本次修复）----
  check('罪魔 条件免疫=中毒（毒素→中毒）', npc.find(x => x.templateId === 'erinyes').conditionImmunities.includes('中毒'));
  check('罪魔 不再含伤害类型「毒素」', !npc.find(x => x.templateId === 'erinyes').conditionImmunities.includes('毒素'));
  check('还魂鬼 条件免疫=恐惧（惊恐→恐惧）', npc.find(x => x.name === '还魂鬼').conditionImmunities.includes('恐惧'));
  check('全库无「中形」体型', npc.every(x => x.size !== '中形'));

  // 条件免疫词表闭集（状态库已实现 + 5e 未实现条件）；种子允许别名写法，归一后必须落在闭集内
  const KNOWN = new Set(['中毒', '昏迷', '擒抱', '麻痹', '石化', '震慑', '倒地', '恐惧', '挑衅', '缴械', '力竭', '束缚', '魅惑', '目盲', '耳聋', '失能', '隐形']);
  const stray = [];
  npc.forEach(x => (x.conditionImmunities || []).forEach(c => {
    if (!KNOWN.has(m.normalizeConditionName(c))) stray.push(`${x.name}:${c}`);
  }));
  check('条件免疫值域归一后全部合法', stray.length === 0, stray.slice(0, 6));

  console.log(`\n=== 条件免疫探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(', ')); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
