# src/data/flowStore.ts

## 功能概述

该文件 `src/data/flowStore.ts` 定义了一个流程库存储服务，负责管理流程的定义、状态和视图快照。它提供了流程的增删改查功能，并支持流程的导入导出。此外，它还提供了视图快照的保存和恢复功能，以支持用户在不同设备或标签页间同步编辑状态。

## 主要导出/接口

### 导出的类型

- `FlowDefinition`: 流程定义类型，包含流程的ID、名称、描述、节点、边、标签、版本和创建/更新时间等信息。
- `FlowViewportSnapshot`: 位置快照类型，包含滚动位置、缩放比例、平移位置和面板显示状态等信息。

### 导出的函数

- `serializeFlow`: 将流程对象序列化为JSON字符串。
- `deserializeFlow`: 将JSON字符串反序列化为流程对象。

### 导出的组件

- `flowStore`: 流程库存储对象，包含以下方法：

  - `getAll()`: 获取所有流程。
  - `getById(id: string)`: 根据ID获取单个流程。
  - `create(name: string = '未命名流程')`: 创建一个空流程。
  - `retargetId(oldId: string, newId: string)`: 变更流程ID。
  - `update(id: string, patch: Partial<FlowDefinition>)`: 更新流程。
  - `delete(id: string)`: 删除流程。
  - `import(json: string)`: 导入流程。
  - `saveViewportSnapshot(flowId: string, snapshot: FlowViewportSnapshot)`: 保存位置快照。
  - `getViewportSnapshot(flowId: string)`: 恢复位置快照。
  - `subscribe(listener: Listener)`: 订阅变更。

## 核心实现说明

该文件的核心实现包括流程的存储、读取、更新、删除和视图快照的保存与恢复。流程数据存储在本地存储中，通过JSON序列化和反序列化进行数据的读写。视图快照也以JSON格式存储，以便在不同设备或标签页间同步。

`flowStore` 对象提供了对流程的CRUD操作，以及视图快照的保存和恢复功能。它还支持订阅变更，以便在流程数据发生变化时通知订阅者。

## 注意事项或使用方式

- 使用 `flowStore` 的方法时，需要确保已经正确地初始化了流程库。
- 在进行流程的创建、更新和删除操作时，需要确保传入的ID是唯一的。
- 在保存和恢复视图快照时，需要确保传入的流程ID是有效的。
- 使用 `subscribe` 方法订阅变更时，需要提供一个回调函数，该函数将在数据变更时被调用。
