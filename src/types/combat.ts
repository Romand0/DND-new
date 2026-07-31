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
  /** 战斗背包：记录战斗期间获得的物品（拾取等），key 为 combatantId */
  combatInventories?: Record<string, CombatInventoryItem[]>;
  createdAt: number;
  updatedAt: number;
}

/** 战斗背包物品：简化版装备信息 */
export interface CombatInventoryItem {
  id: string;
  name: string;
  category: string;
  subtype?: string;
  quantity: number;
  /** 原始装备快照（用于战斗结束后写入角色卡） */
  equipmentData: Record<string, unknown>;
  /** 获得时间 */
  obtainedAt: number;
  /** 来源：'picked' | 'thrown_drop' 等 */
  source?: string;
}
