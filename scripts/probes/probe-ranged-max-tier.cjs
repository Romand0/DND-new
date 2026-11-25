// 探针：远程武器最大射程段劣势（advantageRules positional 检测器）——纯引擎断言，无 UI
// 运行：QUIET=1 node scripts/probes/probe-ranged-max-tier.cjs
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
  const { detectAdvantage } = await jiti.import('@/data/advantageRules');
  const labels = (r) => (r.disadvantage || []).map(d => d.label);

  // 长弓：常规 150 尺（30 格）/ 最大 600 尺（120 格）
  const longbow = {
    name: '长弓', subtype: '军用远程', damage: '1d8+3', damageType: '穿刺',
    properties: ['弹药', '双手'], range: '射程150/600', normalRange: 150, maxRange: 600,
  };
  // 匕首：投掷 + 灵巧，常规 20 尺（4 格）/ 最大 60 尺（12 格）
  const dagger = {
    name: '匕首', subtype: '简易近战', damage: '1d4+3', damageType: '穿刺',
    properties: ['灵巧', '轻型', '投掷'], range: '射程20/60', normalRange: 20, maxRange: 60,
  };

  // ---- 纯远程：最大射程段劣势（本次新增） ----
  const rangedMax = detectAdvantage({ scene: 'attack_ranged', attack: longbow, distanceCells: 40 });
  check('远程 40格(200尺, 常规150~最大600) → 最大射程段劣势',
    labels(rangedMax).includes('远程武器处于最大射程段'), labels(rangedMax));

  const rangedNormal = detectAdvantage({ scene: 'attack_ranged', attack: longbow, distanceCells: 20 });
  check('远程 20格(100尺, 常规内) → 无射程劣势', labels(rangedNormal).length === 0, labels(rangedNormal));

  const rangedEdge = detectAdvantage({ scene: 'attack_ranged', attack: longbow, distanceCells: 30 });
  check('远程 30格(150尺, 恰常规上限) → 无劣势', labels(rangedEdge).length === 0, labels(rangedEdge));

  const ranged5ft = detectAdvantage({ scene: 'attack_ranged', attack: longbow, distanceCells: 1 });
  check('远程 1格(5尺) → 5尺距离劣势且不叠加最大射程段',
    labels(ranged5ft).includes('从 5 尺距离发动远程攻击') && !labels(ranged5ft).includes('远程武器处于最大射程段'), labels(ranged5ft));

  // ---- 投掷：原有规则回归 ----
  const thrownMax = detectAdvantage({ scene: 'attack_thrown', attack: dagger, distanceCells: 8, usageMode: 'thrown' });
  check('投掷 8格(40尺, 20~60) → 投掷最大射程段劣势',
    labels(thrownMax).includes('投掷武器处于最大射程段'), labels(thrownMax));

  const thrownNormal = detectAdvantage({ scene: 'attack_thrown', attack: dagger, distanceCells: 3, usageMode: 'thrown' });
  check('投掷 3格(15尺, 常规内) → 无劣势', labels(thrownNormal).length === 0, labels(thrownNormal));

  check('投掷武器不触发「远程武器」劣势（仅投掷文案）',
    !labels(thrownMax).includes('远程武器处于最大射程段'), labels(thrownMax));

  // ---- 近战场景不进入 positional 检测 ----
  const meleeScene = detectAdvantage({ scene: 'attack_melee', attack: longbow, distanceCells: 40 });
  check('近战场景无射程劣势', labels(meleeScene).length === 0, labels(meleeScene));

  // ---- 边界：无射程字段的攻击 ----
  const noRange = detectAdvantage({
    scene: 'attack_ranged',
    attack: { name: '怪诞射线', subtype: '远程', damage: '1d6', damageType: '力场' },
    distanceCells: 40,
  });
  check('无射程字段不误报劣势', labels(noRange).length === 0, labels(noRange));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
