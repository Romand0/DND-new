# attack_roll - 法术攻击

## 功能概述

法术攻击节点用于执行法术攻击检定，包括攻击检定、目标AC检查、命中判定、伤害计算等完整逻辑。这是法术攻击结算的核心节点，确保攻击检定的准确性和一致性。

## 状态
- ✅ **当前**：主要使用的法术攻击节点
- 🔄 **重要性**：法术攻击结算的关键节点

## 配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `attackBonus` | template | 否 | "0" | 攻击加值计算公式 |
| `targetAC` | template | 否 | "10" | 目标护甲等级 |
| `criticalRange` | number | 否 | 20 | 暴击范围（19-20或20） |
| `criticalMultiplier` | number | 否 | 2 | 暴击倍数 |
| `autoHit` | boolean | 否 | false | 是否自动命中 |
| `autoMiss` | boolean | 否 | false | 是否自动未命中 |
| `advantage` | boolean | 否 | false | 是否有攻击优势 |
| `disadvantage` | boolean | 否 | false | 是否有攻击劣势 |

## 详细配置说明

### attackBonus - 攻击加值计算公式
- **类型**：模板变量
- **必填**：否
- **默认值**：`"0"`
- **说明**：计算攻击加值的公式
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"+5"`
  - 模板变量：`"${spellAttackBonus}"`
  - 计算表达式：`"abilityModifier + proficiencyBonus + spellcastingFocus"`
  - 复杂计算：`"Math.max(0, abilityModifier + proficiencyBonus + (spellLevel * 2))"`

### targetAC - 目标护甲等级
- **类型**：模板变量
- **必填**：否
- **默认值**：`"10"`
- **说明**：目标的护甲等级
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"16"`
  - 模板变量：`"${target.armorClass}"`
  - 计算表达式：`"target.baseAC + target.armorBonus"`
  - 动态计算：`"Math.max(10, target.level + target.armorBonus)"`

### criticalRange - 暴击范围
- **类型**：数字输入
- **必填**：否
- **默认值**：`20`
- **说明**：攻击检定的暴击范围
- **可选值**：
  - `20`：仅在20时暴击（标准）
  - `19-20`：在19或20时暴击（某些武器）
  - `18-20`：在18、19或20时暴击（某些武器）
- **用途**：确定攻击检定的暴击条件

### criticalMultiplier - 暴击倍数
- **类型**：数字输入
- **必填**：否
- **默认值**：`2`
- **说明**：暴击时的伤害倍数
- **范围**：1-4
- **用途**：确定暴击时的伤害倍数

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

### advantage - 是否有攻击优势
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：攻击检定是否有优势
- **规则**：优势时投掷两个d20，取较高值
- **用途**：处理攻击优势的情况

### disadvantage - 是否有攻击劣势
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：攻击检定是否有劣势
- **规则**：劣势时投掷两个d20，取较低值
- **用途**：处理攻击劣势的情况

## 调用方式

### 基本攻击检定
```yaml
- id: basic_attack
  type: attack_roll
  config: {}
```

### 指定攻击加值和目标AC
```yaml
- id: custom_attack
  type: attack_roll
  config:
    attackBonus: "+5"
    targetAC: "16"
    criticalRange: 20
    criticalMultiplier: 2
```

### 攻击优势
```yaml
- id: advantage_attack
  type: attack_roll
  config:
    attackBonus: "+7"
    targetAC: "14"
    advantage: true
    disadvantage: false
```

### 攻击劣势
```yaml
- id: disadvantage_attack
  type: attack_roll
  config:
    attackBonus: "+3"
    targetAC: "18"
    advantage: false
    disadvantage: true
```

### 自动命中
```yaml
- id: autohit_attack
  type: attack_roll
  config:
    attackBonus: "+4"
    targetAC: "15"
    autoHit: true
```

### 暴击范围扩展
```yaml
- id: critical_attack
  type: attack_roll
  config:
    attackBonus: "+6"
    targetAC: "17"
    criticalRange: 19
    criticalMultiplier: 2
```

## 输出数据

