# condition_branch - 条件分支

## 功能概述

条件分支节点用于根据条件执行不同的分支逻辑，支持复杂的条件判断和分支处理。这是法术流程控制的核心节点，支持基于各种条件进行动态的流程分支。

## 状态
- ✅ **当前**：主要使用的条件分支节点
- 🔄 **重要性**：法术流程控制的关键节点

## 配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `condition` | text | 否 | "true" | 条件表达式 |
| `branches` | array | 是 | [] | 分支配置 |
| `defaultBranch` | select | 否 | "continue" | 默认分支 |
| `timeout` | number | 否 | 5000 | 执行超时时间（毫秒） |

## 详细配置说明

### condition - 条件表达式
- **类型**：文本输入
- **必填**：否
- **默认值**：`"true"`
- **说明**：JavaScript条件表达式
- **规则**：支持JavaScript语法和变量引用
- **示例**：
  - 简单条件：`"target.hp < target.maxHp * 0.5"`
  - 复杂条件：`"spellLevel >= 3 && targets.length > 1"`
  - 逻辑运算：`"hasLowHp || hasStrongEnemy"`
  - 函数调用：`"isValidTarget(target)"`

### branches - 分支配置
- **类型**：数组配置
- **必填**：是
- **默认值**：`[]`
- **说明**：分支条件的配置数组
- **结构**：每个分支包含条件、结果和权重
- **示例**：
  ```yaml
  branches:
    - condition: "target.hp < target.maxHp * 0.3"
      result: "heal_priority"
      weight: 1
    - condition: "target.challengeRating > 3"
      result: "attack_priority"
      weight: 1
    - condition: "caster.spellSlots > 0"
      result: "spell_priority"
      weight: 1
  ```

### defaultBranch - 默认分支
- **类型**：下拉选择
- **必填**：否
- **默认值**：`"continue"`
- **可选值**：
  - `"continue"`：继续执行
  - `"skip"`：跳过后续节点
  - `"retry"`：重试当前节点
  - `"fail"`：执行失败
- **说明**：当所有条件都不满足时的默认行为

### timeout - 执行超时时间
- **类型**：数字输入
- **必填**：否
- **默认值**：`5000`
- **说明**：条件评估的超时时间（毫秒）
- **范围**：1000-30000
- **用途**：防止条件评估时间过长

## 调用方式

### 基本条件分支
```yaml
- id: basic_branch
  type: condition_branch
  config:
    condition: "target.hp < target.maxHp * 0.5"
    branches:
      - condition: "true"
        result: "heal_target"
        weight: 1
    defaultBranch: "continue"
```

### 多条件分支
```yaml
- id: multi_branch
  type: condition_branch
  config:
    condition: "spellLevel >= 3"
    branches:
      - condition: "targets.length === 1"
        result: "single_target_spell"
        weight: 1
      - condition: "targets.length > 1"
        result: "area_spell"
        weight: 1
      - condition: "caster.concentration"
        result: "concentration_spell"
        weight: 1
    defaultBranch: "continue"
```

### 复杂逻辑分支
```yaml
- id: complex_branch
  type: condition_branch
  config:
    condition: "hasLowHpTargets || hasStrongEnemies"
    branches:
      - condition: "caster.spellSlots >= spellLevel"
        result: "use_spell_slot"
        weight: 2
      - condition: "caster.hasHealingPotions"
        result: "use_potion"
        weight: 1
      - condition: "caster.canRetreat"
        result: "strategic_retreat"
        weight: 1
    defaultBranch: "continue"
```

### 权重分支
```yaml
- id: weighted_branch
  type: condition_branch
  config:
    condition: "true"
    branches:
      - condition: "target.isBoss"
        result: "boss_strategy"
        weight: 3
      - condition: "target.isMinion"
        result: "minion_sweep"
        weight: 1
      - condition: "target.isCivilian"
        result: "non_lethal"
        weight: 2
    defaultBranch: "continue"
```

## 输出数据

