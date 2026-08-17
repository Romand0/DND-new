# src/types/flow.ts

## 功能概述

该文件定义了 D&D DSL 可视化编译器中流程编排相关的类型。它将游戏机制过程编码为可视化流程图，其中节点代表游戏环节的原子单元，边代表节点之间的衔接关系。这些类型定义了流程图的结构和元素，为可视化编辑和执行流程提供了基础。

## 主要导出/接口

### 类型

- `FlowNodeType`: 节点类型枚举，定义了不同类型的游戏环节。
- `FlowNodePosition`: 节点在画布上的位置。
- `FlowNodeDef`: 单个节点定义，包括唯一 ID、类型、标签、位置、配置和备注。
- `EdgeTrigger`: 边的触发时机，如完成、成功、失败等。
- `FlowEdgeDef`: 单条边定义，包括唯一 ID、上游节点 ID、下游节点 ID、触发时机、标签、数据映射和条件。
- `FlowCategory`: 流程类别枚举，如法术、职业特性和自定义。
- `NodeTypeMeta`: 节点类型的元信息，用于展示和拖放。
- `ConfigFieldType`: 字段输入控件类型，如下拉单选、数字输入等。
- `SelectOption`: 下拉选项，定义中文标签和 DSL 值。
- `ConfigFieldSchema`: 单个配置字段的 Schema，包括键名、标签、控件类型、选项等。
- `FlowExecutionContext`: 执行上下文，包含施法者 ID、目标列表、输出缓存、游戏状态快照和执行日志。
- `FlowLogEntry`: 单条执行日志，包含时间戳、节点 ID、节点类型、状态、消息和数据。
- `NodeExecutionResult`: 节点执行结果，包含状态和输出。
- `StateMutation`: 状态变更操作，包含目标 ID、属性路径、旧值、新值和原因。

### 函数

- `parseFlowId(id: string)`: 解析合格 ID。
- `buildFlowId(category: FlowCategory, slug: string)`: 构建合格 ID。
- `nameToSlug(name: string)`: 名称转换为 slug 建议。
- `groupNodeTypesByCategory()`: 按分类分组节点类型。
- `serializeFlow(flow: FlowDefinition)`: 将 FlowDefinition 序列化为 JSON 字符串。
- `deserializeFlow(json: string)`: 从 JSON 字符串反序列化。
- `validateFlow(flow: FlowDefinition)`: 验证流程定义的基础合法性。

## 核心实现说明

该文件定义了流程编排的核心类型，包括节点、边、流程定义等。这些类型定义了流程图的结构和元素，为可视化编辑和执行流程提供了基础。节点类型枚举定义了不同类型的游戏环节，如施法开始、成分检测、距离检测等。节点定义包含了节点的唯一 ID、类型、标签、位置、配置和备注等信息。边定义包含了边的唯一 ID、上游节点 ID、下游节点 ID、触发时机、标签、数据映射和条件等信息。流程定义包含了流程的唯一 ID、名称、描述、节点列表、边列表、标签和版本号等信息。

## 注意事项或使用方式

- 使用 `FlowNodeDef` 定义单个节点时，需要指定节点的唯一 ID、类型、标签、位置、配置和备注。
- 使用 `FlowEdgeDef` 定义边时，需要指定边的唯一 ID、上游节点 ID、下游节点 ID、触发时机、标签、数据映射和条件。
- 使用 `FlowDefinition` 定义流程时，需要指定流程的唯一 ID、名称、描述、节点列表、边列表、标签和版本号。
- 使用 `serializeFlow` 和 `deserializeFlow` 函数进行流程定义的序列化和反序列化。
- 使用 `validateFlow` 函数验证流程定义的基础合法性。
