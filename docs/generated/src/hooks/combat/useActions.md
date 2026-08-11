# src/hooks/combat/useActions.ts

## 功能概述
该文件定义了一个名为 `useActions` 的 React 钩子函数，用于处理战斗相关的操作。它封装了与战斗状态相关的逻辑，如检查战斗者是否可以使用动作、消耗动作、标记被攻击状态以及重置动作等。该钩子函数的存在是为了提供一种简洁且可重用的方式来访问和操作战斗状态，从而简化组件的编写。

## 主要导出/接口
```typescript
export function useActions(record: CombatRecord | null): {
  currentMode: () => 'simulation' | 'playback';
  canUseAction: (combatantId: string) => boolean;
  isIncapacitated: (combatantId: string) => boolean;
  consumeCombatantAction: (combatantId: string) => void;
  markLoadingAttacked: (combatantId: string) => void;
  resetCombatantActions: (combatantId: string) => void;
};
```

- `currentMode`: 返回当前战斗模式，可以是 'simulation' 或 'playback'。
- `canUseAction`: 检查指定战斗者是否可以使用动作。
- `isIncapacitated`: 检查指定战斗者是否处于无法使用动作的状态。
- `consumeCombatantAction`: 消耗指定战斗者的动作。
- `markLoadingAttacked`: 标记指定战斗者在本回合已被攻击。
- `resetCombatantActions`: 重置指定战斗者的动作。

## 核心实现说明
`useActions` 钩子函数首先根据传入的 `record` 对象确定当前战斗模式。它提供了多个方法来处理战斗状态，包括检查战斗者是否可以使用动作、消耗动作、标记被攻击状态以及重置动作等。这些方法依赖于 `combatStore` 来更新和获取战斗状态。

该钩子函数与项目中的 `combatStore` 模块紧密相关，它通过 `combatStore` 来实现状态的持久化和更新。其他模块可以通过导入 `useActions` 钩子函数来访问这些状态和操作，从而简化组件之间的交互。

## 注意事项或使用方式
使用 `useActions` 钩子函数时，需要传入一个 `CombatRecord` 对象，该对象描述了当前的战斗状态。如果 `record` 为 `null`，则大多数方法将不执行任何操作。在使用前，请确保已经正确设置了 `record` 对象，并且理解每个方法的用途和预期行为。
