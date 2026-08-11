# src/types/battleground.ts

## 功能概述

该文件定义了网格沙盘相关的类型，包括网格大小、预设、棋子位置、掉落物品token以及单场战斗的沙盘数据。这些类型定义用于描述沙盘的结构和状态，为游戏逻辑提供数据基础。

## 主要导出/接口

- `GridSize`: 网格大小的枚举类型，包含 'small', 'medium', 'large' 三个值。
- `GridSizePreset`: 网格大小预设的接口，包含 `size` (网格大小枚举值), `cols` (列数), `rows` (行数), `label` (描述性标签)。
- `GRID_PRESETS`: 包含三种大小预设的常量对象，类型为 `Record<GridSize, GridSizePreset>`。
- `TokenPosition`: 棋子位置的接口，包含 `combatantId` (参战者ID), `col` (列坐标), `row` (行坐标)。
- `ItemToken`: 掉落物品token的接口，包含 `id` (唯一token ID), `col` (列坐标), `row` (行坐标), `name` (物品名称), `equipmentData` (装备快照数据), `droppedBy` (掉落者ID)。
- `Battleground`: 单场战斗的沙盘数据的接口，包含 `sessionId` (会话ID), `size` (网格大小), `tokens` (棋子位置列表), `itemTokens` (掉落物品token列表), `paintedCells` (被涂白的格子列表), `updatedAt` (更新时间), `moveHistory` (移动历史栈)。

## 核心实现说明

该文件定义了一系列接口和常量，用于描述网格沙盘的结构和状态。这些类型定义与游戏逻辑紧密相关，为棋子移动、物品掉落等操作提供数据支持。`GRID_PRESETS` 常量定义了三种网格大小预设，方便在不同场景下使用。`TokenPosition` 和 `ItemToken` 接口定义了棋子和物品token的位置信息，`Battleground` 接口则包含了沙盘的完整状态，包括棋子位置、物品token、涂白格子等。

## 注意事项或使用方式

- 使用 `GridSize` 枚举值来指定网格大小。
- 使用 `GRID_PRESETS` 常量获取预设的网格大小信息。
- 使用 `TokenPosition` 接口创建棋子位置对象。
- 使用 `ItemToken` 接口创建掉落物品token对象。
- 使用 `Battleground` 接口管理沙盘的完整状态。
