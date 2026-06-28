// DM Toolkit - Character Type Definitions
export interface AbilityScore {
  score: number;
  modifier: number;
}

export interface Abilities {
  strength: AbilityScore;
  dexterity: AbilityScore;
  constitution: AbilityScore;
  intelligence: AbilityScore;
  wisdom: AbilityScore;
  charisma: AbilityScore;
}

export interface HitDice {
  type: string;
  total: number;
  used: number;
}

export interface Attack {
  id?: string;
  name: string;
  bonus: string;
  damage: string;
  type: string;
}

export interface SpellSlots {
  level1: { max: number; used: number };
  level2: { max: number; used: number };
  level3: { max: number; used: number };
  level4: { max: number; used: number };
  level5: { max: number; used: number };
  level6: { max: number; used: number };
  level7: { max: number; used: number };
  level8: { max: number; used: number };
  level9: { max: number; used: number };
}

export type SpellSlotLevel = keyof SpellSlots;

export interface Spells {
  cantrips: string[];
  spellSlots: SpellSlots;
  custom: string[];
}

export interface Equipment {
  id?: string;
  name: string;
  quantity: number;
  category: string;
  weight?: number;
  description?: string;
}

export interface Currency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}

export interface Skill {
  proficient: boolean;
  extra: number;
}

export interface Skills {
  acrobatics: Skill;
  animalHandling: Skill;
  arcana: Skill;
  athletics: Skill;
  deception: Skill;
  history: Skill;
  insight: Skill;
  intimidation: Skill;
  investigation: Skill;
  medicine: Skill;
  nature: Skill;
  perception: Skill;
  performance: Skill;
  persuasion: Skill;
  religion: Skill;
  sleightOfHand: Skill;
  stealth: Skill;
  survival: Skill;
}

export type ProficiencyCategory = 'armor' | 'weapons' | 'tools' | 'languages' | 'savingThrows';

export interface Proficiencies {
  armor: string[];
  weapons: string[];
  tools: string[];
  languages: string[];
  savingThrows: string[];
}

export interface Feature {
  id?: string;
  name: string;
  description: string;
  category: string;
  source?: string;
}

export interface Character {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'other' | '';
  class: string;
  level: number;
  race: string;
  background: string;
  alignment: string;
  experience: number;
  size: string;
  
  abilities: Abilities;
  proficiencyBonus: number;
  passivePerception: number;
  armorClass: number;
  speed: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  hitDice: HitDice;
  
  attacks: Attack[];
  spells: Spells;
  
  equipment: Equipment[];
  currency: Currency;
  
  skills: Skills;
  proficiencies: Proficiencies;
  
  features: Feature[];
  
  appearance: string;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;
  
  createdAt?: number;
  updatedAt?: number;
}

export type AbilityKey = keyof Abilities;
export type SkillKey = keyof Skills;
