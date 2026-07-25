// src/types/combat.ts
export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  ac?: number;
  maxHp?: number;
  currentHp?: number;
  isDead?: boolean;
  isPc?: boolean;
  characterId?: string;
  note?: string;
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
