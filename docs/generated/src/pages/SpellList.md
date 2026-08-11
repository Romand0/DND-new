# src/pages/SpellList.tsx

## 功能概述
该文件 `SpellList.tsx` 是一个 React 组件，负责展示和管理一个法术列表。它允许用户查看、搜索、筛选和编辑法术信息。该组件是项目中的核心部分，负责用户与法术数据交互的界面。

## 主要导出/接口
- `Spell` 类型：定义了法术的接口，包括名称、环级、学派、施法时间、成分等属性。
- `SpellList` 组件：该组件是导出的主要功能，负责渲染法术列表和相关的编辑器。
- `fetchAllSpells` 函数：从 API 获取所有法术数据。
- `createSpell` 函数：创建一个新的法术。
- `updateSpell` 函数：更新现有法术。
- `deleteSpell` 函数：删除一个法术。

## 核心实现说明
- `SpellList` 组件使用 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。
- 组件从 `useAuth` 钩子中获取用户权限信息，确保只有管理员（DM）可以编辑和删除法术。
- 使用 `useMemo` 钩子来缓存计算结果，如所有职业和学派的列表，以及筛选后的法术列表。
- 组件通过 `useEditorState` 钩子管理编辑器的打开状态。
- `load` 函数用于从 API 获取法术数据，并更新组件状态。
- `handleSaveSpell` 函数用于保存或创建法术，根据是否有正在编辑的法术来调用 `updateSpell` 或 `createSpell`。
- `handleDeleteSpell` 函数用于删除法术，并处理删除确认对话框。
- 组件根据设备屏幕大小渲染不同的界面，桌面端使用表格，移动端使用卡片式布局。

## 注意事项或使用方式
- 组件依赖于 `react-router-dom` 库进行路由跳转。
- 组件使用 `@/contexts/AuthContext` 和 `@/data/editorState` 来获取上下文状态。
- 组件使用 `@/lib/api` 中的 API 函数来与后端进行交互。
- 组件使用 `lucide-react` 库中的图标组件。
- 组件使用 `sessionStorage` 来持久化筛选状态。
