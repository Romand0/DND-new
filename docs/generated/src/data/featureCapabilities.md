# src/data/featureCapabilities.ts

## 功能概述

主动技能能力注册表（active-skills-engine 的通道路由核心）。为特性名注册「使用后如何执行」的能力契约，未注册的特性回退 manual（提示 DM 手动结算）。DM 端 handleFeatureUse 与玩家端回合包 turnCommitApply 均经 `resolveFeatureCapability` 路由，保证两端同构。

## 主要导出/接口

- `FeatureChannel`：通道枚举——`manual`（手动结算提示）/ `status`（挂状态 + TurnTodo）/ `advantage`（双向 pending 优劣势）/ `reaction`（被动反应说明）/ `checkModifier`（检定加值，待接弹窗）/ `attack_rider`（命中触发）。
- `AttackRiderSpec`：attack_rider 通道契约——成本（池 cost 或 spellSlot）、基础伤害骰、目标种类加骰（vs 不死/邪眷）、环级升级骰（perSlotDice）、命中后豁免（ability/dc 工厂/failStatus: 'stunned'/durationRounds/todo）。
- `resolveFeatureCapability(featureName)`：查注册表，未注册返回 `{ channel: 'manual' }`。
- 已注册：狂暴（status→rage）、鲁莽攻击（advantage 双向）、至圣斩（attack_rider spellSlot 2d8 光耀 + 不死/邪眷 +1d8 + 每环 1d8）、震慑拳（attack_rider 池 1 气，体质豁免 DC 8+熟练+感调，失败震慑 2 回合）。

## 核心实现说明

- 注册键统一 `feature:<特性名>`，与池键/featureUses 漏斗键口径一致。
- 震慑拳 DC 的熟练加值在角色卡字段缺失时按等级推导（L1-4→2，每 4 级 +1）；但 characterStore.add 归一化会补默认 2，低等级外角色需卡上有真实值。

## 注意事项或使用方式

- 新增主动特性优先在此注册通道；跨 3 处以上的执行逻辑放 featureChannelRunner / attackRiders，注册表只声明契约。
- 种子标注（scripts/annotate-feature-resources.mjs）决定特性是否出现在主动技能面板（role/activation/resource），本表决定按下按钮后的行为，两者职责分离。
