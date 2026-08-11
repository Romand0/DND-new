# src/components/CombatAttackModal.tsx

## 功能概述
该文件定义了 `CombatAttackModal` 组件，用于显示战斗攻击检定弹窗。该弹窗从沙盘战斗按钮触发，允许玩家进行攻击检定，并处理命中或未命中的结果。

## 主要导出/接口
- **Props 类型**:
  - `attacker`: `Combatant` 类型，表示攻击者。
  - `target`: `Combatant` 类型，表示目标。
  - `onClose`: `() => void` 类型，关闭弹窗的回调函数。
  - `attackerPos`: 可选，`{ col: number; row: number }` 类型，攻击者在沙盘上的格子坐标。
  - `targetPos`: 可选，`{ col: number; row: number }` 类型，目标在沙盘上的格子坐标。
  - `onConfirmHit`: 可选，`(attack: Attack | NpcAttack, info: {...}) => void` 类型，命中确认的回调函数。
  - `onAttackMiss`: 可选，`(info: {...}) => void` 类型，未命中确认的回调函数。
  - `combatInventory`: 可选，`Equipment[]` 类型，攻击者的战斗背包。
  - `targetCharacter`: 可选，`Character | null` 类型，目标角色。
  - `targetCombatInventory`: 可选，`Equipment[]` 类型，目标战斗背包。
  - `loadedWeapons`: 可选，`Record<string, boolean>` 类型，装填武器状态。
  - `onLoadedChange`: 可选，`(key: string, loaded: boolean) => void` 类型，装填状态变更回调。
  - `loadingAttackedThisRound`: 可选，`Record<string, boolean>` 类型，本回合已用过装填武器攻击的参战者。
  - `combatMode`: 可选，`'simulation' | 'playback'` 类型，战斗模式。
  - `playbackTurnActive`: 可选，`boolean` 类型，是否处于有效放映回合中。
  - `recordId`: 可选，`string` 类型，战斗记录 ID。
  - `currentRound`: 可选，`number` 类型，当前回合数。
  - `combatantPositions`: 可选，`Record<string, { col: number; row: number } | null | undefined> | null` 类型，所有参战者沙盘位置字典。

## 核心实现说明
- 组件使用 `useState` 和 `useMemo` 钩子来管理状态和缓存数据。
- 组件通过 `characterStore` 和 `combatStore` 访问角色和战斗数据。
- 组件使用 `rollDice` 函数来模拟掷骰。
- 组件通过 `detectAdvantage` 和 `resolveRollMode` 函数来检测和解析优劣势。
- 组件处理攻击检定结果，并根据结果调用 `onConfirmHit` 或 `onAttackMiss` 回调函数。

## 注意事项或使用方式
- 组件应在沙盘战斗场景中使用，通过触发沙盘战斗按钮来打开。
- 攻击者需要选择攻击方式，并输入 d20 骰值。
- 组件会根据输入的骰值和攻击加值计算最终结果，并显示命中或未命中的信息。
- 如果攻击命中，组件会调用 `onConfirmHit` 回调函数，并传递攻击信息和相关信息。
- 如果攻击未命中，组件会调用 `onAttackMiss` 回调函数，并传递攻击信息和相关信息。
