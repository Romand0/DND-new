# Requirements Document — 圆桌·通用检定

Feature Name: round-table-checks
Updated: 2026-11-06

## Introduction

「圆桌」是 DM 与玩家之间放置剧情材料并开展即时互动的空间（比喻现实跑团桌），用于承载非战斗场景的规则交互。本阶段仅实现第一个功能「通用检定」：DM 定向给玩家角色抛送属性/技能/豁免检定任务，玩家投骰或填数，d20 结果经特性引擎加工得到应用值，判定结果反向回传 DM。

传输层采用「D1 消息信箱 + 条件轮询」：消息不可变、游标增量拉取、状态机流转；type 字段开放，为圆桌后续功能（任务卡、材料分发、剧情提示）预留同一通道。

## Glossary

- **圆桌（Round Table）**：DM 与玩家之间放置剧情材料并开展即时互动的空间；本阶段仅承载通用检定消息
- **检定任务（check_request）**：DM 定向抛送给某角色卡的检定请求消息
- **检定结果（check_result）**：玩家提交的含应用值与判定明细的回执消息
- **应用值（Applied Value）**：d20 结果经特性引擎（优劣势/检定奖惩/被动特性加值）加工后的最终检定值
- **信箱（Inbox）**：账号侧的消息收取视图（玩家信箱收任务，DM 信箱收结果）
- **隐藏 DC**：DM 可选的判定模式——玩家端展示判定结论但隐藏 DC 数值
- **DM 代掷**：DM 代替未绑定玩家账号的角色卡（NPC / 暂离玩家）在 DM 端完成检定

## Requirements

### R1 检定任务发起（DM）

**User Story:** AS DM, I want 定向给某角色卡抛送属性/技能/豁免检定并设定 DC 与可选说明, so that 非战斗场景的规则判定有统一入口。

#### Acceptance Criteria

1. WHEN DM 提交检定任务（角色卡、检定类型、检定项、DC、可选说明），系统 SHALL 写入一条 `check_request` 消息（status=pending）并提示已送达。
2. WHEN DM 在检定表单选择检定类型，系统 SHALL 提供属性检定（6 能力）、技能检定（18 技能）、豁免检定（6 能力）三类选项。
3. WHEN DM 撤回一条 pending 状态的检定任务，系统 SHALL 将该消息 status 置为 cancelled。
4. IF 目标角色卡未绑定任何玩家账号，系统 SHALL 将该角色卡排除在可发起列表之外并提示先在账号管理中完成绑定。

### R2 检定任务接收（玩家）

**User Story:** AS 玩家, I want 及时看到 DM 抛给我的检定任务, so that 我能对剧情中的检定做出响应。

#### Acceptance Criteria

1. WHILE 玩家已登录且存在绑定角色，系统 SHALL 按退避策略轮询信箱（页面聚焦 3 秒、页面隐藏 15 秒、连续空轮询逐步退避至 10 秒）。
2. WHEN 玩家账号绑定的角色卡收到新 pending 检定任务，系统 SHALL 在玩家端顶栏显示未读角标。
3. WHEN 玩家打开检定任务弹窗，系统 SHALL 展示检定描述、检定类型与检定项、加值明细、DC 展示模式及 d20 输入区。

### R3 投骰与引擎加工（玩家）

**User Story:** AS 玩家, I want 投骰或填入 d20 数值并看到经过我的角色特性加工后的应用值, so that 检定结果反映我的角色能力。

#### Acceptance Criteria

1. WHEN 玩家提交 d20 结果，系统 SHALL 经特性引擎加工得出应用值（优劣势模式、检定奖惩、被动特性加值）并展示加工明细。
2. WHEN 玩家选择一键掷骰，系统 SHALL 用骰子服务生成 d20 值并走与手填相同的加工管线。
3. IF d20 输入超出 1-20 范围，系统 SHALL 阻止提交并提示有效范围。

### R4 判定与回传（玩家 → DM）

**User Story:** AS 玩家, I want 提交后自动判定并回传 DM, so that DM 无需手工登记我的检定结果。

#### Acceptance Criteria

1. WHEN 应用值生成，系统 SHALL 按「应用值 >= DC 为成功」判定，并将检定结果作为 check_result 回填对应 check_request（status=answered）。
2. WHILE DM 选择「隐藏 DC」，系统 SHALL 向玩家展示判定结论（成功/失败）并隐藏 DC 数值。
3. WHILE DM 选择「仅回传数值」，系统 SHALL 只回传 d20 与应用值，判定由 DM 端自行完成。
4. WHEN 检定结果提交成功，系统 SHALL 在玩家端显示提交完成状态并允许查看本次加工明细。

### R5 结果查看（DM）

**User Story:** AS DM, I want 在 DM 端看到检定结果的完整明细, so that 我能据此推进剧情。

#### Acceptance Criteria

1. WHEN check_result 到达，系统 SHALL 在 DM 端圆桌页显示结果卡片（角色、检定项、d20、加值明细、应用值、判定结论）并提示。
2. WHILE 检定任务处于 pending，系统 SHALL 在 DM 端显示等待答复状态。
3. WHILE 检定任务处于 cancelled，系统 SHALL 在 DM 端标记已撤回且玩家端停止展示该任务。

### R6 消息通道通用性（信箱模型）

**User Story:** AS 开发者, I want 检定消息走通用信箱模型, so that 圆桌后续功能可复用同一传输层。

#### Acceptance Criteria

1. 系统 SHALL 以 type 字段区分消息种类，首批类型为 check_request 与 check_result。
2. 系统 SHALL 支持按消息 id 游标增量拉取，保证断线重连后不丢消息且不重复计数。
3. 系统 SHALL 按 message id 生成判定幂等性：同一 check_request 至多接受一次答复，重复提交被拒绝。

## Out of Scope（本阶段明确不做）

- 圆桌其他消息类型（任务卡、材料分发、剧情提示、即时聊天）
- 对抗检定（双方对掷比较）
- DM 代掷（检定任务仅限已绑定玩家账号的角色卡）
- 消息历史长期归档与检索
- Durable Objects / WebSocket 实时推送（信箱语义已预留传输层替换空间）
