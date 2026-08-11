# src/components/combat/QuickCreateCombatDialog.tsx

## 功能概述
该文件定义了一个名为 `QuickCreateCombatDialog` 的 React 组件，用于快速创建战斗记录。该组件允许用户输入战斗名称，选择参战者，并设置每个参战者的先攻值。它简化了战斗记录的创建过程，方便用户快速开始一场新的战斗。

## 主要导出/接口
- `QuickCreateResult` 接口：
  - `title`: 字符串类型，表示战斗的名称。
  - `combatants`: 数组类型，包含每个参战者的信息，包括角色ID、名称、先攻值、AC、最大生命值、当前生命值和速度。

- `Props` 接口：
  - `open`: 布尔类型，表示对话框是否打开。
  - `onClose`: 函数类型，用于关闭对话框。
  - `onConfirm`: 函数类型，用于确认创建战斗，并接收 `QuickCreateResult` 类型的参数。

- `QuickCreateCombatDialog` 组件：
  - 接收 `Props` 类型的 `props` 参数。

## 核心实现说明
- 组件使用 `useState` 和 `useEffect` 钩子来管理状态和副作用。
- `useEffect` 用于在对话框打开时初始化状态，包括设置默认标题、读取所有本地角色和默认全选参战者。
- `toggleSelect` 函数用于切换单个角色的选中状态。
- `toggleSelectAll` 函数用于切换所有角色的选中状态。
- `updateInitiative` 函数用于更新参战者的先攻值。
- `handleConfirm` 函数用于确认创建战斗，并验证输入的有效性。
- `handleCancel` 函数用于关闭对话框。
- `rollAllInitiative` 函数用于为所有选中的参战者随机生成先攻值。
- `selectedChars` 使用 `useMemo` 钩子计算当前选中的角色列表。

## 注意事项或使用方式
- 使用该组件时，需要传入 `open`、`onClose` 和 `onConfirm` 属性。
- 确认创建战斗前，请确保战斗名称不为空，且至少选择了一位参战者。
- 可以通过点击“随机先攻”按钮为所有选中的参战者生成先攻值。
