# src/components/TurnTodoBoard.tsx

## 功能概述
该文件定义了 `TurnTodoBoard` 组件，用于显示和管理战斗回合中的待办事项。组件负责展示当前回合的待办列表，允许用户创建新的待办事项，并处理待办事项的创建、完成和删除操作。此外，对于特定类型的待办事项（如死亡豁免），组件提供了额外的交互功能。

## 主要导出/接口
- **Props 类型**:
  ```typescript
  interface Props {
    record: CombatRecord;
    currentTurn: { round: number; combatantId: string } | null;
    combatants: Combatant[];
  }
  ```
- **导出组件**:
  ```typescript
  export default function TurnTodoBoard({ record, currentTurn, combatants }: Props) { ... }
  ```
- **内部状态**:
  - `showCreate`: 控制创建待办事项表单的显示状态。
  - `activeTodo`: 当前选中的待办事项。
  - `deathRollInput`: 死亡豁免掷骰的输入值。
  - `deathResult`: 死亡豁免掷骰的结果。
  - `formCombatantId`: 创建待办事项时选择的适用者 ID。
  - `formNameInput`: 创建待办事项时输入的名称。
  - `formType`: 创建待办事项时选择的类型。
  - `formStartRoundInput`: 创建待办事项时输入的起始回合。
  - `formEndRoundInput`: 创建待办事项时输入的终止回合。
- **函数**:
  - `handleCreate`: 处理创建待办事项的逻辑。
  - `handleClickTodo`: 处理点击待办事项的逻辑。
  - `handleCompleteTodo`: 处理完成待办事项的逻辑。
  - `handleDeathSaveRoll`: 处理死亡豁免掷骰的逻辑。

## 核心实现说明
- `TurnTodoBoard` 组件通过 `useState` 和 `useEffect` 钩子管理组件的状态。
- 组件使用 `useNumberInput` 和 `useTextInput` 钩子来处理输入值的规范化。
- `useMemo` 钩子用于计算当前回合的待办事项列表。
- 组件通过 `combatStore` 提供的方法来添加、删除和修改待办事项。
- 对于死亡豁免，组件提供了一个额外的弹窗来处理掷骰和结果展示。

## 注意事项或使用方式
- 组件依赖于 `combatStore` 来管理待办事项的数据。
- 用户可以通过点击“添加待办”按钮来创建新的待办事项。
- 用户可以通过点击待办事项来标记其完成或删除。
- 对于死亡豁免，用户需要输入掷骰结果，并提交结果以更新状态。
