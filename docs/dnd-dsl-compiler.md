# D&D 编译器 — 领域特定语言（DSL）架构文档

## 系统概述

这是一个**完整的 D&D 流程编排系统**，已实现从设计理念到可落地架构的完整闭环。系统将复杂的游戏机制抽象为可配置的流程节点，让 DM 可以通过可视化编辑器创建和管理法术流程。

**核心价值**：将硬编码的法术逻辑转变为数据驱动的流程配置，新增法术无需修改代码，只需编排流程节点即可。

---

## 架构设计理念

### 传统架构的局限性

传统 D&D 工具为每种法术编写独立的硬编码逻辑：
- **维护成本高**：新增法术需要修改核心代码，回归测试成本高
- **扩展性差**：复杂逻辑难以复用，代码膨胀严重
- **非程序员无法参与**：DM 无法直接创建自定义法术流程

### 我们的解决方案

将游戏流程抽象为**可配置的节点系统**：
- **节点原子化**：每个游戏机制环节都是一个独立的可配置节点
- **流程可视化**：通过拖拽编排复杂的法术流程
- **数据驱动**：法术逻辑以配置数据形式存储，无需修改代码

---

## 设计原则

### 1. 节点原子化（Atomic Nodes）

系统提供 8 种核心节点类型，每个节点都是可配置的游戏机制单元：

| 节点类型 | 功能描述 | 配置示例 |
|---------|---------|---------|
| **cast_start** | 智能施法开始，自动前置检查 | `spellId`, `autoChecks: {components, range, time}` |
| **target_select** | 目标指定，支持多种选择模式 | `targetMode: self/touch/range/area` |
| **saving_throw** | 豁免检定，集成优劣势系统 | `ability: str/dex/con/int/wis/cha`, `dc: 15` |
| **spell_attack** | 法术攻击检定 | `attackBonus: "+5"`, `damage: "2d6"` |
| **condition_branch** | 条件分支，基于游戏状态分流 | `condition: "hp < 50"`, `branches: [success, failure]` |
| **effect_apply** | 效果分配，处理伤害/治疗/状态 | `effectType: damage/heal/status`, `amount: "10"` |
| **concentration_check** | 专注检定，处理法术维持 | `concentrationDC: 10`, `autoFail: true` |
| **cast_end** | 法术结束，清理和收尾 | `cleanup: true`, `log: true` |

每个节点都有标准化的输入输出接口，支持动态配置和实时验证。

每个游戏机制的最小单元是一个**环节（Node）**，它有：
- **输入**：上游环节传递的数据（如"目标列表"、"豁免结果"）
- **处理**：执行特定逻辑（如"检测距离"、"掷骰判定"）
- **输出**：下游环节可用的数据（如"合格目标"、"豁免失败者名单"）
- **副作用**：对游戏状态的实际修改（如"扣减 HP"、"附加状态"）

**示例环节库**（不穷举，可扩展）：

| 环节类型 | 示例 | 输入 | 输出 |
|---------|------|------|------|
| `cast_start` | 施法开始 | 法术 ID、施法者 | 施法上下文 |
| `check_component` | 成分检测 | 法术成分、施法者状态 | 通过/失败 |
| `check_range` | 距离检测 | 施法者位置、目标位置、射程 | 合格目标 |
| `select_target` | 目标指定 | 选择模式（自身/单体/区域） | 目标列表 |
| `saving_throw` | 豁免检定 | 属性、DC、目标列表 | 成功/失败名单 |
| `condition_branch` | 条件分支 | 条件表达式（HP<阈值等） | 分流后的子集 |
| `apply_effect` | 效果分配 | 效果类型、目标、持续时间 | 已应用标记 |
| `cast_end` | 法术结束 | 最终状态 | 结算日志 |

### 2. 衔接声明式（Declarative Edges）

节点之间通过声明式的边（Edge）连接，定义数据流向和触发条件：

```json
{
  "from": "saving_throw",
  "to": "condition_branch",
  "data_map": {
    "failed_targets": "input_targets",
    "dc_value": "threshold_ref"
  },
  "trigger": "on_complete"
}
```

**衔接属性**：
- `from/to`：上下游节点 ID
- `data_map`：数据映射（上游输出 → 下游输入）
- `trigger`：触发时机（`on_complete`/`on_success`/`on_failure`）
- `condition`：可选条件守卫

**可视化编辑器**：支持拖拽创建连线，实时验证衔接关系，提供直观的流程编排体验。

**衔接属性**：
- `from` / `to`：上下游环节 ID
- `data_map`：数据映射（上游输出 → 下游输入）
- `trigger`：触发时机（`on_complete` / `on_success` / `on_failure` / `on_partial`）
- `condition`：可选的条件守卫（如"仅当失败目标数 > 0 时触发"）

### 3. 编码即数据（Code as Data）

法术以配置数据的形式存储，不再需要编写硬编码逻辑。以下是完整的法术流程配置示例：

