// src/types/combat.ts
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
  isPc?: boolean;
  characterId?: string;
  note?: string;
  speed?: number;
  /** NPC 实例子 ID，格式 `{templateId}-{random}`，从模板创建时自动生成 */
  childId?: string;
  /** 模板 ID 引用（从模板创建时带入） */
  templateId?: string;
  /** NPC 攻击方式（从模板带入） */
  attacks?: NpcAttack[];
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
  createdAt: number;
  updatedAt: number;
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
  /** 双手拿持状态下的伤害骰（"多用"属性） */
  twoHandedDamage?: string;
}

export interface RoundAction {
  [combatantId: string]: string;
}

export interface CombatRecord {
  id: string;
  title: string;
  combatants: Combatant[];
  rounds: RoundAction[];
  /** 战斗模式：'simulation' 模拟模式（无回合），'playback' 放映模式（有回合） */
  mode?: 'simulation' | 'playback';
  /**
   * 装备变更信息（战斗期间的"漏斗"，不直接修改角色卡）
   * key 为 combatantId
   */
  equipmentChanges?: Record<string, EquipmentChanges>;
  createdAt: number;
  updatedAt: number;
}

/**
 * 单个参战者的装备变更信息（"漏斗"）
 * 规则：以子ID (childId) 作为唯一主键
 * - 角色背包 = 信息源（character.equipment）
 * - 变更信息 = 战斗期间 +/- 记录
 * - 战斗背包 = 角色背包 + 应用变更 + 自动合并同名数量
 */
export interface EquipmentChanges {
  /** 战斗中新增物品（例如：拾取）。childId 用于唯一区分，按 childId 去重，自动整理时按名称合并数量 */
  added: Array<{
    childId: string;
    equipment: Record<string, unknown>; // Equipment 序列化快照
  }>;
  /** 战斗中失去物品（例如：投掷/消耗）的 childId 列表 */
  removedChildIds: string[];
  /** 战斗中数量变化：childId -> 数量 delta（正数=增加，负数=减少） */
  quantityDeltas: Record<string, number>;
}

/** 已废除的旧结构（保留兼容读取，不再使用） */
/** @deprecated 请使用 equipmentChanges + 派生战斗背包 */
export interface CombatInventoryItem {
  id: string;
  name: string;
  category: string;
  subtype?: string;
  quantity: number;
  equipmentData: Record<string, unknown>;
  obtainedAt: number;
  source?: string;
}
