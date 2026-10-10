// DND5e 权威数据源技能实现
import type { Character, Spell, EquipmentItem } from '@/types';

export interface ClassInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  hitDice: string;
  primaryAbility: string[];
  savingThrows: string[];
  skills: string[];
  subclasses: SubclassInfo[];
}

export interface SubclassInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  features: string[];
  spellProgression?: SpellProgression;
}

export interface SpellInfo {
  id: string;
  name: string;
  displayName: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string[];
  duration: string;
  description: string;
  higherLevels?: string;
  classes: string[];
  subclasses?: string[];
}

export interface EquipmentInfo {
  id: string;
  name: string;
  displayName: string;
  category: string;
  subtype: string;
  weight: number;
  packSize?: number;
  unit: string;
  price: {
    amount: number;
    unit: string;
  };
  damageDice?: string;
  damageType?: string;
  acBase?: string;
  strengthReq?: number;
  stealthDisadvantage?: boolean;
  description: string;
  properties: string[];
  tags: string[];
  source: string;
}

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

export interface DataSourceConfig {
  source: string;
  branch?: string;
  cache?: boolean;
  autoUpdate?: boolean;
  timeout?: number;
  retries?: number;
}

export class DNDDataSource {
  private config: DataSourceConfig;
  private cache: Map<string, { data: any; timestamp: number; ttl: number }>;
  private cacheTTL: number = 24 * 60 * 60 * 1000; // 24小时

  constructor(config: DataSourceConfig) {
    this.config = {
      source: 'https://github.com/DND5eChm/DND5e_chm',
      branch: 'main',
      cache: true,
      autoUpdate: true,
      timeout: 30000,
      retries: 3,
      ...config
    };
    
    this.cache = new Map();
  }