执行成功时返回：
```typescript
{
  status: 'success';
  output: {
    condition: string;        // 评估的条件表达式
    evaluated: boolean;       // 条件评估结果
    selectedBranch: string;   // 选择的分支
    branchResult: any;       // 分支执行结果
    message: string;          // 分支选择消息
    evaluationTime: number;  // 评估时间（毫秒）
    branches: Array<{        // 所有分支的评估结果
      condition: string;
      evaluated: boolean;
      result: any;
      weight: number;
    }>;
  };
}
```

执行失败时返回：
```typescript
{
  status: 'failure';
  output: {
    error: string;           // 错误信息
    condition: string;       // 评估的条件表达式
    evaluationTime: number;  // 评估时间（毫秒）
  };
}
```

## 执行逻辑

### 1. 参数验证
- 检查 `condition` 表达式的语法正确性
- 验证 `branches` 数组的格式和内容
- 确认 `defaultBranch` 的有效性
- 检查 `timeout` 值在合理范围内

### 2. 条件评估
- **语法检查**：检查条件表达式的语法
- **变量绑定**：将执行上下文绑定到条件中
- **条件计算**：计算条件表达式的值
- **结果缓存**：缓存条件评估的结果

### 3. 分支匹配
- **顺序检查**：按顺序检查每个分支的条件
- **条件匹配**：找到第一个匹配的分支
- **权重处理**：处理权重分支的选择逻辑
- **默认分支**：如果没有匹配的分支，使用默认分支

### 4. 分支执行
- **结果生成**：根据匹配的分支生成结果
- **权重计算**：计算权重分支的概率
- **随机选择**：如果涉及权重，进行随机选择
- **结果返回**：返回分支执行的结果

### 5. 状态更新
- **分支记录**：记录选择的分支和结果
- **状态更新**：更新相关的状态信息
- **事件触发**：触发相关的事件
- **日志记录**：记录分支执行的详细日志

## 应用层映射

### UI 组件集成
- **主要组件**：FlowEditor 中的条件分支编辑器
- **辅助组件**：条件表达式编辑器、分支可视化器
- **触发时机**：流程执行到分支节点时
- **交互流程**：
  1. 系统显示条件分支界面
  2. 显示条件表达式和分支选项
  3. 评估条件并选择分支
  4. 执行选中的分支逻辑

### 条件分支界面
- **条件显示**：显示条件表达式和评估结果
- **分支展示**：显示所有分支的条件和结果
- **权重显示**：显示权重分支的权重信息
- **选择结果**：显示选择的分支和结果

### 流程控制
- **流程分支**：根据条件控制流程的执行路径
- **状态管理**：管理分支执行后的状态
- **事件系统**：触发分支相关的事件
- **日志系统**：记录分支执行的日志

## 使用示例

### 生命值分支
```yaml
- id: hp_branch
  type: condition_branch
  config:
    condition: "target.hp < target.maxHp"
    branches:
      - condition: "target.hp < target.maxHp * 0.25"
        result: "emergency_heal"
        weight: 3
      - condition: "target.hp < target.maxHp * 0.5"
        result: "normal_heal"
        weight: 2
      - condition: "target.hp < target.maxHp * 0.75"
        result: "minor_heal"
        weight: 1
    defaultBranch: "no_action"
```

### 法术等级分支
```yaml
- id: spell_level_branch
  type: condition_branch
  config:
    condition: "spellLevel >= 1"
    branches:
      - condition: "spellLevel >= 6"
        result: "high_level_spell"
        weight: 1
      - condition: "spellLevel >= 3"
        result: "medium_level_spell"
        weight: 1
      - condition: "spellLevel >= 1"
        result: "low_level_spell"
        weight: 1
    defaultBranch: "cantrip"
```

