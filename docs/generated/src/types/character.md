# src/types/character.ts

## 功能概述

该文件定义了角色类型相关的接口，包括角色的属性、技能、装备、法术等，为角色管理模块提供数据结构支持。它存在于项目中是为了确保角色数据的一致性和可维护性，便于后续的开发和扩展。

## 主要导出/接口

### 1. AbilityScore

```typescript
interface AbilityScore {
  score: number;
  modifier: number;
}
```

### 2. Abilities

```typescript
interface Abilities {
  strength: AbilityScore;
  dexterity: AbilityScore;
  constitution: AbilityScore;
  intelligence: AbilityScore;
  wisdom: AbilityScore;
  charisma: AbilityScore;
}
```

### 3. HitDice

```typescript
interface HitDice {
  type: string;
  total: number;
  used: number;
}
```

### 4. Attack

```typescript
interface Attack {
  id?: string;
  name: string;
  attackBonus: string;
  damage: string;
  damageType: string;
  range: string;
  properties: string[];
  subtype?: string;
  normalRange?: number;
  maxRange?: number;
  twoHandedDamage?: string;
  loaded?: boolean;
}
```

### 5. SpellSlots

```typescript
interface SpellSlots {
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

type SpellSlotLevel = keyof SpellSlots;
```

### 6. Spells

```typescript
interface Spells {
  cantrips: string[];
  spellSlots: SpellSlots;
  custom: string[];
}
```

### 7. EquipmentTag

```typescript
interface EquipmentTag {
  key: string;
  value: string;
}
```

### 8. Equipment

```typescript
interface Equipment {
  id?: string;
  childId?: string;
  name: string;
  quantity: number;
  packSize?: number;
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
    unit: 'pp' | 'gp' | 'sp' | 'cp';
  };
  properties?: string[];
  tags?: EquipmentTag[];
  source?: string;
  dataResource?: string;
  subtype?: string;
}
```

### 9. Currency

```typescript
interface Currency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}
```

### 10. Skill

```typescript
interface Skill {
  proficient: boolean;
  extra: number;
  expertise?: boolean;
}
```

### 11. Skills

```typescript
interface Skills {
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
```

### 12. Proficiencies

```typescript
type ProficiencyCategory = 'armor' | 'weapons' | 'tools' | 'languages' | 'savingThrows';

interface Proficiencies {
  armor: string[];
  weapons: string[];
  tools: string[];
  languages: string[];
  savingThrows: string[];
}
```

### 13. Feature

```typescript
interface Feature {
  id?: string;
  name: string;
  description: string;
  category: string;
  source?: string;
}
```

### 14. Character

```typescript
interface Character {
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
  saveExpertise?: AbilityKey[];
  saveBonusOverride?: Partial<Record<AbilityKey, number>>;

  features: Feature[];

  appearance: string;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;

  createdAt?: number;
  updatedAt?: number;

  wornArmorId: string | null;
  wornOutfitId: string | null;
  heldLeft: HandSlot;
  heldRight: HandSlot;
}
```

### 15. HandSlot

```typescript
interface HandSlot {
  state: HandState;
  equipmentId: string | null;
}

type HandState = 'ready' | 'action' | 'unavailable';
```

### 16. AbilityKey

```typescript
type AbilityKey = keyof Abilities;
type SkillKey = keyof Skills;
```

## 核心实现说明

该文件定义了一系列接口，用于描述角色的属性和状态。这些接口构成了角色数据模型的基础，为角色管理模块提供了数据结构支持。角色数据模型包括角色的基本属性、技能、装备、法术等，是角色管理模块的核心。

角色数据模型与项目其他模块的关系如下：

- 角色管理模块：使用该文件定义的接口来存储和操作角色数据。
- 游戏逻辑模块：使用角色数据模型来模拟游戏中的角色行为。
- 视图层：根据角色数据模型来渲染角色界面。

该文件被角色管理模块引用，用于创建和管理角色实例。

## 注意事项或使用方式

- 使用该文件定义的接口时，请确保遵循 TypeScript 的类型系统。
- 在使用角色数据模型时，请注意角色的状态可能会随着游戏进程而变化。
- 在修改角色数据时，请确保数据的一致性和完整性。
