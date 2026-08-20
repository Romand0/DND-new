# select_target - 目标选择

## 功能概述

目标选择节点用于法术的目标选择，支持多种目标类型（单个目标、多个目标、自身、区域等）和选择方式（自动选择、手动选择、条件选择）。这是法术目标处理的核心节点，确保目标选择的准确性和灵活性。

## 状态
- ✅ **当前**：主要使用的目标选择节点
- 🔄 **重要性**：法术目标处理的关键节点

## 配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `targetType` | select | 否 | "single" | 目标类型 |
| `targetCount` | number | 否 | 1 | 目标数量 |
| `autoSelect` | boolean | 否 | false | 是否自动选择 |
| `selectionCriteria` | text | 否 | "" | 选择条件 |
| `includeSelf` | boolean | 否 | false | 是否包含自身 |
| `maxRange` | template | 否 | "60" | 最大射程 |
| `minRange` | template | 否 | "5" | 最小射程 |
| `areaShape` | select | 否 | "sphere" | 区域形状 |
| `areaSize` | template | 否 | "20" | 区域大小 |

## 详细配置说明

### targetType - 目标类型
- **类型**：下拉选择
- **必填**：否
- **默认值**：`"single"`
- **可选值**：
  - `"single"`：单个目标
  - `"multiple"`：多个目标
  - `"self"`：自身
  - `"area"`：区域目标
  - `"cone"`：锥形区域
  - `"line"`：直线区域
  - `"cube"`：立方体区域
- **说明**：法术的目标选择类型

### targetCount - 目标数量
- **类型**：数字输入
- **必填**：否
- **默认值**：`1`
- **说明**：选择的目标数量
- **范围**：1-10（根据法术描述设置）
- **用途**：控制选择的目标数量

### autoSelect - 是否自动选择
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：是否自动选择目标
- **规则**：自动选择时根据条件选择最优目标
- **用途**：处理自动目标选择的情况

### selectionCriteria - 选择条件
- **类型**：文本输入
- **必填**：否
- **默认值**：`""`
- **说明**：目标选择的条件表达式
- **规则**：支持JavaScript语法和变量引用
- **示例**：
  - 生命值条件：`"target.hp < target.maxHp * 0.5"`
  - 威胁等级：`"target.threatLevel > 3"`
  - 目标类型：`"target.type === 'undead'"`
  - 距离条件：`"distance < 30"`

### includeSelf - 是否包含自身
- **类型**：布尔值
- **必填**：否
- **默认值**：`false`
- **说明**：是否包含施法者自身作为目标
- **规则**：某些法术可以影响施法者自身
- **用途**：处理可以影响自身的法术

### maxRange - 最大射程
- **类型**：模板变量
- **必填**：否
- **默认值**：`"60"`
- **说明**：法术的最大射程（尺）
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"60"`
  - 模板变量：`"${spellRange}"`
  - 计算表达式：`"spellLevel * 30"`

### minRange - 最小射程
- **类型**：模板变量
- **必填**：否
- **默认值**：`"5"`
- **说明**：法术的最小射程（尺）
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"5"`
  - 模板变量：`"${spellMinRange}"`
  - 计算表达式：`"10"`

### areaShape - 区域形状
- **类型**：下拉选择
- **必填**：否
- **默认值**：`"sphere"`
- **可选值**：
  - `"sphere"`：球形区域
  - `"cube"`：立方体区域
  - `"cone"`：锥形区域
  - `"line"`：直线区域
  - `"cylinder"`：圆柱体区域
- **说明**：法术影响的区域形状

### areaSize - 区域大小
- **类型**：模板变量
- **必填**：否
- **默认值**：`"20"`
- **说明**：法术影响区域的大小
- **规则**：支持JavaScript表达式和变量引用
- **示例**：
  - 固定值：`"20"`
  - 模板变量：`"${spellArea}"`
  - 计算表达式：`"spellLevel * 10"`

## 调用方式

### 单个目标选择
```yaml
- id: single_target
  type: select_target
  config:
    targetType: "single"
    targetCount: 1
    autoSelect: false
    selectionCriteria: "target.hp < target.maxHp * 0.5"
    includeSelf: false
    maxRange: "60"
    minRange: "5"
    areaShape: "sphere"
    areaSize: "20"
```

### 多个目标选择
```yaml
- id: multiple_targets
  type: select_target
  config:
    targetType: "multiple"
    targetCount: 3
    autoSelect: true
    selectionCriteria: "target.threatLevel > 2"
    includeSelf: false
    maxRange: "90"
    minRange: "10"
    areaShape: "sphere"
    areaSize: "30"
```

