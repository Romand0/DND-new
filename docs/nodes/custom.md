# custom - 自定义节点

## 功能概述

自定义节点是开放扩展的自定义逻辑节点，支持编写自定义代码实现复杂逻辑。这是系统扩展性的核心节点，允许开发者添加新的节点类型和功能。

## 状态
- ✅ **当前**：支持自定义扩展的节点
- 🔄 **重要性**：系统扩展性的关键节点

## 配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `code` | text | 否 | "" | 自定义代码 |
| `language` | select | 否 | "javascript" | 编程语言 |
| `inputSchema` | text | 否 | "" | 输入模式定义 |
| `outputSchema` | text | 否 | "" | 输出模式定义 |
| `timeout` | number | 否 | 5000 | 执行超时时间（毫秒） |

## 详细配置说明

### code - 自定义代码
- **类型**：文本输入
- **必填**：否
- **默认值**：`""`
- **说明**：要执行的自定义代码
- **支持语言**：JavaScript、TypeScript
- **示例**：
  ```javascript
  // 计算复杂伤害
  const totalDamage = targets.reduce((sum, target) => {
    return sum + Math.max(0, target.maxHp - target.currentHp);
  }, 0);
  
  return {
    success: true,
    totalDamage: totalDamage,
    message: `造成 ${totalDamage} 点总伤害`
  };
  ```

### language - 编程语言
- **类型**：下拉选择
- **必填**：否
- **默认值**：`"javascript"`
- **可选值**：
  - `"javascript"`：JavaScript
  - `"typescript"`：TypeScript
- **说明**：自定义代码使用的编程语言

### inputSchema - 输入模式定义
- **类型**：文本输入
- **必填**：否
- **默认值**：`""`
- **说明**：定义输入数据的模式
- **格式**：JSON Schema
- **示例**：
  ```json
  {
    "type": "object",
    "properties": {
      "caster": {"type": "object"},
      "targets": {"type": "array"},
      "spell": {"type": "object"}
    }
  }
  ```

### outputSchema - 输出模式定义
- **类型**：文本输入
- **必填**：否
- **默认值**：`""`
- **说明**：定义输出数据的模式
- **格式**：JSON Schema
- **示例**：
  ```json
  {
    "type": "object",
    "properties": {
      "success": {"type": "boolean"},
      "damage": {"type": "number"},
      "message": {"type": "string"}
    }
  }
  ```

### timeout - 执行超时时间
- **类型**：数字输入
- **必填**：否
- **默认值**：`5000`
- **说明**：代码执行的超时时间（毫秒）
- **范围**：1000-30000
- **用途**：防止代码执行时间过长

## 调用方式

### 基本自定义逻辑
```yaml
- id: custom_damage_calculation
  type: custom
  config:
    code: |
      const totalDamage = targets.reduce((sum, target) => {
        return sum + Math.floor(Math.random() * 6) + 1;
      }, 0);
      
      return {
        success: true,
        totalDamage: totalDamage,
        message: `造成 ${totalDamage} 点伤害`
      };
```

### 复杂条件判断
```yaml
- id: complex_condition_check
  type: custom
  config:
    code: |
      const hasLowHp = targets.some(target => target.currentHp < target.maxHp * 0.5);
      const hasStrongEnemy = targets.some(target => target.challengeRating > 5);
      
      if (hasLowHp && hasStrongEnemy) {
        return {
          success: true,
          action: "heal_prioritize",
          message: "检测到低血量目标和强敌，优先治疗"
        };
      } else {
        return {
          success: true,
          action: "damage_prioritize",
          message: "正常攻击模式"
        };
      };
```

### 数据转换处理
```yaml
- id: data_transformation
  type: custom
  config:
    code: |
      const transformedTargets = targets.map(target => ({
        id: target.id,
        name: target.name,
        effectiveHp: target.currentHp + (tempHp || 0),
        statusEffects: target.statusEffects || []
      }));
      
      return {
        success: true,
        transformedTargets: transformedTargets,
        message: "目标数据转换完成"
      };
```