执行成功时返回：
```typescript
{
  status: 'success';
  output: {
    attackBonus: number;     // 攻击加值
    targetAC: number;         // 目标护甲等级
    attackRoll: number;      // 攻击检定结果
    attackTotal: number;     // 总攻击值
    hit: boolean;            // 是否命中
    critical: boolean;       // 是否暴击
    criticalRange: number;   // 暴击范围
    criticalMultiplier: number; // 暴击倍数
    diceRolls: number[];     // 骰子投掷结果
    advantage: boolean;       // 是否有优势
    disadvantage: boolean;    // 是否有劣势
    message: string;         // 攻击结果消息
    executionTime: number;   // 执行时间（毫秒）
  };
}
```

执行失败时返回：
```typescript
{
  status: 'failure';
  output: {
    error: string;           // 错误信息
    attackBonus: number;     // 攻击加值
    targetAC: number;         // 目标护甲等级
    attackRoll: number;      // 攻击检定结果
  };
}
```

## 执行逻辑

### 1. 参数验证
- 检查 `attackBonus` 参数的有效性
- 验证 `targetAC` 参数的有效性
- 确认 `criticalRange` 和 `criticalMultiplier` 的合理性
- 检查 `advantage` 和 `disadvantage` 不能同时为true
- 验证 `autoHit` 和 `autoMiss` 不能同时为true

### 2. 攻击加值计算
- **基础加值**：根据 `attackBonus` 公式计算基础攻击加值
- **属性修正**：计算施法者的相关属性修正
- **熟练加值**：计算施法者的熟练加值
- **其他加值**：计算其他攻击相关的加值

### 3. 攻击检定
- **自动命中**：如果 `autoHit` 为true，直接判定命中
- **自动未命中**：如果 `autoMiss` 为true，直接判定未命中
- **优势处理**：如果 `advantage` 为true，投掷两个d20，取较高值
- **劣势处理**：如果 `disadvantage` 为true，投掷两个d20，取较低值
- **标准检定**：正常投掷一个d20

### 4. 命中判定
- **总攻击值**：计算攻击检定结果 + 攻击加值
- **命中检查**：比较总攻击值与目标AC
- **命中条件**：总攻击值 ≥ 目标AC
- **暴击检查**：检查攻击检定结果是否在暴击范围内

### 5. 结果生成
- **命中结果**：生成命中或未命中的结果
- **暴击结果**：生成是否暴击的结果
- **攻击消息**：生成攻击检定的详细消息
- **状态更新**：更新攻击相关的状态信息

### 6. 状态更新
- **攻击记录**：记录攻击检定的详细信息
- **状态标记**：标记攻击的状态（命中、未命中、暴击）
- **事件触发**：触发攻击相关的事件
- **日志记录**：记录攻击检定的详细日志

## 应用层映射

### UI 组件集成
- **主要组件**：`CombatAttackModal`
- **辅助组件**：`CharacterEquipmentCard`（装备显示）
- **触发时机**：法术攻击时
- **交互流程**：
  1. 系统显示攻击检定界面
  2. 显示攻击加值和目标AC
  3. 系统执行攻击检定
  4. 显示攻击结果和状态

### 攻击检定界面
- **攻击信息**：显示攻击加值、目标AC、攻击检定过程
- **结果展示**：显示命中结果和暴击状态
- **骰子显示**：显示骰子投掷结果
- **状态提示**：显示攻击状态的重要信息

### 状态管理
- **攻击状态**：跟踪攻击的执行状态
- **命中记录**：记录命中和未命中的历史
- **暴击记录**：记录暴击的历史
- **事件系统**：触发攻击相关的事件

## 使用示例

### 基本法术攻击
```yaml
- id: spell_attack
  type: attack_roll
  config: {}
```

### 火球术攻击
```yaml
- id: fireball_attack
  type: attack_roll
  config:
    attackBonus: "+6"
    targetAC: "15"
    criticalRange: 20
    criticalMultiplier: 2
    autoHit: true  # 火球术自动命中
```

### 长剑攻击
```yaml
- id: longsword_attack
  type: attack_roll
  config:
    attackBonus: "+5"
    targetAC: "16"
    criticalRange: 19
    criticalMultiplier: 2
    advantage: false
    disadvantage: false
```

