# src/data/treasureStore.ts

## 功能概述

该文件 `treasureStore.ts` 负责管理宝藏数据，包括数据的加载、保存、更新和删除。它使用 `localStorage` 作为持久化存储，并在内存中维护缓存以提高性能。该模块的存在是为了提供一个集中式数据管理，使得宝藏数据在应用程序中可以被方便地访问和修改。

## 主要导出/接口

- `STORAGE_KEY`: 常量，用于存储宝藏数据的 `localStorage` 键名。
- `DISTRIBUTION_KEY`: 常量，用于存储分配记录数据的 `localStorage` 键名。
- `Listener`: 类型，表示一个回调函数类型，用于监听数据变化。
- `load()`: 函数，从 `localStorage` 加载宝藏数据。
- `save(list: Treasure[])`: 函数，将宝藏数据保存到 `localStorage`。
- `loadDistributions()`: 函数，从 `localStorage` 加载分配记录数据。
- `saveDistributions(list: DistributionRecord[])`: 函数，将分配记录数据保存到 `localStorage`。
- `treasureStore`: 对象，包含以下方法：
  - `getAll()`: 获取所有宝藏数据。
  - `get(id: string)`: 根据ID获取单个宝藏。
  - `create(title: string)`: 创建一个新的宝藏。
  - `update(id: string, partial: Partial<Omit<Treasure, 'id' | 'createdAt'>>)`: 更新指定宝藏的信息。
  - `delete(id: string)`: 删除指定宝藏。
  - `subscribe(listener: Listener)`: 订阅数据变化通知。
  - `getDistributions(treasureId: string)`: 获取指定宝藏的分配记录。
  - `recordDistribution(record: DistributionRecord)`: 记录分配记录。

## 核心实现说明

`treasureStore` 模块的核心功能是通过 `localStorage` 进行数据的读写操作，并在内存中维护缓存以提高性能。它提供了对宝藏数据的增删改查操作，并支持订阅数据变化通知，以便其他模块可以响应数据变化。

该模块与项目其他模块的关系主要体现在数据交互上。其他模块可以通过 `treasureStore` 获取和修改宝藏数据，同时也可以通过订阅数据变化来更新界面或其他状态。

## 注意事项或使用方式

- 使用 `treasureStore` 之前，确保 `localStorage` 可用。
- 调用 `save` 和 `saveDistributions` 方法时，应确保传入的数据结构正确。
- 使用 `subscribe` 方法订阅数据变化时，应确保在不再需要时取消订阅，以避免内存泄漏。
