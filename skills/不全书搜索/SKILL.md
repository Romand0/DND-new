# 不全书搜索

## 技能描述
让 agent 在工作时能够访问和使用 DND5e_chm 仓库作为标准数据源，提供权威的 D&D 5e 中文数据参考，实现"不全书"式的内容搜索和查询。

## 核心功能

### 1. 数据源访问
- **在线数据获取**: 从 https://github.com/DND5eChm/DND5e_chm 获取最新数据
- **本地缓存**: 缓存已获取的数据，提高访问速度
- **数据版本管理**: 支持特定版本的数据访问

### 2. 数据查询
- **职业查询**: 查询职业描述、子职业、特性等
- **法术查询**: 查询法术信息、等级、施法时间等
- **装备查询**: 查询装备属性、价格、效果等
- **怪物查询**: 查询怪物数据、能力、特殊属性等

### 3. 数据验证
- **规则验证**: 验证角色数据是否符合 DND 5e 规则
- **数据一致性**: 确保项目数据与权威数据源一致
- **错误检测**: 检测数据中的错误和不一致

### 4. 数据对比
- **版本对比**: 对比不同版本的数据变化
- **项目对比**: 对比项目数据与权威数据源的差异
- **规则更新**: 获取最新的规则更新

## 使用方法

### 基本查询
```typescript
// 查询职业信息
const bardInfo = await dndDataSource.getClass('吟游诗人');

// 查询子职业
const loreSubclass = await dndDataSource.getSubclass('吟游诗人', '逸闻学院');

// 查询法术
const fireballSpell = await dndDataSource.getSpell('火球术');

// 查询装备
const swordEquipment = await dndDataSource.getEquipment('长剑');
```

### 高级查询
```typescript
// 条件查询法术
const level3Spells = await dndDataSource.getSpells({
  level: 3,
  school: '塑能'
});

// 查询特定职业的法术
const bardSpells = await dndDataSource.getSpells({
  classes: ['吟游诗人']
});

// 查询装备类别
const weapons = await dndDataSource.getEquipmentByCategory('武器');
```

### 数据验证
```typescript
// 验证角色数据
const validation = await dndDataSource.validateCharacter(characterData);

// 验证法术列表
const spellValidation = await dndDataSource.validateSpells(spellList);

// 检查数据一致性
const consistency = await dndDataSource.checkConsistency(projectData);
```

## 数据接口

### 职业数据接口
```typescript
interface ClassInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  hitDice: string;
  primaryAbility: string[];
  savingThrows: string[];
  skills: string[];
  levels: ClassLevel[];
  subclasses: SubclassInfo[];
}
```

### 子职业数据接口
```typescript
interface SubclassInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  features: string[];
  spellProgression?: SpellProgression;
}
```

### 法术数据接口
```typescript
interface SpellInfo {
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
```

### 装备数据接口
```typescript
interface EquipmentInfo {
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
```

## 集成方式

### 1. 数据源初始化
```typescript
// 初始化数据源
const dndDataSource = new DNDDataSource({
  source: 'https://github.com/DND5eChm/DND5e_chm',
  cache: true,
  autoUpdate: true
});
```

### 2. 在 agent 中使用
```typescript
// 在 agent 任务中使用
async function createCharacter() {
  // 获取权威的职业数据
  const classData = await dndDataSource.getClass('吟游诗人');
  
  // 获取子职业信息
  const subclassData = await dndDataSource.getSubclass('吟游诗人', '逸闻学院');
  
  // 获取法术列表
  const spells = await dndDataSource.getSpells({
    classes: ['吟游诗人'],
    level: 1
  });
  
  // 使用权威数据创建角色
  return {
    class: classData,
    subclass: subclassData,
    spells: spells
  };
}
```

