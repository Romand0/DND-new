# src/components/CombatantInfoPanel.tsx

## 功能概述
该文件定义了 `CombatantInfoPanel` 组件，用于显示和操作战斗中的参战者信息。组件承担以下职责：
- 显示参战者的基本信息，如 HP、AC 等。
- 提供装备管理功能，包括手持装备的选取、放下和变更。
- 提供攻击和施法操作，以及相关的状态管理。
- 提供变更信息编辑功能，允许修改参战者的装备变化。

## 主要导出/接口
- `Props` 接口：定义了组件的属性类型。
  - `combatant`: `Combatant` 类型，表示参战者信息。
  - `onClose`: `() => void` 类型，关闭面板的回调函数。
  - `combatants`: `Combatant[]` 类型，可选，表示所有参战者列表。
  - `tokenMap`: `{ get: (id: string) => { col: number; row: number } | undefined }` 类型，可选，表示参战者位置映射。
  - `combatInventory`: `Equipment[]` 类型，可选，表示战斗背包。
  - `onRemoveItem`: `(item: Equipment) => void` 类型，可选，从战斗背包中移除物品的回调函数。
  - `equipmentChanges`: `EquipmentChanges` 类型，可选，表示参战者的装备变更信息。
  - `onUpdateChanges`: `(changes: EquipmentChanges) => void` 类型，可选，更新装备变更信息的回调函数。
  - `actions`: `number` 类型，可选，表示当前可用动作数。
  - `onHelpClick`: `() => void` 类型，可选，点击“协助”动作时的回调函数。
  - `onAttackClick`: `() => void` 类型，可选，点击“攻击”动作时的回调函数。
  - `onCastClick`: `() => void` 类型，可选，点击“施法”动作时的回调函数。
  - `onDashClick`: `() => void` 类型，可选，点击“疾走”动作时的回调函数。

## 核心实现说明
- 组件使用 `useState` 和 `useEffect` 钩子来管理状态和副作用。
- 组件通过 `characterStore` 和 `combatStore` 来获取和更新参战者和战斗相关的数据。
- 组件提供了手持装备的选取、放下和变更功能，以及攻击和施法操作。
- 组件提供了变更信息编辑功能，允许修改参战者的装备变化。

## 注意事项或使用方式
- 组件需要传入 `combatant` 属性来显示参战者的信息。
- 组件提供了关闭面板的回调函数 `onClose`。
- 组件提供了装备变更信息的更新回调函数 `onUpdateChanges`。
- 组件提供了攻击和施法操作的回调函数，如 `onAttackClick` 和 `onCastClick`。
