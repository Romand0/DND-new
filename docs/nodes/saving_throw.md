# saving_throw - 豁免检定

## 功能概述

豁免检定节点用于处理法术的豁免检定逻辑，包括属性选择、DC计算、检定执行、结果判定等完整流程。这是法术豁免检定的核心节点，确保豁免检定的准确性和一致性。

## 状态
- ✅ **当前**：主要使用的豁免检定节点
- 🔄 **重要性**：法术豁免检定的关键节点

## 配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `saveAbility` | select | 否 | "dexterity" | 豁免属性 |
| `saveDC` | template | 否 | "10" | 豁免DC |
| `damageOnFail` | template | 否 | "0" | 未命中时的伤害 |
| `halfDamageOnSave` | boolean | 否 | false | 豁免成功时伤害减半 |
| `advantage` | boolean | 否 | false | 是否有豁免优势 |
| `disadvantage` | boolean | 否 | false | 是否有豁免劣势 |
| `autoFail` | boolean | 否 | false | 是否自动失败 |
| `autoSucceed` | boolean | 否 | false | 是否自动成功 |

## 详细配置说明

### saveAbility - 豁免属性
- **类型**：下拉选择
- **必填**：否
- **默认值**：`"dexterity"`
- **可选值**：
  - `"strength"`：力量豁免
  - `"dexterity"`：敏捷豁免
  - `"constitution"`：体质豁免
  - `"intelligence"`：智力豁免
  - `"wisdom"`：感知豁免
  - `"charisma"`：魅力豁免

### saveDC - 豁免DC
- **类型**：模板变量
- **必填**：否
- **默认值**：`"10"`
- **说明**：豁免检定的难度等级
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"10"`
  - 模板变量：`"${spellLevel + 8}"`
  - 计算表达式：`"Math.max(10, spellLevel + 8)"`
  - 属性基础：`"spellcastingAbilityModifier + 8"`

### damageOnFail - 未命中时的伤害
- **类型**：模板变量
- **必填**：否
- **默认值**：`"0"`
- **说明**：豁免失败时造成的伤害
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"10"`
  - 模板变量：`"${baseDamage}"`
  - 计算表达式：`"Math.floor(Math.random() * 6) + 1"`
  - 基于等级：`"spellLevel * 2"`

### halfDamageOnSave - 豁免成功时伤害减半
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：豁免成功时是否减半伤害
- **规则**：某些法术允许豁免成功时减半伤害
- **用途**：处理法术的豁免机制

### advantage - 是否有豁免优势
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：豁免检定是否有优势
- **规则**：优势时投掷两个d20，取较高值
- **用途**：处理豁免优势的情况

### disadvantage - 是否有豁免劣势
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：豁免检定是否有劣势
- **规则**：劣势时投掷两个d20，取较低值
- **用途**：处理豁免劣势的情况

### autoFail - 是否自动失败
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：是否自动检定失败
- **规则**：某些情况下强制豁免失败
- **用途**：处理特殊的法术效果

### autoSucceed - 是否自动成功
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：是否自动检定成功
- **规则**：某些情况下强制豁免成功
- **用途**：处理特殊的法术效果

## 调用方式

### 基本豁免检定
```yaml
- id: basic_save
  type: saving_throw
  config: {}
```

### 指定豁免属性和DC
```yaml
- id: custom_save
  type: saving_throw
  config:
    saveAbility: "constitution"
    saveDC: "13"
    damageOnFail: "6"
    halfDamageOnSave: true
    advantage: false
    disadvantage: false
    autoFail: false
    autoSucceed: false
```

### 豁免优势
```yaml
- id: advantage_save
  type: saving_throw
  config:
    saveAbility: "dexterity"
    saveDC: "15"
    damageOnFail: "8"
    halfDamageOnSave: true
    advantage: true
    disadvantage: false
    autoFail: false
    autoSucceed: false
```

### 豁免劣势
```yaml
- id: disadvantage_save
  type: saving_throw
  config:
    saveAbility: "wisdom"
    saveDC: "12"
    damageOnFail: "4"
    halfDamageOnSave: false
    advantage: false
    disadvantage: true
    autoFail: false
    autoSucceed: false
```

### 自动成功豁免
```yaml
- id: autosave_save
  type: saving_throw
  config:
    saveAbility: "intelligence"
    saveDC: "14"
    damageOnFail: "0"
    halfDamageOnSave: false
    advantage: false
    disadvantage: false
    autoFail: false
    autoSucceed: true
```

### 自动失败豁免
```yaml
- id: autofail_save
  type: saving_throw
  config:
    saveAbility: "charisma"
    saveDC: "16"
    damageOnFail: "10"
    halfDamageOnSave: false
    advantage: false
    disadvantage: false
    autoFail: true
    autoSucceed: false
```

## 输出数据

