// 伤害类型与抗性结算的公共类型
// 规则基线：《玩家手册 2014》伤害与治疗（抗性减半、易伤加倍、免疫归零）

/** 13 种标准伤害类型（物理 3 + 元素/能量 10） */
export type DamageType =
  | '钝击'
  | '穿刺'
  | '挥砍'
  | '强酸'
  | '寒冷'
  | '火焰'
  | '力场'
  | '闪电'
  | '黯蚀'
  | '毒素'
  | '心灵'
  | '光耀'
  | '雷鸣';

export const DAMAGE_TYPES: DamageType[] = [
  '钝击',
  '穿刺',
  '挥砍',
  '强酸',
  '寒冷',
  '火焰',
  '力场',
  '闪电',
  '黯蚀',
  '毒素',
  '心灵',
  '光耀',
  '雷鸣',
];

export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  钝击: '钝击',
  穿刺: '穿刺',
  挥砍: '挥砍',
  强酸: '强酸',
  寒冷: '寒冷',
  火焰: '火焰',
  力场: '力场',
  闪电: '闪电',
  黯蚀: '黯蚀',
  毒素: '毒素',
  心灵: '心灵',
  光耀: '光耀',
  雷鸣: '雷鸣',
};

/** 历史数据里出现过的写法 → 标准伤害类型 */
export const DAMAGE_TYPE_ALIASES: Record<string, DamageType> = {
  酸蚀: '强酸',
  强酸: '强酸',
  冰冻: '寒冷',
  寒冷: '寒冷',
  暗蚀: '黯蚀',
  黯蚀: '黯蚀',
  光: '光耀',
  光耀: '光耀',
  声波: '雷鸣',
  雷鸣: '雷鸣',
  神力: '光耀',
  电击: '闪电',
  闪电: '闪电',
  // 流程节点历史配置使用英文枚举值
  bludgeoning: '钝击',
  piercing: '穿刺',
  slashing: '挥砍',
  acid: '强酸',
  cold: '寒冷',
  fire: '火焰',
  force: '力场',
  lightning: '闪电',
  necrotic: '黯蚀',
  poison: '毒素',
  psychic: '心灵',
  radiant: '光耀',
  thunder: '雷鸣',
};

export const DAMAGE_TYPE_OPTIONS = DAMAGE_TYPES.map((type) => ({
  value: type,
  label: DAMAGE_TYPE_LABELS[type],
}));

/** 伤害来源：决定“非魔法武器”“法术伤害”等限定词是否命中 */
export type DamageSourceKind = 'weapon' | 'spell' | 'effect';

export interface DamageSource {
  kind: DamageSourceKind;
  magical?: boolean;
  silvered?: boolean;
  adamantine?: boolean;
}

export type AffinityKind = 'resistance' | 'vulnerability' | 'immunity';

/** 单次结算的最终亲和结果；both = 抗性与易伤同时命中 */
export type Affinity = 'none' | 'resistance' | 'vulnerability' | 'immunity' | 'both';

export interface AffinityRequirement {
  magical?: boolean;
  silvered?: boolean;
  adamantine?: boolean;
  sourceKind?: DamageSourceKind;
  /** 空数组表示不限伤害类型（如“法术伤害”“所有伤害”） */
  types?: DamageType[];
}

export interface AffinityEntry extends AffinityRequirement {
  id: string;
  kind: AffinityKind;
  /** 原始文本，便于 UI 展示与排查 */
  raw: string;
  /** 括号注释等无法结构化但需要提醒 DM 的信息 */
  note?: string;
}

export interface AffinityParseIssue {
  raw: string;
  reason: string;
}

export interface DamageAffinitySet {
  resistances: AffinityEntry[];
  vulnerabilities: AffinityEntry[];
  immunities: AffinityEntry[];
  notes: string[];
  unsupported: AffinityParseIssue[];
}

export interface DamageComponentInput {
  type?: DamageType;
  amount: number;
}

export interface DamageComponentResult {
  type?: DamageType;
  base: number;
  afterImmunity: number;
  afterResistance: number;
  final: number;
  affinity: Affinity;
  /** 命中的条目原始文本 */
  matched: string[];
}

export interface DamageResolution {
  base: number;
  final: number;
  components: DamageComponentResult[];
  notes: string[];
  anyResisted: boolean;
  anyImmune: boolean;
  anyVulnerable: boolean;
}

export interface RawDamageAffinities {
  resistances?: string[] | null;
  vulnerabilities?: string[] | null;
  immunities?: string[] | null;
  notes?: string[] | null;
}
