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
  name: string;
  displayName: string;
  description: string;
  features: string[];
  spellProgression?: SpellProgression;
}

export const SUBCLASSES: Record<string, Subclass[]> = {
  野蛮人: [
    {
      id: 'berserker',
      name: '狂战士道途',
      displayName: '狂战士道途',
      description: '进入狂暴状态，获得额外的战斗能力和伤害',
      features: [
        '狂暴：进入狂暴状态，获得额外攻击和伤害',
        '抵抗：在狂暴状态下获得伤害抗性',
        '狂怒：狂暴状态下移动速度增加'
      ]
    },
    {
      id: 'totem_warrior',
      name: '图腾武者道途',
      displayName: '图腾武者道途',
      description: '通过图腾获得特殊能力，与自然力量连接',
      features: [
        '图腾：获得图腾的特殊能力',
        '动物形态：能够模拟动物的行为',
        '图腾连接：与图腾动物建立连接'
      ]
    }
  ],
  吟游诗人: [
    {
      id: 'college_of_lore',
      name: '逸闻学院',
      displayName: '逸闻学院',
      description: '掌握广泛的知识和技能，能够学习和使用各种法术',
      features: [
        '博学：掌握各种知识',
        '法术专精：能够学习和使用更多法术',
        '技能大师：技能检定获得加成'
      ]
    },
    {
      id: 'college_of_valor',
      name: '勇气学院',
      displayName: '勇气学院',
      description: '专注于勇气和战斗，能够在战斗中鼓舞队友',
      features: [
        '勇气鼓舞：鼓舞队友的勇气',
        '战斗吟唱：在战斗中吟唱',
        '武器专精：获得武器专精'
      ]
    }
  ],
  牧师: [
    {
      id: 'knowledge',
      name: '知识领域',
      displayName: '知识领域',
      description: '专注于智慧和知识，能够获取信息和识破谎言',
      features: [
        '知识获取：能够获取更多信息',
        '智慧祝福：提升智力相关检定',
        '真相洞察：能够识破谎言'
      ]
    },
    {
      id: 'life',
      name: '生命领域',
      displayName: '生命领域',
      description: '专注于治疗和保护生命，能够治愈伤势和驱散邪恶',
      features: [
        '生命治愈：治疗法术效果增强',
        '生命护盾：获得生命护盾',
        '生命复苏：能够复活死者'
      ]
    },
    {
      id: 'light',
      name: '光明领域',
      displayName: '光明领域',
      description: '专注于光明和正义，能够驱散黑暗和邪恶',
      features: [
        '光明打击：对黑暗生物造成额外伤害',
        '光明护盾：获得光明护盾',
        '光明祝福：能够祝福队友'
      ]
    },
    {
      id: 'nature',
      name: '自然领域',
      displayName: '自然领域',
      description: '专注于自然和生态，能够与自然沟通',
      features: [
        '自然沟通：与自然沟通',
        '自然掌控：掌控自然力量',
        '生态平衡：维护生态平衡'
      ]
    },
    {
      id: 'tempest',
      name: '风暴领域',
      displayName: '风暴领域',
      description: '专注于风暴和雷电，能够召唤雷电风暴',
      features: [
        '风暴召唤：能够召唤雷电风暴',
        '雷电掌控：掌握雷电法术',
        '风暴护盾：获得风暴护盾'
      ]
    },
    {
      id: 'trickery',
      name: '诡术领域',
      displayName: '诡术领域',
      description: '专注于诡计和欺骗，擅长隐秘行动',
      features: [
        '隐秘行动：在隐秘行动中获得优势',
        '欺骗技巧：欺骗相关检定获得加成',
        '阴影掌控：在阴影中隐秘行动'
      ]
    },
    {
      id: 'war',
      name: '战争领域',
      displayName: '战争领域',
      description: '专注于战争和战斗，能够鼓舞战士和增强战斗力',
      features: [
        '战争祝福：战斗相关检定获得加成',
        '战争武器：武器攻击获得加成',
        '战争指挥：能够鼓舞队友'
      ]
    }
  ],
  德鲁伊: [
    {
      id: 'circle_of_land',
      name: '大地结社',
      displayName: '大地结社',
      description: '专注于大地和自然，能够掌控大地力量',
      features: [
        '大地掌控：掌控大地力量',
        '植物生长：促进植物生长',
        '地形改变：改变地形'
      ]
    },
    {
      id: 'circle_of_moon',
      name: '月亮结社',
      displayName: '月亮结社',
      description: '专注于月亮和变形，能够变身成动物',
      features: [
        '月亮变身：变身成动物',
        '月亮掌控：掌控月亮力量',
        '夜行动物：在夜晚获得优势'
      ]
    }
  ],
  战士: [
    {
      id: 'fighter',
      name: '勇士',
      displayName: '勇士',
      description: '专注于基础战斗技能，掌握各种武器和战斗技巧',
      features: [
        '战斗专精：获得武器专精',
        '战斗技巧：掌握各种战斗技巧',
        '战斗耐力：增加战斗耐力'
      ]
    },
    {
      id: 'battle_master',
      name: '战斗大师',
      displayName: '战斗大师',
      description: '精通战术和战斗技巧，能够精准打击敌人弱点',
      features: [
        '战术大师：掌握各种战术技巧',
        '打击技巧：能够精准打击敌人弱点',
        '指挥能力：能够鼓舞队友'
      ]
    },
    {
      id: 'eldritch_knight',
      name: '奥法骑士',
      displayName: '奥法骑士',
      description: '结合魔法和武力的战士，能够使用简单的魔法',
      features: [
        '奥术武装：能够为武器附加魔法效果',
        '魔法护盾：获得魔法护盾能力',
        '战斗法术：能够使用简单的战斗法术'
      ]
    }
  ],
  武僧: [
    {
      id: 'quingong_master',
      name: '散打宗',
      displayName: '散打宗',
      description: '专注于散打技巧，能够使用各种武术技巧',
      features: [
        '散打技巧：掌握各种散打技巧',
        '内力增强：内力攻击增强',
        '武术专精：获得武术专精'
      ]
    },
    {
      id: 'shadow_monk',
      name: '暗影宗',
      displayName: '暗影宗',
      description: '专注于暗影和隐秘行动，能够在阴影中隐秘行动',
      features: [
        '暗影掌控：掌控暗影力量',
        '隐秘行动：在阴影中隐秘行动',
        '暗影步法：暗影中移动速度增加'
      ]
    },
    {
      id: 'four_elements',
      name: '四象宗',
      displayName: '四象宗',
      description: '专注于四象元素，能够使用四象元素的力量',
      features: [
        '四象掌控：掌控四象元素',
        '元素攻击：使用元素攻击',
        '元素防御：获得元素防御'
      ]
    }
  ],
  圣武士: [
    {
      id: 'oath_of_devotion',
      name: '奉献之誓',
      displayName: '奉献之誓',
      description: '奉献于正义和善良，能够保护无辜者',
      features: [
        '正义奉献：为正义而战',
        '保护誓言：保护无辜者',
        '神圣打击：对邪恶生物造成额外伤害'
      ]
    },
    {
      id: 'oath_of_the_ancients',
      name: '古贤之誓',
      displayName: '古贤之誓',
      description: '遵循古贤的教诲，保护自然和善良',
      features: [
        '古贤教诲：遵循古贤的教诲',
        '自然保护：保护自然',
        '善良守护：守护善良'
      ]
    },
    {
      id: 'oath_of_revenge',
      name: '复仇之誓',
      displayName: '复仇之誓',
      description: '为复仇而战，能够追踪和惩罚邪恶',
      features: [
        '复仇追踪：追踪邪恶',
        '复仇打击：对邪恶生物造成额外伤害',
        '复仇意志：复仇意志增强'
      ]
    }
  ],
  游侠: [
    {
      id: 'hunter',
      name: '猎人',
      displayName: '猎人',
      description: '专精追踪和狩猎，能够精准打击敌人',
      features: [
        '狩猎技巧：掌握狩猎技巧',
        '精准打击：能够精准打击敌人',
        '陷阱设置：能够设置陷阱'
      ]
    },
    {
      id: 'beast_master',
      name: '驯兽师',
      displayName: '驯兽师',
      description: '与野兽建立深厚联系，能够与野兽并肩作战',
      features: [
        '野兽伙伴：拥有一个野兽伙伴',
        '野兽沟通：能够与野兽沟通',
        '野兽强化：能够强化野兽的能力'
      ]
    }
  ],
  游荡者: [
    {
      id: 'thief',
      name: '盗贼',
      displayName: '盗贼',
      description: '专精偷窃和潜行，能够悄无声息地行动',
      features: [
        '潜行专家：在潜行中获得优势',
        '偷窃技巧：偷窃相关检定获得加成',
        '敏捷行动：在敏捷行动中获得优势'
      ]
    },
    {
      id: 'assassin',
      name: '刺客',
      displayName: '刺客',
      description: '专精暗杀和突袭，能够造成致命伤害',
      features: [
        '暗杀专家：暗杀相关检定获得加成',
        '致命一击：能够造成致命伤害',
        '隐秘行动：在隐秘行动中获得优势'
      ]
    },
    {
      id: 'arcane_trickster',
      name: '诡术师',
      displayName: '诡术师',
      description: '结合偷窃和魔法，能够使用简单的魔法',
      features: [
        '奥术偷窃：能够偷取魔法效果',
        '诡术魔法：使用诡术相关的魔法',
        '隐秘魔法：在隐秘中使用魔法'
      ],
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: '2-3级，3-4级，4-7级',
          level2: '2-7级，3-10级',
          level3: '2-13级，3-16级',
          level4: '1-19级'
        },
        maxSpellLevel: 4
      }
    }
  ],
  术士: [
    {
      id: 'draconic',
      name: '龙族血脉',
      displayName: '龙族血脉',
      description: '拥有龙族血脉，能够使用龙族相关的魔法',
      features: [
        '龙族护盾：获得龙族护盾',
        '龙族魔法：使用龙族魔法',
        '龙族特性：获得龙族特性'
      ]
    },
    {
      id: 'wild_magic',
      name: '狂野魔法',
      displayName: '狂野魔法',
      description: '掌控野魔法，魔法效果不可预测',
      features: [
        '野魔法爆发：魔法效果不可预测',
        '野魔法掌控：掌控野魔法',
        '野魔法护盾：获得野魔法护盾'
      ]
    }
  ],
  邪术师: [
    {
      id: 'archfey',
      name: '至高妖精',
      displayName: '至高妖精',
      description: '与至高妖精建立联系，能够使用妖精魔法',
      features: [
        '妖精魔法：使用妖精魔法',
        '妖精契约：与妖精建立契约',
        '妖精祝福：获得妖精祝福'
      ],
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: '2-3级，3-4级，4-7级',
          level2: '2-7级，3-10级',
          level3: '2-13级，3-16级',
          level4: '1-19级'
        },
        maxSpellLevel: 4
      }
    },
    {
      id: 'fiend',
      name: '邪魔',
      displayName: '邪魔',
      description: '与邪魔建立联系，能够使用邪魔魔法',
      features: [
        '邪魔魔法：使用邪魔魔法',
        '邪魔契约：与邪魔建立契约',
        '邪魔力量：获得邪魔力量'
      ],
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: '2-3级，3-4级，4-7级',
          level2: '2-7级，3-10级',
          level3: '2-13级，3-16级',
          level4: '1-19级'
        },
        maxSpellLevel: 4
      }
    },
    {
      id: 'old_one',
      name: '旧日支配者',
      displayName: '旧日支配者',
      description: '与旧日支配者建立联系，能够使用禁忌魔法',
      features: [
        '禁忌魔法：使用禁忌魔法',
        '旧日契约：与旧日支配者建立契约',
        '疯狂知识：获得疯狂知识'
      ],
      spellProgression: {
        cantrips: '3-3级，4-10级',
        knownSpells: '3-3级，4-4级，5-7级，6-8级，7-10级，8-11级，9-13级，10-14级，11-16级，12-19级，13-20级',
        spellSlots: {
          level1: '2-3级，3-4级，4-7级',
          level2: '2-7级，3-10级',
          level3: '2-13级，3-16级',
          level4: '1-19级'
        },
        maxSpellLevel: 4
      }
    }
  ]
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
  return subclass?.displayName || '';
}