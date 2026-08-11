# src/components/CombatantInfoPanel.tsx

## 功能概述
该文件定义了 `CombatantInfoPanel` 组件，用于显示和操作战斗中的参战者信息。组件负责展示参战者的状态、装备、攻击等信息，并提供编辑装备变更信息的功能。

## 主要导出/接口
- **Props 类型**:
  - `combatant`: `Combatant` 类型，表示参战者的信息。
  - `onClose`: `() => void` 类型，关闭信息面板的回调函数。
  - `combatants`: `Combatant[]` 类型，可选，表示所有参战者的列表。
  - `tokenMap`: `{ get: (id: string) => { col: number; row: number } | undefined }` 类型，可选，表示参战者位置映射。
  - `combatInventory`: `Equipment[]` 类型，可选，表示战斗背包中的物品。
  - `onRemoveItem`: `(item: Equipment) => void` 类型，可选，从战斗背包中移除物品的回调函数。
  - `equipmentChanges`: `EquipmentChanges` 类型，可选，参战者的装备变更信息。
  - `onUpdateChanges`: `(changes: EquipmentChanges) => void` 类型，可选，更新装备变更信息的回调函数。
  - `actions`: `number` 类型，可选，当前可用动作数。
  - `onHelpClick`: `() => void` 类型，可选，点击“协助”动作时的回调函数。
  - `onAttackClick`: `() => void` 类型，可选，点击“攻击”动作时的回调函数。
  - `onCastClick`: `() => void` 类型，可选，点击“施法”动作时的回调函数。
  - `onDashClick`: `() => void` 类型，可选，点击“疾走”动作时的回调函数。

## 核心实现说明
- 组件使用 `useState` 和 `useEffect` 钩子来管理状态和副作用。
- 组件根据传入的 `combatant` 和 `characterStore` 获取参战者的角色信息。
- 组件提供编辑装备变更信息的功能，包括增加、减少、删除物品等操作。
- 组件根据参战者的状态显示不同的信息，如 HP、AC、攻击等。
- 组件提供手持装备、设置动作、设置不可用等操作。

## 注意事项或使用方式
- 组件需要传入 `combatant` 参数来显示参战者的信息。
- 组件提供 `onClose` 回调函数来关闭信息面板。
- 组件提供 `onUpdateChanges` 回调函数来更新装备变更信息。
- 组件提供 `onHelpClick`、`onAttackClick`、`onCastClick`、`onDashClick` 回调函数来执行不同的动作。
