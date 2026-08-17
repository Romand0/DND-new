# src/pages/CombatList.tsx

## 功能概述

该文件 `CombatList.tsx` 是一个 React 组件，负责展示和管理战斗记录列表。它允许用户查看现有的战斗记录，进行快速创建战斗，以及导出和导入战斗数据。该组件主要面向游戏主持人（DM），因此非DM用户将无法访问战斗列表页面。

## 主要导出/接口

- `CombatList`: React 组件，负责渲染战斗记录列表和相关的操作界面。
  - `loadRecords`: `() => void` - 加载战斗记录到状态中。
  - `handleQuickCreateConfirm`: `(result: QuickCreateResult) => void` - 处理快速创建战斗的确认操作。
  - `handleDelete`: `(e: React.MouseEvent, id: string) => void` - 处理删除战斗记录的操作。
  - `handleExport`: `() => void` - 导出战斗记录到文件。
  - `handleImport`: `(e: React.ChangeEvent<HTMLInputElement>) => void` - 从文件导入战斗记录。
  - `handleCardClick`: `(recordId: string) => void` - 点击战斗卡片时触发，用于跳转到战斗详情页面。
  - `isDM`: `boolean` - 从 `AuthContext` 中获取的用户是否为DM。

## 核心实现说明

`CombatList` 组件使用 React 的 `useState` 和 `useEffect` 钩子来管理状态和副作用。它从 `combatStore` 和 `battlegroundStore` 中获取和操作数据。组件的核心功能包括：

- 加载战斗记录并存储在状态中。
- 提供快速创建战斗的功能，包括弹窗输入战斗名称、选择参战者、设置先攻等。
- 提供导出和导入战斗记录的功能。
- 允许用户点击战斗卡片跳转到战斗详情页面。
- 如果用户不是DM，则重定向到首页。

## 注意事项或使用方式

- 用户需要登录且为DM才能访问和操作战斗记录。
- 快速创建战斗时，需要确保所有必要的信息都已填写。
- 导入和导出功能仅支持JSON格式的文件。
- 删除战斗记录是不可逆的操作，请谨慎操作。
