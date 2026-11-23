# Requirements Document — 视野系统（vision-system）

Updated: 2026-11-23
Status: requirements v1（三体系分期 + 决策点机制）

## Introduction

为战斗沙盘引入 D&D 5e 视野三体系：掩护（cover）、光线（lighting）、躲藏与隐身（hiding/invisibility）。三者规则上交织（躲藏依赖掩护与光线、黑暗等效于不可见），统一由「混合判定」模式支撑：几何计算提供辅助证据，最终等级由 DM 裁定。附带一个通用机制：回合中途决策点（interim decision point），供玩家在回合流程中段提出需要 DM 裁定的动作（首个使用方为躲藏），DM 即时批准后流程回归正常推进。

## Glossary

- **光照档位 (light tier)**：格子所处光线环境的档位，取值 `bright`（明亮）/ `dim`（微光）/ `darkness`（黑暗）。
- **环境光照 (ambient light)**：沙盘级默认档位，无光照区域覆盖时生效。
- **光照区域 (light zone)**：DM 用画笔标注的矩形/单元格区域，携带档位与半径语义，覆盖环境光照。
- **视觉感官 (sense)**：生物感知环境的特殊视觉能力，结构化取值含尺数：`darkvision`（黑暗视觉）/ `blindsight`（盲视）/ `truesight`（真实视觉）/ `tremorsense`（震颤感知）。
- **有效档位 (effective tier)**：感官对光照档位的降级结果（黑暗视觉足够长时将 `darkness` 降为 `dim`）。
- **视线遮挡 (LOS blocked)**：攻击者与目标格之间被墙体（paintedCells）阻断。
- **掩护等级 (cover tier)**：`half`（半身，AC/Dex 豁免 +2）/ `three_quarters`（四分之三，+5）/ `total`（全身，无法直接瞄准）。
- **未见 (unseen)**：观察者对某目标的可见性为假的状态来源含三支：光照不足、隐身状态、成功躲藏。
- **躲藏 (hidden)**：参战者通过隐匿检定对抗观察者被动察觉后获得的持续性未见状态。
- **隐身 (invisible)**：参战者因法术或特性获得的不受察觉对抗约束的未见状态。
- **回合中途决策点 (interim decision point)**：玩家回合 op 流中段的暂停节点，玩家在此提交需 DM 裁定的动作，DM 处理后结果回填，流程继续。
- **回合末审批 (end-turn review)**：现有机制，玩家回合结束时 op 流水批量交 DM 审批落账。

## Requirements

### R1 掩护标注与命中修正

**User Story:** AS DM，我想要为参战者标注掩护等级并让攻击弹窗自动应用 AC/豁免修正，以便掩护规则无需记忆即可结算。

#### Acceptance Criteria

1. WHEN DM 在参战者面板设置掩护等级，系统 SHALL 在参战者上记录该等级并渲染掩护徽标。
2. WHEN 攻击弹窗打开且目标存在掩护等级，系统 SHALL 预填该等级并允许 DM 单次攻击内修改或清除。
3. WHEN 攻击者对掩护目标掷命中检定，系统 SHALL 按等级给目标 AC 施加 +2（half）/ +5（three_quarters）修正。
4. WHEN 目标承受 Dex 豁免类效果（含法术伤害），系统 SHALL 按掩护等级给豁免结果叠加 +2/+5 修正。
5. WHEN 目标为 total 掩护，系统 SHALL 阻止直接瞄准该目标的攻击并在弹窗提示改用其他结算方式。
6. WHEN 沙盘上攻击者与目标之间存在墙体遮挡（paintedCells 判定），系统 SHALL 在弹窗几何提示区展示「存在遮挡」并建议 DM 考虑掩护等级。
7. IF DM 清除单次标注，THEN 系统 SHALL 按参战者原始掩护等级之外的结果结算该次攻击。

### R2 光照体系

**User Story:** AS DM，我想要在沙盘上铺设光照区域并让黑暗视觉等感官自动降档，以便光线规则作用于察觉与攻击判定。

#### Acceptance Criteria

1. WHEN DM 设置环境光照档位，系统 SHALL 将该档位作为全图默认并在沙盘渲染环境标识。
2. WHEN DM 画笔画光照区域（bright/dim/darkness），系统 SHALL 在沙盘渲染该区域且区域内格子档位覆盖环境档位。
3. WHEN 计算某参战者所处格子的有效档位，系统 SHALL 先取区域覆盖档位、无覆盖时取环境档位，再按视觉感官尺数与距离降档（darkvision/blindsight/truesight 在尺数范围内将 darkness 降为 dim；truesight 将 dim 降为 bright）。
4. WHILE 参战者有效档位为 dim，系统 SHALL 对该参战者的依赖视觉的察觉类检定施加劣势。
5. WHEN 攻击者与目标任一方有效档位为 darkness（且无震颤感知/盲视等替代感官），系统 SHALL 在攻击检定中对攻击方施加劣势、对防守方施加优势。
6. IF DM 对单次攻击手动覆盖光照判定，THEN 系统 SHALL 以 DM 标注为准生成优劣势明细。

