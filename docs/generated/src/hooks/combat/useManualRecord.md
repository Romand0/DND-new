# src/hooks/combat/useManualRecord.ts

## 功能概述
该文件定义了 `useManualRecord` 钩子函数，用于在战斗系统中手动记录攻击和恢复操作。它允许用户在战斗过程中手动输入攻击和恢复的详细信息，并将这些信息记录到战斗记录中。

## 主要导出/接口
- `UseManualRecordProps` 接口：
  - `selectedCell`: `{ round: number; combatantId: string } | null`，当前选中的战斗单元。
  - `setSelectedCell`: `(v: { round: number; combatantId: string } | null) => void`，设置当前选中的战斗单元。
  - `canUseAction`: `(id: string) => boolean`，检查指定战斗单元是否可以使用动作。
  - `consumeCombatantAction`: `(id: string) => void`，消耗指定战斗单元的动作。
  - `getEffectiveAc`: `(c: any) => number`，获取指定战斗单元的有效AC值。
  - `handleApplyDamage`: `(targetId: string, newHp: number, status?: 'unconscious' | 'dead') => void`，对指定目标造成伤害。
  - `handleCellChange`: `(round: number, combatantId: string, value: string) => void`，更新战斗记录中的单元格。

- `useManualRecord` 函数：
  - 接收 `record: CombatRecord | null` 和 `props: UseManualRecordProps` 作为参数。
  - 返回一个对象，包含以下属性：
    - `manualRecordOpen`: `boolean`，表示手动记录是否打开。
    - `setManualRecordOpen`: `(v: boolean) => void`，设置手动记录的打开状态。
    - `manualRecordType`: `'attack' | 'recovery' | null`，表示手动记录的类型。
    - `setManualRecordType`: `(v: 'attack' | 'recovery' | null) => void`，设置手动记录的类型。
    - `manualTargetId`: `string`，表示手动记录的目标ID。
    - `setManualTargetId`: `(v: string) => void`，设置手动记录的目标ID。
    - `manualAttackMethod`: `string`，表示攻击方式。
    - `setManualAttackMethod`: `(v: string) => void`，设置攻击方式。
    - `manualDamage`: `string`，表示伤害值。
    - `setManualDamage`: `(v: string) => void`，设置伤害值。
    - `manualIsKill`: `boolean`，表示是否造成致命伤害。
    - `setManualIsKill`: `(v: boolean) => void`，设置是否造成致命伤害。
    - `manualHealMethod`: `string`，表示恢复方式。
    - `setManualHealMethod`: `(v: string) => void`，设置恢复方式。
    - `manualHealAmount`: `string`，表示恢复量。
    - `setManualHealAmount`: `(v: string) => void`，设置恢复量。
    - `manualAttackRoll`: `string`，表示攻击检定值。
    - `setManualAttackRoll`: `(v: string) => void`，设置攻击检定值。
    - `confirmManualRecord`: `() => void`，确认手动记录。
    - `cancelManualRecord`: `() => void`，取消手动记录。

## 核心实现说明
`useManualRecord` 钩子函数通过 `useState` 钩子管理手动记录的状态，包括打开状态、记录类型、目标ID、攻击方式、伤害值、是否造成致命伤害、恢复方式、恢复量、攻击检定值等。当用户填写完相关信息并确认记录时，`confirmManualRecord` 函数会被调用，根据记录类型执行相应的操作，如攻击或恢复，并更新战斗记录。如果用户取消记录，`cancelManualRecord` 函数会被调用，清除所有手动记录的状态。

该钩子函数与项目其他模块的关系包括：
- 与 `CombatRecord` 类型定义相关，用于获取和更新战斗记录。
- 与 `canUseAction`、`consumeCombatantAction`、`getEffectiveAc`、`handleApplyDamage`、`handleCellChange` 等函数相关，用于执行战斗操作。

该钩子函数被 `CombatRecord` 组件或其他需要手动记录功能的组件引用。

## 注意事项或使用方式
- 在使用 `useManualRecord` 钩子之前，需要确保已经定义了 `CombatRecord` 类型和相关函数。
- 在调用 `confirmManualRecord` 和 `cancelManualRecord` 函数之前，需要确保手动记录的状态已经填写完整。
- 在执行攻击或恢复操作时，需要确保目标存在且有效。
