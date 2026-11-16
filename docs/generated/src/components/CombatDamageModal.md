# src/components/CombatDamageModal.tsx

## 功能概述
该文件定义了 `CombatDamageModal` 组件，用于在角色扮演游戏中展示伤害弹窗。当攻击命中后，该组件会解析伤害骰、输入各骰结果、计算伤害、影响 HP，并允许用户确认伤害结果。

P3 起新增「命中触发」区（attack_rider 通道）：近战/投掷攻击命中结算时可勾选至圣斩/震慑拳，rider 骰与武器骰合并输入、重击一起翻倍，rider 伤害（如光耀）作为独立伤害分量走抗性结算；带豁免的 rider（震慑拳）需输入豁免成败后才能确认。

## 主要导出/接口
```typescript
interface Props {
  attacker: Combatant;
  target: Combatant;
  attack: Attack | NpcAttack;
  disadvantage?: boolean;
  rollMode?: 'none' | 'advantage' | 'disadvantage';
  reasons?: AdvantageReason[];
  riders?: AttackRiderOption[];   // 命中触发选项（近战/投掷时由 CombatSession 实时派生传入）
  onApplyDamage: (payload: {
    damage: number;
    newHp: number;
    status?: 'unconscious' | 'dead';
    diceValues: number[];
    damageBonus: number;
    isCritical: boolean;
    riders?: AttackRiderSelection[]; // 勾选结果回传，落地在 attackRiders.applyAttackRiders
  }) => void;
  onClose: () => void;
  isCritical?: boolean;
  isTwoHandedWield?: boolean;
}

export default function CombatDamageModal({
  attacker,
  target,
  attack,
  disadvantage,
  rollMode,
  reasons,
  onApplyDamage,
  onClose,
  isCritical = false,
  isTwoHandedWield = false,
}: Props) {
  // ...
}
```

## 核心实现说明
`CombatDamageModal` 组件通过接收 `Props` 对象作为参数，其中包含了攻击者、目标、攻击信息、是否处于劣势、检定模式、优劣势来源列表、应用伤害的回调函数、关闭弹窗的回调函数、是否为重击以及是否双手握持等信息。

组件内部首先解析攻击的伤害骰字符串，并根据手持状态选择正确的伤害骰字符串。然后，组件使用 `useState` 和 `useMemo` 钩子来管理骰子值、计算的总伤害以及 NPC 致命伤害时的状态决定。

组件提供了计算伤害、摇骰、更新单个骰子值、确认伤害等功能。在确认伤害时，会根据是否为 NPC 致命伤害以及是否需要决定状态来执行相应的操作。

## 注意事项或使用方式
- 该组件应在攻击命中后调用，并传入相应的参数。
- 用户需要输入或摇出骰子值，并计算总伤害。
- 如果是 NPC 致命伤害，需要决定其状态（昏迷或死亡）。
- 确认伤害后，会调用 `onApplyDamage` 回调函数，并将伤害结果应用到目标上。