执行成功时返回：
```typescript
{
  status: 'success';
  output: {
    saveAbility: string;      // 豁免属性
    saveDC: number;           // 豁免DC
    saveResult: boolean;       // 豁免结果
    saveRoll: number;          // 豁免检定结果
    saveModifier: number;      // 豁免修正
    saveTotal: number;         // 总豁免值
    damage: number;           // 最终伤害
    damageType: string;       // 伤害类型
    halfDamage: boolean;      // 是否减半伤害
    advantage: boolean;       // 是否有优势
    disadvantage: boolean;    // 是否有劣势
    autoFail: boolean;        // 是否自动失败
    autoSucceed: boolean;     // 是否自动成功
    message: string;          // 结果消息
    executionTime: number;    // 执行时间（毫秒）
    targetDetails: {          // 目标详细信息
      id: string;
      name: string;
      abilityScore: number;
      abilityModifier: number;
      currentHp: number;
      maxHp: number;
    };
  };
}
```

执行失败时返回：
```typescript
{
  status: 'failure';
  output: {
    error: string;           // 错误信息
    saveAbility: string;      // 豁免属性
    saveDC: number;           // 豁免DC
    targetId: string;         // 目标ID
  };
}
```

## 执行逻辑

### 1. 参数验证
- 检查 `saveAbility` 参数的有效性
- 验证 `saveDC` 参数的有效性
- 确认 `advantage` 和 `disadvantage` 不能同时为true
- 验证 `autoFail` 和 `autoSucceed` 不能同时为true
- 检查 `damageOnFail` 和 `halfDamageOnSave` 的配置

### 2. 豁免检定准备
- **属性获取**：获取目标的豁免属性值
- **修正计算**：计算豁免属性的修正值
- **DC计算**：根据 `saveDC` 公式计算DC值
- **伤害计算**：根据 `damageOnFail` 公式计算伤害值

### 3. 豁免检定执行
- **自动失败**：如果 `autoFail` 为true，直接判定失败
- **自动成功**：如果 `autoSucceed` 为true，直接判定成功
- **优势处理**：如果 `advantage` 为true，投掷两个d20，取较高值
- **劣势处理**：如果 `disadvantage` 为true，投掷两个d20，取较低值
- **标准检定**：正常投掷一个d20

### 4. 结果判定
- **成功判定**：比较总豁免值与DC值
- **伤害计算**：根据豁免结果计算最终伤害
- **减半处理**：如果 `halfDamageOnSave` 为true且豁免成功，伤害减半
- **状态更新**：更新目标的状态

### 5. 结果生成
- **豁免结果**：生成豁免检定的详细结果
- **伤害结果**：生成伤害应用的详细结果
- **消息生成**：生成检定和伤害的详细消息
- **状态更新**：更新相关的状态信息

### 6. 状态更新
- **豁免记录**：记录豁免检定的详细信息
- **伤害记录**：记录伤害应用的详细信息
- **状态标记**：标记目标的状态变化
- **事件触发**：触发相关的事件

## 应用层映射

### UI 组件集成
- **主要组件**：`CombatSpellModal`
- **辅助组件**：`TurnTodoBoard`（豁免状态显示）
- **触发时机**：法术效果应用时
- **交互流程**：
  1. 系统显示豁免检定界面
  2. 显示豁免信息和DC值
  3. 系统执行豁免检定
  4. 显示豁免结果和伤害应用

### 豁免检定界面
- **豁免信息**：显示豁免属性、DC值、修正值
- **检定过程**：显示检定过程和结果
- **伤害显示**：显示伤害应用结果
- **状态提示**：显示状态变化信息

### 状态管理
- **豁免状态**：跟踪目标的豁免状态
- **伤害管理**：管理伤害的应用
- **状态效果**：管理状态效果的应用
- **事件系统**：触发相关的事件

## 使用示例

### 力量法术豁免
```yaml
- id: strength_spell_save
  type: saving_throw
  config:
    saveAbility: "strength"
    saveDC: "12"
    damageOnFail: "8"
    halfDamageOnSave: true
    advantage: false
    disadvantage: false
    autoFail: false
    autoSucceed: false
```

### 敏捷法术豁免
```yaml
- id: dexterity_spell_save
  type: saving_throw
  config:
    saveAbility: "dexterity"
    saveDC: "${spellLevel + 6}"
    damageOnFail: "Math.floor(Math.random() * 8) + 1"
    halfDamageOnSave: false
    advantage: true
    disadvantage: false
    autoFail: false
    autoSucceed: false
```

### 体质法术豁免
```yaml
- id: constitution_spell_save
  type: saving_throw
  config:
    saveAbility: "constitution"
    saveDC: "15"
    damageOnFail: "10"
    halfDamageOnSave: true
    advantage: false
    disadvantage: false
    autoFail: false
    autoSucceed: false
```

