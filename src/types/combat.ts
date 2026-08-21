// src/types/combat.ts

// ===== 新增：体型枚举 =====
/** 体型级别：0=微型, 1=小型, 2=中型, 3=大型, 4=巨型, 5=超巨型 */
export type CreatureSize = 0 | 1 | 2 | 3 | 4 | 5;
export const CREATURE_SIZE_LABELS: Record<CreatureSize, string> = {
  0: '微型', 1: '小型', 2: '中型', 3: '大型', 4: '巨型', 5: '超巨型',
};

// ===== 新增：种类枚举 =====
export type CreatureType =
  | 'aberration' | 'beast' | 'celestial' | 'construct'
  | 'dragon' | 'elemental' | 'fey' | 'fiend'
  | 'giant' | 'humanoid' | 'monstrosity' | 'ooze'
  | 'plant' | 'undead';

export const CREATURE_TYPE_LABELS: Record<CreatureType, string> = {
  aberration: '异怪', beast: '野兽', celestial: '天界生物', construct: '构装生物',
  dragon: '龙类', elemental: '元素生物', fey: '精类', fiend: '邪魔',
  giant: '巨人', humanoid: '类人生物', monstrosity: '怪兽', ooze: '泥怪',
  plant: '植物', undead: '不死生物',
};

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  ac?: number;
  maxHp?: number;
  currentHp?: number;
  tempHp?: number;
  isDead?: boolean;
  /** 昏迷（HP 归零但未死亡）：表格表头黯淡，棋子变灰 */
  isUnconscious?: boolean;
  /** 失能（Incapacitated）：无法执行任何动作或反应，actions 视为 0；模拟模式下同样生效 */
  isIncapacitated?: boolean;
  /** 死亡豁免失败次数（D&D 5e：累计 3 次即死亡） */
  deathSaveFailures?: number;
  /** 死亡豁免成功次数（D&D 5e：累计 3 次即稳定） */
  deathSaveSuccesses?: number;
  isPc?: boolean;
  characterId?: string;
  note?: string;
  speed?: number;
  /** 本回合已移动尺数（D&D 5e：每回合开始归零，移动后累加，达到 speed 后不能再走）；仅放映模式下使用，模拟模式始终视为 0 */
  movementUsed?: number;
  /** 速度调整值（因各种效应对速度的影响，如加速/减速法术）；与疾走无关；每回合开始归零 */
  speedModifier?: number;
  /** 疾走额外移动力（疾走动作获得的额外可用移动力，不累加到速度，只增加可用移动力池）；每回合开始归零 */
  dashExtraMovement?: number;
  /** 六大属性值（仅 NPC 参战者携带，用于计算豁免加值；PC 参战者通过 characterId 引用角色卡获取属性） */
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  /** NPC 实例子 ID，格式 `{templateId}-{random}`，从模板创建时自动带入 */
  childId?: string;
  /** 模板 ID 引用（从模板创建时带入） */
  templateId?: string;
  /** NPC 攻击方式（从模板带入） */
  attacks?: NpcAttack[];
  /** 当前可用动作数（放映模式每回合恢复，模拟模式无限） */
  actions?: number;
  /** 体型级别（0=微型…5=超巨型），仅 NPC 使用 */
  creatureSize?: CreatureSize;
  /** 种类（D&D 5e 生物类型），仅 NPC 使用 */
  creatureType?: CreatureType;
  /** 当前可用附赠动作数（放映模式每回合恢复为 1，模拟模式无限） */
  bonusActions?: number;
  /** 待消费的优劣势标记列表（发起者赋予此参战者的一次性优劣势来源，如协助/法术效果） */
  pendingAdvantageSources?: PendingAdvantageSource[];
  /** 言语能力：能否说话或发出声音（true=可以，false=不可以）。默认真，某些状态可剥夺 */
  canSpeak?: boolean;
}

export interface NpcTemplate {
  id: string;
  /** 用户自定义的模板唯一标识（如 "goblin"），用于识别同类 NPC */
  templateId: string;
  /** 模板显示名称（如 "哥布林"） */
  name: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  maxHp: number;
  speed: number;
  ac: number;
  attacks: NpcAttack[];
  creatureSize?: CreatureSize;
  creatureType?: CreatureType;
  createdAt: number;
  updatedAt: number;

  /** 怪物挑战等级(如 0, 0.25, 1, 5, 17) */
  cr?: number;
  /** 尺寸类别(如 '''微型''', '''小型''', '''中型''', '''大型''') */
  size?: string;
  /** 种类标签(如 '''异怪''', '''野兽''', '''类人生物''', '''不死''') */
  type?: string;
  /** 阵营(如 '''混乱邪恶''', '''守序中立''', '''中立''') */
  alignment?: string;
  /** 特性/能力描述 */
  features?: string;
  /** 感官(如 '''黑暗视觉 60 尺,被动感知 10''') */
  senses?: string;
  /** 语言 */
  languages?: string;
  /** 豁免加值(如 { strength: 2, dexterity: 5 }) */
  savingThrows?: Partial<Record<string, number>>;
  /** 技能加值(如 { perception: 3, stealth: 6 }) */
  skills?: Record<string, number>;
  /** 来源(如 '''MM''', '''VGtM''', '''自定义''') */
  source?: string;

}
export interface NpcTemplate {
  id: string;
  /** 用户自定义的模板唯一标识(如 "goblin"),用于识别同类 NPC */
  templateId: string;
  /** 模板显示名称(如 "哥布林") */
  name: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  maxHp: number;
  speed: number;
  ac: number;
  attacks: NpcAttack[];
  createdAt: number;
  updatedAt: number;

  /** 怪物挑战等级(如 0, 0.25, 1, 5, 17) */
  cr?: number;
  /** 尺寸类别(如 '微型', '小型', '中型', '大型') */
  size?: string;
  /** 种类标签(如 '异怪', '野兽', '类人生物', '不死') */
  type?: string;
  /** 阵营(如 '混乱邪恶', '守序中立', '中立') */
  alignment?: string;
  /** 特性/能力描述 */
  features?: string;
  /** 感官(如 '黑暗视觉 60 尺,被动感知 10') */
  senses?: string;
  /** 语言 */
  languages?: string;
  /** 豁免加值(如 { strength: 2, dexterity: 5 }) */
  savingThrows?: Partial<Record<string, number>>;
  /** 技能加值(如 { perception: 3, stealth: 6 }) */
  skills?: Record<string, number>;
  /** 来源(如 'MM', 'VGtM', '自定义') */
  source?: string;
}

export interface NpcAttack {
  name: string;
  attackBonus: string;
  damage: string;
  damageType: string;
  range: string;
  properties: string[];
  subtype?: string;
  normalRange?: number;
  maxRange?: number;
  /** 双手拿持状态下的伤害骰("多用"属性) */
  twoHandedDamage?: string;
  /** 武器是否已装填("装填"属性:当前弹匣状态,true=已装填可射击,false=需装填) */
  loaded?: boolean;
}
