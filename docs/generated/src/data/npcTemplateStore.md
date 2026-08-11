# src/data/npcTemplateStore.ts

## 功能概述
该文件定义了 `npcTemplateStore`，一个用于管理NPC（非玩家角色）模板数据的存储服务。它负责从本地存储中加载、保存、创建、更新和删除NPC模板数据，并提供订阅数据变更的接口。该服务存在是为了提供一个统一的、可访问的NPC模板数据源，以便在应用程序的不同部分中共享和使用这些数据。

## 主要导出/接口
- `STORAGE_KEY`: 常量，用于存储在localStorage中的NPC模板数据的键。
- `Listener`: 类型，定义了一个函数类型，用于订阅数据变更事件。
- `templateCache`: 变量，用于在进程内缓存NPC模板数据。
- `load()`: 函数，从localStorage加载NPC模板数据。
- `save(templates: NpcTemplate[])`: 函数，将NPC模板数据保存到localStorage。
- `npcTemplateStore`: 对象，包含以下方法：
  - `getAll()`: 获取所有NPC模板数据，并按更新时间降序排序。
  - `get(id: string)`: 根据ID获取单个NPC模板数据。
  - `create(template: Omit<NpcTemplate, 'id' | 'createdAt' | 'updatedAt'>)`: 创建一个新的NPC模板。
  - `update(id: string, partial: Partial<Omit<NpcTemplate, 'id' | 'createdAt'>>)`: 更新现有的NPC模板。
  - `delete(id: string)`: 删除一个NPC模板。
  - `clear()`: 清除所有NPC模板数据。
  - `subscribe(listener: Listener)`: 订阅数据变更事件。

## 核心实现说明
`npcTemplateStore` 使用localStorage作为数据存储，并通过`templateCache`变量在进程内缓存数据，以避免每次操作都直接读写localStorage，提高性能。当localStorage中的数据发生变化时，通过监听`storage`事件来更新缓存。

`load()`函数负责从localStorage中解析和加载NPC模板数据，如果数据不存在或解析失败，则返回一个空数组。`save()`函数则负责将NPC模板数据序列化并保存到localStorage，并在保存成功后通知所有订阅者。

`npcTemplateStore`对象中的方法都通过调用`load()`和`save()`来操作数据，确保数据的一致性和完整性。例如，`create()`方法在创建新模板后，会更新缓存并保存数据到localStorage。

该服务被项目中的其他模块引用，以获取和操作NPC模板数据。

## 注意事项或使用方式
- 使用`getAll()`、`get()`、`create()`、`update()`、`delete()`和`clear()`方法来操作NPC模板数据。
- 使用`subscribe()`方法来订阅数据变更事件，以便在数据发生变化时执行相应的操作。
- 确保在调用`save()`方法后，所有相关的数据都已经更新，以避免数据不一致的问题。
