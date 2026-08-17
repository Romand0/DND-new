# src/components/CombatantInfoPanel.tsx

## 功能概述
该文件定义了 `CombatantInfoPanel` 组件，用于显示和操作战斗中的参战者信息。组件负责展示参战者的状态、装备、攻击和动作等信息，并提供相应的交互功能。

## 主要导出/接口
- **Props 类型**:
  - `combatant`: `Combatant` 类型，表示当前参战者的信息。
  - `onClose`: `() => void` 类型，关闭信息面板的回调函数。
  - `combatants`: `Combatant[]` 类型，可选，表示所有参战者的列表。
  - `tokenMap`: `{ get: (id: string) => { col: number; row: number } | undefined }` 类型，可选，表示参战者位置映射。
  - `combatInventory`: `Equipment[]` 类型，可选，表示战斗背包中的物品列表。
  - `onRemoveItem`: `(item: Equipment) => void` 类型，可选，从战斗背包中移除物品的回调函数。
  - `equipmentChanges`: `EquipmentChanges` 类型，可选，表示参战者的装备变更信息。
  - `onUpdateChanges`: `(changes: EquipmentChanges) => void` 类型，可选，更新参战者变更信息的回调函数。
  - `actions`: `number` 类型，可选，表示当前可用动作数。
  - `bonusActions`: `number` 类型，可选，表示当前可用附赠动作数。
  - `onHelpClick`: `() => void` 类型，可选，点击“协助”动作时的回调函数。
  - `onAttackClick`: `() => void` 类型，可选，点击“攻击”动作时的回调函数。
  - `onCastClick`: `() => void` 类型，可选，点击“施法”动作时的回调函数。
  - `onDashClick`: `() => void` 类型，可选，点击“疾走”动作时的回调函数。

## 核心实现说明
- 组件使用 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。
- 组件通过 `characterStore` 和 `combatStore` 来获取和更新参战者和战斗相关的数据。
- 组件提供了手持装备、设置动作、编辑变更信息等功能。
- 组件根据参战者的状态和装备信息动态显示不同的界面和操作。

## 注意事项或使用方式
- 组件需要传入 `combatant` 参数来指定当前参战者。
- 组件提供了多个可选参数，可以根据实际需求进行配置。
- 组件的交互功能依赖于传入的回调函数，需要正确实现这些回调函数来处理用户操作。
