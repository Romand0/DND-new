# src/data/battlegroundStore.ts

## 功能概述
该文件 `battlegroundStore.ts` 负责管理网格沙盘的数据存储。它通过本地存储（localStorage）来持久化沙盘数据，并提供了一系列接口来操作沙盘中的棋子、物品、涂白格子等。该文件的存在是为了确保沙盘数据在不同页面刷新或标签页切换时的一致性。

## 主要导出/接口
```typescript
export type { Battleground, GridSize, TokenPosition, ItemToken };
export const GRID_PRESETS = { ... };
export let battlegroundCache: Battleground[] | null = null;
export function notify(): void;
export function loadAll(): Battleground[];
export function saveAll(list: Battleground[]): void;
export const battlegroundStore = {
  getOrCreate(sessionId: string): Battleground;
  get(sessionId: string): Battleground | null;
  setSize(sessionId: string, size: GridSize): void;
  placeToken(sessionId: string, token: TokenPosition): void;
  removeToken(sessionId: string, combatantId: string): void;
  undoMove(sessionId: string): boolean;
  getUndoCount(sessionId: string): number;
  placeItemToken(sessionId: string, token: ItemToken): void;
  removeItemToken(sessionId: string, tokenId: string): void;
  togglePaintedCell(sessionId: string, cell: string): void;
  setPaintedCells(sessionId: string, cells: string[]): void;
  clearPaintedCells(sessionId: string): void;
  clearTokens(sessionId: string): void;
  delete(sessionId: string): void;
  setTokens(sessionId: string, tokens: TokenPosition[]): void;
  subscribe(listener: Listener): () => void;
};
```

## 核心实现说明
该文件的核心实现包括以下部分：

- **本地存储管理**：使用 `localStorage` 来存储沙盘数据，并通过 `battlegroundCache` 变量在进程内缓存数据，以减少对本地存储的频繁访问。
- **数据解析与序列化**：在读取和保存数据时，使用 `JSON.parse` 和 `JSON.stringify` 来解析和序列化沙盘数据。
- **事件监听**：通过 `window.addEventListener` 监听 `storage` 事件，以确保跨标签页数据的一致性。
- **状态管理**：通过 `loadAll` 和 `saveAll` 函数来管理沙盘数据的加载和保存，确保数据的完整性和一致性。
- **接口实现**：提供了一系列接口来操作沙盘数据，包括获取沙盘、创建沙盘、设置沙盘大小、放置/移动棋子、放置/移除物品、涂白格子等。

## 注意事项或使用方式
- 所有对沙盘数据的修改操作都应该通过 `saveAll` 函数来保存，以确保数据的持久化。
- 使用 `subscribe` 函数可以订阅沙盘数据变更事件，以便在数据发生变化时执行相应的操作。
- 在调用接口时，请确保传入的参数类型正确，以避免运行时错误。