### 外部API调用
```yaml
- id: external_api_call
  type: custom
  config:
    code: |
      try {
        const response = await fetch('https://api.example.com/weather', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            location: caster.location,
            spell: spell.name
          })
        });
        
        const weatherData = await response.json();
        
        return {
          success: true,
          weather: weatherData,
          message: "天气数据获取成功"
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          message: "天气数据获取失败"
        };
      }
```

## 输出数据

执行成功时返回：
```typescript
{
  status: 'success';
  output: {
    success: boolean;       // 执行是否成功
    data: any;             // 自定义代码返回的数据
    executionTime: number;  // 执行时间（毫秒）
    message: string;        // 执行结果消息
    logs: string[];        // 执行日志
  };
}
```

执行失败时返回：
```typescript
{
  status: 'failure';
  output: {
    error: string;         // 错误信息
    executionTime: number; // 执行时间（毫秒）
    logs: string[];       // 执行日志
    errorStack: string;   // 错误堆栈
  };
}
```

## 执行逻辑

### 1. 参数验证
- 检查 `code` 字段是否为空
- 验证 `language` 参数的有效性
- 确认 `timeout` 值在合理范围内

### 2. 沙箱准备
- **沙箱环境**：创建安全的代码执行环境
- **权限控制**：限制代码的访问权限
- **资源限制**：限制代码的资源使用

### 3. 数据绑定
- **输入数据**：将执行上下文绑定到代码中
- **全局变量**：提供必要的全局变量和函数
- **上下文传递**：将前置节点的结果传递给代码

### 4. 代码执行
- **语法检查**：检查代码的语法正确性
- **执行代码**：在沙箱中执行自定义代码
- **超时控制**：监控代码执行时间，防止超时

### 5. 结果处理
- **结果验证**：验证代码返回的结果格式
- **错误处理**：处理代码执行中的错误
- **日志记录**：记录代码执行的详细日志

### 6. 状态更新
- **结果缓存**：缓存代码执行结果
- **状态更新**：更新执行状态和结果
- **事件触发**：触发相关的事件

## 应用层映射

### UI 组件集成
- **主要组件**：FlowEditor 中的自定义节点编辑器
- **辅助组件**：代码编辑器、模式验证器
- **触发时机**：流程执行时
- **交互流程**：
  1. 用户配置自定义代码
  2. 系统验证代码语法
  3. 执行自定义代码
  4. 显示执行结果

### 代码编辑器
- **语法高亮**：支持JavaScript/TypeScript语法高亮
- **自动补全**：提供变量和函数的自动补全
- **实时验证**：实时验证代码语法
- **错误提示**：显示语法错误和提示

### 模式验证
- **输入验证**：验证输入数据的格式
- **输出验证**：验证输出数据的格式
- **类型检查**：检查数据类型的正确性
- **错误提示**：显示模式验证错误

## 使用示例

### 复杂伤害计算
```yaml
- id: complex_damage
  type: custom
  config:
    code: |
      // 基于目标的当前状态计算伤害
      const damage = targets.reduce((total, target) => {
        const baseDamage = Math.floor(Math.random() * 8) + 1;
        const multiplier = target.currentHp < target.maxHp * 0.5 ? 1.5 : 1;
        return total + Math.floor(baseDamage * multiplier);
      }, 0);
      
      return {
        success: true,
        damage: damage,
        message: `造成 ${damage} 点伤害`
      };
```

### 条件逻辑处理
```yaml
- id: conditional_logic
  type: custom
  config:
    code: |
      // 基于多个条件决定执行路径
      const conditions = {
        hasLowHpTargets: targets.some(t => t.currentHp < t.maxHp * 0.3),
        hasStrongEnemies: targets.some(t => t.challengeRating > 3),
        casterHasSpellSlots: caster.spellSlots > 0
      };
      
      if (conditions.hasLowHpTargets && conditions.casterHasSpellSlots) {
        return {
          success: true,
          action: "heal",
          priority: "high",
          message: "优先治疗低血量目标"
        };
      } else if (conditions.hasStrongEnemies) {
        return {
          success: true,
          action: "focus_fire",
          priority: "medium",
          message: "集中攻击强敌"
        };
      } else {
        return {
          success: true,
          action: "area_damage",
          priority: "low",
          message: "区域伤害攻击"
        };
      }
```

