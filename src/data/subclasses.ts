import { Character } from '@/types/character';

export interface SpellProgression {
  cantrips: string;
  knownSpells: string;
  spellSlots: {
    level1: string;
    level2: string;
    level3: string;
    level4: string;
  };
  maxSpellLevel: number;
}

export interface Subclass {
  id: string;
  displayName: string;
  spellProgression?: SpellProgression;
}

export const SUBCLASSES: Record<string, Subclass[]> = {
  野蛮人: [
    { id: 'berserker', displayName: '狂战士道途' },
    { id: 'totem_warrior', displayName: '图腾武者道途' },
  ],
  吟游诗人: [
    { id: 'college_of_lore', displayName: '逸闻学院' },
    { id: 'college_of_valor', displayName: '勇气学院' },
  ],
  牧师: [
    { id: 'knowledge', displayName: '知识领域' },
    { id: 'life', displayName: '生命领域' },
    { id: 'light', displayName: '光明领域' },
    { id: 'nature', displayName: '自然领域' },
    { id: 'tempest', displayName: '风暴领域' },
    { id: 'trickery', displayName: '诡术领域' },
    { id: 'war', displayName: '战争领域' },
  ],
  德鲁伊: [
    { id: 'circle_of_land', displayName: '大地结社' },
    { id: 'circle_of_moon', displayName: '月亮结社' },
  ],
  战士: [
    { id: 'fighter', displayName: '勇士' },
    { id: 'battle_master', displayName: '战斗大师' },
    { id: 'eldritch_knight', displayName: '奥法骑士' },
  ],
  武僧: [
    { id: 'quingong_master', displayName: '散打宗' },
    { id: 'shadow_monk', displayName: '暗影宗' },
    { id: 'four_elements', displayName: '四象宗' },
  ],
  圣武士: [
    { id: 'oath_of_devotion', displayName: '奉献之誓' },
    { id: 'oath_of_the_ancients', displayName: '古贤之誓' },
    { id: 'oath_of_revenge', displayName: '复仇之誓' },
  ],
  游侠: [
    { id: 'hunter', displayName: '猎人' },
    { id: 'beast_master', displayName: '驯兽师' },
  ],
  游荡者: [
    { id: 'thief', displayName: '盗贼' },
    { id: 'assassin', displayName: '刺客' },
    {
      id: 'arcane_trickster',
      displayName: '诡术师',
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: '2-3级，3-4级，4-7级',
          level2: '2-7级，3-10级',
          level3: '2-13级，3-16级',
          level4: '1-19级',
        },
        maxSpellLevel: 4,
      },
    },
  ],
  术士: [
    { id: 'draconic', displayName: '龙族血脉' },
    { id: 'wild_magic', displayName: '狂野魔法' },
  ],
  邪术师: [
    {
      id: 'archfey',
      displayName: '至高妖精',
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: '2-3级，3-4级，4-7级',
          level2: '2-7级，3-10级',
          level3: '2-13级，3-16级',
          level4: '1-19级',
        },
        maxSpellLevel: 4,
      },
    },
    {
      id: 'fiend',
      displayName: '邪魔',
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: '2-3级，3-4级，4-7级',
          level2: '2-7级，3-10级',
          level3: '2-13级，3-16级',
          level4: '1-19级',
        },
        maxSpellLevel: 4,
      },
    },
    {
      id: 'old_one',
      displayName: '旧日支配者',
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: '2-3级，3-4级，4-7级',
          level2: '2-7级，3-10级',
          level3: '2-13级，3-16级',
          level4: '1-19级',
        },
        maxSpellLevel: 4,
      },
    },
  ],
};

export function getAvailableSubclasses(character: Character): Subclass[] {
  if (!character.profession || !character.profession.class) {
    return [];
  }

  return SUBCLASSES[character.profession.class] || [];
}

export function canChooseSubclass(character: Character): boolean {
  if (!character.profession) return false;
  // 术士和邪术师1级就可以选择子职业
  if (character.profession.class === '术士' || character.profession.class === '邪术师') {
    return character.level >= 1 && !!character.profession.subclass;
  }
  // 其他职业3级可以选择子职业
  return character.level >= 3 && !!character.profession.subclass;
}

export function setSubclass(character: Character, subclass: Subclass | null): Character {
  if (!character.profession) {
    character.profession = { class: '', subclass: undefined };
  }

  if (subclass) {
    character.profession.subclass = subclass.id;
  } else {
    character.profession.subclass = undefined;
  }

  return character;
}

export function changeSubclass(character: Character, newSubclass: Subclass): Character {
  if (!character.profession) {
    character.profession = { class: '', subclass: undefined };
  }

  character.profession.subclass = newSubclass.id;
  return character;
}

export function getSubclassById(character: Character, subclassId: string): Subclass | null {
  const availableSubclasses = getAvailableSubclasses(character);
  return availableSubclasses.find(sub => sub.id === subclassId) || null;
}

export function getSubclassDisplayName(character: Character): string {
  if (!character.profession || !character.profession.subclass) {
    return '';
  }

  const subclass = getSubclassById(character, character.profession.subclass);
  return subclass?.displayName || character.profession.subclass;
}
