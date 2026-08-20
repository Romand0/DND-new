# apply_damage - 伤害应用

## 功能概述

伤害应用节点用于将计算出的伤害值应用到目标角色上，处理伤害计算、护甲等级（AC）检查、伤害类型和抗性等复杂逻辑。这是法术伤害结算的核心节点，确保伤害应用的准确性和一致性。

## 状态
- ✅ **当前**：主要使用的伤害应用节点
- 🔄 **重要性**：法术伤害结算的关键节点

## 配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `damage` | template | 否 | "0" | 伤害值计算公式 |
| `damageType` | select | 否 | "bludgeoning" | 伤害类型 |
| `attackRoll` | number | 否 | null | 攻击检定结果 |
| `targetAC` | number | 否 | null | 目标护甲等级 |
| `critical` | boolean | 否 | false | 是否暴击伤害 |
| `autoHit` | boolean | 否 | false | 是否自动命中 |
| `autoMiss` | boolean | 否 | false | 是否自动未命中 |

## 详细配置说明

### damage - 伤害值计算公式
- **类型**：模板变量
- **必填**：否
- **默认值**：`"0"`
- **说明**：计算伤害值的公式
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"10"`
  - 骰子表达式：`"Math.floor(Math.random() * 6) + 1"`
  - 模板变量：`"${baseDamage}"`
  - 复杂表达式：`"Math.floor(Math.random() * 8) + 2 + spellLevel"`

### damageType - 伤害类型
- **类型**：下拉选择
- **必填**：否
- **默认值**：`"bludgeoning"`
- **可选值**：
  - `"bludgeoning"`：钝击伤害
  - `"piercing"`：穿刺伤害
  - `"slashing"`：挥砍伤害
  - `"necrotic"`： necrotic伤害
  - `"poison"`：毒素伤害
  - `"acid"`：酸液伤害
  - `"cold"`：寒冷伤害
  - `"fire"`：火焰伤害
  - `"force"`：力场伤害
  - `"lightning"`：闪电伤害
  - `"psychic"`：精神伤害
  - `"radiant"`：神圣伤害
  - `"thunder"`：雷电伤害

### attackRoll - 攻击检定结果
- **类型**：数字输入
- **必填**：否
- **默认值**：`null`
- **说明**：攻击检定的结果值
- **用途**：用于计算是否命中目标
- **示例**：
  - 命中结果：`18`
  - 未命中结果：`8`

### targetAC - 目标护甲等级
- **类型**：数字输入
- **必填**：否
- **默认值**：`null`
- **说明**：目标的护甲等级
- **用途**：用于判断攻击是否命中
- **示例**：
  - 高AC目标：`18`
  - 低AC目标：`12`

### critical - 是否暴击伤害
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：是否应用暴击伤害
- **规则**：暴击时伤害值翻倍
- **用途**：处理暴击情况的伤害计算

### autoHit - 是否自动命中
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：是否自动命中目标
- **规则**：忽略攻击检定和AC检查
- **用途**：处理某些法术的自动命中特性

### autoMiss - 是否自动未命中
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：是否自动未命中目标
- **规则**：忽略攻击检定和AC检查
- **用途**：处理某些特殊情况的未命中

## 调用方式

### 基本伤害应用
```yaml
- id: basic_damage
  type: apply_damage
  config:
    damage: "10"
    damageType: "fire"
```

### 攻击检定伤害
```yaml
- id: attack_damage
  type: apply_damage
  config:
    damage: "Math.floor(Math.random() * 6) + 1"
    damageType: "slashing"
    attackRoll: 15
    targetAC: 14
```

### 暴击伤害
```yaml
- id: critical_damage
  type: apply_damage
  config:
    damage: "Math.floor(Math.random() * 8) + 2"
    damageType: "piercing"
    critical: true
    attackRoll: 20
    targetAC: 16
```

### 自动命中伤害
```yaml
- id: autohit_damage
  type: apply_damage
  config:
    damage: "15"
    damageType: "necrotic"
    autoHit: true
```

### 自动未命中
```yaml
- id: automiss_damage
  type: apply_damage
  config:
    damage: "20"
    damageType: "acid"
    autoMiss: true
