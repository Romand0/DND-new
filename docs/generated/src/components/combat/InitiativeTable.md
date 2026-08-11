# src/components/combat/InitiativeTable.tsx

## 功能概述
该文件定义了 `InitiativeTable` 组件，该组件负责展示和编辑战斗中的先攻表格。它承担着显示战斗参战者的先攻值、回合行动记录以及提供编辑和操作功能，如编辑先攻值、删除参战者、设置被突袭角色等。该组件的存在是为了提供一个直观且易于操作的界面，帮助战斗管理者高效地进行战斗管理。

## 主要导出/接口
```typescript
interface Props {
  combatants: Combatant[];
  rounds: RoundAction[];
  selectedCell: { round: number; combatantId: string } | null;
  editingCell: { round: number; combatantId: string } | null;
  onCellClick: (round: number, combatantId: string) => void;
  onCellChange: (round: number, combatantId: string, value: string) => void;
  onSetEditingCell: (cell: { round: number; combatantId: string } | null) => void;
  onSetSelectedCell: (cell: { round: number; combatantId: string } | null) => void;
  editingInitiative: string | null;
  initiativeInput: string;
  onInitiativeSave: (id: string) => void;
  onInitiativeCancel: () => void;
  onInitiativeStartEdit: (id: string) => void;
  onInitiativeInputChange: (v: string) => void;
  getInitiativeCircle: (id: string) => string;
  batchMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onRemoveCombatant: (id: string) => void;
  onOpenSurpriseAttack: (round: number) => void;
  isPlayback: boolean;
  playbackStarted: boolean;
  currentTurn: { round: number; combatantIdx: number; combatantId: string } | null;
  onStartPlayback: () => void;
  onOpenManualRecord: () => void;
  onOpenRewind: (round: number, combatantId: string, combatantIdx: number) => void;
  turnTodos?: TurnTodo[];
  onToggleTodo?: (todoId: string, round: number) => void;
}
```

## 核心实现说明
`InitiativeTable` 组件的核心逻辑包括：
- 展示战斗参战者的先攻值和回合行动记录。
- 提供编辑先攻值的功能，包括开始编辑、保存、取消编辑。
- 提供删除参战者和设置被突袭角色的功能。
- 支持批量操作，如选择多个参战者进行操作。
- 支持放映模式，允许回放战斗过程，并提供手动记录和回溯功能。

该组件与项目其他模块的关系：
- 与 `Combatant`、`RoundAction`、`TurnTodo` 等类型定义相关联。
- 与 `onCellClick`、`onCellChange` 等事件处理函数相关联。
- 与 `batchMode`、`isPlayback` 等状态相关联。

## 注意事项或使用方式
- 组件通过 `props` 接收各种状态和操作函数。
- 使用 `onCellClick` 函数来处理单元格点击事件。
- 使用 `onCellChange` 函数来处理单元格内容变更。
- 使用 `onSetEditingCell` 和 `onSetSelectedCell` 函数来设置编辑和选择单元格。
- 在放映模式下，可以使用 `onStartPlayback` 函数开始放映，使用 `onOpenManualRecord` 函数手动记录，使用 `onOpenRewind` 函数回溯到指定回合。