### 目标类型分支
```yaml
- id: target_type_branch
  type: condition_branch
  config:
    condition: "target.type"
    branches:
      - condition: "target.type === 'undead'"
        result: "turn_undead"
        weight: 2
      - condition: "target.type === 'construct'"
        result: "disrupt_construct"
        weight: 1
      - condition: "target.type === 'fey'"
        result: "charm_fey"
        weight: 1
    defaultBranch: "standard_attack"
```

### 环境条件分支
```yaml
- id: environment_branch
  type: condition_branch
  config:
    condition: "environment"
    branches:
      - condition: "environment === 'darkness'"
        result: "dark_vision_spell"
        weight: 2
      - condition: "environment === 'water'"
        result: "water_spell"
        weight: 1
      - condition: "environment === 'air'"
        result: "air_spell"
        weight: 1
    defaultBranch: "standard_spell"
```

## 最佳实践

### 1. 条件设计
- **条件清晰**：使用清晰、易于理解的条件表达式
- **条件完整**：考虑所有可能的情况
- **条件优化**：避免复杂的条件表达式
- **条件测试**：充分测试各种条件场景

### 2. 分支配置
- **分支合理**：设置合理的分支逻辑
- **权重适当**：设置适当的权重值
- **默认处理**：提供合理的默认分支
- **错误处理**：提供错误处理分支

### 3. 性能优化
- **条件缓存**：缓存条件评估的结果
- **分支预计算**：预计算分支的结果
- **异步处理**：支持异步的条件评估
- **超时控制**：设置合理的超时时间

### 4. 调试支持
- **日志记录**：记录详细的执行日志
- **条件调试**：提供条件调试功能
- **分支跟踪**：跟踪分支的执行路径
- **性能监控**：监控条件评估的性能

## 故障排除

### 常见问题

**问题1：条件评估错误**
- **原因**：条件表达式语法错误或逻辑错误
- **解决**：检查条件表达式的语法和逻辑

**问题2：分支选择错误**
- **原因**：分支条件配置错误
- **解决**：检查分支条件的配置，确保正确

**问题3：权重计算错误**
- **原因**：权重计算逻辑有误
- **解决**：检查权重计算逻辑，确保正确

**问题4：超时错误**
- **原因**：条件评估时间过长
- **解决**：优化条件表达式，减少计算复杂度

### 调试技巧

1. **启用详细日志**：记录条件评估的每个步骤
2. **条件验证**：验证条件表达式的正确性
3. **分支测试**：测试各种分支场景
4. **性能分析**：分析条件评估的性能瓶颈

## 相关节点

- **前置节点**：任何提供条件的节点
- **后续节点**：任何基于分支结果的节点
- **相关功能**：FlowEditor 的可视化编辑功能
- **数据流**：将条件评估结果传递给后续的流程控制

## 扩展功能

### 高级条件处理
- **嵌套条件**：支持嵌套的条件表达式
- **条件组合**：支持多个条件的组合
- **条件函数**：支持自定义的条件函数
- **条件模板**：支持条件模板的使用

### 高级分支处理
- **动态分支**：支持动态的分支生成
- **分支模板**：支持分支模板的使用
- **分支继承**：支持分支的继承和重写
- **分支组合**：支持分支的组合使用

### 流程控制增强
- **流程跳转**：支持流程的跳转和重定向
- **流程循环**：支持流程的循环和重复
- **流程并行**：支持流程的并行执行
- **流程异常**：支持流程的异常处理

## 注意事项

### 使用限制
- **执行环境**：条件表达式在沙箱环境中执行
- **访问权限**：条件表达式的访问权限受到限制
- **资源限制**：条件评估的资源使用受到限制
- **超时控制**：条件评估时间受到超时控制

### 性能考虑
- **评估开销**：条件评估有一定的性能开销
- **内存使用**：注意条件评估的内存使用
- **CPU使用**：注意条件评估的CPU使用
- **响应时间**：注意条件评估的响应时间

### 维护考虑
- **代码复杂度**：条件分支可能增加系统复杂度
- **测试负担**：需要额外的测试和维护
- **文档需求**：需要详细的文档和说明
- **版本管理**：需要良好的版本管理机制