```

## 输出数据

执行成功时返回：
```typescript
{
  status: 'success';
  output: {
    damage: number;         // 最终伤害值
    damageType: string;     // 伤害类型
    hit: boolean;          // 是否命中
    critical: boolean;      // 是否暴击
    damageAfterResistance: number; // 抗性后的伤害
    targetHp: number;       // 目标剩余HP
    targetStatus: string;   // 目标状态
    message: string;         // 伤害结算消息
    rollResult: number;     // 骰子结果（如果适用）
    attackResult: number;   // 攻击检定结果
    acCheck: number;        // AC检查结果
  };
}
```

执行失败时返回：
```typescript
{
  status: 'failure';
  output: {
    error: string;         // 错误信息
    targetId: string;      // 目标ID
    originalDamage: number; // 原始伤害值
  };
}
```

## 执行逻辑

### 1. 参数验证
- 检查 `damage` 参数的有效性
- 验证 `damageType` 是否在可选范围内
- 确认 `autoHit` 和 `autoMiss` 不能同时为true
- 检查 `attackRoll` 和 `targetAC` 的有效性（如果需要）

### 2. 伤害计算
- **基础伤害**：根据 `damage` 公式计算基础伤害值
- **暴击处理**：如果 `critical` 为true，伤害值翻倍
- **随机因素**：如果包含骰子表达式，进行随机投掷

### 3. 命中判定
- **自动命中**：如果 `autoHit` 为true，直接判定命中
- **自动未命中**：如果 `autoMiss` 为true，直接判定未命中
- **攻击检定**：比较 `attackRoll` 和 `targetAC`
- **命中条件**：攻击检定结果 ≥ 目标AC

### 4. 伤害应用
- **目标状态**：获取目标的当前状态（HP、状态效果等）
- **伤害抗性**：检查目标对伤害类型的抗性
- **伤害计算**：应用抗性后的最终伤害值
- **HP更新**：更新目标的HP值

### 5. 状态更新
- **HP变化**：更新目标的HP值
- **状态效果**：处理伤害引起的状态效果
- **死亡判定**：检查目标是否死亡
- **事件触发**：触发相关的事件

### 6. 结果生成
- **伤害消息**：生成伤害结算的详细消息
- **状态变化**：记录目标的状态变化
- **日志记录**：记录伤害应用的详细日志

## 应用层映射

### UI 组件集成
- **主要组件**：`CombatDamageModal`
- **辅助组件**：`CharacterEquipmentCard`（装备显示）
- **触发时机**：攻击检定成功后
- **交互流程**：
  1. 系统显示伤害结算界面
  2. 显示伤害计算过程
  3. 显示伤害应用结果
  4. 更新目标的HP和状态

### 伤害结算界面
- **伤害信息**：显示伤害类型、数值、计算过程
- **命中信息**：显示命中结果、攻击检定、AC检查
- **目标状态**：显示目标的HP变化和状态效果
- **结果展示**：显示伤害结算的最终结果

### 状态管理
- **HP管理**：管理目标的HP值变化
- **状态效果**：管理伤害引起的状态效果
- **死亡判定**：处理目标的死亡判定
- **事件系统**：触发相关的事件

## 使用示例

### 火球术伤害
```yaml
- id: fireball_damage
  type: apply_damage
  config:
    damage: "Math.floor(Math.random() * 6) + 1 + spellLevel"
    damageType: "fire"
    critical: false
    autoHit: true  # 火球术自动命中
```

### 长剑攻击伤害
```yaml
- id: longsword_damage
  type: apply_damage
  config:
    damage: "Math.floor(Math.random() * 8) + 1 + strengthModifier"
    damageType: "slashing"
    attackRoll: attackResult
    targetAC: targetArmorClass
```

### 暴击伤害
```yaml
- id: critical_strike
  type: apply_damage
  config:
    damage: "Math.floor(Math.random() * 8) + 2"
    damageType: "piercing"
    critical: true
    attackRoll: 20
    targetAC: 16
