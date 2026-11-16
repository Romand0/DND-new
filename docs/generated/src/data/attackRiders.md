# src/data/attackRiders.ts

## 功能概述

attack_rider 通道执行器：命中触发类特性（至圣斩、震慑拳）的可用性构建与落地结算。可用性在伤害弹窗打开时只读派生，资源消耗与状态挂载只在 DM 确认伤害时写库，与「勾选声明不扣资源」的 5e「当你命中时」语义一致。

## 主要导出/接口

- `AttackRiderOption`：伤害弹窗勾选区的一个可发动 rider 选项（只读快照），含池余量/法术位环级余量/伤害骰/加骰条件/豁免 DC。
- `AttackRiderSelection`：弹窗回传的勾选结果（featureName + slotLevel + saveResult）。
- `getAttackRiders(record, attacker)`：构建攻击者的可用 rider 选项。仅 PC 影子卡特性驱动（NPC 无特性卡返回空数组）；池余量走 `combatStore.getFeaturePoolView`，法术位余量 = 卡 max-used 与战斗 delta 叠加；池余量不足或无任何有余环级时不产生选项。
- `applyAttackRiders(record, attacker, target, selections, currentRound0, opts?)`：落地勾选结果。扣资源（池走 consumeFeatureUse 漏斗 / 法术位走 consumeSpellSlot delta）、豁免失败挂 stunned 状态 + TurnTodo（endRound = start + durationRounds，与 P2 status 约定同构）、返回回合记录补充行；`opts.targetAlive === false`（伤害后死亡）跳过状态挂载但资源照扣。

## 核心实现说明

- 特性判定统一走 `resolveFeatureCapability`（注册式路由），只处理 channel === 'attack_rider' 的条目。
- 池成员特性（震慑拳引用气池）通过 `resolvePoolKey` 解析到池主键 `feature:气`。
- 状态挂载按记录模式区分 playback（startRound 锚定 currentRound0）与 simulation。
- 至圣斩选环升级：CombatDamageModal 按 `perSlotDice` 每高 1 环追加骰组；目标为不死/邪眷时 `bonusDice.vs` 追加 1d8（由弹窗的 riderDiceCount 折算）。

## 注意事项或使用方式

- CombatSession 在伤害弹窗渲染处实时调用 getAttackRiders（usageMode 限近战/投掷），确认伤害后调用 applyAttackRiders 并把返回行写入回合记录。
- turnCommitApply 对玩家端的 attack_rider 声明 op 跳过池扣（资源由 DM 在命中时结算）。
