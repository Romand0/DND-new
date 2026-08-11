# src/pages/CharacterInventory.tsx

## 功能概述

该文件 `CharacterInventory.tsx` 是一个 React 组件，负责渲染和管理角色的装备库存界面。它允许用户查看、添加、编辑、删除和穿戴角色的装备。该组件还处理装备的分类、排序和穿戴状态的管理。

## 主要导出/接口

- **导出类型**：
  - `Character`: 角色类型定义。
  - `Equipment`: 装备类型定义。
  - `EquipmentItem`: 装备项类型定义。
- **导出函数**：
  - `CharacterInventory`: 组件函数，接受 `readOnly` 和 `externalCharacter` 作为可选参数。
- **导出组件**：
  - `EquipmentEditor`: 装备编辑器组件。
  - `EquipmentPicker`: 装备选择器组件。
  - `SyncButton`: 同步按钮组件。
- **导出 Store**：
  - `characterStore`: 角色数据存储。
  - `equipmentStore`: 装备数据存储。
- **导出常量**：
  - `CATEGORIES`: 装备分类常量数组。

## 核心实现说明

该组件的核心功能包括：

- **装备库存管理**：展示角色的所有装备，并根据分类筛选。
- **装备编辑**：允许用户编辑装备的属性，如名称、描述、价格等。
- **装备添加**：从装备库中添加装备到角色库存。
- **装备删除**：删除角色库存中的装备。
- **穿戴管理**：允许用户穿戴或卸下装备。
- **手持管理**：允许用户选择手持装备，并设置动作状态。

该组件与项目其他模块的关系包括：

- 与 `characterStore` 和 `equipmentStore` 模块交互，获取和更新角色和装备数据。
- 与 `apiFetch` 模块交互，从服务器获取数据。
- 与 `useEquipmentActions` 钩子交互，执行装备相关的操作。

## 注意事项或使用方式

- 该组件需要 `characterStore` 和 `equipmentStore` 模块提供的数据支持。
- 使用该组件时，需要确保角色和装备数据已正确加载。
- 组件支持两种视图模式：背包视图和穿戴管理视图。