```yaml
# 法术定义
spell_name: "火球术"
spell_id: "fireball"
casting_flow:
  nodes:
    # 智能施法开始
    - id: start
      type: cast_start
      config:
        spellId: "fireball"
        autoChecks:
          components: true  # 自动检查成分
          range: true      # 自动检查射程
          time: true       # 自动检查施法时间
    
    # 目标指定（20尺半径球状区域）
    - id: select_targets
      type: target_select
      config:
        targetMode: area
        area:
          type: sphere
          radius: 20
          shape: "球状"
    
    # 豁免检定（敏捷豁免）
    - id: dexterity_save
      type: saving_throw
      config:
        ability: dexterity
        dc: "${caster.spellSaveDc}"
        damageOnFail: true
    
    # 条件分支：根据豁免结果分流
    - id: damage_branch
      type: condition_branch
      config:
        condition: "saving_throw.success_count < saving_throw.target_count"
        branches:
          success: "half_damage"
          failure: "full_damage"
    
    # 效果分配：全额伤害
    - id: full_damage
      type: effect_apply
      config:
        effectType: damage
        amount: "8d6"
        damageType: fire
    
    # 效果分配：半额伤害
    - id: half_damage
      type: effect_apply
      config:
        effectType: damage
        amount: "4d6"
        damageType: fire
    
    # 法术结束
    - id: end
      type: cast_end
      config:
        cleanup: true
        log: true
```

**配置特性**：
- **模板变量**：支持 `${caster.spellSaveDc}` 等动态值
- **条件逻辑**：支持复杂的分支条件
- **数据映射**：节点间数据自动传递
- **实时验证**：配置时即时检查语法和逻辑

这段编码可以**作为法术定义的一部分**存进后端数据库（如 `spells` 表的 `casting_flow` JSON 字段），运行时由**编译器/解释器**加载执行。

---

## 系统架构

### 三层架构设计

```
┌─────────────────────────────────────────┐
│  编排层（Orchestrator）                 │
│  FlowCompiler: 流程执行引擎             │
│  功能：加载配置 → 构建执行图 → 调度运行   │
├─────────────────────────────────────────┤
│  环节层（Node Library）                 │
│  NODE_TYPE_REGISTRY: 节点类型注册表     │
│  功能：节点实例化 → 执行逻辑 → 结果返回   │
├─────────────────────────────────────────┤
│  状态层（Game State）                   │
│  combatStore: 游戏状态管理              │
│  功能：状态查询 → 受控修改 → 事件通知     │
└─────────────────────────────────────────┘
```

### 核心组件

#### 1. FlowCompiler - 编排器
```typescript
class FlowCompiler {
  // 执行完整流程
  executeFlow(flow: FlowDefinition, context: FlowExecutionContext): FlowExecutionResult
  
  // 执行单个节点
  executeNode(node: FlowNode, context: FlowExecutionContext): NodeExecutionResult
  
  // 验证流程配置
  validateFlow(flow: FlowDefinition): ValidationResult
}
```

#### 2. FlowExecutionContext - 执行上下文
```typescript
interface FlowExecutionContext {
  caster: Combatant;      // 施法者
  spell: Spell;          // 当前法术
  targets: Combatant[];  // 目标列表
  gameState: GameState;   // 游戏状态
  round: number;         // 当前回合
  log: FlowLog;         // 执行日志
}
```

#### 3. FlowNode - 节点接口
```typescript
interface FlowNode {
  id: string;
  type: string;
  config: Record<string, any>;
}
```

#### 4. NodeExecutionResult - 节点执行结果
```typescript
interface NodeExecutionResult {
  status: 'success' | 'failure' | 'partial';
  output: Record<string, any>;     // 下游可用数据
  mutations: StateMutation[];      // 状态变更
  nextNodes: string[];            // 下一节点ID
}
```

### 执行模型

#### 编译时阶段
1. **配置验证**：检查节点类型存在性、数据映射合法性、循环依赖
2. **执行图构建**：将流程配置转换为可执行的有向无环图
3. **依赖解析**：建立节点间的依赖关系和执行顺序

#### 运行时阶段
1. **初始化**：从 `cast_start` 节点开始，创建执行上下文
2. **深度优先执行**：按拓扑序执行节点，遇到分支时根据条件选择路径
3. **数据流传递**：节点间通过上下文对象传递数据，避免全局变量污染
4. **事务处理**：所有状态修改通过事务批量提交，支持回滚和预览

#### 错误处理
- **节点级错误**：单个节点执行失败时，记录错误并继续执行后续节点
- **流程级错误**：关键节点失败时，终止整个流程执行
- **状态回滚**：支持执行到中间状态时的回滚操作

## 系统集成

### 与现有 D&D 工具的集成

| 现有组件 | 集成方式 | 作用 |
|---------|---------|------|
| `types/spell.ts` | 扩展 `casting_flow?: FlowDefinition` | 法术流程配置存储 |
| `types/combat.ts` | `Combatant` 作为 `FlowContext` 的一部分 | 提供战斗状态数据 |
| `combatStore.ts` | 提供 `GameState` 查询接口 | 状态管理和事件通知 |
| `CombatSpellModal.tsx` | 集成 FlowCompiler | 替代硬编码施法逻辑 |
| `advantageRules.ts` | 在 `saving_throw` 节点中调用 | 优劣势判定支持 |
| `diceService.ts` | 在检定和伤害节点中调用 | 骰子投掷服务 |

