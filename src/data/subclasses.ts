// DM Toolkit - 子职业配置数据
// 内置各职业的子职业选项，3级角色可以选择

export interface SubclassOption {
  id: string;
  name: string;
  displayName: string;
  description: string;
  features: string[]; // 主要特性描述
  prerequisites?: string[]; // 前置要求
}

export interface ClassSubclasses {
  [className: string]: SubclassOption[];
}

// D&D 5e 主要职业的子职业配置
export const SUBCLASSES_DATA: ClassSubclasses = {
  // 战士 (Fighter)
  '战士': [
    {
      id: 'weapon-master',
      name: '武器大师',
      displayName: '武器大师',
      description: '专注于特定武器类型的战斗专家，掌握各种武器技巧',
      features: [
        '武器专精：选择一种武器类型，获得额外加值',
        '战斗风格：选择一种战斗风格增强战斗能力',
        '武器技巧：掌握独特的武器使用方法'
      ]
    },
    {
      id: 'battle-master',
      name: '战役大师',
      displayName: '战役大师',
      description: '精通战术和战斗技巧的战术专家',
      features: [
        '战术指令：可以给队友提供战术指令',
        '战斗技巧：掌握多种战斗技巧',
        '战术洞察：能够分析战场局势'
      ]
    },
    {
      id: 'eldritch-knight',
      name: '奥术骑士',
      displayName: '奥术骑士',
      description: '结合战士的战斗技巧与法术施法的特殊战士',
      features: [
        '战斗法术：可以学习并施放少量法术',
        '战士法术：将战士技巧与法术结合',
        '奥术护甲：获得魔法护甲能力'
      ]
    }
  ],
  
  // 法师 (Wizard)
  '法师': [
    {
      id: 'abjuration',
      name: '防护系',
      displayName: '防护系',
      description: '专注于防护和防护法术的大师',
      features: [
        '防护专精：防护法术效果增强',
        '防护护盾：获得额外的防护能力',
        '反制法术：可以反制敌人的法术'
      ]
    },
    {
      id: 'conjuration',
      name: '召唤系',
      displayName: '召唤系',
      description: '精通召唤和创造法术的专家',
      features: [
        '召唤增强：召唤生物效果增强',
        '创造专精：创造法术效果增强',
        '位面通道：可以打开位面通道'
      ]
    },
    {
      id: 'divination',
      name: '预言系',
      displayName: '预言系',
      description: '能够预见未来和获得神秘知识的智者',
      features: [
        '预知能力：可以预见未来事件',
        '洞察真相：看穿谎言和幻象',
        '命运指引：获得命运指引'
      ]
    },
    {
      id: 'enchantment',
      name: '惑控系',
      displayName: '惑控系',
      description: '精通影响和操控他人心智的大师',
      features: [
        '惑控专精：惑控法术效果增强',
        '心灵控制：可以控制他人心智',
        '魅惑增强：魅惑法术效果增强'
      ]
    },
    {
      id: 'evocation',
      name: '塑能系',
      displayName: '塑能系',
      description: '掌握纯粹能量法术的毁灭大师',
      features: [
        '塑能专精：塑能法术效果增强',
        '能量爆发：可以释放强大的能量',
        '元素掌控：掌握元素能量'
      ]
    },
    {
      id: 'illusion',
      name: '幻术系',
      displayName: '幻术系',
      description: '创造幻象和欺骗感官的大师',
      features: [
        '幻术专精：幻术法术效果增强',
        '真实幻象：创造难以分辨的幻象',
        '感官欺骗：欺骗他人感官'
      ]
    },
    {
      id: 'necromancy',
      name: '死灵系',
      displayName: '死灵系',
      description: '操控生命和死亡力量的黑暗大师',
      features: [
        '死灵专精：死灵法术效果增强',
        '亡灵操控：可以操控亡灵',
        '生命汲取：可以汲取生命能量'
      ]
    },
    {
      id: 'transmutation',
      name: '变化系',
      displayName: '变化系',
      description: '改变物质形态和属性的变形大师',
      features: [
        '变化专精：变化法术效果增强',
        '物质变形：可以改变物质形态',
        '属性增强：可以增强物体属性'
      ]
    }
  ],
  
  // 游侠 (Ranger)
  '游侠': [
    {
      id: 'beast-master',
      name: '野兽大师',
      displayName: '野兽大师',
      description: '与野兽建立特殊联系的野外生存专家',
      features: [
        '野兽伙伴：获得野兽伙伴',
        '野兽沟通：可以与野兽沟通',
        '野兽增强：增强野兽伙伴能力'
      ]
    },
    {
      id: 'hunter',
      name: '猎人',
      displayName: '猎人',
      description: '追踪和猎杀目标的专家',
      features: [
        '猎杀专精：对抗特定敌人加成',
        '陷阱大师：擅长设置和使用陷阱',
        '追踪大师：追踪能力增强'
      ]
    },
    {
      id: 'gloom-stalker',
      name: '幽暗追踪者',
      displayName: '幽暗追踪者',
      description: '擅长在黑暗中作战的游侠',
      features: [
        '黑暗视觉：在黑暗中视觉增强',
        '幽暗猎手：在黑暗中作战加成',
        '恐惧掌控：可以制造恐惧'
      ]
    }
  ],
  
  // 牧师 (Cleric)
  '牧师': [
    {
      id: 'life',
      name: '生命领域',
      displayName: '生命领域',
      description: '专注于治疗和生命力量的牧师',
      features: [
        '生命专精：治疗法术效果增强',
        '生命恢复：增强恢复能力',
        '生命守护：保护生命'
      ]
    },
    {
      id: 'light',
      name: '光明领域',
      displayName: '光明领域',
      description: '专注于光明和驱邪的牧师',
      features: [
        '光明专精：光明法术效果增强',
        '驱邪专家：对抗邪恶生物加成',
        '光明护盾：提供光明护盾'
      ]
    },
    {
      id: 'knowledge',
      name: '知识领域',
      displayName: '知识领域',
      description: '专注于知识和智慧的牧师',
      features: [
        '知识专精：知识相关法术增强',
        '智慧启发：增强智慧属性',
        '记忆掌握：增强记忆能力'
      ]
    },
    {
      id: 'tempest',
      name: '风暴领域',
      displayName: '风暴领域',
      description: '掌控风暴和雷电力量的牧师',
      features: [
        '风暴专精：风暴法术效果增强',
        '雷电掌控：掌控雷电力量',
        '风暴守护：风暴护盾'
      ]
    },
    {
      id: 'trickery',
      name: '诡诈领域',
      displayName: '诡诈领域',
      description: '专注于诡计和欺骗的牧师',
      features: [
        '诡诈专精：诡诈法术效果增强',
        '欺骗大师：擅长欺骗',
        '阴影掌控：掌控阴影'
      ]
    },
    {
      id: 'war',
      name: '战争领域',
      displayName: '战争领域',
      description: '专注于战斗和战争的牧师',
      features: [
        '战争专精：战斗法术效果增强',
        '战争狂热：增强战斗能力',
        '战争祝福：提供战争祝福'
      ]
    }
  ],
  
  // 盗贼 (Rogue)
  '盗贼': [
    {
      id: 'thief',
      name: '盗贼',
      displayName: '盗贼',
      description: '传统的偷窃和开锁专家',
      features: [
        '偷窃专精：偷窃技能增强',
        '开锁大师：开锁能力增强',
        '悄无声息：移动更加隐蔽'
      ]
    },
    {
      id: 'assassin',
      name: '刺客',
      displayName: '刺客',
      description: '精通暗杀和偷袭的杀手',
      features: [
        '暗杀专精：暗杀能力增强',
        '偷袭大师：偷袭加成',
        '毒药专家：擅长使用毒药'
      ]
    },
    {
      id: 'arcane-trickster',
      name: '奥术诡术师',
      displayName: '奥术诡术师',
      description: '结合盗贼技巧与法术施法的特殊盗贼',
      features: [
        '奥术法术：可以学习少量法术',
        '诡术法术：将诡术与法术结合',
        '心灵操控：操控他人心智'
      ]
    }
  ],
  
  // 吟游诗人 (Bard)
  '吟游诗人': [
    {
      id: 'valor',
      name: '勇吟诗人',
      displayName: '勇吟诗人',
      description: '专注于战斗和英雄诗篇的吟游诗人',
      features: [
        '勇吟专精：战斗歌曲效果增强',
        '英雄诗篇：鼓舞英雄事迹',
        '战斗艺术：结合音乐与战斗'
      ]
    },
    {
      id: 'lore',
      name: '博吟诗人',
      displayName: '博吟诗人',
      description: '专注于知识和魔法的吟游诗人',
      features: [
        '博吟专精：知识歌曲效果增强',
        '魔法艺术：结合音乐与魔法',
        '知识掌握：增强知识能力'
      ]
    },
    {
      id: 'elegy',
      name: '悲吟诗人',
      displayName: '悲吟诗人',
      description: '专注于悲伤和治疗的歌曲大师',
      features: [
        '悲吟专精：悲伤歌曲效果增强',
        '治疗艺术：结合音乐与治疗',
        '情感操控：操控他人情感'
      ]
    }
  ],
  
  // 德鲁伊 (Druid)
  '德鲁伊': [
    {
      id: 'circle-of-the-land',
      name: '自然之环',
      displayName: '自然之环',
      description: '与特定自然环境联系紧密的德鲁伊',
      features: [
        '自然专精：特定环境法术增强',
        '自然伙伴：获得自然伙伴',
        '环境掌控：掌控特定环境'
      ]
    },
    {
      id: 'circle-of-the-moon',
      name: '月亮之环',
      displayName: '月亮之环',
      description: '擅长变形和野性战斗的德鲁伊',
      features: [
        '变形专精：变形能力增强',
        '野性战斗：野性战斗加成',
        '野性伙伴：获得野性伙伴'
      ]
    },
    {
      id: 'circle-of-stars',
      name: '星辰之环',
      displayName: '星辰之环',
      description: '与星辰和宇宙联系的神秘德鲁伊',
      features: [
        '星辰专精：星辰法术效果增强',
        '预言能力：预见未来',
        '宇宙掌控：掌控宇宙力量'
      ]
    }
  ],
  
  // 术士 (Sorcerer)
  '术士': [
    {
      id: 'draconic-bloodline',
      name: '龙族血脉',
      displayName: '龙族血脉',
      description: '拥有龙族血统的术士',
      features: [
        '龙族专精：龙族法术效果增强',
        '龙族护甲：获得龙族护甲',
        '龙族呼吸：获得龙族呼吸能力'
      ]
    },
    {
      id: 'wild-magic',
      name: '野魔法',
      displayName: '野魔法',
      description: '掌控不稳定野魔法的术士',
      features: [
        '野魔法爆发：随机魔法爆发',
        '野魔法掌控：掌控野魔法',
        '野魔法增强：野魔法效果增强'
      ]
    },
    {
      id: 'shadow-magic',
      name: '暗影魔法',
      displayName: '暗影魔法',
      description: '掌控暗影和阴影力量的术士',
      features: [
        '暗影专精：暗影法术效果增强',
        '暗影移动：暗影移动能力',
        '暗影掌控：掌控暗影力量'
      ]
    }
  ]
};

// 辅助函数：获取职业的可用子职业
export function getAvailableSubclasses(className: string): SubclassOption[] {
  return SUBCLASSES_DATA[className] || [];
}

// 辅助函数：检查角色是否可以选择子职业
export function canChooseSubclass(character: {
  level: number;
  profession: { class: string; subclass?: string };
}): boolean {
  return character.level >= 3 && !character.profession.subclass;
}

// 辅助函数：检查角色是否可以更换子职业
export function canChangeSubclass(character: {
  level: number;
  profession: { class: string; subclass?: string };
}): boolean {
  return character.level >= 3 && !!character.profession.subclass;
}