// 角色选项库类型（种族/亚种/背景/职业/子职业）
// 数据源：5E不全书 PHB 2014 离线提取（scripts/extract-options.mjs）

export type OptionCategory = 'race' | 'subrace' | 'background' | 'class' | 'subclass';

// 种族特质（名称 + 英文名 + 富文本描述）
export interface OptionTrait {
  name: string;
  nameEn: string;
  text: string;
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
  description: string;
  mechanics: OptionMechanics;
  traits: OptionTrait[];
  // 职业专属
  table?: ClassTableRow[];
  subclasses?: string[];
  // 亚种专属（继承自母种族的特质快照）
  parentTraits?: OptionTrait[];
  // 背景专属
  feature?: { name: string; nameEn: string; text: string };
  characteristics?: OptionCharacteristic[];
  dataResource: string;
  createdAt?: number;
  updatedAt?: number;
}
