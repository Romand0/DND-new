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
  attackBonus: string;
  damage: string;
  damageType: string;
  range: string;
  properties: string[];
  subtype?: string;
  /** 常规射程（单位：尺），用于“投掷”或“弹药”属性 */
  normalRange?: number;
  /** 最大射程（单位：尺），用于“投掷”或“弹药”属性 */
  maxRange?: number;
  /** 双手拿持状态下的伤害骰（“多用”属性） */
  twoHandedDamage?: string;
  /** 武器是否已装填（"装填"属性：当前弹匣状态，true=已装填可射击，false=需装填） */
  loaded?: boolean;
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

export interface EquipmentTag {
  key: string;
  value: string;
}

export interface Equipment {
  /** 装备库模板 ID（从装备库选取时带入，自定义装备可空） */
  id?: string;
  /** 角色背包内实例 ID，格式 `{charId}-{random}`，由 addEquipment 自动生成 */
  childId?: string;
  name: string;
  quantity: number;
/** 每袋/每份所含个体数（如 50 发/袋、4 oz/瓶）。装备库继承，背包实例保留。 */
  packSize?: number;
/** 个体单位名称（如 "发"、"oz"、"瓶"）。装备库继承，背包实例保留。 */
  unit?: string;
  category: string;
  weight?: number;
  damageDice?: string;
  damageType?: string;
  acBase?: string;
  strengthReq?: number;
  stealthDisadvantage?: boolean;
  description?: string;
  price?: {
    amount: number;
    unit: 'pp' | 'gp' | 'ep' | 'sp' | 'cp';
  };
  properties?: string[];
  tags?: EquipmentTag[];
  source?: string;
  dataResource?: string;
  subtype?: string;
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface Skill {
  proficient: boolean;
  extra: number;
  expertise?: boolean; // 专精：熟练加值翻倍
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
  saveExpertise?: AbilityKey[]; // 豁免专精列表
  // 豁免加值覆盖：NPC 的某属性豁免加值通常等于属性调整值，
  // 个别情况下需要单独设定；若该属性未设置（undefined），则回退到属性调整值+熟练加值
  saveBonusOverride?: Partial<Record<AbilityKey, number>>;

  /** 施法关键属性，由职业决定；未设置时通过 class 名自动推断 */
  spellcastingAbility?: AbilityKey;

  features: Feature[];

  appearance: string;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;

  createdAt?: number;
  updatedAt?: number;

  /** 当前穿戴的护甲引用 —— 优先存 childId，回退兼容 id */
  wornArmorId: string | null;
  /** 当前穿戴的服装引用 —— 优先存 childId，回退兼容 id */
  wornOutfitId: string | null;
  /** 左手手持槽 */
  heldLeft: HandSlot;
  /** 右手手持槽 */
  heldRight: HandSlot;
  /** 言语能力：能否说话或发出声音（true=可以，false=不可以）。默认为 true，某些状态可剥夺 */
  canSpeak?: boolean;
  /** 姿势能力：能否做姿势成分（true=可以，false=不可以）。默认为 true，束缚等状态可剥夺 */
  canSomatic?: boolean;
}

/** 手持槽状态 */
export type HandState = 'ready' | 'action' | 'unavailable';

/** 手持槽 */
export interface HandSlot {
  /** 手的状态：ready=待用，action=动作中，unavailable=不可用 */
  state: HandState;
  /** 拿持的装备 ID（优先 childId，回退 id），null 表示未拿持 */
  equipmentId: string | null;
}

export type AbilityKey = keyof Abilities;
export type SkillKey = keyof Skills;