### 3. 数据验证和修复
```typescript
// 验证和修复项目数据
async function validateAndFixProject() {
  // 获取项目数据
  const projectData = getProjectData();
  
  // 验证数据
  const validation = await dndDataSource.validateProject(projectData);
  
  // 修复数据
  if (validation.errors.length > 0) {
    const fixedData = await dndDataSource.fixData(projectData);
    return fixedData;
  }
  
  return projectData;
}
```

## 数据同步

### 1. 自动同步
```typescript
// 设置自动同步
const dndDataSource = new DNDDataSource({
  source: 'https://github.com/DND5eChm/DND5e_chm',
  autoSync: true,
  syncInterval: '24h'
});
```

### 2. 手动同步
```typescript
// 手动同步数据
await dndDataSource.sync();

// 检查更新
const updates = await dndDataSource.checkUpdates();

// 应用更新
await dndDataSource.applyUpdates(updates);
```

## 缓存管理

### 1. 缓存配置
```typescript
const dndDataSource = new DNDDataSource({
  cache: {
    enabled: true,
    ttl: '7d',
    maxSize: '100MB'
  }
});
```

### 2. 缓存操作
```typescript
// 清除缓存
await dndDataSource.clearCache();

// 查看缓存状态
const cacheInfo = await dndDataSource.getCacheInfo();

// 预热缓存
await dndDataSource.warmCache();
```

## 错误处理

### 1. 错误类型
```typescript
enum DataSourceError {
  NETWORK_ERROR = 'NETWORK_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SYNC_ERROR = 'SYNC_ERROR'
}
```

### 2. 错误处理
```typescript
try {
  const classData = await dndDataSource.getClass('吟游诗人');
} catch (error) {
  if (error instanceof DataSourceError) {
    switch (error.type) {
      case DataSourceError.NETWORK_ERROR:
        console.error('网络错误:', error.message);
        break;
      case DataSourceError.DATA_NOT_FOUND:
        console.error('数据未找到:', error.message);
        break;
      default:
        console.error('未知错误:', error.message);
    }
  }
}
```

## 性能优化

### 1. 数据预加载
```typescript
// 预加载常用数据
await dndDataSource.preload(['classes', 'spells', 'equipment']);
```

### 2. 查询优化
```typescript
// 使用索引查询
const classData = await dndDataSource.getClassById('bard');

// 批量查询
const classes = await dndDataSource.getClasses(['bard', 'cleric', 'druid']);
```

### 3. 数据压缩
```typescript
// 启用数据压缩
const dndDataSource = new DNDDataSource({
  compression: true,
  compressionLevel: 6
});
```

## 配置选项

### 1. 基本配置
```typescript
const config = {
  source: 'https://github.com/DND5eChm/DND5e_chm',
  branch: 'main',
  cache: true,
  autoUpdate: true,
  compression: true,
  timeout: 30000,
  retries: 3
};
```

### 2. 高级配置
```typescript
const advancedConfig = {
  source: {
    type: 'git',
    url: 'https://github.com/DND5eChm/DND5e_chm',
    branch: 'main',
    commitHash: 'abc123'
  },
  cache: {
    enabled: true,
    ttl: '7d',
    maxSize: '100MB',
    compression: true
  },
  parsing: {
    encoding: 'gbk',
    removeComments: true,
    removeScript: true,
    removeStyle: true
  },
  validation: {
    strict: true,
    fixErrors: true,
    backup: true
  }
};
```

## 使用示例

### 1. 创建角色
```typescript
async function createCharacter() {
  // 获取权威的职业数据
  const bardClass = await dndDataSource.getClass('吟游诗人');
  
  // 获取子职业
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
    spells: level1Spells,
    features: [...bardClass.features, ...loreSubclass.features]
  };
}
```

### 2. 验证角色数据
```typescript
async function validateCharacter(character) {
  // 验证职业数据
  const classData = await dndDataSource.getClass(character.profession.class);
  
  // 验证子职业数据
  const subclassData = await dndDataSource.getSubclass(
    character.profession.class,
    character.profession.subclass
  );
  
  // 验证法术数据
  const spellValidation = await dndDataSource.validateSpells(character.spells);
  
  return {
    valid: true,
    class: classData,
    subclass: subclassData,
    spells: spellValidation
  };
}
```