### 魔法飞弹攻击
```yaml
- id: magic_missile_attack
  type: attack_roll
  config:
    attackBonus: "+8"
    targetAC: "14"
    autoHit: true  # 魔法飞弹自动命中
    criticalRange: 20
    criticalMultiplier: 1  # 魔法飞弹不暴击
```

## 最佳实践

### 1. 攻击加值计算
- **公式设计**：设计合理的攻击加值计算公式
- **属性修正**：正确计算施法者的属性修正
- **熟练加值**：正确计算施法者的熟练加值
- **其他加值**：正确计算其他攻击相关的加值

### 2. 攻击检定
- **优势劣势**：正确处理攻击的优势和劣势
- **自动命中**：正确处理法术的自动命中特性
- **暴击处理**：正确处理暴击的范围和倍数
- **命中判定**：确保命中判定的准确性

### 3. 状态管理
- **攻击记录**：记录详细的攻击检定信息
- **状态更新**：及时更新攻击相关的状态
- **事件触发**：正确触发攻击相关的事件
- **日志记录**：记录详细的攻击日志

### 4. 错误处理
- **参数验证**：验证输入参数的有效性
- **错误恢复**：提供错误恢复机制
- **错误提示**：提供清晰的错误信息
- **日志记录**：记录详细的错误日志

## 故障排除

### 常见问题

**问题1：攻击加值计算错误**
- **原因**：攻击加值计算公式有误
- **解决**：检查攻击加值计算公式，确保正确

**问题2：攻击检定错误**
- **原因**：攻击检定逻辑有误
- **解决**：检查攻击检定的逻辑，确保正确

**问题3：命中判定错误**
- **原因**：命中判定逻辑有误
- **解决**：检查命中判定的逻辑，确保正确

**问题4：暴击处理错误**
- **原因**：暴击处理逻辑有误
- **解决**：检查暴击处理的逻辑，确保正确

### 调试技巧

1. **启用详细日志**：记录攻击检定的每个步骤
2. **验证攻击加值**：检查攻击加值的计算结果
3. **测试检定逻辑**：手动测试各种攻击检定场景
4. **模拟状态变化**：自动化测试攻击状态的变化

## 相关节点

- **前置节点**：`cast_start`（施法开始）
- **后续节点**：`apply_damage`（伤害应用）
- **相关功能**：`diceService.ts`（骰子投掷）、`characterStore.ts`（角色状态管理）
- **数据流**：将攻击检定结果传递给后续的伤害应用节点

## 扩展功能

### 高级攻击处理
- **多重攻击**：支持多重攻击的处理
- **攻击组合**：支持攻击组合的处理
- **攻击链**：支持攻击链的处理
- **攻击反馈**：支持攻击反馈的处理

### 攻击增强
- **攻击预测**：支持攻击预测的功能
- **攻击优化**：支持攻击优化的功能
- **攻击分析**：支持攻击分析的功能
- **攻击统计**：支持攻击统计的功能

### 性能优化
- **攻击缓存**：优化攻击检定的缓存
- **批量处理**：支持批量攻击的处理
- **异步处理**：支持异步的攻击检定
- **并发处理**：支持并发的攻击处理

## 规则说明

### D&D 5e 攻击规则
- **攻击检定**：d20 + 攻击加值 ≥ 目标AC
- **攻击加值**：属性修正 + 熟练加值 + 其他加值
- **优势劣势**：优势取两个d20较高值，劣势取较低值
- **暴击规则**：攻击检定结果在暴击范围内时暴击

### 暴击规则
- **暴击条件**：攻击检定结果在暴击范围内
- **暴击效果**：伤害值 × 暴击倍数
- **暴击范围**：20（标准）、19-20、18-20等
- **暴击奖励**：某些武器有额外的暴击效果

### 自动命中规则
- **法术特性**：某些法术自动命中目标
- **条件命中**：某些条件下自动命中
- **范围攻击**：范围攻击通常自动命中
- **特殊效果**：某些特殊效果导致自动命中

### 优势劣势规则
- **优势条件**：有利于攻击的条件
- **劣势条件**：不利于攻击的条件
- **同时存在**：优势劣势同时存在时相互抵消
- **多重效果**：多个优势或劣势效果的处理