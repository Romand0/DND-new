// PC 角色卡被动战斗规则引擎：规则表驱动的被动效果（P4 数据化——表迁至 passiveRules.ts，本文件只留派生逻辑）
//   类1 优劣势/豁免触发（advantageRules 的 passive 检测器数据源）
//   类2 伤害抗性/免疫（combatant.damageAffinities 的角色卡派生源）
//   类3 AC 公式替换（无甲防御）与速度加成（快速移动/无甲移动）
//   类4 被动检定三件套 / 类5 黑暗视觉 / 类6 先攻优劣势
// 七类口径冻结表见 .monkeycode/specs/passive-engine/progress.md。
// 纯函数 + 数据表：种子条目名（种族特质/职业特性）是稳定键，文本正则只用于
// 参数提取（如龙裔抗性类型取自「龙族血统」条目），不靠正则识别条目本身。
import type { Character } from '@/types/character';
import type { Combatant, AdvantageResult, PassiveChecks } from '@/types/combat';
import type { AdvantageContext } from '@/data/advantageRules';
import type { DamageAffinitySet, DamageType, AffinityEntry } from '@/types/damage';
import { extractDamageType } from '@/data/damageRules';
import { characterStore } from '@/data/characterStore';
import type { AbilityKey, PassiveAuraRule } from '@/data/passiveRules';
import {
  PASSIVE_SAVE_RULES,
  PASSIVE_SAVE_ADVANTAGE_SPELL_RULES,
  PASSIVE_AURA_RULES,
  AFFINITY_RULES,
  UNARMORED_AC_RULES,
  SPEED_MOD_RULES,
  MONK_UNARMORED_SPEED_TIERS,
  PASSIVE_CHECK_BONUS_RULES,
  DARKVISION_TRAIT_RANGES,
  DARKVISION_RACE_FALLBACK,
  INITIATIVE_ADVANTAGE_RULES,
} from '@/data/passiveRules';

// =======================
// 特性携带判定
// =======================

function hasTrait(char: Character | null | undefined, name: string): boolean {
  return !!char?.features?.some((f) => f.name === name);
}

/** 多名称特性携带判定：种族特质可能被「刷新选项特性」写进 features，也可能只填在 race 字段。
 *  特性部分带等级门槛（hasActiveTrait）；race 字段兜底不过门槛（种族特质天生）。 */
function hasAnyTraitOrRace(char: Character | null | undefined, names: string[]): boolean {
  if (names.some((n) => hasActiveTrait(char, n))) return true;
  return !!char?.race && names.some((n) => char.race!.includes(n));
}

// =======================
// 类2：伤害抗性/免疫派生
// =======================

/** 构造亲和条目（id 稳定：同卡同条目名只命中一次） */
function makeEntry(id: string, kind: AffinityEntry['kind'], types: DamageType[], note?: string): AffinityEntry {
  const raw = types.join('、');
  return { id, kind, types, raw, ...(note ? { note } : {}) };
}

/**
 * 从角色卡特性派生伤害亲和快照（PC 入战时写入 combatant.damageAffinities）。
 * 病/状态类免疫只入 notes 不入 immunities（damage 管线只结算伤害类型）。
 */
export function deriveCharacterAffinities(char: Character | null | undefined): DamageAffinitySet | undefined {
  if (!char?.features?.length) return undefined;
  const resistances: AffinityEntry[] = [];
  const immunities: AffinityEntry[] = [];
  const notes: string[] = [];
  const featureText = (name: string): string =>
    char.features?.find((f) => f.name === name)?.description ?? '';

  for (const rule of AFFINITY_RULES) {
    if (!hasActiveTrait(char, rule.trait)) continue;
    if (rule.occupationIncludes && !(char.profession?.class ?? '').includes(rule.occupationIncludes)) continue;
    let types = rule.types ?? [];
    if (rule.textFrom && types.length === 0) {
      for (const srcName of rule.textFrom) {
        const t = extractDamageType(featureText(srcName));
        if (t) { types = [t]; break; }
      }
      if (types.length === 0) continue; // 品种文本无类型词（数据异常）——宁缺毋滥，DM 手动
    }
    if (rule.kind === 'resistance') resistances.push(makeEntry(`passive-${rule.trait}`, 'resistance', types));
    else immunities.push(makeEntry(`passive-${rule.trait}`, 'immunity', types));
    if (rule.note) notes.push(`${rule.trait}：${rule.note}`);
  }
  if (resistances.length === 0 && immunities.length === 0) return undefined;
  return {
    resistances,
    vulnerabilities: [],
    immunities,
    notes,
    unsupported: [],
  };
}

