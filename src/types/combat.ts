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
}

export interface NpcTemplate {
  id: string;
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
