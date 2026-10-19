# 需求文档：战斗施法步骤原子化（combat-cast-steps）

Updated: 2026-10-19

## Introduction

将 `CombatSpellModal` 的「单弹窗一次性施法」重构为**原子步骤状态机**：每次施法拆解为前置检查 → 目标确认 → 检定 → 效果结算 → 收尾五个原子步骤，步骤命名与三态语义对齐流程 DSL 的 `FlowNodeType`（types/flow.ts:11-20），为后续「流程引擎驱动战斗施法」（Phase 3）预埋契约。本期完全在战斗侧交付价值：DM 逐步审计、先攻表格记录更细、补齐战斗中缺失的成分/施法时间检查。

## Glossary

- **原子步骤（CastStep）**：施法过程中一个不可再分的判定单元，具有唯一类型、pass/fail/partial 三态结果。类型名与 `FlowNodeType` 战斗侧镜像对齐。
- **步骤状态机**：按序推进的步骤序列；当前步骤完成后方可进入下一步。
- **副作用延迟原则**：一切状态变更（HP、动作、先攻表格记录）延迟至收尾步骤一次性应用；在此之前用户关闭弹窗 = 无痕中止。
- **步骤日志（CastStepLog）**：每个步骤完成后产出的一条结构化记录（对齐 `FlowLogEntry` 形状：步骤类型、状态、消息、数据）。
- **自动裁剪**：按法术特性跳过不适用的步骤（如无检定法术跳过检定步骤）。
- **DM 强制施放**：前置检查失败时，DM 显式确认后越过该检查继续的权威覆盖行为。

## Requirements

### R1 步骤状态机

**User Story:** AS DM，我希望施法过程按原子步骤逐步推进，以便每一步都可审计、可理解、可回溯。

#### Acceptance Criteria

1. WHEN DM 在法术弹窗选定法术，系统 SHALL 依据法术特性生成步骤序列并定位到第一个步骤。
2. WHEN 当前步骤产生确定结果，系统 SHALL 展示下一步骤，同时保留已完成步骤的结果摘要。
3. WHILE 效果尚未在收尾步骤应用，IF 用户关闭弹窗，系统 SHALL 丢弃全部步骤状态且不变更任何参战者数据。
4. THE 系统 SHALL 在单弹窗内以顶部步骤进度条呈现进度（已完成/当前/待执行），一次聚焦一个步骤。

### R2 步骤类型与流程节点对齐

**User Story:** AS 系统设计者，我希望战斗侧步骤与 DSL 节点同名同语义，以便 Phase 3 流程引擎可直接替换步骤驱动方。

#### Acceptance Criteria

1. THE 步骤类型集合 SHALL 为 `cast_start`（前置检查）、`select_target`（目标确认）、`attack_roll`（法术攻击）、`saving_throw`（豁免检定）、`apply_effect`（效果结算）、`cast_end`（收尾）的战斗侧子集。
2. THE 步骤结果 SHALL 采用 success / failure / partial 三态，语义与 `NodeExecutionResult.status` 一致。
3. THE 步骤日志结构 SHALL 与 `FlowLogEntry` 字段形状兼容（nodeId/nodeType/status/message/data）。

### R3 前置检查（cast_start）

**User Story:** AS DM，我希望施法前自动检查成分与施法时间，以避免漏判失能状态下的非法施法。

#### Acceptance Criteria

1. WHEN 施法者需言语成分且 `canSpeak === false`，系统 SHALL 在前置检查步骤报告 failure。
2. WHEN 施法者需姿势成分且手势被阻断（复用 `somaticCheck` 判定），系统 SHALL 在前置检查步骤报告 failure 并列明阻断状态。
3. WHEN 施法时间含「1 动作」且施法者无可用动作，系统 SHALL 在前置检查步骤报告 failure；「1 附赠动作」同理校验 `canUseBonusAction`。
4. IF 前置检查存在 failure 项，系统 SHALL 阻断进入下一步，同时展示「强制施放」入口；WHEN DM 确认强制施放，系统 SHALL 标记该步骤为 partial 并继续后续步骤。
5. THE 前置检查 SHALL 展示逐项明细（成分/施法时间/射程），明细含通过与失败项。

### R4 目标确认（select_target）

**User Story:** AS DM，我希望施法前确认目标与射程，以避免超距施法。

#### Acceptance Criteria

1. WHEN 法术为攻击/豁免类且施法者与目标均在沙盘有位置，系统 SHALL 按切比雪夫距离（5 尺/格）计算并展示施法距离。
2. IF 施法距离超过法术射程，系统 SHALL 阻断进入下一步并展示「强制施放」入口（交互同 R3.4）。
3. WHEN 目标已在打开弹窗时由沙盘指定，系统 SHALL 预填目标且允许 DM 在本步骤更换目标（候选为参战者列表）。

### R5 检定（attack_roll / saving_throw）

**User Story:** AS DM，我希望检定步骤保持现有交互质量（手填 d20、优劣势、pending 消费），以避免重构造成体验回退。

#### Acceptance Criteria

1. THE 检定步骤 SHALL 保留现有 d20 手填/掷骰、优劣势切换（AdvDisadvToggle）、pending 优劣势消费行为，语义与现状一致。
2. WHEN 法术无检定（checkType === 'none'），系统 SHALL 自动裁剪检定步骤并在步骤序列中跳过。
3. THE 检定步骤 SHALL 展示检定明细：d20 序列、加值、总值、DC/AC 判定结果。

### R6 效果结算与收尾（apply_effect / cast_end）

**User Story:** AS DM，我希望效果数值在收尾前可预览，且收尾一次性应用全部变更。

#### Acceptance Criteria

1. THE 效果步骤 SHALL 保留现有骰子表达式解析与手动骰输入交互，展示效果预览（目标当前 HP → 预计 HP）。
2. WHEN DM 在收尾步骤确认，系统 SHALL 一次性应用：HP 变更（含击昏/死亡状态）、动作/附赠动作扣减、先攻表格记录。
3. THE 收尾步骤 SHALL 将「步骤日志序列」整体写入战斗记录，供战后审计与回放展示。
4. IF 治疗导致 HP 超过上限，系统 SHALL 将实际恢复量截断至上限并在日志中记录截断。

### R7 步骤日志持久化

**User Story:** AS DM，我希望每次施法的步骤轨迹随战斗记录保存，以便放映回放与战后复盘。

#### Acceptance Criteria

1. THE 系统 SHALL 在 `CombatRecord` 上新增步骤日志存储（施法维度聚合，每次施法一条日志组）。
2. WHEN 读取旧战斗记录（无日志字段），系统 SHALL 按空数组兜底，保证旧数据可打开。
3. THE 步骤日志 SHALL 不写入角色卡（战斗副本原则）。

### R8 兼容与回归

**User Story:** AS 用户，我希望重构后现有施法能力无损。

#### Acceptance Criteria

1. THE 重构 SHALL 保持 `onCastResolved` 回调契约字段不变（CombatSession 侧零改动或最小改动）。
2. THE 重构 SHALL 移除 `CombatSpellModal.tsx` 中未使用的 `flowCompiler` import。
3. THE 攻击检定弹窗（CombatAttackModal）SHALL 零改动。

## Out of Scope（本期不做）

- 法术位（spellSlots）扣减——已裁决暂缓，避免本期触碰角色卡数据链路
- 专注跟踪与专注检定（`concentration_check` 节点）——留 Phase 3 与 TurnTodo 一并设计
- 升环施法加值、抗性/易伤结算
- 流程引擎（flowCompiler）接入——本期只对齐契约
- FlowConsole 试运行
