import type { FeatureRole } from '@/types/character';

export type GrowthGapField =
  | 'class'
  | 'class-table'
  | 'class-feature'
  | 'subclass'
  | 'subclass-feature'
  | 'spell-slots'
  | 'hit-die';

export interface GrowthDataGap {
  level: number;
  field: GrowthGapField;
  message: string;
}

export interface GrowthFeatureOption {
  name: string;
  nameEn?: string;
  description: string;
}

export interface GrowthFeatureRef {
  name: string;
  nameEn?: string;
  description: string;
  level: number;
  source: 'class' | 'subclass';
  category: '职业特性';
  role?: FeatureRole;
  system?: string;
  systemKind?: 'container' | 'member';
  options?: GrowthFeatureOption[];
}

export interface GrowthSubclassChoice {
  required: boolean;
  candidates: Array<{ id: string; name: string }>;
}

export interface GrowthAbilityScoreImprovement {
  points: number;
  modes: Array<'+2' | '+1/+1'>;
}

export interface GrowthHpGain {
  fixed: number;
  conMod: number;
  formula: string;
}

export interface GrowthMilestone {
  level: number;
  proficiencyBonus: number;
  classFeatures: GrowthFeatureRef[];
  subclassFeatures: GrowthFeatureRef[];
  subclassChoice?: GrowthSubclassChoice;
  abilityScoreImprovement?: GrowthAbilityScoreImprovement;
  spellSlots?: Record<number, number>;
  cantripsKnown?: number;
  spellsKnown?: number;
  hitDie?: number;
  hpGain?: GrowthHpGain;
  gaps: GrowthDataGap[];
}

export interface GrowthPath {
  characterId: string;
  classKey: string;
  subclassKey?: string;
  effectiveLevel: number;
  pathVersion: string;
  milestones: GrowthMilestone[];
}