### 自身目标
```yaml
- id: self_target
  type: select_target
  config:
    targetType: "self"
    targetCount: 1
    autoSelect: true
    selectionCriteria: ""
    includeSelf: true
    maxRange: "0"
    minRange: "0"
    areaShape: "sphere"
    areaSize: "0"
```

### 区域目标选择
```yaml
- id: area_targets
  type: select_target
  config:
    targetType: "area"
    targetCount: 0
    autoSelect: true
    selectionCriteria: "true"
    includeSelf: false
    maxRange: "60"
    minRange: "0"
    areaShape: "sphere"
    areaSize: "20"
```

### 锥形区域选择
```yaml
- id: cone_targets
  type: select_target
  config:
    targetType: "cone"
    targetCount: 0
    autoSelect: true
    selectionCriteria: "true"
    includeSelf: false
    maxRange: "60"
    minRange: "0"
    areaShape: "cone"
    areaSize: "30"
```

## 输出数据

执行成功时返回：
```typescript
{
  status: 'success';
  output: {
    targetType: string;        // 目标类型
    targetCount: number;       // 目标数量
    selectedTargets: string[]; // 选择的目标ID列表
    autoSelected: boolean;     // 是否自动选择
    selectionCriteria: string; // 选择条件
    includeSelf: boolean;      // 是否包含自身
    maxRange: number;          // 最大射程
    minRange: number;          // 最小射程
    areaShape: string;         // 区域形状
    areaSize: number;          // 区域大小
    message: string;           // 选择结果消息
    executionTime: number;     // 执行时间（毫秒）
    targetDetails: Array<{     // 目标详细信息
      id: string;
      name: string;
      hp: number;
      maxHp: number;
      distance: number;
      threatLevel: number;
      type: string;
    }>;
  };
}
```

执行失败时返回：
```typescript
{
  status: 'failure';
  output: {
    error: string;             // 错误信息
    targetType: string;        // 目标类型
    targetCount: number;       // 目标数量
    availableTargets: number; // 可用目标数量
  };
}
```

## 执行逻辑

### 1. 参数验证
- 检查 `targetType` 参数的有效性
- 验证 `targetCount` 在合理范围内
- 确认 `autoSelect` 和 `selectionCriteria` 的配置
- 检查 `maxRange` 和 `minRange` 的合理性
- 验证 `areaShape` 和 `areaSize` 的配置

### 2. 目标收集
- **可用目标**：收集战场上所有可用的目标
- **距离过滤**：根据射程过滤目标
- **类型过滤**：根据目标类型过滤
- **状态过滤**：根据目标状态过滤

### 3. 目标选择
- **自动选择**：如果 `autoSelect` 为true，根据条件自动选择
- **手动选择**：如果 `autoSelect` 为false，等待用户选择
- **条件应用**：根据 `selectionCriteria` 筛选目标
- **数量控制**：控制选择的目标数量

### 4. 区域处理
- **区域计算**：根据 `areaShape` 和 `areaSize` 计算影响区域
- **区域检查**：检查目标是否在影响区域内
- **区域过滤**：过滤掉区域外的目标
- **区域应用**：应用区域效果到目标

### 5. 结果生成
- **目标列表**：生成选择的目标列表
- **选择信息**：生成目标选择的详细信息
- **区域信息**：生成区域影响的详细信息
- **消息生成**：生成目标选择的结果消息

### 6. 状态更新
- **目标状态**：更新目标的选择状态
- **施法状态**：更新施法者的状态
- **事件触发**：触发目标选择相关的事件
- **日志记录**：记录目标选择的详细日志

## 应用层映射

### UI 组件集成
- **主要组件**：`CombatSpellModal`
- **辅助组件**：`Battleground`（战场显示）
- **触发时机**：法术施法过程中
- **交互流程**：
  1. 系统显示目标选择界面
  2. 显示可选择的目标列表
  3. 系统执行目标选择逻辑
  4. 显示选择结果和状态

### 目标选择界面
- **目标列表**：显示可选择的目标列表
- **选择信息**：显示目标的选择信息
- **区域显示**：显示法术的影响区域
- **交互控制**：提供目标选择的交互控制

### 状态管理
- **目标状态**：跟踪目标的选择状态
- **施法状态**：跟踪施法者的状态
- **区域状态**：跟踪法术区域的状态
- **事件系统**：触发目标选择相关的事件

## 使用示例

### 治疗术目标选择
```yaml
- id: heal_targets
  type: select_target
  config:
    targetType: "single"
    targetCount: 1
    autoSelect: true
    selectionCriteria: "target.hp < target.maxHp * 0.5"
    includeSelf: true
    maxRange: "60"
    minRange: "0"
    areaShape: "sphere"
    areaSize: "0"
```