### R3 视觉感官结构化

**User Story:** AS DM，我想要 NPC 感官文本自动解析为结构化字段并与玩家角色黑暗视觉统一消费，以便两类参战者走同一判定管线。

#### Acceptance Criteria

1. WHEN NPC 模板进入战斗，系统 SHALL 从 senses 文本解析 darkvision/blindsight/truesight/tremorsense 的尺数写入参战者感官字段。
2. WHEN senses 文本解析结果为空，系统 SHALL 保留该参战者感官字段为空并在 DM 面板提供手动录入入口。
3. WHEN 玩家角色拥有黑暗视觉特性，系统 SHALL 沿用现有派生链写入同一感官字段（与 NPC 字段同构）。

### R4 躲藏与隐身

**User Story:** AS DM，我想要战斗内躲藏动作形成隐匿对抗检定与 hidden 状态闭环，以便玩家躲藏后攻击/被攻击的优劣势自动生效。

#### Acceptance Criteria

1. WHEN 参战者执行躲藏动作，系统 SHALL 消耗 1 动作并触发隐匿检定对每个观察者被动察觉的对抗结算。
2. WHEN 隐匿检定结果大于等于观察者被动察觉，系统 SHALL 给该参战者挂 hidden 状态；结果小于时 SHALL 提示躲藏失败。
3. WHILE 参战者处于 hidden 或 invisible 状态，对未持有该参战者视觉（普通视觉且无替代感官）的攻击者，系统 SHALL 对攻击方施加劣势、对 hidden/invisible 一方施加优势。
4. WHEN 攻击者持有 blindsight 或 truesight 且距离在尺数内，系统 SHALL 对 hidden 目标恢复普通可见性判定；对 invisible 目标仅 truesight 生效。
5. WHEN hidden 状态的参战者发起攻击，系统 SHALL 在该次攻击结算后移除 hidden 状态。
6. WHEN 参战者处于 total 掩护或光照 darkness 有效档位，系统 SHALL 在躲藏动作提示中标注满足躲藏前提。

### R5 回合中途决策点

**User Story:** AS 玩家，我想要在回合中段提交需要 DM 裁定的动作并获得即时结果回填，以便基于结果继续本回合的后续操作。

#### Acceptance Criteria

1. WHEN 玩家在回合内提交决策点请求（首个使用方为躲藏检定），系统 SHALL 将该请求即时送达 DM 端并暂停该玩家 op 流的后续落账。
2. WHEN DM 批准决策点并回填结果，系统 SHALL 将结果落账到战斗记录并通知玩家端恢复操作。
3. WHEN DM 驳回决策点，系统 SHALL 通知玩家端该请求作废且不影响回合已提交的其他 op。
4. WHEN 决策点处于待审批期间，系统 SHALL 在 DM 与玩家两端展示等待标记。
5. IF 玩家回合结束提交时仍存在待审批决策点，THEN 系统 SHALL 在回合末审批队列中保留该决策点供 DM 一并处理。

### R6 掩护/光照对豁免与伤害链的贯通

**User Story:** AS DM，我想要法术豁免弹窗与攻击弹窗共享同一套视野判定，以便优劣势与掩护修正全链一致。

#### Acceptance Criteria

1. WHEN 法术豁免弹窗打开，系统 SHALL 传递攻防双方位置并应用掩护 Dex 豁免修正与光照优劣势判定。
2. WHEN 玩家端圆桌发起依赖视野的检定（隐匿等），系统 SHALL 复用统一检定管线的加值明细。

## Non-Functional Requirements

- **分期交付**：P1 掩护 → P2 光线 + 感官结构化 → P3 躲藏隐身 + 决策点机制。每期独立可验收、独立合入 main。
- **引擎零暗骰**：视野判定只产生优劣势/修正明细，骰值由玩家线下掷骰或 DM 录入。
- **DM 终裁**：所有几何判定结果均以提示形态呈现，DM 可单次覆盖。
- **旧数据兼容**：新增字段全部带 load 兜底，旧战斗记录/旧沙盘数据打开不报错。
