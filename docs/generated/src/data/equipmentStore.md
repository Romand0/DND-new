# src/data/equipmentStore.ts

## 功能概述
该文件定义了一个名为 `equipmentStore` 的模块，用于管理游戏中的装备数据。它通过本地存储（localStorage）缓存后端API获取的装备数据，并提供了一系列方法来同步和异步地获取、保存、更新和删除装备信息。

## 主要导出/接口
```typescript
export const equipmentStore = {
  // 同步方法
  getAll(): EquipmentItem[];
  getById(id: string): EquipmentItem | undefined;
  getByName(name: string): EquipmentItem | undefined;

  // 异步方法
  async fetchAll(): Promise<EquipmentItem[]>;
  async saveItem(item: EquipmentItem): Promise<EquipmentItem>;
  async deleteItem(id: string): Promise<void>;

  // 订阅事件
  subscribe(fn: () => void): () => void;
};
```

- `getAll()`: 返回所有装备的数组。
- `getById(id: string)`: 根据ID获取单个装备。
- `getByName(name: string)`: 根据名称获取单个装备。
- `fetchAll()`: 异步从后端加载所有装备并更新本地缓存。
- `saveItem(item: EquipmentItem)`: 异步保存单个装备到后端，并更新本地缓存。
- `deleteItem(id: string)`: 异步删除单个装备，并更新本地缓存。
- `subscribe(fn: () => void)`: 订阅数据变更事件，当数据更新时触发。

## 核心实现说明
`equipmentStore` 模块的核心功能是通过本地存储来缓存装备数据，并通过API与后端进行数据同步。以下是模块的关键实现细节：

- 使用 `localStorage` 作为缓存，通过 `STORAGE_KEY` 作为键来存储和检索数据。
- `loadFromCache()` 和 `saveToCache()` 函数用于从本地存储读取和保存数据。
- `notifyListeners()` 函数用于通知所有订阅者数据已更新。
- `fetchAll()`, `saveItem()`, 和 `deleteItem()` 方法实现了与后端API的交互，并在本地缓存中更新数据。
- `subscribe()` 方法允许外部模块订阅数据变更事件。

## 注意事项或使用方式
- 使用 `equipmentStore` 之前，确保已经正确配置了后端API。
- 在调用异步方法时，需要处理可能出现的异常。
- 当数据更新时，可以通过 `subscribe()` 方法订阅事件，以便在数据变更时执行相应的操作。
