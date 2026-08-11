# src/components/CombatDamageModal.tsx

## 功能概述
该文件定义了 `CombatDamageModal` 组件，用于在角色扮演游戏中展示伤害弹窗。当攻击命中后，该组件会解析伤害骰、输入各骰结果、计算伤害、影响 HP，并允许用户确认伤害结果。

## 主要导出/接口
```typescript
interface Props {
  attacker: Combatant;
  target: Combatant;
  attack: Attack | NpcAttack;
  disadvantage?: boolean;
  rollMode?: 'none' | 'advantage' | 'disadvantage';
  reasons?: AdvantageReason[];
  onApplyDamage: (payload: {
    damage: number;
    newHp: number;
    status?: 'unconscious' | 'dead';
    diceValues: number[];
    damageBonus: number;
    isCritical: boolean;
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
