// 攻击加值自动计算 —— 基于角色熟练项与武器属性
import type { Character } from '@/types/character';

/** 武器相关的最小输入结构（兼容 Equipment 与 Attack） */
export interface WeaponLike {
  name: string;
  subtype?: string;
  properties?: string[];
}

export interface AttackBonusResult {
  /** 总攻击加值（已带正负号的数字，如 +5 / -1） */
  bonus: number;
  /** 是否熟练该武器 */
  isProficient: boolean;
  /** 熟练加值（熟练时为 character.proficiencyBonus，否则 0） */
  proficiencyBonus: number;
  /** 计算使用的属性 */
  abilityKey: 'strength' | 'dexterity';
  /** 属性调整值 */
  abilityMod: number;
  /** 是否灵巧武器 */
  isFinesse: boolean;
  /** 灵巧武器默认选择（力量/敏捷中较高者，平局取力量） */
  defaultFinesseChoice: 'strength' | 'dexterity';
  /** 加值分解文本，如 "+2(熟练) +3(敏捷)" */
  breakdown: string;
}

// 武器是否为远程武器
function isRangedWeapon(weapon: WeaponLike): boolean {
  const subtype = weapon.subtype || '';
  const props = weapon.properties || [];
  if (subtype.includes('远程')) return true;
  if (props.includes('远程') || props.includes('弹药')) return true;
  // 形如 "150/600尺" 的射程属性也算远程
  if (props.some((p) => /^\d+\/\d+尺$/.test(p))) return true;
  return false;
}

// 武器是否为灵巧武器
function isFinesseWeapon(weapon: WeaponLike): boolean {
  return (weapon.properties || []).includes('灵巧');
}

/**
 * 将武器的 subtype 扩展为有效分类集合。
 * 处理 D&D 规则中的涵盖关系：
 *   - "简易武器" 涵盖 "简易近战" 与 "简易远程"
 *   - "军用武器" 涵盖 "军用近战" 与 "军用远程"
 * 同时反向映射，便于与熟练项中的父类词条匹配。
 */
function expandWeaponSubtypes(subtype: string): string[] {
  if (!subtype) return [];
  const result = new Set<string>();
  result.add(subtype);
  if (subtype === '简易武器') {
    result.add('简易近战');
    result.add('简易远程');
  }
  if (subtype === '军用武器') {
    result.add('军用近战');
    result.add('军用远程');
  }
  // 子类反向映射到父类
  if (subtype === '简易近战' || subtype === '简易远程') {
    result.add('简易武器');
  }
  if (subtype === '军用近战' || subtype === '军用远程') {
    result.add('军用武器');
  }
  return Array.from(result);
}

/**
 * 判定玩家是否熟练该武器。
 * 规则：
 *   1. 同名匹配：熟练项.武器 中存在与武器 name 同名的词条
 *   2. 分类匹配：武器的子分类（含父类涵盖关系）与熟练项.武器 中任一条目匹配
 */
export function isProficientWith(weapon: WeaponLike, character: Character): boolean {
  const weaponProfs = character.proficiencies?.weapons || [];
  if (weaponProfs.length === 0) return false;

  // 1. 同名匹配
  if (weaponProfs.includes(weapon.name)) return true;

  // 2. 子分类匹配 —— 双向扩展后取交集
  const subtype = weapon.subtype || '';
  const weaponSubtypes = expandWeaponSubtypes(subtype);

  const expandedProfs = new Set<string>();
  for (const prof of weaponProfs) {
    expandedProfs.add(prof);
    for (const s of expandWeaponSubtypes(prof)) {
      expandedProfs.add(s);
    }
  }

  return weaponSubtypes.some((s) => expandedProfs.has(s));
}

/**
 * 计算武器攻击加值。
 * 规则：
 *   - 基础值 0
 *   - 熟练该武器 → + 熟练加值
 *   - 近战武器 → + 力量调整值
 *   - 远程武器 → + 敏捷调整值
 *   - 灵巧武器 → 自由选择力量或敏捷（默认较高者）
 *
 * @param finesseChoice 灵巧武器的属性选择；非灵巧武器忽略此参数
 */
export function calcAttackBonus(
  weapon: WeaponLike,
  character: Character,
  finesseChoice?: 'strength' | 'dexterity'
): AttackBonusResult {
  const strMod = character.abilities?.strength?.modifier ?? 0;
  const dexMod = character.abilities?.dexterity?.modifier ?? 0;
  const profBonus = character.proficiencyBonus ?? 0;

  const isProficient = isProficientWith(weapon, character);
  const isFinesse = isFinesseWeapon(weapon);
  const isRanged = isRangedWeapon(weapon);

  // 灵巧武器默认选择较高者，平局取力量
  const defaultFinesseChoice: 'strength' | 'dexterity' =
    strMod >= dexMod ? 'strength' : 'dexterity';

  // 决定使用的属性
  let abilityKey: 'strength' | 'dexterity';
  if (isFinesse) {
    abilityKey = finesseChoice || defaultFinesseChoice;
  } else if (isRanged) {
    abilityKey = 'dexterity';
  } else {
    abilityKey = 'strength';
  }

  const abilityMod = abilityKey === 'strength' ? strMod : dexMod;
  const profValue = isProficient ? profBonus : 0;
  const bonus = abilityMod + profValue;

  // 格式化加值分解
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const parts: string[] = [];
  if (profValue > 0) parts.push(`${fmt(profValue)}(熟练)`);
  parts.push(`${fmt(abilityMod)}(${abilityKey === 'strength' ? '力量' : '敏捷'})`);

  return {
    bonus,
    isProficient,
    proficiencyBonus: profValue,
    abilityKey,
    abilityMod,
    isFinesse,
    defaultFinesseChoice,
    breakdown: parts.join(' '),
  };
}

/** 将数字加值格式化为字符串（如 +5 / -1） */
export function formatAttackBonus(bonus: number): string {
  return bonus >= 0 ? `+${bonus}` : `${bonus}`;
}