```

### 酸液喷射伤害
```yaml
- id: acid_splash
  type: apply_damage
  config:
    damage: "Math.floor(Math.random() * 6) + 1"
    damageType: "acid"
    autoHit: true
```

## 最佳实践

### 1. 伤害计算
- **公式设计**：设计合理的伤害计算公式
- **随机因素**：正确处理骰子表达式
- **暴击处理**：正确处理暴击伤害的翻倍
- **抗性处理**：正确处理目标的伤害抗性

### 2. 命中判定
- **自动命中**：正确处理法术的自动命中特性
- **攻击检定**：正确处理攻击检定的计算
- **AC检查**：正确处理目标的护甲等级
- **命中逻辑**：确保命中判定的准确性

### 3. 状态管理
- **HP更新**：正确更新目标的HP值
- **状态效果**：正确处理伤害引起的状态效果
- **死亡判定**：正确处理目标的死亡判定
- **事件触发**：正确触发相关的事件

### 4. 错误处理
- **参数验证**：验证输入参数的有效性
- **错误恢复**：提供错误恢复机制
- **错误提示**：提供清晰的错误信息
- **日志记录**：记录详细的错误日志

## 故障排除

### 常见问题

**问题1：伤害计算错误**
- **原因**：伤害公式计算有误
- **解决**：检查伤害公式的逻辑，确保计算正确

**问题2：命中判定错误**
- **原因**：攻击检定或AC检查有误
- **解决**：检查攻击检定和AC的计算逻辑

**问题3：抗性处理错误**
- **原因**：伤害抗性处理逻辑有误
- **解决**：检查抗性处理的逻辑，确保正确应用

**问题4：HP更新错误**
- **原因**：HP更新逻辑有误
- **解决**：检查HP更新的逻辑，确保数值正确

### 调试技巧

1. **启用详细日志**：记录伤害计算的每个步骤
2. **验证伤害公式**：检查伤害公式的计算结果
3. **测试命中判定**：测试各种命中和未命中场景
4. **模拟抗性处理**：测试不同抗性场景的处理

## 相关节点

- **前置节点**：`attack_roll`（攻击检定）、`saving_throw`（豁免检定）
- **后续节点**：`condition_branch`（状态分支）、`apply_effect`（效果应用）
- **相关功能**：`diceService.ts`（骰子投掷）、`combatStore.ts`（状态管理）
- **数据流**：将伤害结果传递给后续的状态管理节点

## 扩展功能

### 高级伤害处理
- **多重伤害**：支持多种伤害类型的组合
- **伤害分配**：支持伤害在多个目标间的分配
- **伤害减免**：支持伤害减免的处理
- **伤害转移**：支持伤害转移的机制

### 条件伤害
- **条件伤害**：基于条件的伤害计算
- **环境伤害**：基于环境的伤害调整
- **状态伤害**：基于目标状态的伤害调整
- **时间伤害**：基于时间的伤害变化

### 结果处理增强
- **伤害反馈**：增强伤害结果的反馈
- **状态变化**：增强状态变化的处理
- **事件系统**：增强事件系统的功能
- **日志系统**：增强日志系统的功能

## 规则说明

### D&D 5e 伤害规则
- **伤害类型**：不同的伤害类型有不同的特性
- **伤害抗性**：目标可能对某些伤害类型有抗性
- **伤害免疫**：目标可能对某些伤害类型免疫
- **伤害易伤**：目标可能对某些伤害类型易伤

### 暴击规则
- **暴击条件**：攻击检定结果为20
- **暴击效果**：伤害值翻倍
- **暴击奖励**：某些武器有额外的暴击效果
- **暴击豁免**：某些法术允许目标进行豁免以避免暴击

### 自动命中规则
- **法术特性**：某些法术自动命中目标
- **条件命中**：某些条件下自动命中
- **范围攻击**：范围攻击通常自动命中
- **特殊效果**：某些特殊效果导致自动命中

### 伤害抗性
- **减半抗性**：伤害值减半
- **免疫抗性**：完全免疫伤害
- **易伤抗性**：伤害值翻倍
- **无抗性**：正常应用伤害