# apply_effect - 效果应用

## 功能概述

效果应用节点用于将法术效果应用到目标角色上，包括状态效果、临时HP、属性变化等复杂效果。这是法术效果结算的核心节点，确保效果应用的准确性和一致性。

## 状态
- ✅ **当前**：主要使用的法术效果应用节点
- 🔄 **重要性**：法术效果结算的关键节点

## 配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `effectType` | select | 否 | "status" | 效果类型 |
| `effectName` | text | 否 | "" | 效果名称 |
| `duration` | template | 否 | "1" | 效果持续时间 |
| `magnitude` | template | 否 | "1" | 效果强度 |
| `stackable` | boolean | 否 | false | 是否可叠加 |
| `concentration` | boolean | 否 | false | 是否需要专注 |
| `description` | text | 否 | "" | 效果描述 |

## 详细配置说明

### effectType - 效果类型
- **类型**：下拉选择
- **必填**：否
- **默认值**：`"status"`
- **可选值**：
  - `"status"`：状态效果
  - `"tempHp"`：临时生命值
  - `"attribute"`：属性变化
  - `"condition"`：状态异常
  - `"spell"`：法术效果
  - `"buff"`：增益效果
  - `"debuff"`：减益效果

### effectName - 效果名称
- **类型**：文本输入
- **必填**：否
- **默认值**：`""`
- **说明**：效果的唯一标识名称
- **用途**：用于识别和追踪效果
- **示例**：
  - 状态效果：`"poisoned"`
  - 临时HP：`"temp_hp"`
  - 属性变化：`"strength_enhanced"`

### duration - 效果持续时间
- **类型**：模板变量
- **必填**：否
- **默认值**：`"1"`
- **说明**：效果的持续时间（回合数）
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"1"`
  - 模板变量：`"${spellLevel}"`
  - 计算表达式：`"Math.max(1, spellLevel - 1)"`
  - 持续时间：`"rounds"`（回合）、`"minutes"`（分钟）、`"hours"`（小时）

### magnitude - 效果强度
- **类型**：模板变量
- **必填**：否
- **默认值**：`"1"`
- **说明**：效果的强度或数值
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"5"`
  - 模板变量：`"${spellLevel * 2}"`
  - 计算表达式：`"Math.floor(Math.random() * 6) + 1"`
  - 百分比：`"0.5"`（50%）

### stackable - 是否可叠加
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：效果是否可以叠加
- **规则**：可叠加的效果会累积效果值
- **用途**：处理可以多次应用的效果

### concentration - 是否需要专注
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：效果是否需要施法者专注
- **规则**：需要专注的效果会占用施法者的专注
- **用途**：处理持续法术的专注要求

### description - 效果描述
- **类型**：文本输入
- **必填**：否
- **默认值**：`""`
- **说明**：效果的详细描述
- **用途**：提供效果的详细说明
- **示例**：
  - 详细描述：`"目标获得5点临时生命值，持续1回合"`
  - 规则说明：`"力量属性+2，持续10分钟"`

## 调用方式

### 基本状态效果
```yaml
- id: basic_status_effect
  type: apply_effect
  config:
    effectType: "status"
    effectName: "poisoned"
    duration: "1"
    magnitude: "1"
    stackable: false
    concentration: false
    description: "目标中毒，每回合受到1点毒素伤害"
```

### 临时生命值
```yaml
- id: temporary_hp
  type: apply_effect
  config:
    effectType: "tempHp"
    effectName: "divine_shield"
    duration: "3"
    magnitude: "10"
    stackable: true
    concentration: false
    description: "目标获得10点临时生命值，持续3回合"
```

### 属性变化
```yaml
- id: attribute_modifier
  type: apply_effect
  config:
    effectType: "attribute"
    effectName: "strength_enhanced"
    duration: "10"
    magnitude: "2"
    stackable: false
    concentration: false
    description: "力量属性+2，持续10分钟"
```

### 状态异常
```yaml
- id: condition_effect
  type: apply_effect
  config:
    effectType: "condition"
    effectName: "restrained"
    duration: "1"
    magnitude: "1"
    stackable: false
    concentration: false
    description: "目标被束缚，无法移动"
```

