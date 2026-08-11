# src/components/SpellPicker.tsx

## 功能概述

`SpellPicker.tsx` 文件是一个 React 组件，负责提供一个界面，让用户可以从一个列表中选择法术。该组件用于展示和管理法术数据，包括搜索、筛选和选择功能。它存在于项目中是为了提供一个用户友好的方式来浏览和选择法术，尤其是在角色扮演游戏中。

## 主要导出/接口

- **类型**：`SpellPickerProps`
  - `isOpen`: `boolean` - 控制组件是否显示
  - `onClose`: `() => void` - 关闭组件的回调函数
  - `onSelect`: `(spell: Spell) => void` - 选择法术时的回调函数
  - `selectedSpellIds`: `string[]` - 已选法术的 ID 列表
  - `characterClass?: string` - 角色职业，可选
  - `filterLevel?: number | 'cantrip' | 'all'` - 法术环级筛选，默认为 'all'
  - `matchByName?: boolean` - 是否按名称匹配，默认为 `false`

- **常量**：`levelLabels`
  - `Record<number, string>` - 法术环级标签映射

- **组件**：`SpellPicker`
  - 展示法术选择器界面，包含搜索框、筛选器和法术列表

## 核心实现说明

该组件的核心功能包括：

- **状态管理**：使用 `useState` 和 `useMemo` 来管理组件的状态，如搜索查询、筛选条件、所有法术列表等。
- **数据获取**：使用 `useEffect` 在组件打开时从后端 API 获取所有法术数据。
- **筛选和排序**：根据搜索查询、环级、职业等条件筛选法术，并按环级和名称排序。
- **交互**：提供搜索框、筛选器和法术列表的交互，允许用户搜索、筛选和选择法术。

该组件与项目其他模块的关系：

- 通过 `onSelect` 回调函数将选中的法术传递给父组件。
- 通过 `selectedSpellIds` 属性接收已选法术的 ID 列表。

该组件被父组件引用，通常用于角色扮演游戏的法术选择界面。

## 注意事项或使用方式

- 组件应在 `isOpen` 为 `true` 时渲染。
- 使用 `onClose` 函数来关闭组件。
- 使用 `onSelect` 函数来处理法术选择事件。
- 使用 `selectedSpellIds` 属性来传递已选法术的 ID 列表。
- 使用 `filterLevel` 和 `classFilter` 属性来设置筛选条件。