  // 获取职业信息
  async getClass(className: string): Promise<ClassInfo | null> {
    const cacheKey = `class_${className}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      // 这里应该从DND5e_chm仓库获取数据
      // 目前使用模拟数据
      const classData = await this.fetchClassData(className);
      this.setCache(cacheKey, classData);
      return classData;
    } catch (error) {
      console.error(`获取职业数据失败: ${className}`, error);
      return null;
    }
  }

  // 获取子职业信息
  async getSubclass(className: string, subclassId: string): Promise<SubclassInfo | null> {
    const cacheKey = `subclass_${className}_${subclassId}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const subclassData = await this.fetchSubclassData(className, subclassId);
      this.setCache(cacheKey, subclassData);
      return subclassData;
    } catch (error) {
      console.error(`获取子职业数据失败: ${className}.${subclassId}`, error);
      return null;
    }
  }

  // 获取法术信息
  async getSpell(spellId: string): Promise<SpellInfo | null> {
    const cacheKey = `spell_${spellId}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const spellData = await this.fetchSpellData(spellId);
      this.setCache(cacheKey, spellData);
      return spellData;
    } catch (error) {
      console.error(`获取法术数据失败: ${spellId}`, error);
      return null;
    }
  }

  // 获取装备信息
  async getEquipment(equipmentId: string): Promise<EquipmentInfo | null> {
    const cacheKey = `equipment_${equipmentId}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const equipmentData = await this.fetchEquipmentData(equipmentId);
      this.setCache(cacheKey, equipmentData);
      return equipmentData;
    } catch (error) {
      console.error(`获取装备数据失败: ${equipmentId}`, error);
      return null;
    }
  }

  // 条件查询法术
  async getSpells(options: {
    level?: number;
    school?: string;
    classes?: string[];
    subclasses?: string[];
    name?: string;
  }): Promise<SpellInfo[]> {
    const cacheKey = `spells_${JSON.stringify(options)}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const spells = await this.fetchSpellsData(options);
      this.setCache(cacheKey, spells);
      return spells;
    } catch (error) {
      console.error(`获取法术列表失败:`, error);
      return [];
    }
  }

  // 获取装备类别
  async getEquipmentByCategory(category: string): Promise<EquipmentInfo[]> {
    const cacheKey = `equipment_${category}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const equipment = await this.fetchEquipmentByCategory(category);
      this.setCache(cacheKey, equipment);
      return equipment;
    } catch (error) {
      console.error(`获取装备类别失败: ${category}`, error);
      return [];
    }
  }

  // 验证角色数据
  async validateCharacter(character: Character): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    suggestions: string[];
  }> {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };

    // 验证职业数据
    const classData = await this.getClass(character.profession?.class || '');
    if (!classData) {
      result.valid = false;
      result.errors.push(`职业数据无效: ${character.profession?.class}`);
    }

    // 验证子职业数据
    if (character.profession?.subclass) {
      const subclassData = await this.getSubclass(
        character.profession?.class || '',
        character.profession?.subclass
      );
      if (!subclassData) {
        result.valid = false;
        result.errors.push(`子职业数据无效: ${character.profession?.subclass}`);
      }
    }

    // 验证法术数据
    if (character.spells && character.spells.length > 0) {
      for (const spell of character.spells) {
        const spellData = await this.getSpell(spell.id);
        if (!spellData) {
          result.valid = false;
          result.errors.push(`法术数据无效: ${spell.id}`);
        }
      }
    }

    return result;
  }

  // 同步数据
  async sync(): Promise<void> {
    try {
      // 这里应该从DND5e_chm仓库同步最新数据
      console.log('同步DND5e数据源...');
      await this.fetchLatestData();
      console.log('数据同步完成');
    } catch (error) {
      console.error('数据同步失败:', error);
      throw error;
    }
  }

  // 检查更新
  async checkUpdates(): Promise<{
    hasUpdates: boolean;
    version?: string;
    changes?: string[];
  }> {
    // 这里应该检查DND5e_chm仓库的更新
    return {
      hasUpdates: false,
      version: '1.0.0'
    };
  }

  // 清除缓存
  async clearCache(): Promise<void> {
    this.cache.clear();
  }

  // 获取缓存状态
  getCacheInfo(): {
    size: number;
    entries: Array<{ key: string; timestamp: number; ttl: number }>;
  } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, value]) => ({
        key,
        timestamp: value.timestamp,
        ttl: value.ttl
      }))
    };
  }

  // 私有方法：从缓存获取数据
  private getFromCache(key: string): any {
    if (!this.config.cache) {
      return null;
    }

    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  // 私有方法：设置缓存
  private setCache(key: string, data: any): void {
    if (!this.config.cache) {
      return;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: this.cacheTTL
    });
  }

  // 私有方法：获取职业数据（模拟）
  private async fetchClassData(className: string): Promise<ClassInfo | null> {
    // 这里应该从DND5e_chm仓库获取真实数据
    // 目前使用模拟数据
    const mockClasses: Record<string, ClassInfo> = {
      '吟游诗人': {
        id: 'bard',
        name: 'bard',
        displayName: '吟游诗人',
        description: '吟游诗人是音乐和魔法的大师，他们通过歌曲和故事来影响他人。',
        hitDice: 'd8',
        primaryAbility: ['魅力', '敏捷'],
        savingThrows: ['魅力', '敏捷'],
        skills: ['表演', '说服', '洞察', '察觉'],
        levels: [],
        subclasses: []
      },
      '牧师': {
        id: 'cleric',
        name: 'cleric',
        displayName: '牧师',
        description: '牧师是神明的仆人，他们拥有神圣的力量来治疗和战斗。',
        hitDice: 'd8',
        primaryAbility: ['魅力', '体质'],
        savingThrows: ['魅力', '体质'],
        skills: ['宗教', '医学', '洞察', '历史'],
        levels: [],
        subclasses: []
      }
    };

    return mockClasses[className] || null;
  }

  // 私有方法：获取子职业数据（模拟）
  private async fetchSubclassData(className: string, subclassId: string): Promise<SubclassInfo | null> {
    // 这里应该从DND5e_chm仓库获取真实数据
    // 目前使用模拟数据
    const mockSubclasses: Record<string, SubclassInfo[]> = {
      '吟游诗人': [
        {
          id: 'college_of_lore',
          name: 'college_of_lore',
          displayName: '逸闻学院',
          description: '逸闻学院的诗人精通各种知识，能够学习和记忆更多的法术。',
          features: ['逸闻学识', '魔法秘闻', '秘闻复诵', '秘闻大师']
        }
      ]
    };

    const subclasses = mockSubclasses[className] || [];
    return subclasses.find(sub => sub.id === subclassId) || null;
  }

  // 私有方法：获取法术数据（模拟）
  private async fetchSpellData(spellId: string): Promise<SpellInfo | null> {
    // 这里应该从DND5e_chm仓库获取真实数据
    // 目前使用模拟数据
    const mockSpells: Record<string, SpellInfo> = {
      'fireball': {
        id: 'fireball',
        name: 'fireball',
        displayName: '火球术',
        level: 3,
        school: '塑能',
        castingTime: '1动作',
        range: '150尺',
        components: ['姿势', '言语', '材料'],
        duration: '瞬时',
        description: '一团火焰在指定点爆炸，对区域内所有生物造成火焰伤害。',
        higherLevels: '当你使用3环以上的法术位施放此法术时，每提升一环伤害增加1d6。',
        classes: ['法师', '术士', '邪术师']
      }
    };

    return mockSpells[spellId] || null;
  }

  // 私有方法：获取装备数据（模拟）
  private async fetchEquipmentData(equipmentId: string): Promise<EquipmentInfo | null> {
    // 这里应该从DND5e_chm仓库获取真实数据
    // 目前使用模拟数据
    const mockEquipment: Record<string, EquipmentInfo> = {
      'longsword': {
        id: 'longsword',
        name: 'longsword',
        displayName: '长剑',
        category: '武器',
        subtype: '单手武器',
        weight: 3,
        unit: '磅',
        price: { amount: 15, unit: 'gp' },
        damageDice: '1d8',
        damageType: '挥砍',
        description: '一把优雅的单手剑，适合战士和游侠使用。',
        properties: ['灵巧', '挥砍', '双手', '轻量'],
        tags: ['武器', '单手武器'],
        source: '玩家手册'
      }
    };

    return mockEquipment[equipmentId] || null;
  }

  // 私有方法：获取法术列表（模拟）
  private async fetchSpellsData(options: any): Promise<SpellInfo[]> {
    // 这里应该从DND5e_chm仓库获取真实数据
    // 目前使用模拟数据
    const mockSpells: SpellInfo[] = [
      {
        id: 'fireball',
        name: 'fireball',
        displayName: '火球术',
        level: 3,
        school: '塑能',
        castingTime: '1动作',
        range: '150尺',
        components: ['姿势', '言语', '材料'],
        duration: '瞬时',
        description: '一团火焰在指定点爆炸，对区域内所有生物造成火焰伤害。',
        higherLevels: '当你使用3环以上的法术位施放此法术时，每提升一环伤害增加1d6。',
        classes: ['法师', '术士', '邪术师']
      }
    ];

    // 根据选项过滤法术
    return mockSpells.filter(spell => {
      if (options.level && spell.level !== options.level) {
        return false;
      }
      if (options.school && spell.school !== options.school) {
        return false;
      }
      if (options.classes && !options.classes.includes(spell.name)) {
        return false;
      }
      if (options.name && !spell.displayName.includes(options.name)) {
        return false;
      }
      return true;
    });
  }

  // 私有方法：获取装备类别（模拟）
  private async fetchEquipmentByCategory(category: string): Promise<EquipmentInfo[]> {
    // 这里应该从DND5e_chm仓库获取真实数据
    // 目前使用模拟数据
    const mockEquipment: EquipmentInfo[] = [
      {
        id: 'longsword',
        name: 'longsword',
        displayName: '长剑',
        category: '武器',
        subtype: '单手武器',
        weight: 3,
        unit: '磅',
        price: { amount: 15, unit: 'gp' },
        damageDice: '1d8',
        damageType: '挥砍',
        description: '一把优雅的单手剑，适合战士和游侠使用。',
        properties: ['灵巧', '挥砍', '双手', '轻量'],
        tags: ['武器', '单手武器'],
        source: '玩家手册'
      }
    ];

    return mockEquipment.filter(item => item.category === category);
  }

  // 私有方法：获取最新数据（模拟）
  private async fetchLatestData(): Promise<void> {
    // 这里应该从DND5e_chm仓库获取最新数据
    // 目前模拟同步过程
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// 创建默认数据源实例
export const dndDataSource = new DNDDataSource({
  source: 'https://github.com/DND5eChm/DND5e_chm',
  cache: true,
  autoUpdate: true
});