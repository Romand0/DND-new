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
  createdAt: number;
  updatedAt: number;
}
