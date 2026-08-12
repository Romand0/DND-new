# src/hooks/combat/useActions.ts

## 功能概述
该文件定义了 `useActions` 函数，该函数是一个 React Hook，用于提供与战斗记录相关的操作功能。它允许组件根据战斗记录的状态执行各种操作，如检查动作是否可用、消耗动作、标记攻击等。该文件的存在是为了在组件中提供便捷的战斗逻辑处理，而不需要直接操作状态管理。

## 主要导出/接口
```typescript
export function useActions(record: CombatRecord | null): {
  currentMode: () => 'simulation' | 'playback';
  canUseAction: (combatantId: string) => boolean;
  canUseBonusAction: (combatantId: string) => boolean;
  isIncapacitated: (combatantId: string) => boolean;
  consumeCombatantAction: (combatantId: string) => void;
  consumeCombatantBonusAction: (combatantId: string) => void;
  markLoadingAttacked: (combatantId: string) => void;
  resetCombatantActions: (combatantId: string) => void;
};
```

- `currentMode`: 返回当前战斗模式，'simulation' 或 'playback'。
- `canUseAction`: 检查指定战斗者是否可以使用动作。
- `canUseBonusAction`: 检查指定战斗者是否可以使用附赠动作。
- `isIncapacitated`: 检查指定战斗者是否处于无法行动状态。
- `consumeCombatantAction`: 消耗指定战斗者的动作。
- `consumeCombatantBonusAction`: 消耗指定战斗者的附赠动作。
- `markLoadingAttacked`: 标记指定战斗者在本回合是否被攻击。
- `resetCombatantActions`: 重置指定战斗者的动作。

## 核心实现说明
`useActions` 函数通过接收一个 `CombatRecord` 对象作为参数，提供了一系列操作战斗记录的方法。它依赖于 `combatStore` 来管理战斗记录的状态。以下是一些关键点：

- `currentMode` 函数根据战斗记录的 `mode` 属性返回当前模式。
- `canUseAction` 和 `canUseBonusAction` 函数检查战斗者是否满足使用条件，包括是否处于无法行动状态、是否在模拟模式或放映模式下以及动作次数是否足够。
- `consumeCombatantAction` 和 `consumeCombatantBonusAction` 函数通过 `combatStore` 消耗动作和附赠动作。
- `markLoadingAttacked` 函数标记战斗者是否在本回合被攻击。
- `resetCombatantActions` 函数在放映模式下重置战斗者的动作。

该模块被组件引用以执行与战斗记录相关的操作。

## 注意事项或使用方式
- 使用 `useActions` 需要传入一个有效的 `CombatRecord` 对象。
- 在调用 `consumeCombatantAction` 和 `consumeCombatantBonusAction` 之前，应先使用 `canUseAction` 和 `canUseBonusAction` 检查动作是否可用。
- 在放映模式下，所有动作都是可用的，因此不需要检查动作次数。
