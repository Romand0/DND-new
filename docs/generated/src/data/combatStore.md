# src/data/combatStore.ts

## 功能概述

该文件定义了 `combatStore`，一个用于管理战斗记录和参战者信息的存储模块。它负责处理战斗记录的加载、保存、更新、删除等操作，并提供接口来获取和修改参战者的状态，如装备、生命值、先攻等。此外，它还处理回合待办和待消费优劣势标记的CRUD操作。

## 主要导出/接口

### 导出的类型

- `Combatant`: 参战者类型
- `CombatRecord`: 战斗记录类型
- `RoundAction`: 回合动作类型
- `EquipmentChanges`: 装备变更类型
- `TurnTodo`: 回合待办类型
- `PendingAdvantageSource`: 待消费优劣势标记类型
- `ChildQtyInfo`: 子装备数量信息类型
- `NetChangeEntry`: 净变化量条目类型

### 导出的函数

- `emptyEquipmentChanges()`: 返回空装备变更信息
- `computeChildQtyMap(character, changes?)`: 计算每个子装备的净变化量
- `computeNetChanges(character, changes?)`: 计算净变化量视图
- `sortInventory(list)`: 整理背包排序
- `deriveFromChildQtyMap(map)`: 从子装备数量信息派生战斗背包
- `deriveCombatInventory(character, changes?)`: 派生战斗背包
- `deriveCombatInventoryRaw(character, changes?)`: 派生战斗背包（未排序）
- `getCombatInventoryRaw(record, combatant)`: 从战斗记录和参战者计算战斗背包（未排序）
- `getCombatInventory(record, combatant)`: 从战斗记录和参战者计算战斗背包
- `computeCombatantAc(combatant, character, combatInventory?)`: 计算参战者的AC
- `applyEquipmentChange(changes, update)`: 记录装备变更
- `load()`: 加载战斗记录
- `save(records)`: 保存战斗记录
- `getAll()`: 获取所有战斗记录
- `get(id)`: 根据ID获取单个战斗记录
- `create(title, combatants)`: 创建新战斗记录
- `update(id, partial)`: 更新战斗记录
- `delete(id)`: 删除战斗记录
- `clear()`: 清空所有战斗记录
- `exportToFile()`: 导出为JSON文件
- `importFromFile(file)`: 从JSON文件导入
- `subscribe(listener)`: 订阅数据变更
- `consumeAction(recordId, combatantId, mode)`: 消耗可用动作
- `resetActions(recordId, combatantId)`: 重置参战者的可用动作数
- `consumeMovement(recordId, combatantId, distanceFeet, mode, playbackActive)`: 消耗移动力
- `refundMovement(recordId, combatantId, feet, mode, playbackActive)`: 恢复移动力
- `getRemainingMovement(combatant, mode?, playbackActive?)`: 获取剩余移动力
- `addTurnTodo(recordId, todo)`: 添加回合待办
- `removeTurnTodo(recordId, todoId)`: 删除回合待办
- `toggleTurnTodo(recordId, todoId)`: 切换回合待办状态
- `toggleIncapacitated(sessionId, combatantId)`: 切换参战者的昏迷状态
- `resetTurnTodosForRound(recordId, round)`: 重置回合待办
- `addPendingAdvantage(recordId, combatantId, source)`: 添加待消费优劣势标记
- `addPendingAdvantages(recordId, combatantId, sources)`: 批量添加待消费优劣势标记
- `consumePendingAdvantage(recordId, combatantId, sourceIds)`: 批量消费待消费标记
- `clearExpiredAdvantage(recordId, combatantId, currentRound)`: 清理过期待消费标记
- `clearAdvantageByExpireCombatant(recordId, combatantId)`: 按expireOnCombatantId全局清理待消费标记
- `getPendingAdvantages(combatant)`: 读取未消费的待消费标记列表
- `cleanupDeathSaveTodos(recordId)`: 清理已完成使命的死亡豁免待办
- `applyDeathSaveResult(recordId, todoId, roll)`: 应用死亡豁免d20掷骰结果
- `autoNpcDeathSave(recordId, combatantId)`: NPC自动死亡豁免掷骰

### 导出的常量

- `STORAGE_KEY`: localStorage存储键名

## 核心实现说明

`combatStore` 模块的核心功能是管理战斗记录和参战者信息。它通过localStorage进行数据持久化，并提供了一系列API来操作这些数据。

- **状态管理**: 模块使用内部状态来缓存战斗记录，并在必要时从localStorage加载或保存数据。
- **与项目其他模块的关系**: 模块依赖于 `characterStore` 来获取角色信息。
- **被谁引用**: 该模块被项目中的其他模块引用，用于处理战斗相关的操作。

## 注意事项或使用方式

- 使用 `getAll()` 获取所有战斗记录时，结果按更新时间倒序排列。
- 使用 `get(id)` 获取单个战斗记录时，如果找不到记录则返回null。
- 使用 `create(title, combatants)` 创建新战斗记录时，需要提供战斗名称和参战者列表。
- 使用 `update(id, partial)` 更新战斗记录时，需要提供记录ID和部分更新字段。
- 使用 `delete(id)` 删除战斗记录时，需要提供记录ID。
- 使用 `clear()` 清空所有战斗记录。
- 使用 `exportToFile()` 导出战斗记录为JSON文件。
- 使用 `importFromFile(file)` 从JSON文件导入战斗记录。
- 使用 `subscribe(listener)` 订阅数据变更，以便在数据发生变化时执行回调函数。
