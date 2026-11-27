# 战斗→角色变更回传功能说明

## 功能概述

本功能实现了战斗结束后将战斗中的变更（HP、装备、状态）安全地回传到角色卡中。采用增量合并策略，确保数据的一致性和安全性。

## 核心特性

### 1. 增量合并策略
- **HP 回传**：取战斗最终值与角色卡当前值的较小值（安全策略）
- **装备回传**：基于 childId 精确合并，避免数量错误
- **状态回传**：仅回传有意义的状态（昏迷、死亡等）

### 2. 冲突检测机制
- 自动检测战斗期间的角色卡修改
- 提供冲突信息供 DM 确认
- 支持自动解决和手动处理

### 3. 安全保障
- 快照锁定机制
- 原子写入操作
- 不会覆盖战斗期间的角色卡编辑

## 使用流程

### 1. 战斗结束
当所有参战者都倒下或死亡时，战斗自动结束，显示回传弹窗。

### 2. 预览变更
点击"预览变更"按钮查看所有角色的变更详情：
- HP 变更（前后对比）
- 装备变更（数量变化）
- 状态变更（昏迷、死亡等）
- 冲突信息（如有）

### 3. 执行回传
确认变更无误后，点击"执行回传"：
- 批量处理所有 PC 角色的变更
- 自动应用无冲突的变更
- 标记需要手动处理的冲突

### 4. 查看结果
回传完成后可以查看：
- 成功回传的角色数量
- 失败的角色数量
- 需要处理冲突的角色数量

## 技术实现

### 核心函数

#### `commitCombatToCharacter(recordId, combatantId)`
- 计算单个角色的战斗变更
- 返回详细的变更信息和冲突检测结果

#### `commitAllPcCombatChanges(recordId)`
- 批量处理所有 PC 角色的变更
- 返回批量处理的结果统计

#### `mergeHp(combatant, character)`
- HP 合并策略：取最小值
- 防止凭空恢复 HP

#### `mergeEquipment(character, netChanges)`
- 装备合并策略：基于 childId 精确匹配
- 支持数量叠加和整件移除

#### `mergeStatus(combatant)`
- 状态合并策略：白名单过滤
- 仅保留有意义的状态

### 数据结构

#### `CombatCommitResult`
```typescript
interface CombatCommitResult {
  characterId: string;
  hp: { before: number; after: number };
  equipmentDeltas: NetChangeEntry[];
  statusChanges: string[];
  conflicts: CommitConflict[];
}
```

#### `CommitConflict`
```typescript
interface CommitConflict {
  field: 'equipment' | 'hp' | 'status';
  childId?: string;
  combatValue: any;
  currentValue: any;
  resolution: 'auto' | 'manual';
}
```

## 安全机制

### 1. 快照锁定
- 战斗开始时拍下角色卡快照
- 回传时比对快照，检测外部修改

### 2. 最小值策略
- HP 取战斗值与角色卡值的较小值
- 确保不会凭空恢复 HP

### 3. 精确匹配
- 装备基于 childId 合并
- 避免同名装备的数量错误

### 4. 白名单过滤
- 仅回传有意义的状态
- 过滤掉战斗临时状态

## 最佳实践

### 1. 定期回传
- 战斗结束后及时回传变更
- 避免数据积压导致冲突

### 2. 检查冲突
- 重点关注有冲突的角色
- 确认变更的正确性

### 3. 备份数据
- 重要战斗前备份角色卡
- 防止意外数据丢失

### 4. 测试验证
- 在非战斗环境中测试功能
- 确保回传逻辑的正确性

## 故障排除

### 常见问题

1. **回传失败**
   - 检查角色 ID 是否正确
   - 确认角色卡是否存在

2. **冲突过多**
   - 检查战斗期间是否修改了角色卡
   - 确认回传时机的合适性

3. **装备数量异常**
   - 检查 childId 是否匹配
   - 确认装备合并逻辑的正确性

### 调试方法

1. 使用浏览器开发者工具查看控制台输出
2. 检查 localStorage 中的数据结构
3. 逐步执行回传函数，观察中间结果

## 未来改进

1. **冲突解决界面**：提供更详细的冲突处理界面
2. **回传历史**：记录回传历史，支持撤销操作
3. **批量配置**：支持自定义回传策略
4. **自动化测试**：增加单元测试和集成测试

## 相关文件

- `src/data/combatStore.ts` - 核心回传逻辑
- `src/components/CombatCommitModal.tsx` - 回传弹窗组件
- `src/pages/CombatSession.tsx` - 战斗页面集成
- `test-combat-commit.ts` - 测试文件