### 火球术目标选择
```yaml
- id: fireball_targets
  type: select_target
  config:
    targetType: "area"
    targetCount: 0
    autoSelect: true
    selectionCriteria: "true"
    includeSelf: false
    maxRange: "150"
    minRange: "0"
    areaShape: "sphere"
    areaSize: "20"
```

### 传送术目标选择
```yaml
- id: teleport_targets
  type: select_target
  config:
    targetType: "single"
    targetCount: 1
    autoSelect: false
    selectionCriteria: "distance < 60"
    includeSelf: false
    maxRange: "60"
    minRange: "0"
    areaShape: "sphere"
    areaSize: "0"
```

### 魔法飞弹目标选择
```yaml
- id: magic_missile_targets
  type: select_target
  config:
    targetType: "multiple"
    targetCount: 3
    autoSelect: true
    selectionCriteria: "target.isHostile"
    includeSelf: false
    maxRange: "120"
    minRange: "0"
    areaShape: "sphere"
    areaSize: "0"
```

## 最佳实践

### 1. 目标选择设计
- **选择类型**：选择合适的目标类型
- **选择数量**：设置合理的目标数量
- **选择条件**：设计清晰的选择条件
- **自动选择**：提供智能的自动选择逻辑

### 2. 区域处理
- **区域形状**：选择合适的区域形状
- **区域大小**：设置合理的区域大小
- **区域计算**：准确计算区域影响
- **区域显示**：清晰地显示区域范围

### 3. 距离处理
- **射程限制**：正确设置射程限制
- **距离计算**：准确计算目标距离
- **距离过滤**：合理过滤目标
- **距离提示**：提供距离提示

### 4. 错误处理
- **参数验证**：验证输入参数的有效性
- **目标检查**：检查目标的存在性
- **条件验证**：验证选择条件的有效性
- **错误恢复**：提供错误恢复机制

## 故障排除

### 常见问题

**问题1：目标选择错误**
- **原因**：目标选择逻辑有误
- **解决**：检查目标选择的逻辑，确保正确

**问题2：区域计算错误**
- **原因**：区域计算逻辑有误
- **解决**：检查区域计算的逻辑，确保正确

**问题3：距离计算错误**
- **原因**：距离计算逻辑有误
- **解决**：检查距离计算的逻辑，确保正确

**问题4：条件筛选错误**
- **原因**：条件筛选逻辑有误
- **解决**：检查条件筛选的逻辑，确保正确

### 调试技巧

1. **启用详细日志**：记录目标选择的每个步骤
2. **验证目标列表**：检查目标列表的内容
3. **测试区域计算**：测试各种区域形状和大小
4. **模拟距离变化**：自动化测试不同距离场景

## 相关节点

- **前置节点**：`cast_start`（施法开始）
- **后续节点**：`attack_roll`（攻击检定）、`saving_throw`（豁免检定）
- **相关功能**：`Battleground`（战场网格）、`combatStore.ts`（状态管理）
- **数据流**：将选择的目标传递给后续的检定节点

## 扩展功能

### 高级目标选择
- **智能选择**：基于AI的目标选择
- **优先级选择**：基于优先级的目标选择
- **条件选择**：基于复杂条件的目标选择
- **组合选择**：基于组合条件的目标选择

### 区域增强
- **动态区域**：支持动态变化的区域
- **区域叠加**：支持区域的叠加效果
- **区域限制**：支持区域的限制条件
- **区域效果**：支持区域的特殊效果

### 选择增强
- **选择历史**：记录目标选择的历史
- **选择统计**：统计目标选择的数据
- **选择优化**：优化目标选择的算法
- **选择学习**：学习目标选择的模式

## 规则说明

### D&D 5e 目标选择规则
- **目标类型**：法术可以有不同的目标类型
- **选择方式**：可以是自动选择或手动选择
- **射程限制**：法术有射程限制
- **区域影响**：区域法术影响特定区域内的目标

### 区域形状规则
- **球形区域**：影响球形区域内的所有目标
- **锥形区域**：影响锥形区域内的所有目标
- **直线区域**：影响直线区域内的所有目标
- **立方体区域**：影响立方体区域内的所有目标

### 选择条件规则
- **生命值条件**：基于目标生命值的选择
- **威胁等级**：基于目标威胁等级的选择
- **目标类型**：基于目标类型的选择
- **距离条件**：基于目标距离的选择

### 自动选择规则
- **最优目标**：选择最优的目标
- **条件匹配**：匹配选择条件的目标
- **数量控制**：控制选择的目标数量
- **区域过滤**：过滤区域外的目标