import { calcAttackBonus } from '@/lib/attackBonus';
import type { Attack, Character } from '@/types/character';

/** 副手攻击合成所需的最小武器字段（Equipment / Attack 均兼容） */
export interface OffhandWeaponLike {
  name: string;
  subtype?: string;
  properties?: string[];
  damageDice?: string;
  damageType?: string;
  magicBonus?: number;
}

const hasProp = (w: OffhandWeaponLike, keyword: string): boolean =>
  (w.properties ?? []).some(p => String(p).includes(keyword));

/** 轻型近战武器（双武器战斗基准资格） */
export function isLightMeleeWeapon(w: OffhandWeaponLike | null | undefined): boolean {
  if (!w) return false;
  return (w.subtype ?? '').includes('近战') && hasProp(w, '轻型');
}

/** 单手近战武器（双持客专长放宽后的资格：非双手武器） */
export function isOneHandedMeleeWeapon(w: OffhandWeaponLike | null | undefined): boolean {
  if (!w) return false;
  return (w.subtype ?? '').includes('近战') && !hasProp(w, '双手');
}

export interface TwoWeaponOptions {
  /** 双持客专长：允许非轻型单手武器 */
  dualWielder?: boolean;
}

/** 双武器战斗资格：两只手各持一把合格近战武器（调用方保证左右手为不同物品） */
export function canTwoWeaponFight(
  main: OffhandWeaponLike | null | undefined,
  offhand: OffhandWeaponLike | null | undefined,
  opts: TwoWeaponOptions = {},
): boolean {
  const check = opts.dualWielder ? isOneHandedMeleeWeapon : isLightMeleeWeapon;
  return check(main) && check(offhand);
}

/** 角色是否拥有双持客专长（放宽为非轻型单手武器） */
export function hasDualWielder(character: Character | null | undefined): boolean {
  return (character?.features ?? []).some(f => /双持客|Dual Wielder/i.test(f.name ?? ''));
}

/** 角色是否拥有「双武器战斗」战斗风格（副手伤害加属性调整值） */
export function hasTwoWeaponFightingStyle(character: Character | null | undefined): boolean {
  return (character?.features ?? []).some(f => /双武器战斗|Two-Weapon Fighting/i.test(f.name ?? ''));
}

/**
 * 合成副手攻击条目（弹窗列表动态插入，不写入角色卡）。
 * 伤害规则（5e）：副手攻击不加属性调整值，负调整值照加；「双武器战斗」战斗风格则加调整值。
 */
export function buildOffhandAttack(
  weapon: OffhandWeaponLike,
  character: Character | null | undefined,
  opts: TwoWeaponOptions & { twoWeaponFightingStyle?: boolean } = {},
): Attack | null {
  if (!weapon?.damageDice) return null;
  const calc = character ? calcAttackBonus(weapon, character) : null;
  const abilityMod = calc?.abilityMod ?? 0;
  const dmgMod = opts.twoWeaponFightingStyle ? abilityMod : Math.min(0, abilityMod);
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  return {
    name: `副手攻击（${weapon.name}）`,
    attackBonus: calc ? fmt(calc.bonus) : '+0',
    damage: dmgMod === 0 ? weapon.damageDice : `${weapon.damageDice}${fmt(dmgMod)}`,
    damageType: weapon.damageType ?? '',
    range: '触及5尺',
    properties: [...(weapon.properties ?? [])],
    subtype: weapon.subtype,
    magical: (weapon.magicBonus ?? 0) > 0,
    offhand: true,
  };
}

/**
 * 为弹窗生成副手攻击候选条目：左右手各持合格武器时各给一条（副手由玩家自选，
 * 同名武器重复出现属预期——两次攻击的加值/伤害完全一致）。
 * 附赠动作不可用时返回空数组（放映模式已耗尽）。
 */
export function buildOffhandAttackCandidates(
  left: OffhandWeaponLike | null | undefined,
  right: OffhandWeaponLike | null | undefined,
  character: Character | null | undefined,
  opts: { bonusActionsAvailable: number },
): Attack[] {
  if (!character || opts.bonusActionsAvailable <= 0) return [];
  const dualWielder = hasDualWielder(character);
  if (!canTwoWeaponFight(left, right, { dualWielder })) return [];
  const style = hasTwoWeaponFightingStyle(character);
  const out: Attack[] = [];
  for (const w of [left, right]) {
    if (!w) continue;
    const atk = buildOffhandAttack(w, character, { dualWielder, twoWeaponFightingStyle: style });
    if (atk) out.push(atk);
  }
  return out;
}
