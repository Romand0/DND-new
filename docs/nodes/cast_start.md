# cast_start - 智能施法开始

## 功能概述

智能施法开始节点是法术流程的智能入口点，自动执行前置检查（成分、射程、专注等）并初始化施法上下文。这是法术流程的核心节点，提供完整的施法前检查和初始化功能。

## 状态
- ✅ **当前**：主要使用的施法开始节点
- 🔄 **重要性**：法术流程智能化的关键节点

## 配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `autoChecks` | object | 否 | {} | 自动检查配置 |
| `spellSlots` | template | 否 | "1" | 消耗法术位数量 |
| `actions` | template | 否 | "1" | 消耗动作点数 |
| `concentration` | boolean | 否 | false | 是否需要专注 |
| `initialization` | object | 否 | {} | 初始化配置 |

## 详细配置说明

### autoChecks - 自动检查配置
- **类型**：对象配置
- **必填**：否
- **默认值**：`{}`
- **说明**：自动执行的前置检查配置
- **结构**：包含成分、射程、专注等检查配置
- **示例**：
  ```yaml
  autoChecks:
    components:
      enabled: true
      verbal: true
      somatic: true
      material: true
    range:
      enabled: true
      range: "60"
      targetMode: "sight"
    concentration:
      enabled: true
      dc: "10"
      damageHalf: false
  ```

### spellSlots - 消耗法术位数量
- **类型**：模板变量
- **必填**：否
- **默认值**：`"1"`
- **说明**：消耗的法术位数量
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"1"`
  - 模板变量：`"${spellLevel}"`
  - 计算表达式：`"Math.max(1, spellLevel - 1)"`
  - 零消耗：`"0"`（戏法）

### actions - 消耗动作点数
- **类型**：模板变量
- **必填**：否
- **默认值**：`"1"`
- **说明**：消耗的动作点数
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"1"`
  - 模板变量：`"${actionCost}"`
  - 计算表达式：`"spellLevel > 0 ? 1 : 0"`
  - 零消耗：`"0"`

### concentration - 是否需要专注
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：法术是否需要施法者专注
- **规则**：持续法术通常需要专注
- **用途**：处理持续法术的专注要求

### initialization - 初始化配置
- **类型**：对象配置
- **必填**：否
- **默认值**：`{}`
- **说明**：施法上下文的初始化配置
- **结构**：包含法术位、动作、专注等初始化配置
- **示例**：
  ```yaml
  initialization:
    spellSlots: "1"
    actions: "1"
    concentration: false
    message: "开始施法"
  ```

## 调用方式

### 基本智能施法
```yaml
- id: smart_cast_start
  type: cast_start
  config: {}
```

### 完整前置检查
```yaml
- id: full_checks_cast
  type: cast_start
  config:
    autoChecks:
      components:
        enabled: true
        verbal: true
        somatic: true
        material: true
      range:
        enabled: true
        range: "60"
        targetMode: "sight"
      concentration:
        enabled: true
        dc: "10"
        damageHalf: false
    spellSlots: "1"
    actions: "1"
    concentration: false
    initialization:
      spellSlots: "1"
      actions: "1"
      concentration: false
      message: "开始施法"
```

### 戏法施法（无消耗）
```yaml
- id: cantrip_cast
  type: cast_start
  config:
    autoChecks:
      components:
        enabled: true
        verbal: true
        somatic: false
        material: false
      range:
        enabled: true
        range: "60"
        targetMode: "sight"
    spellSlots: "0"
    actions: "0"
    concentration: false
    initialization:
      spellSlots: "0"
      actions: "0"
      concentration: false
      message: "施放戏法"
```

### 持续法术施法
```yaml
- id: concentration_spell
  type: cast_start
  config:
    autoChecks:
      components:
        enabled: true
        verbal: true
        somatic: true
        material: false
      range:
        enabled: true
        range: "30"
        targetMode: "touch"
      concentration:
        enabled: true
        dc: "10"
        damageHalf: false
    spellSlots: "2"
    actions: "1"
    concentration: true
    initialization:
      spellSlots: "2"
      actions: "1"
      concentration: true
      message: "开始持续法术"
```

### 高级法术施法
```yaml
- id: advanced_spell
  type: cast_start
  config:
    autoChecks:
      components:
        enabled: true
        verbal: true
        somatic: true
        material: true
      range:
        enabled: true
        range: "120"
        targetMode: "sight"
      concentration:
        enabled: true
        dc: "15"
        damageHalf: true
    spellSlots: "3"
    actions: "1"
    concentration: false
    initialization:
      spellSlots: "3"
      actions: "1"
      concentration: false
      message: "施放高级法术"
```

## 输出数据