// =======================
// 类3：无甲防御 AC 公式
// =======================

export interface UnarmoredAcProfile {
  extraAbility: AbilityKey;
  shieldForbidden: boolean;
  ruleLabel: string;
}

/** 按职业 + 特性名匹配无甲防御规则（同卡多条时职业名精确者优先，正常只命中一条） */
export function deriveUnarmoredAc(char: Character | null | undefined): UnarmoredAcProfile | null {
  if (!char) return null;
  const occupation = char.profession?.class ?? '';
  const rule = UNARMORED_AC_RULES.find(
    (r) => hasActiveTrait(char, r.trait) && (!r.occupationIncludes || occupation.includes(r.occupationIncludes))
  );
  if (!rule) return null;
  return { extraAbility: rule.extraAbility, shieldForbidden: rule.shieldForbidden, ruleLabel: rule.trait };
}

function abilityMod(char: Character, key: AbilityKey): number {
  return char.abilities?.[key]?.modifier ?? 0;
}

/**
 * 判定「未着装护甲」（无甲防御前提）。
 * combatShieldHeld：战斗层是否手持盾牌（computeCombatantAc 传；日常态视为未持盾）
 */
export function resolveUnarmoredAc(
  char: Character | null | undefined,
  hasArmor: boolean,
  combatShieldHeld = false
): number | null {
  if (!char || hasArmor) return null;
  const rule = deriveUnarmoredAc(char);
  if (!rule) return null;
  if (rule.shieldForbidden && combatShieldHeld) return null;
  return 10 + abilityMod(char, 'dexterity') + abilityMod(char, rule.extraAbility);
}

// =======================
// 类3：速度加成（快速移动 / 无甲移动——SPEED_MOD_RULES 表驱动）
// =======================

/**
 * 派生参战者速度修正（写入 combatant.speedModifier，combatStore 消耗移动力时叠加）。
 * @param wearingHeavyArmor 战斗背包中是否穿戴重甲（快速移动/无甲移动失效条件）
 * @param combatShieldHeld 战斗层是否持盾（无甲移动失效条件之一）
 */
export function deriveSpeedModifier(
  char: Character | null | undefined,
  opts: { wearingHeavyArmor?: boolean; combatShieldHeld?: boolean } = {}
): number {
  if (!char) return 0;
  const level = characterStore.getEffectiveLevel(char);
  let bonus = 0;
  for (const rule of SPEED_MOD_RULES) {
    if (!hasActiveTrait(char, rule.trait)) continue;
    if (rule.heavyArmorForbidden && opts.wearingHeavyArmor) continue;
    if (rule.shieldForbidden && opts.combatShieldHeld) continue;
    if (rule.flatBonus) {
      bonus += rule.flatBonus;
    } else if (rule.tierTable === 'monk') {
      const tier = MONK_UNARMORED_SPEED_TIERS.find((t) => level >= t.level);
      if (tier) bonus += tier.bonus;
    }
  }
  return bonus;
}

// =======================
// 类4：被动感知/洞察/调查（Passive Perception / Insight / Investigation）
// =======================

/** 被动检定定义：属性 + 技能熟练来源 */
const PASSIVE_CHECK_DEFS = [
  { key: 'perception', ability: 'wisdom', skill: 'perception' },
  { key: 'insight', ability: 'wisdom', skill: 'insight' },
  { key: 'investigation', ability: 'intelligence', skill: 'investigation' },
] as const;

