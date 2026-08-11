# src/hooks/combat/useRoundTurn.ts

## 功能概述

该文件定义了 `useRoundTurn` 钩子，用于管理战斗回合的流程。它负责处理回合的推进、回合内参战者的行动记录、回合快照的保存与回滚等功能。该钩子是战斗逻辑的核心部分，确保战斗流程的准确性和可追溯性。

## 主要导出/接口

- `TurnSnapshot` 类型：定义了回合快照的结构，包含参战者、回合行动、战场状态和装备变更等信息。
  ```typescript
  export type TurnSnapshot = {
    combatants: Combatant[];
    rounds: RoundAction[];
    battleground: any[];
    equipmentChanges?: Record<string, EquipmentChanges>;
  };
  ```
- `UseRoundTurnProps` 接口：定义了 `useRoundTurn` 钩子所需的属性，包括自动填充倒地标记、重置参战者行动和回滚快照引用等。
  ```typescript
  export interface UseRoundTurnProps {
    autoFillDownedMarkers: () => void;
    resetCombatantActions: (id: string) => void;
    rollbackSnapshotRef: React.MutableRefObject<{
      initial: TurnSnapshot | null;
      snapshots: Record<string, TurnSnapshot>;
    }>;
  }
  ```
- `useRoundTurn` 函数：导出的主要函数，负责处理战斗回合的逻辑。
  ```typescript
  export function useRoundTurn(record: CombatRecord | null, props: UseRoundTurnProps) {
    // ...
  }
  ```

## 核心实现说明

`useRoundTurn` 钩子通过管理 `currentTurn` 状态来跟踪当前回合的参战者和回合号。它提供了以下核心功能：

- **回合推进**：通过 `advanceTurn` 函数推进回合，处理参战者的行动记录，并更新状态。
- **回合快照**：通过 `takeTurnSnapshot` 函数在回合开始时保存快照，通过 `applyRollback` 函数回滚到之前的回合状态。
- **状态管理**：通过 `combatStore` 和 `battlegroundStore` 管理战斗记录和战场状态。
- **与其他模块的关系**：与 `combatStore` 和 `battlegroundStore` 模块紧密交互，确保战斗数据的准确性和一致性。
- **被谁引用**：该钩子被战斗逻辑组件和界面组件引用，用于处理战斗流程和显示战斗状态。

## 注意事项或使用方式

- 使用 `useRoundTurn` 钩子时，需要传入 `record` 对象，它包含战斗的当前状态。
- 钩子提供了 `handleCellChange` 和 `appendRoundRecord` 函数来处理参战者的行动记录。
- `findNextValidTurn` 函数用于查找下一个有效的参战者。
- `confirmEndTurn` 函数用于确认结束当前回合。
- `resolveWriteCell` 函数用于确定写入单元格的回合和参战者。
