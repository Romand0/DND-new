# src/pages/CombatList.tsx

## 功能概述
该文件 `CombatList.tsx` 是一个 React 组件，负责展示和管理战斗记录列表。它允许用户查看现有的战斗记录、快速创建新的战斗、导出和导入战斗数据，以及删除战斗记录。该组件主要面向游戏主持人（DM），非DM用户将被重定向到首页。

## 主要导出/接口
- **函数**:
  - `toggleHook`: 切换战斗记录的钩住状态。
  - `loadRecords`: 加载战斗记录。
  - `handleQuickCreateConfirm`: 处理快速创建战斗的确认操作。
  - `handleDelete`: 处理删除战斗记录的操作。
  - `handleExport`: 导出战斗记录。
  - `handleImport`: 导入战斗记录。
  - `handleCardClick`: 处理战斗卡片点击事件。
- **组件**:
  - `QuickCreateCombatDialog`: 快速创建战斗的对话框组件。
- **Store**:
  - `combatStore`: 用于管理战斗记录的 Store。
  - `battlegroundStore`: 用于管理沙盘数据的 Store。
- **常量**:
  - 无

## 核心实现说明
- 该组件使用 `useState` 和 `useEffect` 钩子来管理状态和副作用。
- `loadRecords` 函数用于从 `combatStore` 加载所有战斗记录，并使用 `useEffect` 钩子确保组件加载时和 `combatStore` 更新时重新加载记录。
- `handleQuickCreateConfirm` 函数用于处理快速创建战斗的逻辑，包括创建战斗记录、初始化参战者和沙盘。
- `handleDelete` 函数用于删除战斗记录，并同步清理沙盘数据。
- `handleExport` 和 `handleImport` 函数分别用于导出和导入战斗记录。
- `handleCardClick` 函数用于处理战斗卡片点击事件，跳转到对应的战斗详情页面。
- 该组件还包含一个快速创建战斗的对话框组件 `QuickCreateCombatDialog`。

## 注意事项或使用方式
- 用户需要登录且是DM才能访问和操作战斗记录。
- 导入和导出功能需要正确格式化的JSON文件。
- 删除战斗记录是不可逆的操作，请谨慎操作。
