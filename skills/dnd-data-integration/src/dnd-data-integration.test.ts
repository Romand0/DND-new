// DND5e 权威数据源技能测试文件
import { dndDataSource } from './src/index';
import type { Character } from '@/types';

describe('DND5e 权威数据源技能', () => {
  describe('数据查询功能', () => {
    test('应该能够获取职业信息', async () => {
      const bardClass = await dndDataSource.getClass('吟游诗人');
      
      expect(bardClass).toBeDefined();
      expect(bardClass?.id).toBe('bard');
      expect(bardClass?.name).toBe('bard');
      expect(bardClass?.displayName).toBe('吟游诗人');
      expect(bardClass?.description).toContain('音乐和魔法的大师');
    });

    test('应该能够获取子职业信息', async () => {
      const loreSubclass = await dndDataSource.getSubclass('吟游诗人', 'college_of_lore');
      
      expect(loreSubclass).toBeDefined();
      expect(loreSubclass?.id).toBe('college_of_lore');
      expect(loreSubclass?.name).toBe('college_of_lore');
      expect(loreSubclass?.displayName).toBe('逸闻学院');
      expect(loreSubclass?.description).toContain('精通各种知识');
    });

    test('应该能够获取法术信息', async () => {
      const fireballSpell = await dndDataSource.getSpell('fireball');
      
      expect(fireballSpell).toBeDefined();
      expect(fireballSpell?.id).toBe('fireball');
      expect(fireballSpell?.name).toBe('fireball');
      expect(fireballSpell?.displayName).toBe('火球术');
      expect(fireballSpell?.level).toBe(3);
      expect(fireballSpell?.school).toBe('塑能');
    });

    test('应该能够获取装备信息', async () => {
      const longsword = await dndDataSource.getEquipment('longsword');
      
      expect(longsword).toBeDefined();
      expect(longsword?.id).toBe('longsword');
      expect(longsword?.name).toBe('longsword');
      expect(longsword?.displayName).toBe('长剑');
      expect(longsword?.category).toBe('武器');
      expect(longsword?.weight).toBe(3);
    });

    test('应该能够条件查询法术', async () => {
      const level3Spells = await dndDataSource.getSpells({
        level: 3,
        school: '塑能'
      });
      
      expect(Array.isArray(level3Spells)).toBe(true);
      expect(level3Spells.length).toBeGreaterThan(0);
      level3Spells.forEach(spell => {
        expect(spell.level).toBe(3);
        expect(spell.school).toBe('塑能');
      });
    });

    test('应该能够按职业查询法术', async () => {
      const bardSpells = await dndDataSource.getSpells({
        classes: ['吟游诗人']
      });
      
      expect(Array.isArray(bardSpells)).toBe(true);
      expect(bardSpells.length).toBeGreaterThan(0);
    });

    test('应该能够按装备类别查询', async () => {
      const weapons = await dndDataSource.getEquipmentByCategory('武器');
      
      expect(Array.isArray(weapons)).toBe(true);
      expect(weapons.length).toBeGreaterThan(0);
      weapons.forEach(weapon => {
        expect(weapon.category).toBe('武器');
      });
    });
  });

  describe('数据验证功能', () => {
    test('应该能够验证有效的角色数据', async () => {
      const validCharacter: Character = {
        profession: {
          class: '吟游诗人',
          subclass: 'college_of_lore'
        },
        spells: [
          { id: 'fireball' },
          { id: 'healing_word' }
        ],
        level: 1
      };

      const validation = await dndDataSource.validateCharacter(validCharacter);
      
      expect(validation).toBeDefined();
      expect(typeof validation.valid).toBe('boolean');
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
      expect(Array.isArray(validation.suggestions)).toBe(true);
    });

    test('应该能够检测无效的角色数据', async () => {
      const invalidCharacter: Character = {
        profession: {
          class: '未知职业',
          subclass: '未知子职业'
        },
        spells: [
          { id: '未知法术' }
        ],
        level: 1
      };

      const validation = await dndDataSource.validateCharacter(invalidCharacter);
      
      expect(validation).toBeDefined();
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('缓存管理功能', () => {
    test('应该能够获取缓存信息', () => {
      const cacheInfo = dndDataSource.getCacheInfo();
      
      expect(cacheInfo).toBeDefined();
      expect(typeof cacheInfo.size).toBe('number');
      expect(Array.isArray(cacheInfo.entries)).toBe(true);
    });

    test('应该能够清除缓存', async () => {
      await dndDataSource.clearCache();
      
      const cacheInfo = dndDataSource.getCacheInfo();
      expect(cacheInfo.size).toBe(0);
    });
  });

  describe('数据同步功能', () => {
    test('应该能够同步数据', async () => {
      // 注意：这是一个模拟测试，实际的数据同步需要网络连接
      await expect(dndDataSource.sync()).resolves.not.toThrow();
    });

    test('应该能够检查更新', async () => {
      const updates = await dndDataSource.checkUpdates();
      
      expect(updates).toBeDefined();
      expect(typeof updates.hasUpdates).toBe('boolean');
      expect(typeof updates.version).toBe('string');
    });
  });

  describe('错误处理', () => {
    test('应该正确处理不存在的职业', async () => {
      const unknownClass = await dndDataSource.getClass('未知职业');
      
      expect(unknownClass).toBeNull();
    });

    test('应该正确处理不存在的法术', async () => {
      const unknownSpell = await dndDataSource.getSpell('未知法术');
      
      expect(unknownSpell).toBeNull();
    });

    test('应该正确处理不存在的装备', async () => {
      const unknownEquipment = await dndDataSource.getEquipment('未知装备');
      
      expect(unknownEquipment).toBeNull();
    });
  });

  describe('性能测试', () => {
    test('缓存应该提高查询性能', async () => {
      // 第一次查询
      const startTime1 = Date.now();
      await dndDataSource.getClass('吟游诗人');
      const time1 = Date.now() - startTime1;

      // 第二次查询（应该从缓存获取）
      const startTime2 = Date.now();
      await dndDataSource.getClass('吟游诗人');
      const time2 = Date.now() - startTime2;

      // 第二次查询应该更快
      expect(time2).toBeLessThan(time1);
    });

    test('批量查询应该正常工作', async () => {
      const classes = await Promise.all([
        dndDataSource.getClass('吟游诗人'),
        dndDataSource.getClass('牧师'),
        dndDataSource.getClass('德鲁伊')
      ]);

      expect(classes).toHaveLength(3);
      expect(classes.every(cls => cls !== null)).toBe(true);
    });
  });
});

// 运行测试的命令
// npm test