执行成功时返回：
```typescript
{
  status: 'success';
  output: {
    spellId: string;         // 法术ID
    casterId: string;        // 施法者ID
    autoChecks: {            // 自动检查结果
      components: {
        enabled: boolean;
        verbal: boolean;
        somatic: boolean;
        material: boolean;
        passed: boolean;
        message: string;
      };
      range: {
        enabled: boolean;
        range: number;
        targetMode: string;
        passed: boolean;
        message: string;
      };
      concentration: {
        enabled: boolean;
        dc: number;
        damageHalf: boolean;
        passed: boolean;
        message: string;
      };
    };
    resources: {              // 资源消耗
      spellSlots: number;    // 消耗的法术位数量
      actions: number;       // 消耗的动作点数
      concentration: boolean; // 是否需要专注
    };
    initialization: {         // 初始化结果
      completed: boolean;     // 初始化是否完成
      message: string;       // 初始化消息
      context: any;          // 初始化的上下文
    };
    message: string;          // 总体执行消息
    executionTime: number;   // 执行时间（毫秒）
    checksPassed: boolean;    // 所有检查是否通过
    resourcesAvailable: boolean; // 资源是否可用
  };
}
```

执行失败时返回：
```typescript
{
  status: 'failure';
  output: {
    error: string;           // 错误信息
    spellId: string;         // 法术ID
    casterId: string;        // 施法者ID
    failedChecks: string[];  // 失败的检查项
    resourceIssues: string[]; // 资源问题
    autoChecks: {            // 自动检查结果
      components: {
        enabled: boolean;
        passed: boolean;
        message: string;
      };
      range: {
        enabled: boolean;
        passed: boolean;
        message: string;
      };
      concentration: {
        enabled: boolean;
        passed: boolean;
        message: string;
      };
    };
  };
}
```

## 执行逻辑

### 1. 参数验证
- 检查 `autoChecks` 配置的有效性
- 验证 `spellSlots` 和 `actions` 参数的有效性
- 确认 `concentration` 和 `initialization` 的配置
- 检查所有配置项的合理性

### 2. 自动检查执行
- **成分检查**：检查法术成分（言语、姿势、材料）
- **射程检查**：检查施法者与目标的射程
- **专注检查**：检查施法者的专注状态
- **检查结果**：汇总所有检查的结果

### 3. 资源检查
- **法术位检查**：检查施法者是否有足够的法术位
- **动作检查**：检查施法者是否有足够的动作点数
- **专注检查**：检查施法者是否可以维持专注
- **资源验证**：验证所有资源的可用性

### 4. 资源消耗
- **法术位消耗**：消耗相应的法术位
- **动作消耗**：消耗相应的动作点数
- **专注占用**：占用施法者的专注状态
- **状态更新**：更新施法者的资源状态

### 5. 上下文初始化
- **法术上下文**：初始化法术执行上下文
- **目标上下文**：初始化目标选择上下文
- **状态上下文**：初始化状态管理上下文
- **事件上下文**：初始化事件处理上下文

### 6. 结果生成
- **检查结果**：生成自动检查的详细结果
- **资源结果**：生成资源消耗的详细结果
- **初始化结果**：生成上下文初始化的详细结果
- **总体结果**：生成总体执行结果和消息

## 应用层映射

### UI 组件集成
- **主要组件**：`CombatSpellModal`
- **辅助组件**：`TurnTodoBoard`（专注状态显示）
- **触发时机**：玩家点击施法按钮时
- **交互流程**：
  1. 系统显示施法开始界面
  2. 执行自动前置检查
  3. 显示检查结果和资源状态
  4. 继续执行后续节点

### 施法开始界面
- **检查信息**：显示自动检查的结果
- **资源信息**：显示资源消耗和状态
- **初始化信息**：显示上下文初始化状态
- **状态提示**：显示施法准备状态

### 状态管理
- **检查状态**：跟踪自动检查的执行状态
- **资源状态**：跟踪资源的使用状态
- **专注状态**：跟踪施法者的专注状态
- **上下文状态**：跟踪法术上下文的初始化状态

## 使用示例

### 基本法术施法
```yaml
- id: basic_spell_cast
  type: cast_start
  config: {}
```

### 火球术施法
```yaml
- id: fireball_cast
  type: cast_start
  config:
    autoChecks:
      components:
        enabled: true
        verbal: true
        somatic: true
        material: false
      range:
        enabled: true
        range: "150"
        targetMode: "sight"
      concentration:
        enabled: false
        dc: "10"
        damageHalf: false
    spellSlots: "3"
    actions: "1"
    concentration: false
    initialization:
      spellSlots: "3"
      actions: "1"
      concentration: false
      message: "准备火球术"
```

