# Requirements Document — 剧情全周期管理

Feature Name: story-management
Updated: 2026-11-27
Related: `docs/roadmap/v0.9.md`（V9-2）、`docs/roadmap/round-table-hub.md`（任务与信箱）

## Introduction

为一场团组提供剧情内容的全周期管理：DM 以「剧情线 → 章节 → 场景」三级结构编写与推进剧情，场景（一段剧情）承载时间、空间、团队、任务、奖励五个轴；玩家按揭晓范围看到对应内容；场景与战斗记录、宝藏、圆桌任务、游戏时间联动。

本版本只覆盖单 DM 编辑、玩家只读揭晓；多人协同编辑、AI 续写、历史数据迁移不在范围内。

## Glossary

- **团组**：Campaign，一场跑团战役的数据容器，成员含 DM 与玩家
- **剧情线**：StoryArc，一个完整故事弧，团组作用域
- **章节**：StoryChapter，剧情线的分段，含顺序号
- **场景**：StoryScene，「一段剧情」的最小单元，属于一个章节
- **目标**：StoryObjective，场景内的任务项，可派发到圆桌
- **线索**：StoryClue，可被揭晓的信息条目，可作为奖励的一部分
- **计划奖励**：PlannedReward，DM 预期的奖励内容
- **实际奖励**：ActualReward，结算后真实发放的奖励，关联宝藏与分配记录
- **揭晓对象**：RevealTarget，允许看到某条内容的团组用户集合
- **知识层级**：KnowledgeLevel，玩家对内容的理解程度，取值 `rumor`（传闻）、`witnessed`（亲历）、`detailed`（细节）
- **在场名单**：PresenceRoster，场景发生时在场的角色与 NPC
- **游戏内时间**：GameTime，团组日历上的日期与时刻
- **跑团场次**：SessionNo，现实中的第几次跑团
- **剧情顺序**：SceneOrder，场景在章节内的叙事序号

## Requirements

### Requirement 1 — 剧情三级结构

**User Story:** 作为 DM，我想要按剧情线、章节、场景组织内容，以便长篇剧情有稳定的骨架。

#### Acceptance Criteria

1. 系统 SHALL 以团组为作用域保存剧情线、章节、场景三级结构。
2. WHEN DM 创建场景，系统 SHALL 记录所属章节与章节内顺序号。
3. 系统 SHALL 保证同一章节内场景顺序号唯一。
4. IF DM 删除章节，系统 SHALL 级联删除该章节下属场景与线索。

### Requirement 2 — 场景时间信息

**User Story:** 作为 DM，我想要分别记录游戏内时间、跑团场次与剧情顺序，以便同一场景在不同时间口径下都能被定位。

#### Acceptance Criteria

1. 系统 SHALL 为场景分别保存游戏内时间、跑团场次、剧情顺序三个独立字段。
2. WHEN DM 填写游戏内时间，系统 SHALL 以团组日历日期与时刻保存该值。
3. 系统 SHALL 允许三个时间字段为空。
4. WHEN DM 将场景状态置为进行中，系统 SHALL 提供将游戏内时间填充为当前游戏时间的操作。

### Requirement 3 — 空间位置

**User Story:** 作为 DM，我想要记录场景发生的地点，以便剧情与地图、沙盘对应。

#### Acceptance Criteria

1. 系统 SHALL 为场景保存地点名称与区域层级。
2. 系统 SHALL 允许场景关联一个沙盘标识。
3. 系统 SHALL 允许地点信息为空。
4. WHEN 场景关联沙盘，系统 SHALL 提供从场景跳转到对应沙盘的入口。

### Requirement 4 — 团队与在场名单

**User Story:** 作为 DM，我想要区分团组长期成员与场景当场在场者，以便奖励归属与信息可见性各自正确。

#### Acceptance Criteria

1. 系统 SHALL 记录团组绑定角色集合作为长期团队。
2. 系统 SHALL 为场景保存在场角色集合与在场 NPC 集合。
3. WHEN DM 保存在场角色，系统 SHALL 校验每个角色属于当前团组。
4. 系统 SHALL 允许 DM 标记未在场的团组角色为缺席。

### Requirement 5 — 场景目标与任务联动

**User Story:** 作为 DM，我想要在场景内定义目标并派发到圆桌，以便玩家知道当前要做什么。

#### Acceptance Criteria

