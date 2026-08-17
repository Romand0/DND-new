# src/data/treasureStore.ts

## 功能概述

该文件定义了一个名为 `treasureStore` 的模块，用于管理宝藏数据。它通过本地存储和内存缓存来存储和管理宝藏信息，包括宝藏的创建、更新、删除和查询等操作。该模块的存在是为了提供一个统一的接口来访问和管理宝藏数据，确保数据的持久性和一致性。

## 主要导出/接口

- `STORAGE_KEY`: 字符串常量，用于存储宝藏数据的本地存储键。
- `DISTRIBUTION_KEY`: 字符串常量，用于存储分配记录的本地存储键。
- `Listener`: 类型，表示一个回调函数类型，用于监听宝藏数据变化。
- `load()`: 函数，从本地存储加载宝藏数据。
- `save(list: Treasure[])`: 函数，将宝藏数据保存到本地存储。
- `loadDistributions()`: 函数，从本地存储加载分配记录。
- `saveDistributions(list: DistributionRecord[])`: 函数，将分配记录保存到本地存储。
- `treasureStore`: 对象，包含以下方法：
  - `getAll()`: 获取所有宝藏，按更新时间降序排列。
  - `get(id: string)`: 根据ID获取单个宝藏。
  - `create(title: string)`: 创建一个新的宝藏。
  - `update(id: string, partial: Partial<Omit<Treasure, 'id' | 'createdAt'>>)`: 更新指定宝藏的信息。
  - `delete(id: string)`: 删除指定宝藏。
  - `subscribe(listener: Listener)`: 订阅宝藏数据变化。
  - `getDistributions(treasureId: string)`: 获取指定宝藏的分配记录。
  - `recordDistribution(record: DistributionRecord)`: 记录宝藏的分配。

## 核心实现说明

`treasureStore` 模块的核心功能是通过本地存储来持久化宝藏数据。它使用 `localStorage` 来存储数据，并通过内存缓存来提高访问速度。模块提供了丰富的接口来操作宝藏数据，包括创建、更新、删除和查询等。

该模块与项目其他模块的关系主要体现在数据交互上。其他模块可以通过 `treasureStore` 接口来获取和操作宝藏数据，确保数据的一致性和准确性。

## 注意事项或使用方式

- 使用 `treasureStore` 之前，确保本地存储可用。
- 在操作宝藏数据时，建议使用 `subscribe` 方法来监听数据变化，以便及时更新界面或其他模块。
- 在创建或更新宝藏时，确保传入的参数符合 `Treasure` 类型定义。