### 治疗术施法
```yaml
- id: heal_cast
  type: cast_start
  config:
    autoChecks:
      components:
        enabled: true
        verbal: true
        somatic: true
        material: false
      range:
        enabled: true
        range: "60"
        targetMode: "touch"
      concentration:
        enabled: false
        dc: "10"
        damageHalf: false
    spellSlots: "1"
    actions: "1"
    concentration: false
    initialization:
      spellSlots: "1"
      actions: "1"
      concentration: false
      message: "准备治疗术"
```

### 持续火焰术施法
```yaml
- id:持续火焰术_cast
  type: cast_start
  config:
    autoChecks:
      components:
        enabled: true
        verbal: true
        somatic: true
        material: false
      range:
        enabled: true
        range: "60"
        targetMode: "touch"
      concentration:
        enabled: true
        dc: "10"
        damageHalf: false
    spellSlots: "2"
    actions: "1"
    concentration: true
    initialization:
      spellSlots: "2"
      actions: "1"
      concentration: true
      message: "准备持续火焰术"
```

## 最佳实践

### 1. 检查配置
- **检查项设置**：合理设置自动检查的项
- **检查顺序**：按照合理的顺序执行检查
- **检查逻辑**：确保检查逻辑的正确性
- **错误处理**：提供清晰的检查错误信息

### 2. 资源管理
- **资源检查**：正确检查资源的可用性
- **资源消耗**：合理消耗资源
- **资源恢复**：提供资源恢复机制
- **资源状态**：保持资源状态的一致性

### 3. 上下文管理
- **上下文初始化**：正确初始化法术上下文
- **上下文传递**：正确传递上下文给后续节点
- **上下文清理**：及时清理不再需要的上下文
- **上下文验证**：验证上下文的完整性

### 4. 错误处理
- **检查失败**：处理检查失败的情况
- **资源不足**：处理资源不足的情况
- **状态错误**：处理状态错误的情况
- **系统错误**：处理系统错误的情况

## 故障排除

### 常见问题

**问题1：检查失败**
- **原因**：自动检查逻辑有误
- **解决**：检查自动检查的逻辑，确保正确

**问题2：资源不足**
- **原因**：资源检查逻辑有误
- **解决**：检查资源检查的逻辑，确保正确

**问题3：上下文错误**
- **原因**：上下文初始化逻辑有误
- **解决**：检查上下文初始化的逻辑，确保正确

**问题4：状态不一致**
- **原因**：状态更新逻辑有误
- **解决**：检查状态更新的逻辑，确保正确

### 调试技巧

1. **启用详细日志**：记录施法开始的每个步骤
2. **验证检查结果**：检查自动检查的结果
3. **测试资源消耗**：测试资源消耗的逻辑
4. **模拟上下文初始化**：自动化测试上下文初始化

## 相关节点

- **后续节点**：`select_target`（目标选择）、`attack_roll`（攻击检定）
- **相关功能**：`characterStore.ts`（角色状态管理）、`combatStore.ts`（战斗状态管理）
- **数据流**：将施法上下文传递给后续的节点

## 扩展功能

### 高级检查
- **条件检查**：支持基于条件的检查
- **动态检查**：支持动态的检查逻辑
- **组合检查**：支持组合的检查逻辑
- **自定义检查**：支持自定义的检查逻辑

### 资源增强
- **资源预测**：支持资源预测功能
- **资源优化**：支持资源优化功能
- **资源恢复**：支持资源恢复功能
- **资源统计**：支持资源统计功能

### 上下文增强
- **上下文继承**：支持上下文的继承
- **上下文共享**：支持上下文的共享
- **上下文持久化**：支持上下文的持久化
- **上下文验证**：支持上下文的验证

## 规则说明

### D&D 5e 施法规则
- **成分要求**：法术需要特定的成分（言语、姿势、材料）
- **射程限制**：法术有射程限制
- **专注要求**：持续法术需要施法者专注
- **资源消耗**：法术消耗法术位和动作点数

### 自动检查规则
- **检查顺序**：按照成分→射程→专注的顺序执行检查
- **检查优先级**：检查失败的优先级高于资源检查
- **检查结果**：检查失败会阻止施法的继续
- **检查反馈**：提供清晰的检查反馈信息

### 资源消耗规则
- **法术位**：法术消耗相应等级的法术位
- **动作点数**：法术消耗相应的动作点数
- **专注占用**：持续法术占用施法者的专注
- **资源状态**：资源消耗后更新资源状态

### 上下文初始化规则
- **上下文创建**：创建法术执行的上下文
- **上下文传递**：将上下文传递给后续节点
- **上下文清理**：法术结束后清理上下文
- **上下文验证**：验证上下文的完整性