1. 系统 SHALL 为场景维护零到多个目标，每个目标包含类别、标题、指派对象、状态。
2. WHEN DM 派发目标，系统 SHALL 创建圆桌任务消息并保存消息标识。
3. WHEN 玩家提交目标完成，系统 SHALL 将目标状态置为待确认。
4. WHEN DM 确认完成，系统 SHALL 将目标状态置为已完成并记录确认时间。
5. WHEN DM 取消目标，系统 SHALL 将目标状态置为已取消并保留取消原因。

### Requirement 6 — 奖励双轨

**User Story:** 作为 DM，我想要分别记录计划奖励与实际发放，以便预期与结算互不覆盖。

#### Acceptance Criteria

1. 系统 SHALL 为场景分别保存计划奖励与实际奖励。
2. 计划奖励 SHALL 包含钱币、物品、经验与线索四类内容。
3. WHEN DM 结算实际奖励，系统 SHALL 保存关联的宝藏标识与分配记录。
4. 系统 SHALL 保持计划奖励在结算后内容不变。
5. 系统 SHALL 允许实际奖励为空。

### Requirement 7 — 线索与揭晓

**User Story:** 作为玩家，我想要只看到 DM 对我揭晓的内容，以便保持桌面信息边界。

#### Acceptance Criteria

1. 系统 SHALL 以独立条目保存线索，每条线索包含内容、关联场景与揭晓对象。
2. 系统 SHALL 为场景与线索分别保存知识层级。
3. WHEN 玩家请求剧情数据，系统 SHALL 仅返回揭晓对象包含该玩家或标记为公开的场景与线索。
4. WHEN DM 修改揭晓对象，系统 SHALL 在该玩家下次请求时返回更新后的内容。
5. 系统 SHALL 支持 DM 一次揭晓整个章节下属场景。

### Requirement 8 — 场景状态与因果

**User Story:** 作为 DM，我想要场景有状态与前置依赖，以便剧情推进有明确的先后。

#### Acceptance Criteria

1. 系统 SHALL 为场景维护 `planned`、`active`、`done`、`skipped` 四种状态。
2. 系统 SHALL 为场景保存零到多个前置场景引用。
3. WHEN DM 将场景置为进行中，系统 SHALL 校验全部前置场景处于已完成状态。
4. IF 前置场景未完成且 DM 要求跳过，系统 SHALL 要求填写跳过原因后允许状态变更。
5. WHEN 场景状态变为已完成，系统 SHALL 记录完成时间。

### Requirement 9 — 结果记录与战斗联动

**User Story:** 作为 DM，我想要记录场景实际发生了什么，并关联战斗记录，以便回顾时还原现场。

#### Acceptance Criteria

1. 系统 SHALL 为场景保存实际结果文本。
2. 系统 SHALL 允许场景关联一条战斗记录。
3. WHEN 场景关联战斗记录，系统 SHALL 提供从场景跳转到该战斗记录的入口。
4. WHEN 场景标记完成，系统 SHALL 保存结果文本与完成时间的组合。

### Requirement 10 — 权限与数据完整性

**User Story:** 作为团组管理员，我想要剧情数据只有 DM 可写、成员可读，以便内容不被越权修改或泄露。

#### Acceptance Criteria

1. 系统 SHALL 仅允许当前团组的 DM 写入剧情数据。
2. IF 非 DM 发起写请求，系统 SHALL 返回 403。
3. IF 请求者不属于该团组，系统 SHALL 返回 403。
4. 系统 SHALL 为剧情线、章节、场景记录创建者与更新时间。
5. 系统 SHALL 在读取时对缺失字段填充默认值。

### Requirement 11 — 持久化与离线可用

**User Story:** 作为 DM，我想要在网络中断时仍能查看最近一次剧情数据，以便现场不阻塞。

#### Acceptance Criteria

1. 系统 SHALL 将剧情数据持久化到团组制品存储。
2. WHEN 网络请求失败，系统 SHALL 展示本地缓存的最近一次成功数据。
3. WHEN 网络恢复，系统 SHALL 允许 DM 手动重试保存。
4. 系统 SHALL 在保存冲突时提示 DM 手动刷新后重试。

## Out of Scope

- 多人同时编辑同一剧情线
- AI 自动续写剧情
- 历史笔记与战斗数据迁移进剧情模型
- 玩家端写入剧情数据（留言与任务提交走圆桌消息）
