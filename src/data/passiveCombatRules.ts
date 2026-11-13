// PC 角色卡被动战斗规则引擎：声明式规则表驱动的三类被动效果
//   1. 优劣势/豁免触发（advantageRules 的 passive 检测器数据源）
//   2. 伤害抗性/免疫（combatant.damageAffinities 的角色卡派生源）
//   3. AC 公式替换（无甲防御）与速度加成（快速移动/无甲移动）
// 纯函数 + 常量表：种子条目名（种族特质/职业特性）是稳定键，文本正则只用于
// 参数提取（如龙裔抗性类型取自「龙族血统」条目），不靠正则识别条目本身。
import type { Character } from '@/types/character';
import type { Combatant, AdvantageResult, PassiveChecks } from '@/types/combat';
import type { AdvantageContext } from '@/data/advantageRules';
import type { DamageAffinitySet, DamageType, AffinityEntry } from '@/types/damage';
import { extractDamageType } from '@/data/damageRules';
import { characterStore } from '@/data/characterStore';

// =======================
// 特性携带判定
// =======================

function hasTrait(char: Character | null | undefined, name: string): boolean {
  return !!char?.features?.some((f) => f.name === name);
}

/** 种族特质可能被「刷新选项特性」写进 features，也可能只填在 race 字段；两处都查 */
function hasTraitOrRace(char: Character | null | undefined, name: string): boolean {
  if (hasTrait(char, name)) return true;
  return !!char?.race && char.race.includes(name);
}

// =======================
// 类2：伤害抗性/免疫派生
// =======================

interface AffinityRule {
  /** 触发条目名（features 中的 name） */
  trait: string;
  /** 仅职业子类持有（如龙族体魄属术士·龙族血脉），需要 occupation 前缀匹配 */
  occupationIncludes?: string;
  kind: 'resistance' | 'immunity';
  /** 固定伤害类型；留空时按 textFrom 提取 */
  types?: DamageType[];
  /** 从这些条目的文本依次提取伤害类型（龙裔品种可能写在「龙族血统」或「伤害抗性」自身描述里） */
  textFrom?: string[];
  /** 无法自动判定的附加说明（进 affinity notes，提示 DM） */
  note?: string;
}

const AFFINITY_RULES: AffinityRule[] = [
  { trait: '炎狱抗性', kind: 'resistance', types: ['火焰'] },
  { trait: '矮人体魄', kind: 'resistance', types: ['毒素'] },
  {
    trait: '伤害抗性',
    textFrom: ['龙族血统', '伤害抗性'],
    kind: 'resistance',
    note: '抗性类型由龙族血统品种决定（自动识别，异常时请人工核对）',
  },
  { trait: '百病不侵', kind: 'immunity', types: ['毒素'], note: '另免疫疾病（非伤害类型，需 DM 记录）' },
  { trait: '自然之护', kind: 'immunity', types: ['毒素'], note: '另免疫疾病；魅惑/恐慌免疫仅限元素生物与妖精来源' },
];

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
    if (!hasTrait(char, rule.trait)) continue;
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

type AbilityKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

interface UnarmoredAcRule {
  trait: string;
  /** 公式额外属性（10+敏+X 的 X） */
  extraAbility: AbilityKey;
  /** 武僧版要求未持盾才生效；野蛮人/龙族体魄可用盾 */
  shieldForbidden: boolean;
  /** 识别职业（野蛮人/武僧同名条目区分公式；龙族体魄按职业） */
  occupationIncludes?: string;
}

// 武僧「没持用盾牌时」才生效；野蛮人「使用盾牌不会影响获益」；龙族体魄（术士·龙族血脉）未着装护甲即生效
const UNARMORED_AC_RULES: UnarmoredAcRule[] = [
  { trait: '无甲防御', extraAbility: 'constitution', shieldForbidden: false, occupationIncludes: '野蛮人' },
  { trait: '无甲防御', extraAbility: 'wisdom', shieldForbidden: true, occupationIncludes: '武僧' },
  { trait: '龙族体魄', extraAbility: 'charisma', shieldForbidden: false, occupationIncludes: '术士' },
];

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
    (r) => hasTrait(char, r.trait) && (!r.occupationIncludes || occupation.includes(r.occupationIncludes))
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
// 类3：速度加成（快速移动 / 无甲移动）
// =======================