/** 技能 → 关联属性（主动检定加值派生用，仅列常用项） */
const SKILL_ABILITY: Record<string, AbilityKey> = {
  perception: 'wisdom',
  insight: 'wisdom',
  investigation: 'intelligence',
  stealth: 'dexterity',
};

/**
 * 主动技能检定加值：属性调整 + 熟练(×1)/专精(×2) × 熟练加值 + 技能 extra。
 * 不含「仅被动生效」的特性修正（如观察力 +5 被动），主动搜索时不应享受。
 */
export function deriveSkillCheckBonus(
  char: Character | null | undefined,
  skillKey: keyof Character['skills'],
): number {
  if (!char) return 0;
  const ability = SKILL_ABILITY[skillKey as string];
  if (!ability) return 0;
  const abilityMod = char.abilities?.[ability]?.modifier ?? 0;
  const skill = char.skills?.[skillKey];
  const profMult = skill?.expertise ? 2 : skill?.proficient ? 1 : 0;
  return abilityMod + profMult * (char.proficiencyBonus ?? 0) + (skill?.extra ?? 0);
}

/** 特性对被动检定的固定修正：PASSIVE_CHECK_BONUS_RULES（passiveRules.ts）表驱动 */

/**
 * 派生被动检定三件套（PC 入战快照，写入 combatant.passiveChecks）。
 * 公式：10 + 属性调整值 + 技能熟练(×1)/专精(×2) × 熟练加值 + 技能 extra + 特性修正。
 * 影子卡/无技能数据时 skills 缺省视为未熟练，退化为 10 + 属性调整。
 */
export function derivePassiveChecks(char: Character | null | undefined): PassiveChecks | undefined {
  if (!char) return undefined;
  const result = {} as PassiveChecks;
  for (const def of PASSIVE_CHECK_DEFS) {
    result[def.key] = 10 + deriveSkillCheckBonus(char, def.skill);
  }
  for (const rule of PASSIVE_CHECK_BONUS_RULES) {
    if (hasActiveTrait(char, rule.trait)) result[rule.target] += rule.bonus;
  }
  return result;
}

// =======================
// 类5：黑暗视觉（Darkvision）
// =======================

/**
 * 派生黑暗视觉尺数（PC 入战快照，写入 combatant.darkvision）。
 * features / race 字段里找「黑暗视觉」条目：文本提取尺数优先，失败按条目名兜底；
 * 两处都无条目时按种族名兜底。返回 undefined = 无黑暗视觉。
 */
export function deriveDarkvision(char: Character | null | undefined): number | undefined {
  if (!char) return undefined;
  const feature = char.features?.find((f) => /黑暗视觉/.test(f.name) && isActiveFeature(f, char));
  if (feature) {
    const m = /(\d+)\s*尺/.exec(feature.description ?? '');
    if (m) return Number(m[1]);
    for (const r of DARKVISION_TRAIT_RANGES) {
      if (r.match.test(feature.name)) return r.range;
    }
  }
  if (char.race) {
    for (const r of DARKVISION_RACE_FALLBACK) {
      if (r.match.test(char.race)) return r.range;
    }
  }
  return undefined;
}

// =======================
// 类6：先攻优劣势（INITIATIVE_ADVANTAGE_RULES 表驱动）
// =======================

/**
 * 先攻优劣势特性（PC 入战提示，InitiativeRollDialog 展示；先攻骰由 DM 手动执行优劣势）。
 * 返回 null = 无先攻优劣势特性。
 */
export function deriveInitiativeAdvantage(char: Character | null | undefined): AdvantageResult['advantage'][number] | null {
  if (!char) return null;
  for (const rule of INITIATIVE_ADVANTAGE_RULES) {
    if (hasActiveTrait(char, rule.trait)) {
      return { kind: 'trait', label: rule.label };
    }
  }
  return null;
}

// =======================
// 条目等级门槛
// =======================