### 数据聚合处理
```yaml
- id: data_aggregation
  type: custom
  config:
    code: |
      // 聚合多个目标的数据
      const aggregatedData = {
        totalTargets: targets.length,
        totalHp: targets.reduce((sum, t) => sum + t.currentHp, 0),
        averageHp: targets.reduce((sum, t) => sum + t.currentHp, 0) / targets.length,
        statusEffects: [...new Set(targets.flatMap(t => t.statusEffects || []))],
        threatLevels: targets.map(t => ({
          id: t.id,
          name: t.name,
          threat: t.currentHp > t.maxHp * 0.7 ? 'high' : 'low'
        }))
      };
      
      return {
        success: true,
        aggregatedData: aggregatedData,
        message: "数据聚合完成"
      };
```

## 最佳实践

### 1. 代码设计
- **模块化**：将复杂逻辑分解为小的函数
- **错误处理**：添加适当的错误处理逻辑
- **性能优化**：避免不必要的计算和循环
- **可读性**：保持代码的清晰和可读性

### 2. 安全考虑
- **输入验证**：验证输入数据的合法性
- **输出清理**：清理输出数据中的敏感信息
- **权限控制**：限制代码的访问权限
- **资源管理**：合理使用系统资源

### 3. 调试支持
- **日志记录**：添加详细的日志记录
- **错误信息**：提供清晰的错误信息
- **调试工具**：提供调试和测试工具
- **性能监控**：监控代码的执行性能

### 4. 扩展性
- **插件系统**：支持插件系统的扩展
- **API接口**：提供清晰的API接口
- **版本管理**：支持代码的版本管理
- **文档支持**：提供详细的文档支持

## 故障排除

### 常见问题

**问题1：语法错误**
- **原因**：代码中存在语法错误
- **解决**：检查代码语法，使用语法检查工具

**问题2：执行超时**
- **原因**：代码执行时间过长
- **解决**：优化代码逻辑，增加超时时间

**问题3：权限错误**
- **原因**：代码试图访问受限资源
- **解决**：检查代码的权限需求，调整权限设置

**问题4：数据格式错误**
- **原因**：返回的数据格式不符合预期
- **解决**：检查返回数据的格式，确保符合模式定义

### 调试技巧

1. **启用详细日志**：记录代码执行的每个步骤
2. **分段执行**：将代码分段执行，定位问题
3. **单元测试**：为代码编写单元测试
4. **模拟数据**：使用模拟数据测试代码逻辑

## 相关节点

- **前置节点**：任何提供数据的节点
- **后续节点**：任何使用自定义节点输出的节点
- **相关功能**：FlowEditor 的可视化编辑功能
- **数据流**：从前置节点获取数据，向后续节点传递处理结果

## 扩展功能

### 高级特性
- **异步支持**：支持异步代码执行
- **依赖注入**：支持依赖注入机制
- **插件系统**：支持插件系统的扩展
- **API集成**：支持外部API的集成

### 开发工具
- **代码生成**：自动生成常用代码模板
- **调试器**：集成代码调试器
- **性能分析**：提供性能分析工具
- **版本控制**：集成版本控制系统

### 安全增强
- **代码签名**：支持代码签名验证
- **沙箱隔离**：增强沙箱隔离机制
- **资源限制**：更严格的资源限制
- **审计日志**：详细的审计日志记录

## 注意事项

### 使用限制
- **执行环境**：代码在沙箱环境中执行
- **访问权限**：代码的访问权限受到限制
- **资源限制**：代码的资源使用受到限制
- **超时控制**：代码执行时间受到超时控制

### 性能考虑
- **执行开销**：自定义代码的执行开销较大
- **内存使用**：注意代码的内存使用
- **CPU使用**：注意代码的CPU使用
- **响应时间**：注意代码的响应时间

### 维护考虑
- **代码复杂度**：自定义代码可能增加系统复杂度
- **测试负担**：需要额外的测试和维护
- **文档需求**：需要详细的文档和说明
- **版本管理**：需要良好的版本管理机制