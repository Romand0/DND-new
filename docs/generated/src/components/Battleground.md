# src/components/Battleground.tsx

## 功能概述
该文件定义了 `Battleground` 组件，它是用于展示参战者位置与移动的网格沙盘组件。它支持三种大小预设，并提供了一系列操作，如移动、放置、删除、橡皮擦、缩放、撤回等。该组件主要用于模拟战斗场景，支持战斗模式（模拟模式和放映模式）和放映模式下的特定操作。

## 主要导出/接口
- `Props` 接口定义了组件的属性，包括：
  - `sessionId`：会话 ID
  - `combatants`：参战者列表
  - `onRequestAttack`：攻击按钮触发函数
  - `onRequestSpell`：法术按钮触发函数
  - `onPickupItem`：拾起物品函数
  - `readOnly`：放映模式
  - `activeTurnCombatantId`：当前回合角色 ID
  - `playbackOnlyMovableId`：放映模式下可操作的角色 ID
  - `combatInventories`：战斗背包
  - `onRemoveItem`：从战斗背包删除物品函数
  - `equipmentChangesMap`：装备变更信息
  - `onUpdateChanges`：更新装备变更信息函数
  - `mode`：战斗模式
  - `playbackActive`：放映模式是否有效
  - `actionsMap`：参战者当前可用动作数
  - `remainingMovementMap`：参战者剩余移动力
  - `onConsumeMovement`：消耗移动力函数
  - `onRefundMovement`：退还移动力函数
  - `onSelectionChange`：选中参战者变更函数
- `Battleground` 组件：网格沙盘组件，使用 React 函数组件实现

## 核心实现说明
- `Battleground` 组件使用 `useState`、`useEffect`、`useMemo` 和 `useRef` 等钩子函数来管理状态和副作用。
- 组件使用 `battlegroundStore` 来获取和更新沙盘数据。
- 组件支持手势操作，如拖拽、缩放和平移。
- 组件支持放映模式，允许在放映模式下禁用所有沙盘操作。
- 组件支持战斗模式，包括模拟模式和放映模式。
- 组件支持装备变更和物品拾取功能。

## 注意事项或使用方式
- 组件需要传入 `sessionId` 和 `combatants` 属性。
- 组件支持 `onRequestAttack`、`onRequestSpell`、`onPickupItem` 等函数来处理特定操作。
- 组件支持 `readOnly` 属性来启用放映模式。
- 组件支持 `mode` 属性来指定战斗模式。
- 组件支持 `playbackActive` 属性来控制放映模式是否有效。