/** 武僧无甲移动档位：PHB 职业表（L2 +10 / L6 +15 / L10 +20 / L14 +25 / L18 +30） */
const MONK_UNARMORED_SPEED_TIERS: { level: number; bonus: number }[] = [
  { level: 18, bonus: 30 },
  { level: 14, bonus: 25 },
  { level: 10, bonus: 20 },
  { level: 6, bonus: 15 },
  { level: 2, bonus: 10 },
];

/**
 * 派生参战者速度修正（写入 combatant.speedModifier，combatStore 消耗移动力时叠加）。
 * @param wearingHeavyArmor 战斗背包中是否穿戴重甲（快速移动失效条件）
 * @param combatShieldHeld 战斗层是否持盾（无甲移动失效条件之一）
 */
export function deriveSpeedModifier(
  char: Character | null | undefined,
  opts: { wearingHeavyArmor?: boolean; combatShieldHeld?: boolean } = {}
): number {
  if (!char) return 0;
  let bonus = 0;
  if (hasTrait(char, '快速移动') && !opts.wearingHeavyArmor) {
    bonus += 10;
  }
  if (hasTrait(char, '无甲移动') && !opts.wearingHeavyArmor && !opts.combatShieldHeld) {
    // 等级取卡面等级与经验推导值的较大者（影子卡可能只填 level；真实卡两处一致）
    const level = Math.max(char.level ?? 1, characterStore.getLevelFromExp(char.experience ?? 0) || 1);
    const tier = MONK_UNARMORED_SPEED_TIERS.find((t) => level >= t.level);
    if (tier) bonus += tier.bonus;
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

/** 特性对被动检定的固定修正（条目名是稳定键） */
const PASSIVE_CHECK_BONUS_RULES: { trait: string; target: keyof PassiveChecks; bonus: number }[] = [
  // 专长「观察者」：被动感知 +5
  { trait: '观察者', target: 'perception', bonus: 5 },
];

/**
 * 派生被动检定三件套（PC 入战快照，写入 combatant.passiveChecks）。
 * 公式：10 + 属性调整值 + 技能熟练(×1)/专精(×2) × 熟练加值 + 技能 extra + 特性修正。
 * 影子卡/无技能数据时 skills 缺省视为未熟练，退化为 10 + 属性调整。
 */
export function derivePassiveChecks(char: Character | null | undefined): PassiveChecks | undefined {
  if (!char) return undefined;
  const prof = char.proficiencyBonus ?? 0;
  const result = {} as PassiveChecks;
  for (const def of PASSIVE_CHECK_DEFS) {
    const abilityMod = char.abilities?.[def.ability]?.modifier ?? 0;
    const skill = char.skills?.[def.skill];
    const profMult = skill?.expertise ? 2 : skill?.proficient ? 1 : 0;
    result[def.key] = 10 + abilityMod + profMult * prof + (skill?.extra ?? 0);
  }
  for (const rule of PASSIVE_CHECK_BONUS_RULES) {
    if (hasActiveTrait(char, rule.trait)) result[rule.target] += rule.bonus;
  }
  return result;
}

// =======================
// 类5：黑暗视觉（Darkvision）
// =======================

/** 种子条目名 → 尺数（名字是稳定键；条目文本提取失败时兜底） */
const DARKVISION_TRAIT_RANGES: { match: RegExp; range: number }[] = [
  { match: /增强黑暗视觉/, range: 120 },
  { match: /黑暗视觉/, range: 60 },
];

/** 无条目时按种族名兜底（角色卡 race 只填种族名的旧数据） */
const DARKVISION_RACE_FALLBACK: { match: RegExp; range: number }[] = [
  { match: /黑暗精灵|卓尔/, range: 120 },
  { match: /矮人|精灵|侏儒|半精灵|半兽人|提夫林/, range: 60 },
];

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
// 类6：先攻优劣势（野性直觉）
// =======================

/**
 * 先攻优劣势特性（PC 入战提示，InitiativeRollDialog 展示；先攻骰由 DM 手动执行优劣势）。
 * 返回 null = 无先攻优劣势特性。
 */
export function deriveInitiativeAdvantage(char: Character | null | undefined): AdvantageResult['advantage'][number] | null {
  if (!char) return null;
  // 野蛮人 L7「野性直觉」：骰先攻时具有优势
  if (hasActiveTrait(char, '野性直觉')) {
    return { kind: 'trait', label: '野性直觉（先攻优势：请掷 2d20 取较高值）' };
  }
  return null;
}

// =======================
// 条目等级门槛
// =======================

/** 单条特性是否已达到生效等级（职业特性带 level 标注，未达标不参与派生） */
function isActiveFeature(f: NonNullable<Character['features']>[number], char: Character): boolean {
  const level = Math.max(char.level ?? 1, characterStore.getLevelFromExp(char.experience ?? 0) || 1);
  return f.level == null || f.level <= level;
}

/** hasTrait 的等级门槛版：新派生函数一律用这个，防止高等级特性在低级角色上生效 */
function hasActiveTrait(char: Character | null | undefined, name: string): boolean {
  if (!char?.features?.length) return false;
  return char.features.some((f) => f.name === name && isActiveFeature(f, char));
}

// =======================
// 类1：优劣势/豁免触发规则表（advantageRules passive 检测器的数据源）
// =======================

interface PassiveSaveRule {
  trait: string;
  label: string;
  /** 限定豁免属性；缺省任意 */
  saveAbility?: AbilityKey[];
  /** 豁免来源名（法术名/效应名）必须命中（保守模式：识别不了来源不自动给优势，DM 手动） */
  spellMatch?: RegExp;
  /** true = 来源未知时也自动命中（险境感知：DEX 豁免绝大多数是可见区域效应） */
  unrestricted?: boolean;
}

const PASSIVE_SAVE_RULES: PassiveSaveRule[] = [
  { trait: '矮人体魄', label: '矮人体魄（对毒素豁免优势）', saveAbility: ['constitution'], spellMatch: /毒/ },
  { trait: '勇敢', label: '勇敢（对恐慌豁免优势）', spellMatch: /恐惧|恐慌/ },
  { trait: '妖精血统', label: '妖精血统（对魅惑豁免优势）', spellMatch: /魅惑|催眠/ },
  {
    trait: '侏儒狡黠',
    label: '侏儒狡黠（对魔法的智力/感知/魅力豁免优势）',
    saveAbility: ['intelligence', 'wisdom', 'charisma'],
    spellMatch: /./,
  },
  { trait: '险境感知', label: '险境感知（DEX 豁免优势）', saveAbility: ['dexterity'], unrestricted: true },
];

/** 对法术豁免优势类（对齐魔法抗性兜底哲学：豁免上下文无效应类型，给优势由 DM 手动取消） */
const PASSIVE_SAVE_ADVANTAGE_SPELL_RULES: PassiveSaveRule[] = [
  { trait: '魔法抗性', label: '魔法抗性（对法术及魔法效应豁免优势）' },
];

/**
 * 光环规则：同阵营持有者在 N 格内时，被检定者获优势。
 * 守护灵光（圣武士 L6，10 尺 = 2 格）：豁免优势；勇气灵光（L10）：恐慌免疫 → 恐惧豁免优势近似。
 */
interface PassiveAuraRule {
  trait: string;
  label: string;
  saveAbility?: AbilityKey[];
  spellMatch?: RegExp;
  /** 光环半径（格）；10 尺 = 2 格 */
  radiusCells: number;
}

const PASSIVE_AURA_RULES: PassiveAuraRule[] = [
  { trait: '守护灵光', label: '守护灵光（圣武士光环：豁免优势）', radiusCells: 2 },
  { trait: '勇气灵光', label: '勇气灵光（圣武士光环：恐慌免疫）', spellMatch: /恐惧|恐慌/, radiusCells: 2 },
];

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
    if (!hasTrait(allyChar, rule.trait)) continue;
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
    if (!hasTraitOrRace(char, rule.trait)) continue;
    if (rule.saveAbility && ctx.saveAbility && !rule.saveAbility.includes(ctx.saveAbility)) continue;
    if (rule.spellMatch && !(rule.unrestricted && !ctx.sourceSpellName)) {
      if (!ctx.sourceSpellName || !rule.spellMatch.test(ctx.sourceSpellName)) continue;
    }
    result.advantage.push({ kind: 'trait', label: rule.label });
  }
  // 对法术豁免优势类（无属性/来源限定）
  if (ctx.sourceSpellName) {
    for (const rule of PASSIVE_SAVE_ADVANTAGE_SPELL_RULES) {
      if (!hasTraitOrRace(char, rule.trait)) continue;
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
