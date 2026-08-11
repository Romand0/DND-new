# src/components/combat/ManualRecordDialog.tsx

## 功能概述
该文件定义了 `ManualRecordDialog` 组件，用于在游戏中手动记录攻击或恢复操作。组件允许用户选择攻击或恢复类型，选择目标，输入攻击或恢复的详细信息，并预览操作结果。该组件的存在是为了提供更灵活的战斗记录方式，满足游戏中可能出现的特殊战斗情况。

## 主要导出/接口
- **类型**：`Props`
  - `open`: `boolean` - 控制对话框是否显示
  - `recordType`: `'attack' | 'recovery' | null` - 记录类型，'attack' 表示攻击记录，'recovery' 表示恢复记录，null 表示未设置
  - `combatants`: `Combatant[]` - 参与战斗的角色列表
  - `attackerId`: `string` - 攻击者的 ID
  - `onSetType`: `(t: 'attack' | 'recovery' | null) => void` - 设置记录类型
  - `targetId`: `string` - 目标角色的 ID
  - `onTargetIdChange`: `(v: string) => void` - 更新目标角色 ID
  - `attackMethod`: `string` - 攻击方式
  - `onAttackMethodChange`: `(v: string) => void` - 更新攻击方式
  - `attackRoll`: `string` - 攻击检定值
  - `onAttackRollChange`: `(v: string) => void` - 更新攻击检定值
  - `damage`: `string` - 伤害值
  - `onDamageChange`: `(v: string) => void` - 更新伤害值
  - `isKill`: `boolean` - 是否造成致命伤害
  - `onIsKillChange`: `(v: boolean) => void` - 更新是否造成致命伤害
  - `healMethod`: `string` - 恢复方式
  - `onHealMethodChange`: `(v: string) => void` - 更新恢复方式
  - `healAmount`: `string` - 恢复量
  - `onHealAmountChange`: `(v: string) => void` - 更新恢复量
  - `getEffectiveAc`: `(c: Combatant) => number` - 获取角色的有效 AC 值
  - `getInitiativeCircle`: `(id: string) => string` - 获取角色的先攻标记
  - `onConfirm`: `() => void` - 确认操作
  - `onCancel`: `() => void` - 取消操作

## 核心实现说明
`ManualRecordDialog` 组件根据传入的 `recordType` 属性决定显示攻击记录或恢复记录界面。组件中包含多个输入框和选择框，用于输入和选择攻击或恢复的详细信息。组件还包含预览功能，用于显示操作结果。

组件与 `combatants` 数组中的角色信息进行交互，通过 `getEffectiveAc` 和 `getInitiativeCircle` 函数获取角色的有效 AC 值和先攻标记。组件还与 `onSetType`、`onTargetIdChange`、`onAttackMethodChange` 等函数进行交互，以更新记录类型、目标角色 ID、攻击方式等信息。

## 注意事项或使用方式
- 使用该组件前，需要确保已传入正确的 `recordType`、`combatants`、`attackerId` 等参数。
- 在选择目标角色时，需要注意不能选择自己或同队角色（PC 攻击 NPC / NPC 攻击 PC）。
- 在输入攻击或恢复的详细信息时，请确保输入的值符合游戏规则。
- 使用预览功能可以查看操作结果，确认无误后再进行确认操作。