### 需要专注的效果
```yaml
- id: concentration_effect
  type: apply_effect
  config:
    effectType: "buff"
    effectName: "bless"
    duration: "8"
    magnitude: "1"
    stackable: true
    concentration: true
    description: "目标获得祝福，持续8小时，需要专注"
```

## 输出数据

执行成功时返回：
```typescript
{
  status: 'success';
  output: {
    effectType: string;       // 效果类型
    effectName: string;      // 效果名称
    targetId: string;        // 目标ID
    duration: number;         // 持续时间
    magnitude: number;        // 效果强度
    stackable: boolean;      // 是否可叠加
    concentration: boolean;   // 是否需要专注
    previousValue: number;    // 之前的值
    currentValue: number;     // 当前值
    message: string;          // 应用结果消息
    timestamp: number;        // 应用时间戳
    expiryTime: number;       // 过期时间
    effectId: string;        // 效果ID
  };
}
```

执行失败时返回：
```typescript
{
  status: 'failure';
  output: {
    error: string;           // 错误信息
    targetId: string;        // 目标ID
    effectType: string;      // 效果类型
    effectName: string;      // 效果名称
  };
}
```

## 执行逻辑

### 1. 参数验证
- 检查 `effectType` 参数的有效性
- 验证 `effectName` 和 `duration` 的有效性
- 确认 `magnitude` 值在合理范围内
- 检查 `stackable` 和 `concentration` 的配置

### 2. 效果计算
- **基础效果**：根据 `effectType` 创建基础效果
- **强度计算**：根据 `magnitude` 计算效果强度
- **持续时间**：根据 `duration` 计算效果持续时间
- **过期时间**：计算效果的过期时间

### 3. 效果应用
- **状态检查**：检查目标是否已有相同效果
- **叠加处理**：如果 `stackable` 为true，处理效果叠加
- **冲突处理**：处理效果之间的冲突
- **专注占用**：如果 `concentration` 为true，占用施法者的专注

### 4. 状态更新
- **效果添加**：将效果添加到目标的状态中
- **数值更新**：更新相关的数值（如临时HP、属性值）
- **状态标记**：标记目标的状态变化
- **事件触发**：触发相关的事件

### 5. 结果生成
- **效果信息**：生成效果的详细信息
- **状态变化**：记录状态的变化信息
- **消息生成**：生成效果应用的结果消息
- **日志记录**：记录效果应用的详细日志

## 应用层映射

### UI 组件集成
- **主要组件**：`CombatDamageModal`
- **辅助组件**：`CharacterEquipmentCard`（装备显示）
- **触发时机**：法术效果应用时
- **交互流程**：
  1. 系统显示效果应用界面
  2. 显示效果信息和持续时间
  3. 显示效果应用过程
  4. 更新目标的状态和效果

### 效果应用界面
- **效果信息**：显示效果类型、名称、持续时间
- **强度显示**：显示效果的强度和数值
- **状态变化**：显示目标的状态变化
- **结果展示**：显示效果应用的最终结果

### 状态管理
- **效果管理**：管理目标的法术效果
- **状态跟踪**：跟踪目标的各种状态
- **专注管理**：管理施法者的专注状态
- **事件系统**：触发相关的事件

## 使用示例

### 治疗术效果
```yaml
- id: heal_effect
  type: apply_effect
  config:
    effectType: "status"
    effectName: "healed"
    duration: "0"
    magnitude: "Math.floor(Math.random() * 8) + 1 + spellLevel"
    stackable: false
    concentration: false
    description: "目标获得治疗，恢复生命值"
```

### 护盾术效果
```yaml
- id: shield_effect
  type: apply_effect
  config:
    effectType: "tempHp"
    effectName: "magical_shield"
    duration: "1"
    magnitude: "5"
    stackable: true
    concentration: false
    description: "目标获得5点临时生命值"
```

### 祝福术效果
```yaml
- id: bless_effect
  type: apply_effect
  config:
    effectType: "buff"
    effectName: "bless"
    duration: "8"
    magnitude: "1"
    stackable: true
    concentration: true
    description: "目标获得祝福，攻击检定+1，需要专注"
```

