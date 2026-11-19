// 被动规则表数据层（feature-fullcycle P4，决策 1/4 同源：表条目 = 声明式数据，加条目零逻辑改动）。
// 七类处理器派生逻辑留在 passiveCombatRules.ts（冻结口径见 .monkeycode/specs/passive-engine/progress.md）；
// 本文件只放规则表 + 特性标注元数据。条目名 = 种子特性名稳定键（别名 alias 兼容旧手录卡）。
import type { DamageType } from '@/types/damage';

export type AbilityKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';

// =======================
// A1 豁免优势（advantageRules passive 检测器数据源，场景 saving_throw）
// =======================

export interface PassiveSaveRule {
  trait: string;
  /** 兼容旧手录卡的别名（半身人勇气在部分卡上写作「勇敢」） */
  alias?: string;
  label: string;
  /** 限定豁免属性；缺省任意 */
  saveAbility?: AbilityKey[];
  /** 豁免来源名（法术名/效应名）必须命中（保守模式：识别不了来源不自动给优势，DM 手动） */
  spellMatch?: RegExp;
  /** true = 来源未知时也自动命中（险境感知：DEX 豁免绝大多数是可见区域效应） */
  unrestricted?: boolean;
}

export const PASSIVE_SAVE_RULES: PassiveSaveRule[] = [
  { trait: '矮人体魄', label: '矮人体魄（对毒素豁免优势）', saveAbility: ['constitution'], spellMatch: /毒/ },
  { trait: '勇气', alias: '勇敢', label: '勇气（对恐慌豁免优势）', spellMatch: /恐惧|恐慌/ },
  { trait: '妖精血统', label: '妖精血统（对魅惑豁免优势）', spellMatch: /魅惑|催眠/ },
  {
    trait: '侏儒狡黠',
    label: '侏儒狡黠（对魔法的智力/感知/魅力豁免优势）',
    saveAbility: ['intelligence', 'wisdom', 'charisma'],
    spellMatch: /./,
  },
  { trait: '险境感知', label: '险境感知（DEX 豁免优势）', saveAbility: ['dexterity'], unrestricted: true },
  // 德鲁伊 L6：抵抗魔法制造/控制的植物移动障碍效应（如纠缠术）豁免优势；非魔法困难地形移动力条目另行 DM 裁定
  { trait: '大地行者', label: '大地行者（对植物类效应豁免优势）', spellMatch: /纠缠|植物/ },
];

/** 对法术豁免优势类（对齐魔法抗性兜底哲学：豁免上下文无效应类型，给优势由 DM 手动取消） */
export const PASSIVE_SAVE_ADVANTAGE_SPELL_RULES: PassiveSaveRule[] = [
  { trait: '魔法抗性', label: '魔法抗性（对法术及魔法效应豁免优势）' },
  // 术士 L14：对法术豁免优势；「对法术伤害抗性」为法术泛伤类型，引擎不表达，DM 手动核验
  { trait: '法术抗性', label: '法术抗性（对法术豁免优势；法术伤害抗性请 DM 手动）' },
];

export interface PassiveAuraRule {
  trait: string;
  label: string;
  saveAbility?: AbilityKey[];
  spellMatch?: RegExp;
  /** 光环半径（格）；10 尺 = 2 格 */
  radiusCells: number;
}

export const PASSIVE_AURA_RULES: PassiveAuraRule[] = [
  { trait: '守护灵光', label: '守护灵光（圣武士光环：豁免优势）', radiusCells: 2 },
  { trait: '勇气灵光', label: '勇气灵光（圣武士光环：恐慌免疫）', spellMatch: /恐惧|恐慌/, radiusCells: 2 },
];

// =======================
// A2 伤害抗性/免疫（combatant.damageAffinities 派生源）
// =======================

