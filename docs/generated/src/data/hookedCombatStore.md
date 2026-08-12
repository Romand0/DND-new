# src/data/hookedCombatStore.ts

## 功能概述
该文件定义了一个名为 `hookedCombatStore` 的模块，用于管理一个名为 `HookedCombat` 的数据存储。`HookedCombat` 数据结构包含 `id` 和 `title` 两个字段，分别用于存储与战斗相关的唯一标识和标题。该模块通过本地存储（localStorage）来持久化数据，提供数据的加载、保存、获取和清除功能。

## 主要导出/接口
- `HookedCombat` 接口：
  ```typescript
  interface HookedCombat {
    id: string;
    title: string;
  }
  ```
- `load` 函数：
  ```typescript
  function load(): HookedCombat | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  ```
- `save` 函数：
  ```typescript
  function save(hooked: HookedCombat | null) {
    if (hooked) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hooked));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  ```
- `hookedCombatStore` 对象：
  - `get` 方法：
    ```typescript
    get(): HookedCombat | null { return load(); }
    ```
  - `set` 方法：
    ```typescript
    set(id: string, title: string) { save({ id, title }); }
    ```
  - `clear` 方法：
    ```typescript
    clear() { save(null); }
    ```
- `STORAGE_KEY` 常量：
  ```typescript
  const STORAGE_KEY = 'dnd-hooked-combat';
  ```

## 核心实现说明
该模块的核心实现包括数据的加载、保存和清除。`load` 函数从本地存储中读取 `HookedCombat` 数据，如果数据存在则解析 JSON 字符串并返回，否则返回 `null`。`save` 函数将 `HookedCombat` 数据序列化为 JSON 字符串并保存到本地存储，如果传入 `null` 则清除存储的数据。`hookedCombatStore` 对象提供了 `get`、`set` 和 `clear` 方法，分别用于获取、设置和清除数据。

该模块与项目其他模块的关系主要体现在数据的持久化和共享上。其他模块可以通过调用 `hookedCombatStore` 的方法来获取或修改 `HookedCombat` 数据，从而实现数据的持久化和共享。

## 注意事项或使用方式
- 调用 `set` 方法时，需要传入 `id` 和 `title` 字段，以更新 `HookedCombat` 数据。
- 调用 `clear` 方法将清除 `HookedCombat` 数据，如果需要重新加载数据，请调用 `get` 方法。
- 使用该模块之前，确保本地存储可用且项目环境支持 `localStorage`。
