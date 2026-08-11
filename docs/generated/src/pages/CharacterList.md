# src/pages/CharacterList.tsx

## 功能概述
该文件定义了 `CharacterList` 组件，负责展示和管理角色列表页面。它承担着展示角色信息、处理角色添加、删除、搜索、导出等操作，是用户与角色数据交互的主要界面。

## 主要导出/接口
- `CharacterList`: React 组件，负责渲染角色列表页面。
  - `characters`: `Character[]`，当前页面上显示的角色列表。
  - `searchQuery`: `string`，搜索查询字符串。
  - `showDeleteConfirm`: `string | null`，当前是否显示删除确认弹窗。
  - `selectedIds`: `Set<string>`，当前选中的角色 ID 集合。
  - `loading`: `boolean`，是否正在加载数据。
  - `error`: `string | null`，加载或操作过程中发生的错误信息。

## 核心实现说明
- `CharacterList` 组件使用 React 的 `useState` 和 `useEffect` 钩子来管理状态和副作用。
- 组件在加载时调用 `loadCharacters` 方法从 `characterStore` 中获取角色数据。
- `filteredCharacters` 通过搜索查询过滤 `characters` 数组。
- 提供了添加、删除、复制、导出等操作，并通过 `characterStore` 进行数据管理。
- 组件还处理了角色列表的展示，包括角色信息、属性、操作按钮等。

## 注意事项或使用方式
- 组件在加载时会显示加载状态或错误信息。
- 用户可以通过搜索框进行角色搜索。
- 可以通过复选框选择多个角色进行批量操作。
- 提供了导入和导出功能，用于数据管理。
- 删除操作会弹出确认弹窗，确保用户不会误删数据。
