# 需求文档：active-skills-engine（主动技能引擎）

> 特性作用方式四分类中的「主动技能」（`FeatureRole = 'active'`）在战斗场景的自动化结算引擎。
> 方针：高效、经济、可复用——复用已验证的漏斗/奖惩/状态/反应引擎，仅新增一个资源漏斗与一个能力路由器。
> 范围确认（2026-11-15）：A+B+C+D 类自动化；休息恢复纳入；玩家端自助触发纳入。E（超魔）、F（裁定型）维持现状。

## 1. 术语表

- **主动技能**：角色卡「特性与特质」中 `role = 'active'` 的特性条目，需主动运用（消耗资源/动作）产生效果。
- **池（Pool）**：主动技能的资源量（气、卓越骰、激励骰、引导神力次数等），由公式按等级/属性计算，战斗中消耗、休息恢复。
- **种子选项**：`public/seed/玩家手册2014/角色选项/*.json` 中的 `OptionTrait` 条目。
- **资源漏斗（featureUses）**：战斗记录顶层的 delta 记账表，战斗内消耗不写角色卡，结算时统一并入。
- **能力通道（effectChannel）**：主动技能触发后路由到的结算引擎类型。
- **卡片满池**：角色卡 `featurePools` 记录的已用量；战斗内可用 = 公式满池 - 卡片已用 - 漏斗 delta。

## 2. 用户故事

### US1 — DM 在战斗中触发 PC 主动技能
**AS** DM，**I WANT** 在参战者信息面板的主动技能区点击技能按钮完成消耗与结算，**SO THAT** 高频职业能力（气/卓越骰/引导神力等）无需手工记账。

#### 验收标准
1. WHEN DM 点击带池的主动技能按钮，系统 SHALL 检查该参战者池余量并扣减 1 点（写 featureUses delta）。
2. IF 池余量为 0 或参战者处于死亡/昏迷/失能状态，系统 SHALL 禁用对应按钮。
3. WHEN 技能声明动作成本（动作/附赠动作），系统 SHALL 同步扣减对应动作余量（复用 consumeAction 家族）。
4. WHEN 技能效果通道为 checkModifier，系统 SHALL 生成 pendingCheckModifier（复用激励骰既有链路）。
5. WHEN 技能效果通道为 status 或 advantage，系统 SHALL 经 statusManager / pendingAdvantageSources 挂载效果并按声明持续时间建立回合待办。
6. WHEN 技能效果通道为 reaction，系统 SHALL 仅登记反应声明（复用 reactionDefinitions `feature:<名>` 键），由既有反应弹窗流程结算。
7. IF 技能无自动化通道（F 类），系统 SHALL 展示特性描述并提示 DM 手动结算（维持现状文案）。

### US2 — 放映回溯一致性
**AS** DM，**I WANT** 战斗回溯后池余量回到所选时间点，**SO THAT** 回滚重演时资源账目与画面一致。

#### 验收标准
1. WHEN startPlayback 回溯到历史回合，系统 SHALL 将 featureUses 恢复为该记录条目当时的快照值。
2. WHEN 回溯后再次消耗池，系统 SHALL 基于回溯后的 delta 重新记账。

### US3 — 战斗结算并入角色卡
**AS** DM，**I WANT** 战斗结束时把池消耗并入角色卡，**SO THAT** 职业资源跨战斗持久扣减。

#### 验收标准
1. WHEN 战斗结束进入结算弹窗，系统 SHALL 按参战者列出本场池消耗明细（复用法术位并入的勾选式交互）。
2. WHEN DM 确认并入，系统 SHALL 将 delta 累加到角色卡 featurePools.used（clamp 到满池公式值）。
3. WHEN DM 跳过并入，系统 SHALL 保持角色卡 featurePools 不变。

### US4 — 休息恢复
**AS** 玩家/DM，**I WANT** 短休/长休后池量恢复，**SO THAT** 资源生命周期闭环。

#### 验收标准
1. WHEN 在角色详情页执行长休重置，系统 SHALL 将全部池 used 重置为 0（短休类池长休同样恢复）。
2. WHEN 执行短休恢复，系统 SHALL 仅重置 restKind = 'short' 的池。
3. IF 池 used 已为 0，系统 SHALL 将恢复入口置灰。

### US5 — 玩家端自助触发
**AS** PC 玩家，**I WANT** 在玩家端看到自己参战者的主动技能与池余量并发起使用，**SO THAT** 轮到自己时可以主动运用职业能力。

#### 验收标准
1. WHEN 战斗投影构建 activeFeatures，系统 SHALL 携带池余量与可用标记（realtime.ts 投影扩展）。
2. WHEN 玩家点击主动技能，系统 SHALL 经圆桌信箱发送使用请求（request 类别扩展 feature_use），DM 端确认后按 US1 链路结算。
3. WHEN 请求尚未被 DM 处理，系统 SHALL 在玩家端标记该技能为待确认状态。

### US6 — 种子数据标注
**AS** 维护者，**I WANT** 种子条目携带结构化的激活方式/资源模型标注，**SO THAT** 读端零关键词猜测、新条目可按数据接入。

#### 验收标准
1. WHEN 标注脚本运行，系统 SHALL 为全部 A~D 类条目写入 `activation`（action/bonus/reaction/free）与 `resource`（pool/toggle/manual）及池公式（fixed/classLevel/abilityMod/levelTiers + restKind）。
2. WHEN 标注脚本运行，系统 SHALL 为 D 类条目写入 `reaction` 声明（与 FeatureReaction 同口径）。
3. IF 存在未命中映射的条目，脚本 SHALL 报错退出（延续 annotate-option-roles.mjs 的 100% 覆盖约束）。

## 3. 范围外（本期不做）

- E 类超魔法（挂施法流，待 spell-flow 通道扩展）。
- F 类的自动伤害/攻击挂接结算（吐息武器 AoE、震慑拳 attack rider），P1 先扣池 + 手动结算提示，自动结算列入后续迭代。
- NPC 主动技能（NPC 无角色卡 features）。
- 战斗外使用主动技能（激励骰社交场景等）。

## 4. 正确性不变量

- 战斗内消耗只写 featureUses delta，任何代码路径直接改角色卡 featurePools 均为缺陷。
- 池余量 clamp 下界 0：delta 合计超出满池时扣减请求被拒绝（按钮已禁用，double-check 在扣减 API 内兜底）。
- featureKey 与 reactionDefinitions 键同口径：`feature:<特性名>`。
- 放映回溯后 derived 余量必须等于该回合结束时的真实余量。
