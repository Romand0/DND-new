// 探针：手动记录「直接伤害/效果伤害」结算（无攻击检定路径）
// 运行：QUIET=1 node scripts/probes/probe-manual-direct-damage.cjs
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

function entry(kind, types, extra = {}) {
  return { id: kind + '-' + types.join('-'), kind, raw: types.join('/'), types, ...extra };
}

async function main() {
  const { resolveManualDamage, manualDamageSource } = await jiti.import('@/data/manualDamage');

  // ---- 无类型：原样通过、不应用抗性 ----
  const untyped = resolveManualDamage({ amount: 15, damageType: '', source: 'effect' });
  check('无类型原样通过', untyped.final === 15 && untyped.damageType === null, untyped);
  check('无类型不产生抗性明细', untyped.breakdown === '' && untyped.affinity === '', untyped);

  // ---- 类型别名归一 ----
  check('英文别名归一到标准类型', resolveManualDamage({ amount: 1, damageType: 'fire' }).damageType === '火焰');

  // ---- 抗性/易伤/免疫（直接伤害与攻击共用同一引擎） ----
  const resist = resolveManualDamage({
    amount: 20, damageType: '火焰', source: 'effect',
    affinities: { resistances: [entry('resistance', ['火焰'])], vulnerabilities: [], immunities: [], notes: [], unsupported: [] },
  });
  check('火焰抗性减半', resist.final === 10, resist.final);

  const vuln = resolveManualDamage({
    amount: 20, damageType: '寒冷', source: 'effect',
    affinities: { resistances: [], vulnerabilities: [entry('vulnerability', ['寒冷'])], immunities: [], notes: [], unsupported: [] },
  });
  check('寒冷易伤翻倍', vuln.final === 40, vuln.final);

  const immune = resolveManualDamage({
    amount: 99, damageType: '毒素', source: 'effect',
    affinities: { resistances: [], vulnerabilities: [], immunities: [entry('immunity', ['毒素'])], notes: [], unsupported: [] },
  });
  check('毒素免疫归零', immune.final === 0 && immune.affinity === '免疫', immune);

  // ---- 来源语义：效果伤害不视为魔法武器；方法文本可自动推断魔法 ----
  check('效果来源 kind=effect', manualDamageSource('effect', '魔法陷阱').kind === 'effect');
  const weaponMagic = manualDamageSource('weapon', '魔法长剑');
  check('武器来源按文本推断魔法', weaponMagic.kind === 'weapon' && weaponMagic.magical === true, weaponMagic);
  const weaponPlain = manualDamageSource('weapon', '普通长剑');
  check('普通武器不误判魔法', weaponPlain.magical !== true, weaponPlain);

  // ---- 非法/负数伤害归零 ----
  check('负数伤害归零', resolveManualDamage({ amount: -5, damageType: '火焰' }).final === 0);

  console.log(`=== 手动直接伤害探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(err => { console.error(err); process.exit(1); });
