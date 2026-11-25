// 探针：重型武器小体型劣势（advantageRules heavy-weapon 检测器）——纯引擎断言，无 UI
// 运行：QUIET=1 node scripts/probes/probe-heavy-weapon-size.cjs
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

  const greatsword = {
    name: '巨剑', subtype: '军用近战', damage: '2d6+3', damageType: '挥砍',
    properties: ['重型', '双手'], range: '触及5尺', normalRange: 5, maxRange: 5,
  };
  const longsword = {
    name: '长剑', subtype: '军用近战', damage: '1d8+3', damageType: '挥砍',
    properties: ['多用（1d10）'], range: '触及5尺', normalRange: 5, maxRange: 5,
  };
  const heavyCrossbow = {
    name: '重弩', subtype: '军用远程', damage: '1d10+2', damageType: '穿刺',
    properties: ['弹药', '重型', '装填', '双手'], range: '射程100/400', normalRange: 100, maxRange: 400,
  };

  const smallChar = { size: '小型', abilities: {}, proficiencies: {}, equipment: [] };
  const mediumChar = { size: '中型', abilities: {}, proficiencies: {}, equipment: [] };

  // ---- PC 卡路径 ----
  const smallHeavy = detectAdvantage({ scene: 'attack_melee', attack: greatsword, attackerCharacter: smallChar, distanceCells: 1 });
  check('小型 + 重型 → 劣势', labels(smallHeavy).includes('小型生物使用重型武器'), labels(smallHeavy));

  const mediumHeavy = detectAdvantage({ scene: 'attack_melee', attack: greatsword, attackerCharacter: mediumChar, distanceCells: 1 });
  check('中型 + 重型 → 无劣势', labels(mediumHeavy).length === 0, labels(mediumHeavy));

  const smallLight = detectAdvantage({ scene: 'attack_melee', attack: longsword, attackerCharacter: smallChar, distanceCells: 1 });
  check('小型 + 非重型 → 无劣势', labels(smallLight).length === 0, labels(smallLight));

  // ---- NPC 模板 path（attackerSize 直传，无角色卡） ----
  const npcTiny = detectAdvantage({ scene: 'attack_melee', attack: greatsword, attackerSize: '微型', distanceCells: 1 });
  check('NPC 微型直传 → 劣势', labels(npcTiny).includes('微型生物使用重型武器'), labels(npcTiny));

  const npcLarge = detectAdvantage({ scene: 'attack_melee', attack: greatsword, attackerSize: '大型', distanceCells: 1 });
  check('NPC 大型 → 无劣势', labels(npcLarge).length === 0, labels(npcLarge));

  // ---- 重型远程武器同样适用 ----
  const smallCrossbow = detectAdvantage({ scene: 'attack_ranged', attack: heavyCrossbow, attackerCharacter: smallChar, distanceCells: 10 });
  check('小型 + 重弩（远程）→ 劣势', labels(smallCrossbow).includes('小型生物使用重型武器'), labels(smallCrossbow));

  const thrownHeavy = detectAdvantage({ scene: 'attack_thrown', attack: greatsword, attackerCharacter: smallChar, distanceCells: 2, usageMode: 'thrown' });
  check('投掷场景 + 重型 → 劣势', labels(thrownHeavy).includes('小型生物使用重型武器'), labels(thrownHeavy));

  // ---- 场景/缺省边界 ----
  const saveScene = detectAdvantage({ scene: 'saving_throw', attack: greatsword, attackerCharacter: smallChar });
  check('豁免场景不触发', labels(saveScene).length === 0, labels(saveScene));

  const noSize = detectAdvantage({ scene: 'attack_melee', attack: greatsword, distanceCells: 1 });
  check('体型缺省不误报', labels(noSize).length === 0, labels(noSize));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(e => { console.error('PROBE ERROR', e); process.exit(1); });