### 3. 数据修复
```typescript
async function fixCharacterData(character) {
  // 获取权威数据
  const authoritativeData = await dndDataSource.getClass(character.profession.class);
  
  // 修复职业数据
  const fixedClass = {
    ...character.profession,
    displayName: authoritativeData.displayName,
    description: authoritativeData.description
  };
  
  // 修复子职业数据
  const fixedSubclass = await dndDataSource.getSubclass(
    fixedClass.class,
    fixedClass.subclass
  );
  
  return {
    ...character,
    profession: fixedClass,
    subclass: fixedSubclass
  };
}
```

## 监控和日志

### 1. 监控指标
```typescript
// 获取监控数据
const metrics = await dndDataSource.getMetrics();
console.log({
  totalQueries: metrics.queries.total,
  cacheHits: metrics.queries.cacheHits,
  cacheMisses: metrics.queries.cacheMisses,
  averageResponseTime: metrics.performance.averageResponseTime,
  errorRate: metrics.errors.rate
});
```

### 2. 日志记录
```typescript
// 设置日志级别
dndDataSource.setLogLevel('debug');

// 获取日志
const logs = await dndDataSource.getLogs({
  level: 'error',
  since: '2024-01-01'
});
```

## 安全考虑

### 1. 数据验证
```typescript
// 验证数据完整性
const integrity = await dndDataSource.verifyDataIntegrity();

// 检查数据签名
const signature = await dndDataSource.verifyDataSignature();
```

### 2. 访问控制
```typescript
// 设置访问权限
const dndDataSource = new DNDDataSource({
  accessControl: {
    allowedMethods: ['getClass', 'getSpell', 'getEquipment'],
    rateLimit: 1000,
    ipWhitelist: ['127.0.0.1']
  }
});
```

## 最佳实践

### 1. 数据缓存
```typescript
// 合理使用缓存
const dndDataSource = new DNDDataSource({
  cache: {
    enabled: true,
    ttl: '24h',
    maxSize: '50MB'
  }
});
```

### 2. 错误处理
```typescript
// 完善的错误处理
try {
  const data = await dndDataSource.getClass('吟游诗人');
} catch (error) {
  // 记录错误
  await dndDataSource.logError(error);
  
  // 重试机制
  const retryData = await dndDataSource.retry('getClass', ['吟游诗人']);
  
  return retryData;
}
```

### 3. 性能优化
```typescript
// 批量查询
const classes = await dndDataSource.getClasses(['吟游诗人', '牧师', '德鲁伊']);

// 预加载常用数据
await dndDataSource.preload(['classes', 'spells']);
```

## 故障排除

### 1. 常见问题
```typescript
// 检查数据源状态
const status = await dndDataSource.checkStatus();

// 检查缓存状态
const cacheStatus = await dndDataSource.checkCacheStatus();

// 检查网络连接
const networkStatus = await dndDataSource.checkNetworkStatus();
```

### 2. 调试工具
```typescript
// 启用调试模式
dndDataSource.setDebugMode(true);

// 获取调试信息
const debugInfo = await dndDataSource.getDebugInfo();

// 导出调试数据
await dndDataSource.exportDebugData('./debug.json');
```

## 更新和维护

### 1. 数据更新
```typescript
// 检查更新
const updates = await dndDataSource.checkUpdates();

// 应用更新
await dndDataSource.applyUpdates(updates);

// 回滚更新
await dndDataSource.rollbackUpdate('v1.0.0');
```

### 2. 维护操作
```typescript
// 清理缓存
await dndDataSource.cleanupCache();

// 优化数据库
await dndDataSource.optimizeDatabase();

// 备份数据
await dndDataSource.backupData('./backup');
```