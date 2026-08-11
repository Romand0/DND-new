# src/components/combat/SurpriseAttackDialog.tsx

## 功能概述
该文件定义了 `SurpriseAttackDialog` 组件，该组件负责展示和管理突袭对话框。它允许用户选择在战斗中被突袭的角色，并处理相关的确认和关闭操作。该组件的存在是为了提供一个用户界面，让玩家或NPC在战斗中执行突袭动作。

## 主要导出/接口
- **Props 类型**:
  ```typescript
  interface Props {
    open: boolean;
    round: number;
    combatants: Combatant[];
    surprisedCombatants: Set<string>;
    onToggleSurprised: (id: string) => void;
    onConfirm: () => void;
    onClose: () => void;
  }
  ```
  - `open`: 布尔值，指示对话框是否打开。
  - `round`: 数字，表示当前战斗轮数。
  - `combatants`: `Combatant` 数组，包含所有参与战斗的角色信息。
  - `surprisedCombatants`: `Set<string>`，包含被突袭的角色ID集合。
  - `onToggleSurprised`: 函数，用于切换角色的突袭状态。
  - `onConfirm`: 函数，用于确认突袭操作。
  - `onClose`: 函数，用于关闭对话框。

## 核心实现说明
`SurpriseAttackDialog` 组件的核心逻辑包括：
- 根据 `open` 属性决定是否渲染对话框。
- 使用 `map` 方法遍历 `combatants` 数组，为每个角色生成一个复选框，用于选择是否被突袭。
- 使用 `onToggleSurprised` 函数来更新 `surprisedCombatants` 集合的状态。
- 提供取消和确定按钮，分别调用 `onClose` 和 `onConfirm` 函数。

该组件与项目其他模块的关系：
- 通过 `combatants` 和 `surprisedCombatants` 与战斗管理模块交互。
- 通过 `onToggleSurprised` 和 `onConfirm` 与战斗逻辑模块交互。

该组件被战斗管理模块引用，用于展示和管理突袭对话框。

## 注意事项或使用方式
- 该组件应在战斗管理模块的控制下打开和关闭。
- 用户应通过复选框选择被突袭的角色。
- 确认按钮将触发突袭操作，取消按钮将关闭对话框。
