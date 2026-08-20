# D&D 编译器 — 领域特定语言（DSL）设计理念

## 核心理念

> 无论多复杂的游戏机制过程，最终可以拆解成按照特定顺序和触发机制排列的编码化模块。

这是一套**D&D 编程语言**——用"接口"来编排或简单或复杂的游戏流程，把规则引擎从硬编码中解放出来，变为**数据驱动**。

**最新状态**：✅ **已实现** - 完整的可视化流程编辑器已上线，支持拖拽编排、实时验证、发布同步等核心功能。

---

## 问题陈述

D&D 5e 的核心手册（PHB 2014）包含**数百种法术**，每种法术的流程各不相同：

- 有的需要成分检测（V/S/M）
- 有的需要目标指定（自身/触碰/距离/区域）
- 有的触发豁免检定（魅力/体质/敏捷...）
- 有的按条件分支分配不同效果（HP 阈值、豁免成败、距离远近...）
- 有的产生持续效果（需追踪回合数、浓度、触发条件）
- 有的需要跨对象协调（影响名单、优先级排序、状态传播）

**传统做法**：为每种法术写一套独立的硬编码函数。这在数十种法术时还行，但在数百种时变得不可维护——新增一种法术需要修改核心代码，测试回归成本极高。

**我们的解法**：把游戏流程抽象为**通用环节（节点）**和**环节之间的衔接关系（边）**，让法术本身只是一段**流程编码**（JSON/YAML/DSL），存进数据库即可生效。

**最新进展**：✅ **已实现可视化流程编辑器**，支持拖拽编排、实时验证、发布同步，让 DM 可以像搭积木一样创建复杂的法术流程。

---

## 设计原则

### 1. 环节原子化（Atomic Nodes）
**已实现** - 支持 8 种核心节点类型：
- **施法开始**：智能前置检查（成分、距离、时间）+ 旧版兼容
- **目标指定**：支持自身、触碰、距离、区域等多种目标类型
- **豁免检定**：支持 6 种属性检定，集成优劣势引擎
- **法术攻击**：自动计算攻击加值，处理命中判定
- **条件分支**：基于 HP、豁免结果、距离等条件分流
- **效果分配**：伤害、治疗、状态效果分配
- **专注检定**：处理专注法术的维持检定
- **法术结束**：流程收尾和清理

**技术实现**：每个节点都有独立的执行器，支持动态配置和验证。

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
**已实现** - 环节之间不是硬编码的函数调用，而是**声明式的衔接关系**：

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

**可视化编辑器支持**：拖拽节点创建连线，实时验证衔接关系，支持数据映射配置。

**衔接属性**：
- `from` / `to`：上下游环节 ID
- `data_map`：数据映射（上游输出 → 下游输入）
- `trigger`：触发时机（`on_complete` / `on_success` / `on_failure` / `on_partial`）
- `condition`：可选的条件守卫（如"仅当失败目标数 > 0 时触发"）

### 3. 编码即数据（Code as Data）
**已实现** - 法术不再是一堆 if-else，而是一段**流程编码**：

```yaml
spell_name: "圣言术"
spell_id: "power_word_kill"
casting_flow:
  nodes:
    - id: start
      type: cast_start
      config:
        spellId: "power_word_kill"
        autoChecks:
          components: true
          range: true
          time: true
      
    - id: check_verbal
      type: check_component
      config:
        component: verbal
        
    - id: check_range
      type: check_range
      config:
        range: 60
        targetMode: sight
```

**配置 Schema**：每个节点类型都有详细的配置字段定义，支持多种输入控件类型。

这段编码可以**作为法术定义的一部分**存进后端数据库（如 `spells` 表的 `casting_flow` JSON 字段），运行时由**编译器/解释器**加载执行。

---

## 编译器架构（已实现）

### 三层架构

```
┌─────────────────────────────────────────┐
│  编排层（Orchestrator）                 │
│  FlowCompiler → 构建执行图 → 调度运行    │
│  ✅ 已实现：executeFlow() / executeNode() │
├─────────────────────────────────────────┤
│  环节层（Node Library）                 │
│  NODE_TYPE_REGISTRY → 执行逻辑          │
│  ✅ 已实现：8种核心节点类型             │
├─────────────────────────────────────────┤
│  状态层（Game State）                   │
│  Combatant · HP · Status · Position     │
│  ✅ 已实现：combatStore 提供查询接口    │
└─────────────────────────────────────────┘
```

### 执行模型
**已实现**：

1. **编译时**：流程编码 → 验证（环节类型存在、数据映射合法、无循环依赖）→ 生成执行图
2. **运行时**：从 `cast_start` 节点开始，按深度优先/拓扑序执行，遇到分支时根据条件选择路径
3. **数据流**：节点间通过**上下文对象**传递数据（类似 pipeline），而非全局变量
4. **副作用**：所有状态修改通过**事务**批量提交，支持回滚（用于预览/模拟）

