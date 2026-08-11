# src/components/combat/CombatantList.tsx

## 功能概述

该文件定义了 `CombatantList` 组件，负责展示和管理战斗中的参战者列表。它承担着显示参战者信息、处理参战者选择、批量操作、编辑先攻值等职责。该组件的存在是为了提供一个直观、易用的界面来管理战斗中的参战者。

## 主要导出/接口

- **类型**：
  - `Combatant`: 参战者类型，包含姓名、AC、最大生命值、当前生命值、是否死亡、是否失去意识、是否为玩家角色等属性。
  - `TurnTodo`: 行动待办类型，包含参战者ID、是否执行、开始回合、结束回合等属性。
- **接口**：
  - `Props`:
    - `combatants`: 参战者数组。
    - `turnTodos`: 行动待办数组。
    - `getEffectiveAc`: 获取参战者有效AC值的函数。
    - `batchMode`: 是否处于批量操作模式。
    - `selectedIds`: 已选中的参战者ID集合。
    - `onToggleSelect`: 切换参战者选择的函数。
    - `onSelectAll`: 全选或取消全选参战者的函数。
    - `onSetBatchMode`: 切换批量操作模式的函数。
    - `onBatchDelete`: 批量删除选中的参战者的函数。
    - `editingInitiative`: 正在编辑先攻值的参战者ID。
    - `initiativeInput`: 先攻值输入框的值。
    - `onInitiativeInputChange`: 编辑先攻值输入框值改变的函数。
    - `onStartEditInitiative`: 开始编辑参战者先攻值的函数。
    - `onSaveInitiative`: 保存编辑的先攻值的函数。
    - `onCancelEditInitiative`: 取消编辑先攻值的函数。
    - `onRemoveCombatant`: 移除参战者的函数。
    - `currentTurnId`: 当前行动的参战者ID。
    - `currentTurnRound`: 当前回合数。

## 核心实现说明

`CombatantList` 组件通过接收 `Props` 参数，获取参战者列表、行动待办列表等数据，并展示每个参战者的信息。组件支持批量操作，包括全选、取消全选和批量删除。同时，支持编辑参战者的先攻值。组件中的 `hasTodos` 函数用于判断参战者是否有未完成的行动待办。

`CombatantList` 组件与项目其他模块的关系主要体现在接收来自父组件的参数，如 `combatants`、`turnTodos` 等，以及触发父组件的方法，如 `onToggleSelect`、`onBatchDelete` 等。

## 注意事项或使用方式

- 使用 `CombatantList` 组件时，需要传入 `combatants`、`turnTodos` 等必要参数。
- 在批量操作模式下，可以通过点击复选框选择参战者，并执行全选、取消全选和批量删除操作。
- 可以通过双击参战者的先攻值来编辑它，编辑完成后点击“✔”保存或点击“✕”取消编辑。
