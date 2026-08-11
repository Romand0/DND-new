# src/hooks/combat/usePlayback.ts

## 功能概述
该文件 `usePlayback.ts` 定义了 `usePlayback` 钩子函数，用于管理战斗回放功能。它负责处理回放状态、模式切换、战斗记录的快照管理以及回放逻辑。该文件的存在是为了提供用户在战斗回放时的交互和功能支持。

## 主要导出/接口
### 导出类型
```typescript
interface UsePlaybackProps {
  playbackStarted: boolean;
  setPlaybackStarted: (v: boolean) => void;
  currentTurn: { round: number; combatantId: string } | null;
  setCurrentTurn: (v: { round: number; combatantId: string } | null) => void;
  rollbackSnapshotRef: React.MutableRefObject<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>;
  playbackSnapshotRef: React.MutableRefObject<any>;
  findNextValidTurn: (fromRound: number, fromCol: number, roundsOverride?: RoundAction[]) => { round: number; combatantId: string } | null;
  resetCombatantActions: (id: string) => void;
  takeTurnSnapshot: (round: number, combatantId: string) => void;
  autoFillDownedMarkers: () => void;
  selectedCell: { round: number; combatantId: string } | null;
}
```

### 导出函数
```typescript
export function usePlayback(record: CombatRecord | null, props: UsePlaybackProps) {
  // ...
}
```

## 核心实现说明
`usePlayback` 钩子函数的核心逻辑包括：

- **状态管理**：管理回放模式（模拟或回放）的状态，以及回放过程中战斗记录的快照。
- **模式切换**：允许用户在模拟和回放模式之间切换，并处理相关的数据更新。
- **快照管理**：在回放模式开始前，保存战斗记录的初始快照，并在回放过程中创建新的快照。
- **回放逻辑**：根据用户的选择或快照数据，恢复战斗状态，并自动填充倒地的标记。

该模块与其他模块的关系包括：

- 与 `combatStore` 模块交互，用于更新战斗记录和快照。
- 与 `battlegroundStore` 模块交互，用于更新战场状态。
- 与 `useRoundTurn` 模块交互，用于获取有效的回合。

## 注意事项或使用方式
- 在使用 `usePlayback` 钩子之前，确保已经正确导入了所需的模块和类型。
- 在调用 `startPlayback` 函数之前，必须有一个有效的战斗记录对象。
- 在进行模式切换时，需要考虑是否已经开始回放或已有快照，以避免潜在的数据不一致问题。
