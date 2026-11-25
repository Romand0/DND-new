// 探针：吐息武器自动豁免接入（形状解析回归 + 种子可用性门禁）——纯引擎断言，无 UI
// 运行：QUIET=1 node scripts/probes/probe-breath-weapon.cjs
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
  const { parseAoeSpec } = await jiti.import('@/data/aoeShapes');
  const npc = require('../../src/data/npcTemplates.json');

  // ---- 形状解析：图鉴吐息文本（两种线状语序）----
  check('锥状：覆盖30尺的锥状', JSON.stringify(parseAoeSpec('覆盖30尺的锥状')) === '{"shape":"cone","lengthFt":30}', parseAoeSpec('覆盖30尺的锥状'));
  check('线状：长X尺宽Y尺语序', JSON.stringify(parseAoeSpec('覆盖60尺长、5尺宽的线状')) === '{"shape":"line","lengthFt":60,"widthFt":5}', parseAoeSpec('覆盖60尺长、5尺宽的线状'));
  check('线状：长60尺~宽5尺语序', JSON.stringify(parseAoeSpec('覆盖长60尺宽5尺的线状')) === '{"shape":"line","lengthFt":60,"widthFt":5}', parseAoeSpec('覆盖长60尺宽5尺的线状'));
  check('球状半径', parseAoeSpec('覆盖半径20尺的球状')?.radiusFt === 20, parseAoeSpec('覆盖半径20尺的球状'));
  check('立方', parseAoeSpec('覆盖15尺的立方')?.sideFt === 15, parseAoeSpec('覆盖15尺的立方'));
  check('空文本 → null', parseAoeSpec('') === null);
  check('无形状词 → null', parseAoeSpec('范围内的目标受伤害') === null);

  // ---- 种子可用性门禁：有伤害骰 + 形状可解析 = 可自动豁免 ----
  const breaths = npc.flatMap(m => (m.breathWeapon || []).map(b => ({ owner: m.name, ...b })));
  const withDice = breaths.filter(b => !!b.damageDice);
  const usable = breaths.filter(b => !!b.damageDice && !!parseAoeSpec(b.shape));
  check('吐息条目 75 条', breaths.length === 75, breaths.length);
  check('含伤害骰 50 条', withDice.length === 50, withDice.length);
  check('可自动结算 45 条', usable.length === 45, usable.length);
  const unparsed = [...new Set(breaths.filter(b => b.shape && !parseAoeSpec(b.shape)).map(b => b.shape))];
  check('所有已抽取形状均可解析', unparsed.length === 0, unparsed);
  // 5 条有骰无形状（原文未给形状，留 DM 手动）
  const diceNoShape = withDice.filter(b => !parseAoeSpec(b.shape)).map(b => b.owner).sort((a, b) => a.localeCompare(b, 'zh'));
  check('有骰无形状恰 5 条留手动', JSON.stringify(diceNoShape) === JSON.stringify(['冰魔蝠', '青足龙蛇', '熔岩魔蝠', '远古黑龙', '蒸汽魔蝠']), diceNoShape);

  // ---- 具体数据点：成年蓝龙 ----
  const blue = npc.find(m => m.name === '成年蓝龙').breathWeapon[0];
  check('成年蓝龙 吐息字段完整', blue.dc === 19 && blue.ability === '敏捷' && blue.damageDice === '12d10' && blue.damageType === '闪电' && blue.halfOnSave === true, blue);
  check('成年蓝龙 线状解析 90×5', JSON.stringify(parseAoeSpec(blue.shape)) === '{"shape":"line","lengthFt":90,"widthFt":5}', parseAoeSpec(blue.shape));

  console.log(`\n=== 吐息武器探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(', ')); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
