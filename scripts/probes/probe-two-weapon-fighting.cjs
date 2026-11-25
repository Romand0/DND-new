// 探针：双武器战斗（轻型武器副手攻击）——纯引擎断言，无 UI
// 运行：QUIET=1 node scripts/probes/probe-two-weapon-fighting.cjs
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

const shortSword = { name: '短剑', subtype: '军用近战', damageDice: '1d6', damageType: '穿刺', properties: ['灵巧', '轻型'] };
const longSword = { name: '长剑', subtype: '军用近战', damageDice: '1d8', damageType: '斩击', properties: ['多用'] };
const greatSword = { name: '巨剑', subtype: '军用近战', damageDice: '2d6', damageType: '斩击', properties: ['双手', '重型'] };
const shortBow = { name: '短弓', subtype: '简易远程', damageDice: '1d6', damageType: '穿刺', properties: ['弹药', '轻型'] };

const baseCharacter = {
  id: 'c1', name: '测试', size: '中型',
  abilities: { strength: { modifier: 2 }, dexterity: { modifier: 3 } },
  proficiencyBonus: 2,
  proficiencies: { weapons: ['简易武器', '军用武器'] },
  features: [],
};

async function main() {
  const m = await jiti.import('@/lib/twoWeaponFighting');

  // ---- 轻型武器判定 ----
  check('短剑(近战/轻型) → 是轻型近战武器', m.isLightMeleeWeapon(shortSword) === true);
  check('长剑(近战/无轻型) → 非轻型近战武器', m.isLightMeleeWeapon(longSword) === false);
  check('短弓(远程/轻型属性) → 非轻型近战武器', m.isLightMeleeWeapon(shortBow) === false);
  check('空值 → 非轻型近战武器', m.isLightMeleeWeapon(null) === false);

  // ---- 单手近战（双持客放宽） ----
  check('长剑 → 单手近战（双持客合格）', m.isOneHandedMeleeWeapon(longSword) === true);
  check('巨剑(双手) → 非单手近战', m.isOneHandedMeleeWeapon(greatSword) === false);
  check('短弓 → 非单手近战', m.isOneHandedMeleeWeapon(shortBow) === false);

  // ---- 双武器战斗资格 ----
  check('两把短剑 → 可双武器战斗', m.canTwoWeaponFight(shortSword, shortSword) === true);
  check('短剑 + 长剑 → 不可（长剑非轻型）', m.canTwoWeaponFight(shortSword, longSword) === false);
  check('双持客：短剑 + 长剑 → 可', m.canTwoWeaponFight(shortSword, longSword, { dualWielder: true }) === true);
  check('双持客：巨剑(双手) 仍不可', m.canTwoWeaponFight(longSword, greatSword, { dualWielder: true }) === false);
  check('单手空缺 → 不可', m.canTwoWeaponFight(shortSword, null) === false);

  // ---- 专长 / 战斗风格识别 ----
  check('双持客专长识别（中文）', m.hasDualWielder({ ...baseCharacter, features: [{ name: '双持客' }] }) === true);
  check('双持客专长识别（英文）', m.hasDualWielder({ ...baseCharacter, features: [{ name: 'Dual Wielder' }] }) === true);
  check('无双持客专长 → false', m.hasDualWielder(baseCharacter) === false);
  check('双武器战斗风格识别', m.hasTwoWeaponFightingStyle({ ...baseCharacter, features: [{ name: '双武器战斗' }] }) === true);
  check('无战斗风格 → false', m.hasTwoWeaponFightingStyle(baseCharacter) === false);

  // ---- 副手攻击条目合成 ----
  const atk = m.buildOffhandAttack(shortSword, baseCharacter);
  check('副手条目 offhand 标记', atk && atk.offhand === true, atk);
  check('副手条目名称带武器名', atk && atk.name === '副手攻击（短剑）', atk && atk.name);
  // 短剑灵巧：敏捷 3 > 力量 2 → +3；熟练 +2 → 命中 +5
  check('副手条目攻击加值 +5（灵巧敏捷3+熟练2）', atk && atk.attackBonus === '+5', atk && atk.attackBonus);
  check('无战斗风格：副手伤害不加正属性调整（1d6）', atk && atk.damage === '1d6', atk && atk.damage);
  check('副手条目继承轻型/灵巧属性', atk && atk.properties.includes('轻型') && atk.properties.includes('灵巧'), atk && atk.properties);

  const strChar = {
    ...baseCharacter,
    abilities: { strength: { modifier: -1 }, dexterity: { modifier: -1 } },
  };
  const atkNeg = m.buildOffhandAttack(shortSword, strChar);
  check('副手伤害保留负属性调整（1d6-1）', atkNeg && atkNeg.damage === '1d6-1', atkNeg && atkNeg.damage);

  const styled = { ...baseCharacter, features: [{ name: '双武器战斗' }] };
  const atkStyled = m.buildOffhandAttack(shortSword, styled, { twoWeaponFightingStyle: true });
  check('有战斗风格：副手伤害加属性调整（1d6+3）', atkStyled && atkStyled.damage === '1d6+3', atkStyled && atkStyled.damage);

  check('无伤害骰 → 不生成条目', m.buildOffhandAttack({ name: '木棍' }, baseCharacter) === null);

  // ---- 候选条目生成 ----
  const both = m.buildOffhandAttackCandidates(shortSword, shortSword, baseCharacter, { bonusActionsAvailable: 1 });
  check('两把短剑 + 有附赠 → 2 条副手候选', both.length === 2, both.length);
  check('候选条目全部带 offhand', both.every(a => a.offhand === true));
  const noBonus = m.buildOffhandAttackCandidates(shortSword, shortSword, baseCharacter, { bonusActionsAvailable: 0 });
  check('无附赠动作 → 0 条候选', noBonus.length === 0, noBonus.length);
  const noEligible = m.buildOffhandAttackCandidates(longSword, shortSword, baseCharacter, { bonusActionsAvailable: 1 });
  check('长剑+短剑 无专长 → 0 条候选', noEligible.length === 0, noEligible.length);
  const dw = { ...baseCharacter, features: [{ name: '双持客' }] };
  const dwBoth = m.buildOffhandAttackCandidates(longSword, shortSword, dw, { bonusActionsAvailable: 1 });
  check('双持客 长剑+短剑 → 2 条候选', dwBoth.length === 2, dwBoth.length);
  const noChar = m.buildOffhandAttackCandidates(shortSword, shortSword, null, { bonusActionsAvailable: 1 });
  check('无角色卡 → 0 条候选', noChar.length === 0, noChar.length);
  const emptyHand = m.buildOffhandAttackCandidates(shortSword, null, baseCharacter, { bonusActionsAvailable: 1 });
  check('仅持一把 → 0 条候选', emptyHand.length === 0, emptyHand.length);

  console.log(`\n=== 双武器战斗探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(', ')); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
