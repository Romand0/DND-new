# src/pages/CombatList.tsx

## 功能概述
该文件 `CombatList.tsx` 是一个 React 组件，负责展示和管理战斗记录列表。它允许用户查看所有战斗记录，支持快速创建新的战斗，以及导入和导出战斗数据。该组件主要面向游戏主持人（DM），非DM用户将无法访问。

## 主要导出/接口
- **类型**：
  - `CombatRecord`: 战斗记录类型，包含战斗标题、参战者信息、创建时间等。
  - `Combatant`: 参战者类型，包含名称、先攻、AC、最大生命值、当前生命值等。
  - `RoundAction`: 轮次行动类型，包含每个参战者的行动信息。
- **函数**：
  - `loadRecords()`: 加载战斗记录。
  - `handleQuickCreateConfirm(result: QuickCreateResult)`: 确认快速创建战斗。
  - `handleDelete(e: React.MouseEvent, id: string)`: 删除战斗记录。
  - `handleExport()`: 导出战斗数据。
  - `handleImport(e: React.ChangeEvent<HTMLInputElement>)`: 导入战斗数据。
  - `handleCardClick(recordId: string)`: 点击战斗卡片跳转。
- **组件**：
  - `QuickCreateCombatDialog`: 快速创建战斗的对话框组件。
- **Store**：
  - `combatStore`: 用于管理战斗记录的 Store。
  - `battlegroundStore`: 用于管理沙盘数据的 Store。
- **常量**：
  无。

## 核心实现说明
该组件使用 React 的 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。`loadRecords` 函数用于从 `combatStore` 加载战斗记录，并使用 `useEffect` 钩子确保在组件挂载时加载记录，并在记录更新时重新加载。

快速创建战斗功能通过 `QuickCreateCombatDialog` 组件实现，用户可以输入战斗标题和选择参战者，然后自动创建战斗记录并跳转到相应的战斗页面。

删除战斗记录时，会阻止事件冒泡，避免触发其他组件的点击事件。导出和导入功能分别通过 `handleExport` 和 `handleImport` 函数实现，使用 `combatStore` 的相关方法进行数据操作。

## 注意事项或使用方式
- 用户需要拥有DM权限才能访问该组件的所有功能。
- 快速创建战斗时，需要确保所有参战者信息完整。
- 导入和导出功能仅支持JSON格式文件。
