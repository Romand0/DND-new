# src/lib/combatSnapshots.ts

## 功能概述

该文件实现了战斗回合快照的 IndexedDB 持久化层，用于存储和检索战斗过程中的回合快照数据。它承担着将战斗回合数据持久化到 IndexedDB 的职责，以保证数据的持久性和可恢复性。

## 主要导出/接口

- **类型**：`Row`
  - `key`: `string` - 快照的唯一标识符
  - `sessionId`: `string` - 会话标识符
  - `kind`: `'initial' | 'turn'` - 快照类型（初始或回合）
  - `round?: number` - 回合编号（仅适用于回合快照）
  - `combatantId?: string` - 参战者标识符（仅适用于回合快照）
  - `snapshot`: `TurnSnapshot` - 快照数据
  - `createdAt`: `number` - 快照创建时间戳

- **函数**：
  - `openDb()`: 打开 IndexedDB 数据库
  - `tx(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | undefined)`: 执行 IndexedDB 事务
  - `turnKey(sessionId: string, round: number, combatantId: string)`: 生成回合快照的键
  - `initialKey(sessionId: string)`: 生成初始快照的键
  - `putInitialSnapshot(sessionId: string, snapshot: TurnSnapshot)`: 存储初始快照
  - `putTurnSnapshot(sessionId: string, round: number, combatantId: string, snapshot: TurnSnapshot)`: 存储回合快照
  - `getInitialSnapshot(sessionId: string)`: 获取初始快照
  - `getTurnSnapshot(sessionId: string, round: number, combatantId: string)`: 获取回合快照
  - `deleteSessionSnapshots(sessionId: string)`: 删除指定会话的所有快照
  - `getBestTurnSnapshot(sessionId: string, targetRound: number, targetCombatantId: string)`: 获取最佳回合快照
  - `deleteTurnSnapshot(sessionId: string, round: number, combatantId: string)`: 删除指定回合快照

## 核心实现说明

该文件的核心实现是使用 IndexedDB 来存储和检索战斗回合快照数据。它通过定义一个 `Row` 接口来描述快照的结构，并通过一系列函数来执行数据的增删查改操作。

- **状态管理**：通过 IndexedDB 的 `openDb` 函数来管理数据库的打开和关闭，确保数据库操作的原子性。
- **与项目其他模块的关系**：该模块为其他模块提供数据持久化的服务，使得战斗回合数据可以在页面刷新或关闭后仍然被保留。
- **被谁引用**：该模块被战斗管理模块和其他需要持久化数据的模块引用。

## 注意事项或使用方式

- 在使用该模块之前，需要确保 IndexedDB 已在浏览器中启用。
- 使用 `putInitialSnapshot` 和 `putTurnSnapshot` 函数来存储快照数据。
- 使用 `getInitialSnapshot` 和 `getTurnSnapshot` 函数来检索快照数据。
- 使用 `deleteSessionSnapshots` 函数来删除指定会话的所有快照。
- 使用 `getBestTurnSnapshot` 函数来获取最佳回合快照，该函数在找不到精确匹配的快照时会尝试回退到最接近的可恢复状态。