### 智力法术豁免
```yaml
- id: intelligence_spell_save
  type: saving_throw
  config:
    saveAbility: "intelligence"
    saveDC: "14"
    damageOnFail: "6"
    halfDamageOnSave: false
    advantage: false
    disadvantage: true
    autoFail: false
    autoSucceed: false
```

### 感知法术豁免
```yaml
- id: wisdom_spell_save
  type: saving_throw
  config:
    saveAbility: "wisdom"
    saveDC: "${spellLevel + 4}"
    damageOnFail: "Math.floor(Math.random() * 6) + 1"
    halfDamageOnSave: true
    advantage: false
    disadvantage: false
    autoFail: false
    autoSucceed: false
```

### 魅力法术豁免
```yaml
- id: charisma_spell_save
  type: saving_throw
  config:
    saveAbility: "charisma"
    saveDC: "13"
    damageOnFail: "4"
    halfDamageOnSave: false
    advantage: false
    disadvantage: false
    autoFail: false
    autoSucceed: false
```

## 最佳实践

### 1. 豁免设置
- **属性选择**：选择正确的豁免属性
- **DC设置**：根据法术描述设置正确的DC
- **伤害处理**：正确处理豁免失败时的伤害
- **减半处理**：正确处理豁免成功时的伤害减半

### 2. 优势劣势
- **优势条件**：正确设置豁免优势的条件
- **劣势条件**：正确设置豁免劣势的条件
- **同时处理**：正确处理优势劣势同时存在的情况
- **效果叠加**：正确处理多重优势或劣势的效果

### 3. 自动处理
- **自动失败**：正确设置自动失败的条件
- **自动成功**：正确设置自动成功的条件
- **优先级**：设置自动处理的优先级
- **条件检查**：检查自动处理的条件

### 4. 错误处理
- **参数验证**：验证输入参数的有效性
- **状态检查**：检查目标的状态
- **错误恢复**：提供错误恢复机制
- **错误提示**：提供清晰的错误信息

## 故障排除

### 常见问题

**问题1：豁免属性错误**
- **原因**：豁免属性选择错误
- **解决**：检查豁免属性的设置，确保正确

**问题2：DC计算错误**
- **原因**：DC值计算有误
- **解决**：检查DC值的计算逻辑，确保正确

**问题3：伤害计算错误**
- **原因**：伤害计算逻辑有误
- **解决**：检查伤害计算逻辑，确保正确

**问题4：豁免结果错误**
- **原因**：豁免检定计算有误
- **解决**：检查豁免检定的计算逻辑，确保正确

### 调试技巧

1. **启用详细日志**：记录豁免检定的每个步骤
2. **验证豁免计算**：检查豁免计算的结果
3. **测试不同场景**：测试各种豁免场景
4. **模拟目标状态**：自动化测试不同目标状态

## 相关节点

- **前置节点**：`select_target`（目标选择）
- **后续节点**：`apply_damage`（伤害应用）
- **相关功能**：`diceService.ts`（骰子投掷）、`characterStore.ts`（角色状态管理）
- **数据流**：将豁免结果传递给后续的伤害应用节点

## 扩展功能

### 高级豁免处理
- **多重豁免**：支持多重豁免的处理
- **豁免链**：支持豁免链的处理
- **豁免组合**：支持豁免组合的处理
- **豁免反馈**：支持豁免反馈的处理

### 豁免增强
- **豁免预测**：支持豁免预测的功能
- **豁免优化**：支持豁免优化的功能
- **豁免分析**：支持豁免分析的功能
- **豁免统计**：支持豁免统计的功能

### 性能优化
- **豁免缓存**：优化豁免检定的缓存
- **批量处理**：支持批量目标的豁免检定
- **异步处理**：支持异步的豁免检定
- **并发处理**：支持并发的豁免处理

## 规则说明

### D&D 5e 豁免规则
- **豁免属性**：每个角色有六个属性的豁免值
- **豁免检定**：d20 + 豁免修正值 ≥ DC
- **豁免成功**：检定值 ≥ DC
- **豁免失败**：检定值 < DC

### 法术豁免
- **豁免类型**：法术指定特定的豁免属性
- **豁免效果**：豁免成功或失败有不同的效果
- **豁免DC**：通常为法术等级 + 施法者属性修正 + 8
- **豁免伤害**：某些法术在豁免失败时造成伤害

### 伤害处理
- **全额伤害**：豁免失败时造成全额伤害
- **半额伤害**：豁免成功时造成半额伤害
- **无伤害**：某些法术豁免成功时无伤害
- **特殊效果**：某些法术有特殊的伤害处理机制

### 优势劣势规则
- **优势条件**：有利于豁免的条件
- **劣势条件**：不利于豁免的条件
- **同时存在**：优势劣势同时存在时相互抵消
- **多重效果**：多个优势或劣势效果的处理