### 新增核心组件

| 组件 | 类型 | 作用 |
|------|------|------|
| `types/flow.ts` | 类型定义 | FlowDefinition、ExecutionContext 等 |
| `src/lib/flowCompiler.ts` | 执行引擎 | 流程编译和执行 |
| `src/pages/FlowEditor.tsx` | UI 组件 | 可视化流程编辑器 |
| `src/pages/FlowList.tsx` | UI 组件 | 流程列表管理 |
| `src/pages/FlowDetail.tsx` | UI 组件 | 流程详情查看 |
| `src/data/flowStore.ts` | 状态管理 | 本地流程数据管理 |
| `src/data/bindingStore.ts` | 状态管理 | 法术-流程绑定关系 |
| `functions/api/flows/` | API 接口 | 流程 CRUD 操作 |

### 数据流架构

```
法术数据 (Spell)
    ↓
流程配置 (casting_flow)
    ↓
FlowCompiler
    ↓
节点执行 (Node Execution)
    ↓
状态变更 (State Mutation)
    ↓
UI 更新 (CombatSpellModal)
```

---

## 核心优势

### 1. 开发效率提升
- **新增法术**：写一段编码 → 存数据库 → 立即可用，无需修改代码
- **修改法术**：改编码 → 仅测试该法术，无需回归测试
- **复杂度管理**：环节复用，复杂度线性增长，避免代码膨胀

### 2. 用户友好性
- **DM 可视化编辑**：拖拽编排流程，无需编程知识
- **实时验证**：配置时即时检查语法和逻辑
- **直观调试**：可视化流程图，逐环节回放执行过程

### 3. 系统扩展性
- **数据驱动**：法术逻辑以配置数据形式存储，平台无关
- **插件化节点**：新节点类型可独立开发和部署
- **版本管理**：支持流程版本控制和回滚

### 4. 协作能力
- **发布同步**：本地草稿与远程正式版分离管理
- **批量操作**：支持流程批量发布和管理
- **权限控制**：DM 权限分级管理
- **法术绑定**：查看和管理绑定的法术
- **DM 权限**：编辑、删除权限控制

### 4. CombatSpellModal - 战斗施法
**功能**：游戏中的法术执行
- **流程执行**：加载并执行法术流程
- **实时反馈**：执行过程可视化展示
- **错误处理**：优雅处理执行异常

---

## 与现有系统的关系

## 快速上手指南

### 1. 创建新流程
1. 打开 FlowEditor 页面
2. 从节点库拖拽所需节点到画布
3. 连接节点创建流程关系
4. 配置每个节点的属性
5. 保存为草稿或直接发布

### 2. 绑定法术
1. 在 FlowList 中选择流程
2. 点击"绑定法术"按钮
3. 选择要绑定的法术
4. 发布流程后，法术将自动使用新流程

### 3. 修改现有流程
1. 在 FlowList 中找到目标流程
2. 点击"编辑"进入 FlowEditor
3. 修改节点配置或连接关系
4. 修改后重新发布
5. 绑定的法术将自动使用新流程

### 4. 调试流程
1. 在 FlowEditor 中点击"预览"按钮
2. 系统将模拟执行流程
3. 查看每个节点的执行结果
4. 支持单步调试和整体回放

## 最佳实践

### 1. 流程设计原则
- **单一职责**：每个节点只做一件事
- **数据流清晰**：确保节点间数据传递明确
- **错误处理**：为关键节点添加错误处理逻辑
- **性能优化**：避免不必要的节点和复杂的条件分支

### 2. 配置规范
- **命名规范**：节点ID使用有意义的名称
- **配置验证**：配置时注意实时验证提示
- **版本管理**：重要修改前创建备份
- **文档记录**：为复杂流程添加说明文档

### 3. 团队协作
- **分工合作**：不同 DM 负责不同类型的流程
- **代码审查**：通过 Pull Request 进行流程审查
- **版本同步**：定期拉取远程最新版本
- **测试验证**：发布前进行充分测试

## 总结

D&D DSL 编译器是一个**完整的可落地系统**，成功实现了从设计理念到实际架构的转变。通过可视化的流程编辑器，DM 可以像搭积木一样创建复杂的法术流程，无需编写代码即可实现游戏机制的定制化。

**核心价值**：
- **数据驱动**：将硬编码逻辑转变为配置数据
- **可视化编辑**：直观的拖拽式流程编排
- **实时验证**：配置时即时检查语法和逻辑
- **协作管理**：支持团队协作和版本控制

这个系统为 D&D 工具带来了**质的飞跃**，让 DM 可以轻松创建和管理复杂的游戏机制，真正实现了"无限扩展"的可能性。
