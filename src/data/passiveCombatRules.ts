// PC 角色卡被动战斗规则引擎：声明式规则表驱动的三类被动效果
//   1. 优劣势/豁免触发（advantageRules 的 passive 检测器数据源）
//   2. 伤害抗性/免疫（combatant.damageAffinities 的角色卡派生源）
//   3. AC 公式替换（无甲防御）与速度加成（快速移动/无甲移动）
// 纯函数 + 常量表：种子条目名（种族特质/职业特性）是稳定键，文本正则只用于
// 参数提取（如龙裔抗性类型取自「龙族血统」条目），不靠正则识别条目本身。
import type { Character } from '@/types/character';
import type { Combatant, AdvantageResult } from '@/types/combat';
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
    const level = characterStore.getLevelFromExp(char.experience ?? 0) || 1;
    const tier = MONK_UNARMORED_SPEED_TIERS.find((t) => level >= t.level);
    if (tier) bonus += tier.bonus;
  }
  return bonus;
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
