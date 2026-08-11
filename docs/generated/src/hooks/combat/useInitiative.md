# src/hooks/combat/useInitiative.ts

## 功能概述
该文件定义了 `useInitiative` 钩子函数，用于管理战斗中的先攻顺序。它负责处理先攻投掷、先攻数值的编辑、先攻顺序的排序、平局处理、批量操作等功能。该钩子函数是战斗模块的核心，用于确保战斗流程的顺利进行。

## 主要导出/接口
- `UseInitiativeProps` 接口：包含钩子函数所需的属性，如编辑中的先攻值、设置编辑中的先攻值的函数、先攻输入值、设置先攻输入值的函数等。
- `useInitiative` 函数：返回一系列与先攻顺序相关的状态和函数，包括先攻顺序、获取先攻序号的方法、确认先攻、处理平局、拖动排序、添加回合、删除参战者、批量添加NPC、批量删除参战者、切换选择状态等。

```typescript
interface UseInitiativeProps {
  editingInitiative: string | null;
  setEditingInitiative: (v: string | null) => void;
  initiativeInput: string;
  setInitiativeInput: (v: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  batchMode: boolean;
  setBatchMode: (v: boolean) => void;
  onAddCombatant: (char?: Character) => void;
  onRemoveCombatant: (id: string) => void;
  onAddNpc: (c: Omit<Combatant, 'id'>) => void;
  onBatchAddNpc: (list: Omit<Combatant, 'id'>[]) => void;
}

export function useInitiative(record: CombatRecord | null, props: UseInitiativeProps) {
  // ...
}
```

## 核心实现说明
`useInitiative` 钩子函数首先从 `props` 中解构出必要的属性，然后定义了一系列状态和函数来处理先攻顺序。关键逻辑包括：

- 使用 `useState` 和 `useRef` 管理各种状态，如先攻投掷弹窗状态、选中的角色、d20 输入值、平局排序状态等。
- 根据 `record` 计算先攻顺序，并使用 `Map` 存储每个参战者的先攻序号。
- 提供方法来处理先攻投掷、确认先攻、处理平局、拖动排序、添加回合、删除参战者、批量添加NPC、批量删除参战者、切换选择状态等。
- 与 `combatStore` 和 `characterStore` 交互，更新战斗记录和角色数据。

## 注意事项或使用方式
- 使用该钩子函数时，需要传入 `record` 和 `props`。
- `record` 应该是当前战斗记录的实例。
- `props` 包含与先攻顺序相关的各种属性和函数，如编辑中的先攻值、设置编辑中的先攻值的函数等。
- 使用 `handleConfirmInitiative` 函数来处理确认 PC 先攻并加入战斗的逻辑。
- 使用 `handleConfirmTiebreaker` 函数来处理平局排序的逻辑。
- 使用 `handleDragStart`、`handleDragMove` 和 `handleDragEnd` 函数来处理先攻顺序的拖动排序逻辑。
