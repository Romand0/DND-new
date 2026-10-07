# DND5e 权威数据源技能

## 简介

DND5e 权威数据源技能是一个让 agent 在工作时能够访问和使用 DND5e_chm 仓库作为标准数据源的技能。它提供了权威的 D&D 5e 中文数据参考，确保项目数据的准确性和权威性。

## 功能特性

### 🔍 数据查询
- **职业查询**: 查询职业描述、子职业、特性等
- **法术查询**: 查询法术信息、等级、施法时间等
- **装备查询**: 查询装备属性、价格、效果等
- **条件查询**: 支持按等级、学派、职业等条件查询

### ✅ 数据验证
- **角色验证**: 验证角色数据是否符合 DND 5e 规则
- **数据一致性**: 确保项目数据与权威数据源一致
- **错误检测**: 检测数据中的错误和不一致

### 🔄 数据同步
- **自动同步**: 定期检查数据更新
- **手动同步**: 手动触发数据更新
- **版本管理**: 支持特定版本的数据访问

### 💾 缓存管理
- **智能缓存**: 缓存已获取的数据，提高访问速度
- **缓存控制**: 支持缓存 TTL 和大小限制
- **缓存清理**: 提供缓存清理功能

## 快速开始

### 安装
```bash
npm install
```

### 基本使用
```typescript
import { dndDataSource } from './src/index';

// 查询职业信息
const bardClass = await dndDataSource.getClass('吟游诗人');
console.log(bardClass);

// 查询法术信息
const fireballSpell = await dndDataSource.getSpell('fireball');
console.log(fireballSpell);

// 验证角色数据
const character = {
  profession: { class: '吟游诗人', subclass: 'college_of_lore' },
  spells: [{ id: 'fireball' }]
};
const validation = await dndDataSource.validateCharacter(character);
console.log(validation);
```

## API 文档

### DNDDataSource 类

#### 构造函数
```typescript
new DNDDataSource(config: DataSourceConfig)
```

#### 方法

##### 获取职业信息
```typescript
getClass(className: string): Promise<ClassInfo | null>
```

##### 获取子职业信息
```typescript
getSubclass(className: string, subclassId: string): Promise<SubclassInfo | null>
```

##### 获取法术信息
```typescript
getSpell(spellId: string): Promise<SpellInfo | null>
```

##### 获取装备信息
```typescript
getEquipment(equipmentId: string): Promise<EquipmentInfo | null>
```

##### 条件查询法术
```typescript
getSpells(options: {
  level?: number;
  school?: string;
  classes?: string[];
  subclasses?: string[];
  name?: string;
}): Promise<SpellInfo[]>
```

##### 获取装备类别
```typescript
getEquipmentByCategory(category: string): Promise<EquipmentInfo[]>
```

##### 验证角色数据
```typescript
validateCharacter(character: Character): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}>
```

##### 数据同步
```typescript
sync(): Promise<void>
```

##### 检查更新
```typescript
checkUpdates(): Promise<{
  hasUpdates: boolean;
  version?: string;
  changes?: string[];
}>
```

##### 缓存管理
```typescript
clearCache(): Promise<void>
getCacheInfo(): {
  size: number;
  entries: Array<{ key: string; timestamp: number; ttl: number }>;
}
```

## 数据格式

### ClassInfo
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
  subclasses: SubclassInfo[];
}
```

### SubclassInfo
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

### SpellInfo
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

### EquipmentInfo
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

## 配置选项

### DataSourceConfig
```typescript
interface DataSourceConfig {
  source: string;
  branch?: string;
  cache?: boolean;
  autoUpdate?: boolean;
  timeout?: number;
  retries?: number;
}
```

## 使用示例

查看 [EXAMPLE.md](./EXAMPLE.md) 获取详细的使用示例。

## 开发

### 构建
```bash
npm run build
```

### 开发模式
```bash
npm run dev
```

### 测试
```bash
npm test
```

### 代码检查
```bash
npm run lint
```

### 类型检查
```bash
npm run type-check
```

## 贡献

欢迎贡献代码！请确保：

1. 遵循现有的代码风格
2. 添加适当的测试
3. 更新相关文档
4. 提交前运行所有检查

## 许可证

MIT License

## 支持

- 问题反馈: GitHub Issues
- 功能请求: GitHub Discussions
- 文档: Wiki页面

## 更新日志

### v1.0.0
- 初始版本发布
- 基本数据查询功能
- 数据验证功能
- 缓存管理功能
- 数据同步功能