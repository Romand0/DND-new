// 探针：手动记录伤害类型/抗性结算（manualDamage 纯函数 + 再生否定联动）
// 运行：QUIET=1 node scripts/probes/probe-manual-damage.cjs
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
  const { resolveManualDamage, manualDamageSource, inferManualWeaponTraits } = await jiti.import('@/data/manualDamage');
  const { parseDamageAffinities } = await jiti.import('@/data/damageRules');
  const { getCombatantAffinities } = await jiti.import('@/data/combatAffinities');
  const { isRegenSuppressedBy } = await jiti.import('@/data/regeneration');

  const affinities = parseDamageAffinities({
    resistances: ['火焰', '非魔法武器的伤害'],
    immunities: ['毒素'],
    vulnerabilities: ['光耀'],
  });

  // ---- 基础结算 ----
  const untyped = resolveManualDamage({ amount: 12, method: '长剑' });
  check('未声明类型：原样通过', untyped.final === 12 && untyped.damageType === null, untyped);
  check('未声明类型：提示文案', untyped.resolution.notes.some(n => n.includes('未声明')), untyped.resolution.notes);

  const resisted = resolveManualDamage({ amount: 24, damageType: '火焰', affinities });
  check('火焰抗性：24→12', resisted.final === 12 && resisted.affinity === '抗性', resisted);
  check('火焰抗性：明细文案', resisted.breakdown.includes('火焰 24→12'), resisted.breakdown);

  const immune = resolveManualDamage({ amount: 24, damageType: '毒素', affinities });
  check('毒素免疫：归零', immune.final === 0 && immune.affinity === '免疫', immune);

  const vulnerable = resolveManualDamage({
    amount: 10,
    damageType: '光耀',
    affinities: parseDamageAffinities({ vulnerabilities: ['光耀'] }),
  });
  check('光耀易伤：10→20', vulnerable.final === 20 && vulnerable.affinity === '易伤', vulnerable);

  const both = resolveManualDamage({
    amount: 11,
    damageType: '火焰',
    affinities: parseDamageAffinities({ resistances: ['火焰'], vulnerabilities: ['火焰'] }),
  });
  check('抗性+易伤：floor(11/2)*2=10', both.final === 10 && both.affinity === '抗性+易伤', both);

  const alias = resolveManualDamage({
    amount: 10,
    damageType: '酸蚀',
    affinities: parseDamageAffinities({ resistances: ['强酸'] }),
  });
  check('别名归一：酸蚀→强酸 且吃抗性', alias.damageType === '强酸' && alias.final === 5, alias);

  const plain = resolveManualDamage({
    amount: 9,
    damageType: '挥砍',
    affinities: parseDamageAffinities({ resistances: ['火焰'] }),
  });
  check('无匹配：原样通过且标签为空', plain.final === 9 && plain.affinity === '', plain);

  // ---- 来源类型：非魔法武器限定 ----
  const nonMagic = resolveManualDamage({ amount: 20, damageType: '钝击', source: 'weapon', method: '铁锤', affinities });
  check('非魔法武器抗性命中', nonMagic.final === 10, nonMagic);
  const magicWeapon = resolveManualDamage({ amount: 20, damageType: '钝击', source: 'weapon', method: '魔法铁锤', affinities });
  check('魔法武器绕过非魔法抗性', magicWeapon.final === 20, magicWeapon);
  const spell = resolveManualDamage({ amount: 20, damageType: '钝击', source: 'spell', method: '法术', affinities });
  check('法术来源绕过非魔法武器抗性', spell.final === 20, spell);

  const wSrc = manualDamageSource('weapon', '魔法长剑');
  check('来源推断：魔法武器', wSrc.kind === 'weapon' && wSrc.magical === true, wSrc);
  const wPlain = manualDamageSource('weapon', '长剑');
  check('来源推断：普通武器非魔法', wPlain.kind === 'weapon' && !wPlain.magical, wPlain);
  const eSrc = manualDamageSource('effect', '陷阱');
  check('来源推断：其他效果', eSrc.kind === 'effect', eSrc);

  // ---- 高级选项：材质显式指定覆盖文本推断 ----
  const autoTraits = inferManualWeaponTraits('魔法镀银长剑');
  check('自动推断：魔法+镀银', autoTraits.magical === true && autoTraits.silvered === true, autoTraits);
  const autoNone = inferManualWeaponTraits('长剑');
  check('自动推断：普通武器无材质', !autoNone.magical && !autoNone.silvered && !autoNone.adamantine, autoNone);

  const overrideOn = manualDamageSource('weapon', '长剑', { magical: true });
  check('显式指定魔法：覆盖无魔法文本', overrideOn.magical === true, overrideOn);
  const overrideOff = manualDamageSource('weapon', '魔法长剑', { magical: false });
  check('显式否定魔法：覆盖魔法文本', overrideOff.magical === false, overrideOff);

  const silveredResist = parseDamageAffinities({ resistances: ['非镀银武器的挥砍伤害'] });
  const plainVsSilver = resolveManualDamage({ amount: 20, damageType: '挥砍', source: 'weapon', method: '长剑', affinities: silveredResist });
  check('未镀银：吃非镀银抗性', plainVsSilver.final === 10, plainVsSilver);
  const silverVsSilver = resolveManualDamage({ amount: 20, damageType: '挥砍', source: 'weapon', method: '长剑', weaponTraits: { silvered: true }, affinities: silveredResist });
  check('高级选项指定镀银：绕过抗性', silverVsSilver.final === 20, silverVsSilver);

  const magicOverrideResist = resolveManualDamage({
    amount: 20, damageType: '钝击', source: 'weapon', method: '铁锤',
    weaponTraits: { magical: true },
    affinities: parseDamageAffinities({ resistances: ['非魔法武器的伤害'] }),
  });
  check('高级选项指定魔法：绕过非魔法抗性', magicOverrideResist.final === 20, magicOverrideResist);

  const spellIgnoresTraits = manualDamageSource('spell', '火球', { magical: false, silvered: true });
  check('法术来源忽略武器材质选项', spellIgnoresTraits.kind === 'spell' && spellIgnoresTraits.magical === true, spellIgnoresTraits);

  // ---- 与参战者亲和快照联动 ----
  const combatant = {
    id: 'c1',
    name: '测试怪',
    damageAffinities: parseDamageAffinities({ resistances: ['火焰'] }),
  };
  const viaCombatant = resolveManualDamage({
    amount: 16,
    damageType: '火焰',
    affinities: getCombatantAffinities(combatant),
  });
  check('参战者快照抗性生效', viaCombatant.final === 8, viaCombatant);

  // ---- 再生否定条件联动（hook 会把 preview.damageType 传给伤害应用） ----
  const fireOnTroll = resolveManualDamage({ amount: 10, damageType: '火焰' });
  check('手动火焰伤害带类型', fireOnTroll.damageType === '火焰', fireOnTroll);
  check('手动火焰伤害触发再生失效', isRegenSuppressedBy('强酸或火焰', fireOnTroll.damageType) === true);
  const fireImmune = resolveManualDamage({
    amount: 10,
    damageType: '火焰',
    affinities: parseDamageAffinities({ immunities: ['火焰'] }),
  });
  check('免疫火焰：最终 0（不会以 0 伤害触发失效）', fireImmune.final === 0, fireImmune);
  const lightning = resolveManualDamage({ amount: 10, damageType: '闪电' });
  check('手动闪电伤害不触发再生失效', isRegenSuppressedBy('强酸或火焰', lightning.damageType) === false);

  // ---- 边界 ----
  check('负数伤害归零', resolveManualDamage({ amount: -5, damageType: '火焰' }).final === 0);
  check('小数向下取整', resolveManualDamage({ amount: 9.9, damageType: '火焰' }).resolution.base === 9);
  check('不存在的类型按未声明处理',
    resolveManualDamage({ amount: 5, damageType: '秘法' }).damageType === null);

  console.log(`=== 手动记录伤害探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(' | ')); process.exit(1); }
}

main().catch(err => { console.error(err); process.exit(1); });
