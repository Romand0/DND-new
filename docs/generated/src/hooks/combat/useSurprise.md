# src/hooks/combat/useSurprise.ts

## 功能概述
该文件定义了一个名为 `useSurprise` 的 React 钩子函数，用于处理战斗中的突袭逻辑。该钩子负责管理突袭的状态，包括是否打开突袭模态框、突袭的回合数以及被突袭的战斗单位集合。它被用于在战斗过程中触发和管理突袭事件。

## 主要导出/接口
```typescript
export function useSurprise(record: CombatRecord | null): {
  surpriseAttackOpen: boolean;
  setSurpriseAttackOpen: React.Dispatch<React.SetStateAction<boolean>>;
  surpriseAttackRound: number;
  surprisedCombatants: Set<string>;
  setSurprisedCombatants: React.Dispatch<React.SetStateAction<Set<string>>>;
  openSurpriseAttackModal: (round: number) => void;
  confirmSurpriseAttack: () => void;
};
```

## 核心实现说明
`useSurprise` 钩子函数的核心逻辑包括：

- 使用 `useState` 钩子来管理突袭状态，包括是否打开模态框、突袭回合数和被突袭的战斗单位集合。
- `openSurpriseAttackModal` 函数用于打开突袭模态框，并设置突袭回合数和被突袭的战斗单位集合。
- `confirmSurpriseAttack` 函数用于确认突袭，更新战斗记录中的突袭状态，并关闭模态框。

该钩子与 `combatStore` 数据存储模块交互，用于更新战斗记录。它被其他组件或模块引用以触发和管理突袭事件。

## 注意事项或使用方式
- 使用 `useSurprise` 钩子之前，需要确保已经导入了 `CombatRecord` 类型定义。
- 调用 `openSurpriseAttackModal` 函数时，需要传入突袭的回合数。
- 调用 `confirmSurpriseAttack` 函数时，将确认突袭并更新战斗记录。
