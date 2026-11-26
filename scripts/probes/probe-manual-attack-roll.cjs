// 探针：手动记录命中判定（manualAttack 纯函数：d20/加值/优劣势/自然1·20/重击）
// 运行：QUIET=1 node scripts/probes/probe-manual-attack-roll.cjs
const path = require('path');
const { createJiti } = require('jiti');

const QUIET = !!process.env.QUIET;
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; if (!QUIET) console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + ' :: ' + JSON.stringify(detail)); }
}

const jiti = createJiti(__filename, { alias: { '@': path.resolve(__dirname, '../../src') } });

async function main() {
  const { resolveManualAttackRoll, formatManualRollSummary } = await jiti.import('@/data/manualAttack');

  const R = (d20, bonus, ac, mode = 'none', forceCrit = false) =>
    resolveManualAttackRoll({ d20, bonus, ac, mode, forceCrit });

  // ---- 普通模式 ----
  const hit = R([12], 5, 15);
  check('普通命中：12+5=17 ≥ 15', hit.hit === true && hit.total === 17 && !hit.critical, hit);
  const miss = R([8], 5, 15);
  check('普通未命中：8+5=13 < 15', miss.hit === false && miss.total === 13, miss);
  const nat1 = R([1], 20, 10);
  check('自然1 必失（加值再高）', nat1.hit === false && nat1.isNatural1 === true, nat1);
  const nat20 = R([20], 0, 30);
  check('自然20 必中（AC 再高）', nat20.hit === true && nat20.isNatural20 === true, nat20);
  check('自然20 自动重击', nat20.critical === true, nat20);
  const nat1Crit = R([1], 20, 10, 'none', true);
  check('未命中不重击', nat1Crit.critical === false, nat1Crit);

  // ---- 优势 / 劣势 ----
  const adv = R([7, 18], 5, 15, 'advantage');
  check('优势取高：18+5=23', adv.d20 === 18 && adv.hit === true, adv);
  const adv20 = R([3, 20], 0, 25, 'advantage');
  check('优势任一骰 20：直接命中', adv20.d20 === 20 && adv20.hit === true && adv20.critical === true, adv20);
  const adv1 = R([1, 15], 0, 15, 'advantage');
  check('优势一颗 1 另一颗 15：取 15 不误判自然1', adv1.d20 === 15 && adv1.isNatural1 === false && adv1.hit === true, adv1);
  const dis = R([7, 18], 5, 15, 'disadvantage');
  check('劣势取低：7+5=12 < 15', dis.d20 === 7 && dis.hit === false, dis);
  const dis20 = R([20, 3], 0, 25, 'disadvantage');
  check('劣势任一骰 20：直接命中（与自动链一致）', dis20.d20 === 20 && dis20.hit === true, dis20);
  const dis1 = R([1, 12], 5, 15, 'disadvantage');
  check('劣势取低：1 触发自然1 必失', dis1.d20 === 1 && dis1.isNatural1 === true && dis1.hit === false, dis1);

  // ---- 手动重击 ----
  const force = R([12], 5, 15, 'none', true);
  check('勾选重击：命中且 critical', force.hit === true && force.critical === true, force);

  // ---- 负数加值 ----
  const neg = R([12], -2, 15);
  check('负加值：12-2=10 未命中', neg.total === 10 && neg.hit === false, neg);

  // ---- 日志明细 ----
  const sNormal = formatManualRollSummary({ d20: [12], bonus: 5, mode: 'none' }, R([12], 5, 15));
  check('明细：普通', sNormal === 'd20【12】+5=【17】', sNormal);
  const sAdv = formatManualRollSummary({ d20: [7, 18], bonus: 5, mode: 'advantage' }, R([7, 18], 5, 15, 'advantage'));
  check('明细：优势', sAdv === '优势 d20【7,18】取18+5=【23】', sAdv);
  const sNeg = formatManualRollSummary({ d20: [12], bonus: -2, mode: 'none' }, R([12], -2, 15));
  check('明细：负加值', sNeg === 'd20【12】-2=【10】', sNeg);
  const sZero = formatManualRollSummary({ d20: [12], bonus: 0, mode: 'none' }, R([12], 0, 10));
  check('明细：零加值省略符号', sZero === 'd20【12】=【12】', sZero);

  // ---- 与伤害结算串联（自然20 重击 + 抗性） ----
  const { resolveManualDamage } = await jiti.import('@/data/manualDamage');
  const { parseDamageAffinities } = await jiti.import('@/data/damageRules');
  const critRoll = R([20], 7, 18);
  const dmg = resolveManualDamage({
    amount: 24,
    damageType: '火焰',
    affinities: parseDamageAffinities({ resistances: ['火焰'] }),
  });
  check('重击 + 火焰抗性：仍按半伤结算', critRoll.critical === true && dmg.final === 12, { critRoll, dmg });

  console.log(`=== 手动命中判定探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(err => { console.error(err); process.exit(1); });
