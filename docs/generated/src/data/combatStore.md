# src/data/combatStore.ts

## 功能概述

该文件 `src/data/combatStore.ts` 是一个战斗记录存储模块，负责管理战斗记录的加载、保存、更新和导出导入。它还处理与战斗相关的数据，如参战者状态、回合待办事项和待消费优劣势标记。该模块的存在是为了确保战斗数据的持久化和一致性，并支持战斗过程的模拟和回放。

## 主要导出/接口

### 类型

- `Combatant`: 战斗参战者类型。
- `CombatRecord`: 战斗记录类型。
- `RoundAction`: 回合动作类型。
- `EquipmentChanges`: 装备变更类型。
- `TurnTodo`: 回合待办事项类型。
- `PendingAdvantageSource`: 待消费优劣势标记类型。
- `Character`: 角色类型。
- `Equipment`: 装备类型。

### 函数

- `emptyEquipmentChanges()`: 返回一个空的装备变更信息对象。
- `computeChildQtyMap(character, changes)`: 计算每个 childId 的净变化量信息。
- `computeNetChanges(character, changes)`: 计算净变化量视图。
- `sortInventory(list)`: 整理背包排序。
- `deriveFromChildQtyMap(map)`: 基于净变化量派生战斗背包。
- `deriveCombatInventory(character, changes)`: 派生战斗背包。
- `deriveCombatInventoryRaw(character, changes)`: 派生战斗背包（未排序版本）。
- `getCombatInventoryRaw(record, combatant)`: 从战斗记录 + combatantId 计算出战斗背包（未排序）。
- `getCombatInventory(record, combatant)`: 从战斗记录 + combatantId 计算出战斗背包。
- `computeCombatantAc(combatant, character, combatInventory)`: 基于战斗背包实际存在的装备，重算 PC 的 AC。
- `applyEquipmentChange(changes, update)`: 记录"装备变更"。
- `load()`: 加载战斗记录。
- `save(records)`: 保存战斗记录。

### Store

- `combatStore`: 包含所有对外 API 的对象。

### 常量

- `STORAGE_KEY`: 用于 localStorage 的存储键。

## 核心实现说明

该模块的核心功能是管理战斗记录，包括加载、保存、更新和导出导入。它使用 localStorage 来持久化数据，并通过事件监听来确保跨标签页的一致性。模块内部使用缓存来提高性能，避免每次操作都直接读写 localStorage。

该模块还处理与战斗相关的数据，如参战者状态、回合待办事项和待消费优劣势标记。这些数据通过一系列函数进行管理，包括计算净变化量、派生战斗背包、计算参战者 AC 等。

该模块被 `characterStore` 模块引用，用于获取角色信息，以及被 `combatStore` 模块内部的其他函数引用。

## 注意事项或使用方式

- 使用 `combatStore` 模块时，需要确保已经加载了 `characterStore` 模块。
- 在进行写操作时，必须通过 `applyEquipmentChange` 函数来更新装备变更信息，以确保数据结构的一致性。
- 在处理战斗记录时，需要考虑模拟模式和放映模式的不同，以及相应的数据处理逻辑。
