# src/data/spellStore.ts

## 功能概述
`spellStore.ts` 文件负责管理法术数据，包括从本地缓存读取、保存到本地缓存、从后端API加载和更新数据。该文件的存在是为了确保法术数据的一致性和可用性，同时减少对后端API的直接调用，提高应用的性能。

## 主要导出/接口
```typescript
export const spellStore = {
  // 同步：从本地缓存读取
  getAll(): Spell[];
  getById(id: string): Spell | undefined;
  getByName(name: string): Spell | undefined;
  save(spells: Spell[]): void;
  subscribe(fn: () => void): () => void;

  // 异步：从后端加载并更新本地缓存
  async fetchAll(): Promise<Spell[]>;
  // 异步：保存单个法术到后端
  async saveItem(spell: Spell): Promise<Spell>;
  // 异步：删除单个法术
  async deleteItem(id: string): Promise<void>;
};
```

- `getAll()`: 返回所有法术的数组。
- `getById(id: string)`: 根据ID返回单个法术对象。
- `getByName(name: string)`: 根据名称返回单个法术对象。
- `save(spells: Spell[])`: 将法术数组保存到本地缓存。
- `subscribe(fn: () => void)`: 订阅一个函数，当数据更新时被调用。
- `fetchAll()`: 异步从后端API加载所有法术并更新本地缓存。
- `saveItem(spell: Spell)`: 异步保存单个法术到后端，并更新本地缓存。
- `deleteItem(id: string)`: 异步删除单个法术，并更新本地缓存。

## 核心实现说明
`spellStore` 使用 `localStorage` 作为本地缓存，以存储法术数据。它提供了同步和异步方法来获取和操作数据。同步方法直接从本地缓存读取数据，而异步方法则从后端API获取数据，并在成功后更新本地缓存。

`spellStore` 还提供了订阅机制，允许其他模块在数据更新时收到通知。这有助于保持数据的一致性，并允许其他模块响应数据变化。

`spellStore` 被项目中的其他模块引用，用于获取和操作法术数据。

## 注意事项或使用方式
- 在使用 `saveItem` 和 `deleteItem` 方法时，应确保传入的法术对象或ID是有效的。
- 在调用 `fetchAll` 方法时，如果后端API调用失败，将回退到本地缓存的数据。
- 使用 `subscribe` 方法时，应确保在不再需要时取消订阅，以避免内存泄漏。