export interface AffinityRule {
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

export const AFFINITY_RULES: AffinityRule[] = [
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
  // 魔导师 L10：心灵伤害抗性；读心免疫与反噬为伤害管线外机制，DM 手动
  { trait: '思维之盾', kind: 'resistance', types: ['心灵'], note: '读心免疫与心灵反噬为机制效果，需 DM 裁定' },
];

// =======================
// A3 无甲防御 AC 公式
// =======================

export interface UnarmoredAcRule {
  trait: string;
  /** 公式额外属性（10+敏+X 的 X） */
  extraAbility: AbilityKey;
  /** 武僧版要求未持盾才生效；野蛮人/龙族体魄可用盾 */
  shieldForbidden: boolean;
  /** 识别职业（野蛮人/武僧同名条目区分公式；龙族体魄按职业） */
  occupationIncludes?: string;
}

// 武僧「没持用盾牌时」才生效；野蛮人「使用盾牌不会影响获益」；龙族体魄（术士·龙族血脉）未着装护甲即生效
export const UNARMORED_AC_RULES: UnarmoredAcRule[] = [
  { trait: '无甲防御', extraAbility: 'constitution', shieldForbidden: false, occupationIncludes: '野蛮人' },
  { trait: '无甲防御', extraAbility: 'wisdom', shieldForbidden: true, occupationIncludes: '武僧' },
  { trait: '龙族体魄', extraAbility: 'charisma', shieldForbidden: false, occupationIncludes: '术士' },
];

// =======================
// A4 速度修正（快速移动 / 无甲移动）
// =======================

export interface SpeedModRule {
  trait: string;
  /** 固定加值（快速移动 +10） */
  flatBonus?: number;
  /** 等级档位表键（无甲移动 = 武僧职业表档位） */
  tierTable?: 'monk';
  heavyArmorForbidden: boolean;
  shieldForbidden: boolean;
}

export const SPEED_MOD_RULES: SpeedModRule[] = [
  { trait: '快速移动', flatBonus: 10, heavyArmorForbidden: true, shieldForbidden: false },
  { trait: '无甲移动', tierTable: 'monk', heavyArmorForbidden: true, shieldForbidden: true },
];

/** 武僧无甲移动档位：PHB 职业表（L2 +10 / L6 +15 / L10 +20 / L14 +25 / L18 +30） */
export const MONK_UNARMORED_SPEED_TIERS: { level: number; bonus: number }[] = [
  { level: 18, bonus: 30 },
  { level: 14, bonus: 25 },
  { level: 10, bonus: 20 },
  { level: 6, bonus: 15 },
  { level: 2, bonus: 10 },
];

// =======================
// A5 被动检定固定加值（被动感知/洞察/调查三件套之上）
// =======================

export type PassiveCheckKey = 'perception' | 'insight' | 'investigation';

export interface PassiveCheckBonusRule {
  trait: string;
  target: PassiveCheckKey;
  bonus: number;
}

export const PASSIVE_CHECK_BONUS_RULES: PassiveCheckBonusRule[] = [
  // 专长「观察者」：被动感知 +5
  { trait: '观察者', target: 'perception', bonus: 5 },
];

// =======================
// A6 黑暗视觉
// =======================

export interface DarkvisionTraitRange {
  match: RegExp;
  range: number;
}

/** 种子条目名 → 尺数（名字是稳定键；条目文本提取失败时兜底） */
export const DARKVISION_TRAIT_RANGES: DarkvisionTraitRange[] = [
  { match: /增强黑暗视觉/, range: 120 },
  { match: /黑暗视觉/, range: 60 },
];

/** 无条目时按种族名兜底（角色卡 race 只填种族名的旧数据） */
export const DARKVISION_RACE_FALLBACK: DarkvisionTraitRange[] = [
  { match: /黑暗精灵|卓尔/, range: 120 },
  { match: /矮人|精灵|侏儒|半精灵|半兽人|提夫林/, range: 60 },
];

// =======================
// A7 先攻优劣势
// =======================

export interface InitiativeAdvRule {
  trait: string;
  label: string;
}

export const INITIATIVE_ADVANTAGE_RULES: InitiativeAdvRule[] = [
  { trait: '野性直觉', label: '野性直觉（先攻优势：请掷 2d20 取较高值）' },
];

// =======================
// 特性标注元数据（CharacterDetail 被动徽标数据源）
// =======================

export type PassiveTraitKind = 'engine' | 'mechanic' | 'setting';

/** engine = 七张表任一 trait/alias 命中（自动派生）；未标注条目默认 mechanic（DM 裁定）。
 *  A6 黑暗视觉是正则条目（无 trait 字段），种子名显式列出。 */
export const PASSIVE_ENGINE_TRAITS: Set<string> = new Set([
  ...[
    ...PASSIVE_SAVE_RULES,
    ...PASSIVE_SAVE_ADVANTAGE_SPELL_RULES,
    ...PASSIVE_AURA_RULES,
    ...AFFINITY_RULES,
    ...UNARMORED_AC_RULES,
    ...SPEED_MOD_RULES,
    ...PASSIVE_CHECK_BONUS_RULES,
    ...INITIATIVE_ADVANTAGE_RULES,
  ].map((r) => r.trait),
  '黑暗视觉',
  '增强黑暗视觉',
]);

export interface PassiveTraitMeta {
  kind: Exclude<PassiveTraitKind, 'engine'>;
  note?: string;
}

/** 显式 setting 标注（纯设定无战斗影响；余下被动一律按 mechanic = DM 裁定展示） */
export const PASSIVE_TRAIT_META: Record<string, PassiveTraitMeta> = {
  出神: { kind: 'setting', note: '4 小时冥想代替 8 小时睡眠，无战斗影响' },
  石中精妙: { kind: 'setting', note: '石制品/工匠工艺相关，无战斗影响' },
  唤醒心灵: { kind: 'setting', note: '心灵感应通讯，无战斗影响' },
};

export function resolvePassiveTraitMeta(name: string): { kind: PassiveTraitKind; note?: string } {
  if (PASSIVE_ENGINE_TRAITS.has(name)) return { kind: 'engine' };
  const meta = PASSIVE_TRAIT_META[name];
  return meta ? { ...meta } : { kind: 'mechanic' };
}