### 恐惧术效果
```yaml
- id: fear_effect
  type: apply_effect
  config:
    effectType: "debuff"
    effectName: "frightened"
    duration: "1"
    magnitude: "1"
    stackable: false
    concentration: false
    description: "目标恐惧，移动速度减半"
```

## 最佳实践

### 1. 效果设计
- **效果类型**：选择正确的效果类型
- **效果名称**：使用清晰的效果名称
- **持续时间**：设置合理的持续时间
- **强度设置**：设置合适的效果强度

### 2. 叠加处理
- **叠加逻辑**：正确处理可叠加效果
- **冲突处理**：处理效果之间的冲突
- **优先级**：设置效果的优先级
- **合并处理**：处理相同效果的合并

### 3. 专注管理
- **专注占用**：正确处理专注占用
- **专注检查**：检查施法者的专注状态
- **专注释放**：处理专注的释放
- **专注冲突**：处理专注之间的冲突

### 4. 错误处理
- **参数验证**：验证输入参数的有效性
- **状态检查**：检查目标的状态
- **错误恢复**：提供错误恢复机制
- **错误提示**：提供清晰的错误信息

## 故障排除

### 常见问题

**问题1：效果应用错误**
- **原因**：效果应用逻辑有误
- **解决**：检查效果应用的逻辑，确保正确

**问题2：叠加处理错误**
- **原因**：效果叠加逻辑有误
- **解决**：检查效果叠加的逻辑，确保正确

**问题3：专注占用错误**
- **原因**：专注占用逻辑有误
- **解决**：检查专注占用的逻辑，确保正确

**问题4：状态更新错误**
- **原因**：状态更新逻辑有误
- **解决**：检查状态更新的逻辑，确保正确

### 调试技巧

1. **启用详细日志**：记录效果应用的每个步骤
2. **验证效果计算**：检查效果计算的结果
3. **测试不同场景**：测试各种效果应用场景
4. **模拟目标状态**：自动化测试不同目标状态

## 相关节点

- **前置节点**：`apply_damage`（伤害计算）、`saving_throw`（豁免检定）
- **后续节点**：`condition_branch`（状态分支）
- **相关功能**：`characterStore.ts`（角色状态管理）、`combatStore.ts`（战斗状态管理）
- **数据流**：将效果应用结果传递给后续的状态管理节点

## 扩展功能

### 高级效果处理
- **多重效果**：支持多种效果的组合应用
- **条件效果**：基于条件的效果应用
- **动态效果**：基于状态变化的动态效果
- **连锁效果**：触发其他效果的连锁反应

### 效果管理增强
- **效果排序**：支持效果的排序和优先级
- **效果过滤**：支持效果的过滤和筛选
- **效果搜索**：支持效果的搜索和查找
- **效果统计**：支持效果的统计和分析

### 用户体验增强
- **效果可视化**：增强效果的视觉展示
- **效果提示**：增强效果的提示和说明
- **效果历史**：记录效果的应用历史
- **效果预测**：预测效果的未来影响

## 规则说明

### D&D 5e 效果规则
- **效果类型**：不同的效果类型有不同的特性
- **持续时间**：效果的持续时间可以是回合、分钟、小时等
- **叠加规则**：某些效果可以叠加，某些不可以
- **专注要求**：某些效果需要施法者专注

### 状态效果
- **正面效果**：增益效果，提升角色能力
- **负面效果**：减益效果，降低角色能力
- **中性效果**：中性效果，改变角色状态
- **临时效果**：临时效果，持续时间有限

### 临时生命值
- **优先级**：临时HP优先于普通HP受到伤害
- **叠加**：临时HP可以叠加
- **持续时间**：临时HP有持续时间限制
- **恢复**：临时HP不会自然恢复

### 专注要求
- **专注占用**：需要专注的效果占用施法者的专注
- **专注检查**：施法者需要保持专注
- **专注失去**：失去专注会导致效果终止
- **专注转移**：可以转移专注到其他效果