# DND5e 权威数据源技能使用示例

本示例展示如何在 agent 中使用 DND5e 权威数据源技能来访问和使用 DND5e_chm 仓库的权威数据。

## 基本使用

### 1. 导入数据源
```typescript
import { dndDataSource } from '@/skills/dnd-data-integration/src/index';
```

### 2. 查询职业信息
```typescript
// 获取吟游诗人的权威数据
const bardClass = await dndDataSource.getClass('吟游诗人');
console.log(bardClass);
/*
{
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
}
*/
```

### 3. 查询子职业信息
```typescript
// 获取逸闻学院的子职业信息
const loreSubclass = await dndDataSource.getSubclass('吟游诗人', '逸闻学院');
console.log(loreSubclass);
/*
{
  id: 'college_of_lore',
  name: 'college_of_lore',
  displayName: '逸闻学院',
  description: '逸闻学院的诗人精通各种知识，能够学习和记忆更多的法术。',
  features: ['逸闻学识', '魔法秘闻', '秘闻复诵', '秘闻大师']
}
*/
```

### 4. 查询法术信息
```typescript
// 获取火球术的权威数据
const fireballSpell = await dndDataSource.getSpell('fireball');
console.log(fireballSpell);
/*
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
*/
```

### 5. 查询装备信息
```typescript
// 获取长剑的权威数据
const longsword = await dndDataSource.getEquipment('longsword');
console.log(longsword);
/*
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
*/
```

## 高级查询

### 1. 条件查询法术
```typescript
// 查询所有3级塑能系法术
const level3EvocationSpells = await dndDataSource.getSpells({
  level: 3,
  school: '塑能'
});
console.log(level3EvocationSpells);
```

### 2. 按职业查询法术
```typescript
// 查询吟游诗人可以学习的所有法术
const bardSpells = await dndDataSource.getSpells({
  classes: ['吟游诗人']
});
console.log(bardSpells);
```

### 3. 按装备类别查询
```typescript
// 查询所有武器类装备
const weapons = await dndDataSource.getEquipmentByCategory('武器');
console.log(weapons);
```

## 数据验证

### 1. 验证角色数据
```typescript
// 验证角色数据是否符合权威数据源
const character = {
  profession: {
    class: '吟游诗人',
    subclass: 'college_of_lore'
  },
  spells: [
    { id: 'fireball' },
    { id: 'healing_word' }
  ]
};

const validation = await dndDataSource.validateCharacter(character);
console.log(validation);
/*
{
  valid: true,
  errors: [],
  warnings: [],
  suggestions: []
}
*/
```

### 2. 处理验证结果
```typescript
if (!validation.valid) {
  console.error('角色数据验证失败:', validation.errors);
  // 根据错误信息修复数据
} else {
  console.log('角色数据验证通过');
}
```

## 数据同步

### 1. 手动同步数据
```typescript
// 从DND5e_chm仓库同步最新数据
await dndDataSource.sync();
console.log('数据同步完成');
```

### 2. 检查更新
```typescript
// 检查是否有数据更新
const updates = await dndDataSource.checkUpdates();
console.log('更新信息:', updates);
/*
{
  hasUpdates: true,
  version: '1.1.0',
  changes: ['新增了3个法术', '修正了装备描述']
}
*/
```

### 3. 应用更新
```typescript
if (updates.hasUpdates) {
  await dndDataSource.sync();
  console.log('已应用最新更新');
}
```

## 缓存管理

### 1. 查看缓存状态
```typescript
// 获取缓存信息
const cacheInfo = dndDataSource.getCacheInfo();
console.log('缓存信息:', cacheInfo);
/*
{
  size: 5,
  entries: [
    { key: 'class_吟游诗人', timestamp: 1234567890, ttl: 86400000 },
    { key: 'spell_fireball', timestamp: 1234567890, ttl: 86400000 }
  ]
}
*/
```

### 2. 清除缓存
```typescript
// 清除所有缓存
await dndDataSource.clearCache();
console.log('缓存已清除');
```

## 错误处理

### 1. 基本错误处理
```typescript
try {
  const classData = await dndDataSource.getClass('未知职业');
  console.log(classData);
} catch (error) {
  console.error('获取职业数据失败:', error);
}
```

