// 角色选项库类型（种族/亚种/背景/职业/子职业）
// 数据源：5E不全书 PHB 2014 离线提取（scripts/extract-options.mjs）
import type { FeatureRole } from './character';

export type OptionCategory = 'race' | 'subrace' | 'background' | 'class' | 'subclass';

// 种族特质（名称 + 英文名 + 富文本描述）
export interface OptionTrait {
  name: string;
  nameEn: string;
  text: string;
  // 生效等级（从文本「第X级」解析；无标注的按 1 级默认，仅职业特性使用）
  level?: number;
  // 作用方式分类（CharacterDetail 四类页标准）；种子由 scripts/annotate-option-roles.mjs 标注，
  // 缺省时读端按名称关键词派生（deriveFeatureRole 兜底），显式值优先
  role?: FeatureRole;
  // 玩法体系归属（超魔法/魔能祈唤等）；容器条目 systemKind=container，选项成员=member
  system?: string;
  systemKind?: 'container' | 'member';
  // 特性内嵌选项库（如战斗大师战技、武僧气技、魔契师魔印、术士超魔选项）
  options?: OptionTrait[];
}

// 种族/职业的机械字段（自动化填卡用；v1 只读展示）
export interface OptionMechanics {
  abilityBonus?: Record<string, number> | null;
  size?: string | null;
  speed?: number | null;
  darkvision?: number | null;
  hitDie?: number | null;
  savingThrows?: string[];
  proficiencies?: string;
  startingEquipment?: string;
  skills?: string;
  languages?: string;
  tools?: string;
  equipment?: string;
}

// 职业表行（等级/熟练加值/职业特性/法术位）
export interface ClassTableRow {
  level: number;
  proficiency: number;
  features: string[];
  slots?: Record<string, string>;
}

// 建议特征表条目
export interface OptionCharacteristic {
  die: string;
  kind: string;
  entries: string[];
}

// 扁平选项条目（D1 character_options 表 / localStorage 通用形状）
export interface CharacterOption {
  id: string;
  name: string;
  nameEn: string;
  category: OptionCategory;
  parentName: string;
  source: string;
  campaignId?: string | null; // 归属团组（null/缺省 = 出版物条目，团组无关全局共享）
  /** 覆盖/墓碑行指回种子条目的 id（种子与自建条目无此字段） */
  seedId?: string | null;
  /** 墓碑标记：仅删除种子的墓碑行含此字段，合并时剔除对应种子 */
  deleted?: boolean;
  description: string;
  mechanics: OptionMechanics;
  traits: OptionTrait[];
  // 职业专属
  table?: ClassTableRow[];
  subclasses?: string[];
  // 亚种专属（继承自母种族的特质快照）
  parentTraits?: OptionTrait[];
  // 背景专属
  feature?: { name: string; nameEn: string; text: string; role?: FeatureRole };
  characteristics?: OptionCharacteristic[];
  dataResource: string;
  createdAt?: number;
  updatedAt?: number;
}
