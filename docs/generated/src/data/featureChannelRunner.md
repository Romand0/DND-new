# src/data/featureChannelRunner.ts

## 功能概述

主动技能 C 类通道共用执行器。DM 端 handleFeatureUse 与玩家端回合包 turnCommitApply（feature-use op）共用的「按下按钮之后」落地函数，保证两端执行同构。

## 主要导出/接口

- `executeFeatureChannel(record, combatant, featureName, currentRound0)`：按 resolveFeatureCapability 的通道执行。
  - `status` 通道：globalStatusManager.applyEffect 挂状态（playback 模式锚定 startRound = currentRound0）+ combatStore.addTurnTodo 提醒解除（endRound = start + durationRounds）。
  - `advantage` 通道：双向 pending 优劣势（自身对目标优势 + 目标对自身优势，expireOnCombatantId 锚定），返回 note 文案。
  - `attack_rider` 通道：仅返回「命中时结算：…」提示 note（声明不扣资源，落地在 attackRiders.applyAttackRiders）。
- 返回 `{ note?: string }`，note 为空表示静默成功。

## 核心实现说明

- 状态实例与 TurnTodo 的 round 口径与放映回溯一致：playback 下 statusManager 的过期语义按 startRound + durationRounds 推导。
- 本模块只做通道执行，不做池扣减——池消耗在调用方（DM 端 handleFeatureUse 第 2 步 / turnCommitApply feature-use 分支）按 poolInfo/op 声明走 featureUses 漏斗。

## 注意事项或使用方式

- 新通道类型先在 featureCapabilities 的 FeatureChannel 扩枚举，再在此加分支；attack_rider 的实际结算在 src/data/attackRiders.ts。