### 2. 详细的错误处理
```typescript
try {
  const spellData = await dndDataSource.getSpell('未知法术');
  if (!spellData) {
    console.warn('法术数据不存在');
    // 可以尝试从其他数据源获取
  }
} catch (error) {
  console.error('获取法术数据失败:', error);
  // 可以记录错误日志或重试
}
```

## 性能优化

### 1. 批量查询
```typescript
// 批量查询多个职业
const classes = await Promise.all([
  dndDataSource.getClass('吟游诗人'),
  dndDataSource.getClass('牧师'),
  dndDataSource.getClass('德鲁伊')
]);
console.log(classes);
```

### 2. 预加载常用数据
```typescript
// 预加载常用数据
const commonSpells = await dndDataSource.getSpells({
  level: 1,
  classes: ['吟游诗人', '牧师', '德鲁伊']
});
console.log('已预加载1级法术');
```

## 在 agent 中的实际应用

### 1. 创建角色
```typescript
async function createCharacter() {
  // 获取权威的职业数据
  const bardClass = await dndDataSource.getClass('吟游诗人');
  
  // 获取子职业信息
  const loreSubclass = await dndDataSource.getSubclass('吟游诗人', '逸闻学院');
  
  // 获取1级法术
  const level1Spells = await dndDataSource.getSpells({
    level: 1,
    classes: ['吟游诗人']
  });
  
  // 创建角色数据
  return {
    profession: {
      class: bardClass.id,
      subclass: loreSubclass.id
    },
    spells: level1Spells.slice(0, 4), // 吟游诗人1级知道4个法术
    features: [...bardClass.features, ...loreSubclass.features]
  };
}
```

### 2. 验证和修复角色数据
```typescript
async function validateAndFixCharacter(character) {
  // 验证角色数据
  const validation = await dndDataSource.validateCharacter(character);
  
  if (!validation.valid) {
    console.error('角色数据验证失败:', validation.errors);
    
    // 修复数据
    const fixedCharacter = {
      ...character,
      profession: {
        class: validation.class?.id || character.profession.class,
        subclass: validation.subclass?.id || character.profession.subclass
      }
    };
    
    return fixedCharacter;
  }
  
  return character;
}
```

### 3. 生成角色报告
```typescript
async function generateCharacterReport(character) {
  // 获取权威数据
  const classData = await dndDataSource.getClass(character.profession.class);
  const subclassData = await dndDataSource.getSubclass(
    character.profession.class,
    character.profession.subclass
  );
  
  // 生成报告
  const report = {
    class: classData.displayName,
    subclass: subclassData.displayName,
    description: `${classData.description} ${subclassData.description}`,
    features: [...classData.features, ...subclassData.features],
    spells: character.spells.map(spell => spell.name).join(', '),
    validation: await dndDataSource.validateCharacter(character)
  };
  
  return report;
}
```

## 最佳实践

### 1. 合理使用缓存
```typescript
// 启用缓存以提高性能
const dndDataSource = new DNDDataSource({
  source: 'https://github.com/DND5eChm/DND5e_chm',
  cache: true,
  autoUpdate: true
});
```

### 2. 错误重试机制
```typescript
async function fetchWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`操作失败，重试 ${i + 1}/${maxRetries}`, error);
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  
  throw lastError;
}

// 使用重试机制
const bardClass = await fetchWithRetry(() => 
  dndDataSource.getClass('吟游诗人')
);
```

### 3. 数据验证和清理
```typescript
async function ensureDataQuality(data) {
  // 验证数据完整性
  const validation = await dndDataSource.validateCharacter(data);
  
  if (!validation.valid) {
    console.warn('数据验证失败，尝试修复:', validation.errors);
    
    // 清理和修复数据
    const cleanedData = {
      ...data,
      profession: {
        class: validation.class?.id || data.profession.class,
        subclass: validation.subclass?.id || data.profession.subclass
      }
    };
    
    return cleanedData;
  }
  
  return data;
}
```

## 总结

DND5e 权威数据源技能为 agent 提供了访问 DND5e_chm 仓库权威数据的能力。通过这个技能，agent 可以：

1. 查询权威的职业、法术、装备数据
2. 验证项目数据的完整性和正确性
3. 与权威数据源保持同步
4. 提供高质量的数据参考

这个技能是 DND 5e DM Toolkit 的重要组成部分，确保了项目数据的权威性和准确性。