# src/hooks/combat/useDamageAndHp.ts

## 功能概述
该文件定义了 `useDamageAndHp` 钩子函数，用于处理战斗中的伤害和生命值（HP）相关逻辑。它负责在战斗记录中应用伤害，更新角色的生命状态，并管理死亡豁免待办事项。该钩子存在是为了提供一个统一的接口来处理战斗中的伤害和生命值变化，确保战斗逻辑的一致性和正确性。

## 主要导出/接口
- `UseDamageAndHpProps` 接口：
  - `currentTurn`: `{ round: number; combatantId: string } | null`，当前回合信息。
  - `playbackMode`: `boolean`，是否处于回放模式。
- `useDamageAndHp` 函数：
  - `record`: `CombatRecord | null`，战斗记录。
  - `props`: `UseDamageAndHpProps`，钩子参数。
  - 返回对象包含：
    - `handleApplyDamage`: `(targetId: string, newHp: number, status?: 'unconscious' | 'dead') => void`，应用伤害到指定角色。
    - `autoFillDownedMarkers`: `() => void`，为昏迷或死亡的角色在后续轮次填入占位符。

## 核心实现说明
`handleApplyDamage` 函数负责根据传入的伤害值和状态更新角色的生命值。如果角色是PC且生命值为0，则自动判定为昏迷状态。函数会更新战斗记录中的角色状态，并在回放模式下添加死亡豁免待办事项。

`autoFillDownedMarkers` 函数用于在战斗记录中为昏迷或死亡的角色在后续轮次填入占位符，确保战斗界面显示的正确性。

该钩子与 `combatStore` 存储模块紧密相关，用于读取和更新战斗记录。它被其他模块引用以执行战斗中的伤害和生命值管理。

## 注意事项或使用方式
- 在调用 `handleApplyDamage` 时，确保传入正确的 `targetId` 和 `newHp`。
- 使用 `autoFillDownedMarkers` 时，确保战斗记录已加载并处于最新状态。
- 在回放模式下，需要正确处理死亡豁免待办事项的添加和清理。
