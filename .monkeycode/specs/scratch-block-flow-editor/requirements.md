# Requirements Document — Scratch 式积木化流程编辑器

Feature Name: scratch-block-flow-editor
Updated: 2026-11-18

## Introduction

将可视化流程编辑器从「自由画布 + 手动连线」模型重构为 Scratch 式积木模型：节点拓扑关系直接由积木的堆叠与嵌套结构编码，画布坐标退化为布局细节（最终消失）。执行顺序在视觉上即结构本身，用户通过拖拽吸附与插槽嵌套表达流程，悬空引用、孤立节点、缺分支出边等图结构错误因模型约束而结构性消失。

方针出处：DSL 编辑器开发时期确立的「重要的是节点之间的拓扑关系而不是位置关系」。当前实现以 XY 画布 + 边数组表达拓扑，位置与拓扑脱节，编辑负担与校验负担均由此产生。

## Glossary

- **块（Block）**：脚本中的单个积木，对应现有 FlowNodeDef 的一种节点类型。
- **帽子块（Hat Block）**：只能位于脚本顶部的入口块，对应 cast_start；每个脚本有且仅有一个。
- **堆叠块（Stack Block）**：普通步骤块，垂直堆叠，对应 select_target / saving_throw / attack_roll / apply_effect / scaled_effect / concentration_check / custom / cast_end。
- **C 形块（C-Block）**：内含嵌套插槽的块，对应 condition_branch，包含条件表达式与两个分支体（满足体 / 否则体）。
- **脚本（Script）**：帽子块 + 顶部序列，即一个流程的完整结构；对应现有 FlowDefinition 的执行语义。
- **插槽（Slot）**：可放置块的空位；序列插槽位于块之间，分支体插槽位于 C 形块内部。
- **吸附（Snap）**：拖拽释放时块自动贴合到目标插槽的行为。
- **脚本树（Script Tree）**：脚本的嵌套数据结构，作为编辑器的唯一读写格式。
- **编译产物（Compiled Graph）**：由脚本树生成的 nodes/edges 图，供云端存储与 flowCompiler 运行时消费。
- **迁移器（Migrator）**：把旧图流程转换为脚本树的纯函数。
- **黄金对照测试**：迁移 → 编译 → 与原流程在相同上下文下执行，比对执行日志一致性的验证方法。

## Requirements

### R1 脚本树作为编辑器唯一读写格式

**User Story:** 作为 DM，我希望编辑器直接编辑嵌套积木结构，使我能凭视觉结构确认执行顺序，所以我不再需要理解边数组与画布坐标。

#### Acceptance Criteria

1. WHEN 编辑器打开流程，系统 SHALL 加载脚本树并以堆叠 + 嵌套缩进方式渲染。
2. WHEN 用户在编辑器内执行任何结构操作，系统 SHALL 只修改脚本树。
3. WHEN 编辑器打开无脚本树字段的旧图流程，系统 SHALL 调用迁移器生成脚本树。
4. IF 迁移遇到回流边、多入口子图或同触发歧义出边，系统 SHALL 记录迁移告警并按「行为与旧运行时一致」的规则处理。
5. WHEN 用户发布流程，系统 SHALL 将脚本树编译为 nodes/edges 并与脚本树一同提交保存。

### R2 拓扑即结构：拖拽吸附与插槽嵌套

**User Story:** 作为 DM，我希望像拼 Scratch 积木一样把块拖进序列和分支体，使我能凭直觉表达流程而无需手动连线。

#### Acceptance Criteria

1. WHEN 用户拖拽块经过合法插入点，系统 SHALL 以插槽阴影高亮该插入位置。
2. WHEN 用户在插槽阴影处释放块，系统 SHALL 吸附块到该位置。
3. WHEN 用户拖动序列中部的块，系统 SHALL 保持该块及其全部嵌套子块为一个整体。
4. WHEN 用户拖动帽子块，系统 SHALL 仅允许释放位置为脚本顶部。
5. WHEN 用户对 C 形块操作，系统 SHALL 提供满足体与否则体两个嵌套插槽。
6. WHEN 脚本中已存在帽子块，系统 SHALL 阻止第二个帽子块进入任何插槽。
7. WHEN 用户删除块，系统 SHALL 仅删除该块及其嵌套子块，序列其余部分保持连续。

### R3 校验简化：结构不可能性取代拓扑检查

**User Story:** 作为 DM，我希望校验只告诉我配置层面的问题，所以我不再需要处理连线类错误。

#### Acceptance Criteria

1. WHEN 校验脚本树，系统 SHALL 检查节点配置必填项（沿用 NODE_CONFIG_SCHEMA 的 required 规则）。
2. WHEN 校验脚本树，系统 SHALL 检查每个脚本存在帽子块。
3. WHEN C 形块的条件表达式为空，系统 SHALL 报错指出该块。
4. 系统 SHALL 保证孤立块、悬空引用、重复连线、自环、分支缺出边类错误在脚本树中结构性不存在。
5. WHEN 校验通过，系统 SHALL 允许保存与发布（沿用「绑定拦截」门禁策略）。

### R4 编译等价性：脚本树与旧图语义一致

**User Story:** 作为运行时与云端的维护者，我希望脚本树编译产物与旧图执行语义一致，所以我无需改动 flowCompiler 与 D1 消费方。

#### Acceptance Criteria

1. WHEN 编译脚本树，系统 SHALL 产出的图在相同执行上下文下与源流程产生一致的执行日志。
2. WHEN 编译 C 形块，系统 SHALL 生成 condition_branch 节点及其 on_true/on_false 出边。
3. WHEN C 形块否则体为空，系统 SHALL 将否则路径编译为指向后续汇合点的 on_false 出边。
4. WHEN 黄金对照测试运行，系统 SHALL 验证编译产物执行日志与原流程执行日志完全一致。

### R5 只读视图同步

**User Story:** 作为玩家，我希望流程查看视图按积木结构呈现，使我阅读流程时能直接看到执行顺序。

#### Acceptance Criteria

1. WHEN FlowView 打开已发布流程，系统 SHALL 按脚本树渲染积木结构视图。
2. WHEN 脚本树缺失且仅有编译产物图，系统 SHALL 以现有图视图渲染。

### R6 AI 管线同步

**User Story:** 作为流程生成器（AI 产图管线）的维护者，我希望拓扑配方改为直接产出脚本树，所以我生成的流程天然满足结构合法性。

#### Acceptance Criteria

1. WHEN 流程生成器按拓扑配方建模机制，系统 SHALL 以脚本树结构产出流程定义。
2. WHEN 脚本树由生成器产出，系统 SHALL 复用同一编译器进入发布管线。

## Out of Scope（本轮明确不做）

- 结构化循环块（repeat / until）：现有运行时以 visited 防环，循环执行在当前引擎下本就不生效（回流边指向已访问节点时被跳过），回流边在迁移中按死代码丢弃，行为等价。
- 运行时原生树遍历（executeScript 直接递归）：编译桥接已满足等价性，原生遍历留待编译桥接稳定后评估。
- 脚本树与旧图的双向图编辑并存：脚本树为唯一编辑面，旧画布退役。