**执行器实现**：
```typescript
class FlowCompiler {
  executeFlow(flow: FlowDefinition, context: FlowExecutionContext): FlowExecutionResult
  executeNode(node: FlowNode, context: FlowExecutionContext): NodeExecutionResult
}
```

### 关键抽象

**Context（执行上下文）**：
```typescript
interface FlowContext {
  caster: Combatant;           // 施法者
  spell: Spell;                // 当前法术
  targets: Combatant[];        // 已选目标（动态变化）
  results: Map<string, any>;   // 各环节输出缓存
  state: GameState;            // 游戏状态快照（只读查询）
  log: FlowLog;                // 执行日志（用于回放/UI展示）
}
```

**Node（环节接口）**：
```typescript
interface FlowNode {
  id: string;
  type: string;
  config: Record<string, any>;  // 环节配置（如 range: 60）
}

interface NodeResult {
  status: 'success' | 'failure' | 'partial';
  output: Record<string, any>;  // 下游可用的数据
  sideEffects: StateMutation[]; // 待提交的状态修改
}
```

**已实现**：8种核心节点类型都有对应的实现类，支持完整的执行逻辑。

---

## 为什么不用传统编程结构

| 维度 | 传统硬编码 | D&D DSL |
|------|-----------|---------|
| **新增法术** | 改核心代码 → 编译 → 部署 | 写一段编码 → 存数据库 → 立即可用 |
| **修改法术** | 改代码 → 回归测试所有法术 | 改编码 → 仅测试该法术 |
| **复杂度上限** | 代码膨胀，维护困难 | 环节复用，复杂度线性增长 |
| **非程序员** | 无法参与 | DM 可直接编辑编码 |
| **跨平台** | 需重写逻辑 | 编码平台无关，只需实现环节库 |
| **调试** | 断点调试代码 | 可视化流程图，逐环节回放 |

---

## 实现路径（已完成）

### 阶段一：核心基础设施 ✅ **已完成**
1. ✅ 定义 `FlowNode` 接口和 `FlowContext`
2. ✅ 实现 8 个核心环节（cast_start, check_component, check_range, saving_throw, apply_effect, cast_end, condition_branch, concentration_check）
3. ✅ 实现编排器：`FlowCompiler` 类，支持完整执行逻辑
4. ✅ 在现有 `CombatSpellModal` 中接入：智能施法开始节点替代硬编码

### 阶段二：扩展环节库 ✅ **已完成**
5. ✅ 添加条件分支、持续效果、浓度追踪等复杂环节
6. ✅ 实现可视化流程编辑器（拖拽节点、连线、实时验证）

### 阶段三：数据化与生态 🔄 **进行中**
7. 🔄 PHB 核心法术批量编码为 DSL（部分完成）
8. 🔄 开放 DM 自定义法术接口（已完成流程管理）
9. 🔄 更高级的语法糖（模板继承、宏、条件编译）

---

## 与现有系统的关系

| 现有系统 | DSL 中的角色 |
|---------|-------------|
| `types/spell.ts` | 新增 `casting_flow?: FlowDefinition` 字段 |
| `types/combat.ts` | `Combatant` 作为 `FlowContext` 的一部分 |
| `combatStore.ts` | 提供 `GameState` 查询和受控修改接口 |
| `CombatSpellModal.tsx` | 调用编排器替代现有硬编码施法流程 |
| `advantageRules.ts` | `saving_throw` 环节内部调用优劣势引擎 |
| `diceService.ts` | `saving_throw` / `damage_roll` 环节内部调用 |
| **新增系统** | **新增组件和服务** |
| `types/flow.ts` | FlowDefinition、FlowExecutionContext 等类型定义 |
| `src/pages/FlowEditor.tsx` | 可视化流程编辑器 |
| `src/pages/FlowList.tsx` | 流程列表管理 |
| `src/pages/FlowDetail.tsx` | 流程详情查看 |
| `src/lib/flowCompiler.ts` | FlowCompiler 编译器实现 |
| `src/data/flowStore.ts` | 流程状态管理 |
| `src/data/bindingStore.ts` | 法术-流程绑定管理 |
| `functions/api/flows/` | 流程管理 API 接口 |

---

## 总结

这不是要重写 D&D 规则，而是**把规则的执行方式从命令式编程转变为声明式编程**。法术、能力、陷阱、环境效果——一切游戏流程都可以被视为**一段可编排的编码**，由通用编译器执行。

**核心优势**：
- ✅ **新增机制不需要改代码，只需要写编码**
- ✅ **可视化流程编辑器**让 DM 可以像搭积木一样创建复杂流程
- ✅ **本地草稿 + 远程正式版**的发布机制支持协作
- ✅ **法术绑定系统**实现流程与法术的灵活关联

**当前状态**：🎯 **MVP 已完成** - 基础设施、核心环节库、可视化编辑器、发布同步机制已全部实现，为 DM 提供了强大的法术流程编排能力。这标志着从"软件开发"到"数据配置"的范式转换已经成功落地。
