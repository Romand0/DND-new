import { Character } from '@/types/character';

export interface SpellProgression {
  cantrips: string;
  knownSpells: string;
  spellSlots: {
    level1: number;
    level2: number;
    level3: number;
    level4: number;
  };
  maxSpellLevel: number;
}

export interface Subclass {
  id: string;
  displayName: string;
  description: string;
  features: string[];
  spellProgression?: SpellProgression;
}

export const SUBCLASSES: Record<string, Subclass[]> = {
  野蛮人: [
    { 
      id: 'berserker', 
      displayName: '狂战士道途',
      description: '狂战士在战斗中能够进入狂暴状态，获得额外的攻击力和防御力。',
      features: ['狂暴', '不稳定狂暴', '意志坚韧']
    },
    { 
      id: 'totem_warrior', 
      displayName: '图腾武者道途',
      description: '图腾武者与动物图腾建立联系，获得图腾赋予的特殊能力。',
      features: ['图腾灵', '图腾战士', '图腾狂怒', '精神庇护']
    },
  ],
  吟游诗人: [
    { 
      id: 'college_of_lore', 
      displayName: '逸闻学院',
      description: '逸闻学院的诗人精通各种知识，能够学习和记忆更多的法术。',
      features: ['逸闻学识', '魔法秘闻', '秘闻复诵', '秘闻大师']
    },
    { 
      id: 'college_of_valor', 
      displayName: '勇气学院',
      description: '勇气学院的诗人擅长战斗，能够鼓舞战友的士气。',
      features: ['鼓舞士气', '英雄气概', '鼓舞人心', '英雄诗篇']
    },
  ],
  牧师: [
    { 
      id: 'knowledge', 
      displayName: '知识领域',
      description: '知识领域的牧师专注于学习和传播知识，能够保护和解除魔法效果。',
      features: ['学者', '解除魔法', '知识之神赐福', '秘术抗性']
    },
    { 
      id: 'life', 
      displayName: '生命领域',
      description: '生命领域的牧师专注于治疗和保护生命，能够治愈疾病和伤害。',
      features: ['生命赐福', '反制疾病', '守护生命', '生命链接']
    },
    { 
      id: 'light', 
      displayName: '光明领域',
      description: '光明领域的牧师专注于驱散黑暗和邪恶，能够照亮黑暗并伤害不死生物。',
      features: ['光耀术', '驱散不死生物', '守护之光', '太阳射线']
    },
    { 
      id: 'nature', 
      displayName: '自然领域',
      description: '自然领域的牧师专注于与自然和谐共处，能够控制自然元素和动物。',
      features: ['动物交谈', '植物生长', '自然和谐', '狂野形态']
    },
    { 
      id: 'tempest', 
      displayName: '风暴领域',
      description: '风暴领域的牧师掌控风暴和雷电，能够召唤雷暴和闪电攻击敌人。',
      features: ['风暴之怒', '雷鸣术', '风之庇护', '风暴召唤']
    },
    { 
      id: 'trickery', 
      displayName: '诡术领域',
      description: '诡术领域的牧师专注于欺骗和诡计，能够隐身和欺骗敌人。',
      features: ['阴影庇护', '神行术', '欺骗之语', '诡术大师']
    },
    { 
      id: 'war', 
      displayName: '战争领域',
      description: '战争领域的牧师专注于战争和胜利，能够鼓舞战士的士气并增强战斗力。',
      features: ['战争祝福', '战争神赐', '鼓舞士气', '战争大师']
    },
  ],
  德鲁伊: [
    { 
      id: 'circle_of_land', 
      displayName: '大地结社',
      description: '大地结社的德鲁伊专注于与土地和植物的联系，能够操控植物和获得土地的庇护。',
      features: ['土地庇护', '动物交谈', '自然和谐', '土地之友']
    },
    { 
      id: 'circle_of_moon', 
      displayName: '月亮结社',
      description: '月亮结社的德鲁伊专注于野生动物和变形，能够变成各种野兽进行战斗。',
      features: ['野生形态', '月下狂暴', '野兽交谈', '月之祝福']
    },
  ],
  战士: [
    { 
      id: 'fighter', 
      displayName: '勇士',
      description: '勇士是战士的基础职业，专注于各种武器和护甲的使用。',
      features: ['武器专精', '战斗风格', '行动如风', '武器大师']
    },
    { 
      id: 'battle_master', 
      displayName: '战斗大师',
      description: '战斗大师精通各种战斗技巧，能够使用战斗指令来控制战场。',
      features: ['战斗指令', '方阵战术', '反击', '战术大师']
    },
    { 
      id: 'eldritch_knight', 
      displayName: '奥法骑士',
      description: '奥法骑士结合了战士的战斗能力和法术施放能力。',
      features: ['战斗施法', '武器咒术', '奥术骑士', '魔法剑术']
    },
  ],
  武僧: [
    { 
      id: 'quingong_master', 
      displayName: '散打宗',
      description: '散打宗专注于拳法和格斗技巧，能够使用内力增强攻击力。',
      features: ['拳法精通', '内力爆发', '散打技巧', '拳宗大师']
    },
    { 
      id: 'shadow_monk', 
      displayName: '暗影宗',
      description: '暗影宗专注于暗影和隐身，能够在暗影中移动和攻击。',
      features: ['暗影步', '暗影攻击', '暗影庇护', '暗影大师']
    },
    { 
      id: 'four_elements', 
      displayName: '四象宗',
      description: '四象宗专注于四种元素的操控，能够使用元素力量进行攻击和防御。',
      features: ['元素掌控', '四象合一', '元素护盾', '元素大师']
    },
  ],
  圣武士: [
    { 
      id: 'oath_of_devotion', 
      displayName: '奉献之誓',
      description: '奉献之誓的圣武士专注于保护和帮助他人，能够治愈和驱散邪恶。',
      features: ['神圣庇护', '奉献之誓', '神圣治愈', '正义使者']
    },
    { 
      id: 'oath_of_the_ancients', 
      displayName: '古贤之誓',
      description: '古贤之誓的圣武士专注于保护自然和弱小，能够与自然和谐共处。',
      features: ['自然守护', '古贤之誓', '自然治愈', '自然庇护']
    },
    { 
      id: 'oath_of_revenge', 
      displayName: '复仇之誓',
      description: '复仇之誓的圣武士专注于复仇和正义，能够对邪恶造成额外伤害。',
      features: ['复仇之怒', '复仇之誓', '正义审判', '复仇使者']
    },
  ],
  游侠: [
    { 
      id: 'hunter', 
      displayName: '猎人',
      description: '猎人专注于追踪和狩猎，能够追踪敌人并进行精准射击。',
      features: ['追踪专家', '精准射击', '野外生存', '猎人直觉']
    },
    { 
      id: 'beast_master', 
      displayName: '驯兽师',
      description: '驯兽师能够与动物建立联系，指挥动物进行战斗。',
      features: ['动物伙伴', '动物指挥', '动物沟通', '野兽大师']
    },
  ],
  游荡者: [
    { 
      id: 'thief', 
      displayName: '盗贼',
      description: '盗贼是精通偷窃和潜行的大师，能够悄无声息地移动并进行偷窃。',
      features: ['偷窃', '无声移动', '巧手', '盗贼工具']
    },
    { 
      id: 'assassin', 
      displayName: '刺客',
      description: '刺客是暗杀和伏击的专家，能够进行致命的偷袭和暗杀。',
      features: ['致命一击', '暗杀', '隐匿', '暗影大师']
    },
    {
      id: 'arcane_trickster',
      displayName: '诡术师',
      description: '诡术师将盗贼的灵活性与法术施放能力结合，能够使用法术进行欺骗和偷窃。',
      features: ['法术偷窃', '欺骗法术', '隐匿法术', '诡术大师'],
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: 2,
          level2: 2,
          level3: 2,
          level4: 1,
        },
        maxSpellLevel: 4,
      },
    },
  ],
  术士: [
    { 
      id: 'draconic', 
      displayName: '龙族血脉',
      description: '龙族血脉的术士拥有龙族血统，能够从龙族血脉中获得特殊能力。',
      features: ['龙族血脉', '龙鳞护甲', '龙息', '龙族亲和']
    },
    { 
      id: 'wild_magic', 
      displayName: '狂野魔法',
      description: '狂野魔法的术士能够控制不稳定的魔法能量，每次施法都可能产生特殊效果。',
      features: ['狂野魔法', '魔法爆发', '不稳定施法', '魔法掌控']
    },
  ],
  邪术师: [
    {
      id: 'archfey',
      displayName: '至高妖精',
      description: '至高妖精的邪术师与妖精界建立了联系，能够使用妖精界的魔法。',
      features: ['妖精契约', '妖精魔法', '妖精庇护', '妖精亲和'],
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: 2,
          level2: 2,
          level3: 2,
          level4: 1,
        },
        maxSpellLevel: 4,
      },
    },
    {
      id: 'fiend',
      displayName: '邪魔',
      description: '邪魔的邪术师与邪魔界建立了联系，能够使用邪魔界的黑暗魔法。',
      features: ['邪魔契约', '黑暗魔法', '邪魔庇护', '邪魔亲和'],
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: 2,
          level2: 2,
          level3: 2,
          level4: 1,
        },
        maxSpellLevel: 4,
      },
    },
    {
      id: 'old_one',
      displayName: '旧日支配者',
      description: '旧日支配者的邪术师与远古存在建立了联系，能够使用来自远古的禁忌魔法。',
      features: ['远古契约', '禁忌魔法', '远古庇护', '远古知识'],
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: 2,
          level2: 2,
          level3: 2,
          level4: 1,
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