/** 单条特性是否已达到生效等级（职业特性带 level 标注，未达标不参与派生） */
function isActiveFeature(f: NonNullable<Character['features']>[number], char: Character): boolean {
  const level = characterStore.getEffectiveLevel(char);
  return f.level == null || f.level <= level;
}

/** hasTrait 的等级门槛版：新派生函数一律用这个，防止高等级特性在低级角色上生效 */
function hasActiveTrait(char: Character | null | undefined, name: string): boolean {
  if (!char?.features?.length) return false;
  return char.features.some((f) => f.name === name && isActiveFeature(f, char));
}

// =======================
// 类1：优劣势/豁免触发规则表（PASSIVE_SAVE_RULES / PASSIVE_SAVE_ADVANTAGE_SPELL_RULES / PASSIVE_AURA_RULES——passiveRules.ts）
// =======================

function findAuraBenefactor(
  ctx: AdvantageContext,
  roller: Combatant,
  rule: PassiveAuraRule
): Combatant | null {
  const roster = ctx.roster;
  if (!roster || roster.length === 0) return null;
  const rollerPos = ctx.combatantPositions?.[roller.id];
  if (!rollerPos) return null;
  for (const ally of roster) {
    if (ally.id === roller.id || ally.isPc !== roller.isPc || ally.isDead) continue;
    const allyChar = ally.characterId ? characterStore.get(ally.characterId) : null;
    if (!allyChar) continue;
    if (!hasActiveTrait(allyChar, rule.trait)) continue;
    const allyPos = ctx.combatantPositions?.[ally.id];
    if (!allyPos) continue;
    const dist = Math.max(Math.abs(allyPos.col - rollerPos.col), Math.abs(allyPos.row - rollerPos.row));
    if (dist <= rule.radiusCells) return ally;
  }
  return null;
}

/**
 * PC 被动规则优劣势检测（advantageRules 内置 passive-feature 检测器的规则表化重写）。
 * 妖精血统原有硬编码逻辑迁入 PASSIVE_SAVE_RULES，行为保持一致。
 */
export function detectPassiveFeatureRules(ctx: AdvantageContext): AdvantageResult {
  const result: AdvantageResult = { advantage: [], disadvantage: [] };
  if (ctx.scene !== 'saving_throw') return result;
  const roller = ctx.attacker;
  const char = ctx.attackerCharacter;
  if (!roller || !char) return result;

  // 条目级规则：按豁免属性 + 来源名匹配
  for (const rule of PASSIVE_SAVE_RULES) {
    if (!hasAnyTraitOrRace(char, rule.alias ? [rule.trait, rule.alias] : [rule.trait])) continue;
    if (rule.saveAbility && ctx.saveAbility && !rule.saveAbility.includes(ctx.saveAbility)) continue;
    if (rule.spellMatch && !(rule.unrestricted && !ctx.sourceSpellName)) {
      if (!ctx.sourceSpellName || !rule.spellMatch.test(ctx.sourceSpellName)) continue;
    }
    result.advantage.push({ kind: 'trait', label: rule.label });
  }
  // 对法术豁免优势类（无属性/来源限定）
  if (ctx.sourceSpellName) {
    for (const rule of PASSIVE_SAVE_ADVANTAGE_SPELL_RULES) {
      if (!hasAnyTraitOrRace(char, [rule.trait])) continue;
      result.advantage.push({ kind: 'trait', label: rule.label });
    }
  }
  // 光环规则：同阵营持有者在半径内
  for (const rule of PASSIVE_AURA_RULES) {
    if (rule.saveAbility && ctx.saveAbility && !rule.saveAbility.includes(ctx.saveAbility)) continue;
    if (rule.spellMatch && (!ctx.sourceSpellName || !rule.spellMatch.test(ctx.sourceSpellName))) continue;
    if (findAuraBenefactor(ctx, roller, rule)) {
      result.advantage.push({ kind: 'trait', label: rule.label });
    }
  }
  return result;
}
