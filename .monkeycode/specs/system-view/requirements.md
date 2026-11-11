# Requirements Document — 体系视图（职业玩法体系分页）

## Introduction

为角色卡「特性与特质」区提供一个「体系」分页，把职业/子职业的玩法体系类内容（超魔法、魔能祈唤、引导神力、卓越战技等容器及其成员条目）按体系聚合呈现，让玩家一眼看到「我的职业有哪些玩法体系、体系内有什么、我已选了什么、还有什么可成长」。

## Glossary

- **容器条目**：介绍某玩法体系的种子条目（如「超魔法」「魔能祈唤」），text 为体系规则介绍，当前 role=profile
- **体系成员条目**：玩家在体系内做出的具体选择（如「引导神力：黎明曙光」「魔能祈唤：魔裔」），role 各异（active/passive/stat）
- **体系（System）**：容器条目 + 其成员条目构成的一个聚合视图单元
- **已选**：成员条目已存在于角色卡 features 中
- **未解锁**：成员条目的获得等级（level）高于角色当前等级
- **角色卡**：characterStore 中的 Character 对象，features 数组持有全部已入卡条目
- **选项库**：optionStore 种子（public/seed/玩家手册2014/角色选项/*.json），职业/子职业全量特性

## Requirements

### Requirement 1 — 体系分页入口

**User Story:** AS 玩家，I want 在特性与特质区看到「体系」分页，so that 我能以体系视角总览职业玩法而非逐条翻找。

#### Acceptance Criteria

1. THE CharacterDetail 特性与特质区 SHALL 在现有四类作用方式分页（主动技能/被动技能/人物设定/属性调整）之外提供「体系」分页入口。
2. THE PlayerView 特性区 SHALL 提供与 CharacterDetail 一致的体系分页。
3. WHEN 玩家点击「体系」分页，THE 系统 SHALL 以体系为单位分组展示该角色的体系内容。
4. IF 角色卡上无任何体系类条目，THE 系统 SHALL 在体系分页内显示空态提示文案。
5. THE 体系分页 SHALL 支持与现有特性搜索框联动（按体系名或成员条目名/描述过滤）。

### Requirement 2 — 体系聚合呈现

**User Story:** AS 玩家，I want 同一体系的容器介绍与成员条目聚合在一起，so that 我能理解体系的整体规则与我已做的选择。

#### Acceptance Criteria

1. THE 系统 SHALL 将体系成员条目聚合到其所属容器条目之下形成体系组。
2. THE 体系组 SHALL 展示容器条目的体系介绍文本（text）。
3. THE 体系组内的成员条目 SHALL 保留各自的作用方式标识（active/passive/stat 徽章）。
4. THE 系统 SHALL 按 PHB 2014 规则覆盖全部选择型体系（卓越战技、超魔法、魔能祈唤、引导神力、猎人战术、图腾精魄、誓言引导神力）。

### Requirement 3 — 体系全貌与成长视图

**User Story:** AS 玩家，I want 看到体系内全部可选项及我的选择进度，so that 我能规划体系内的成长与替换。

#### Acceptance Criteria

1. THE 体系组 SHALL 展示该体系在选项库中的全部成员条目（全貌），含角色卡上已入卡成员与库中未入卡成员。
2. THE 系统 SHALL 以视觉样式区分已选成员（已入角色卡）与未选成员。
3. THE 系统 SHALL 将获得等级高于角色当前等级的成员条目呈现为未解锁状态。
4. IF 已入卡成员在选项库中无对应条目（手录/自定义），THE 体系组 SHALL 仍展示该成员并标注来源。
5. THE 体系组 SHALL 标注成员条目的获得等级（level）。

### Requirement 4 — 体系内直接入卡

**User Story:** AS DM，I want 在体系视图里把未选成员一键加入角色卡，so that 玩家在体系内做出选择时免去去选项页翻找与手录。

#### Acceptance Criteria

1. WHEN DM 点击未选成员条目的入卡按钮，THE 系统 SHALL 以库条目内容构造特性条目写入角色卡 features。
2. THE 入卡条目 SHALL 携带种子的 role / level / system / systemKind 与来源分类，派生字段与现有选项页入卡路径一致。
3. IF 成员条目处于未解锁状态（level > 角色当前等级），THE 入卡按钮 SHALL 呈禁用态并提示解锁等级。
4. THE 入卡动作 SHALL 复用现有角色卡保存与云端同步路径。
5. THE 玩家端 PlayerView 的体系分页 SHALL 保持只读（无入卡按钮）。

## Data Decisions（已确认）

- 成员数据范围：选项库全貌 + 已选高亮，未达等级条目呈「未解锁」置灰可见状态
- 体系归属判定：种子条目新增显式 `system` / `systemKind` 字段，由标注脚本统一标注
- 入口范围：DM 端 CharacterDetail 与玩家端 PlayerView 两端同步
- 入卡操作：体系视图支持未选成员一键入卡（未解锁禁用，PlayerView 只读）
- 种子补录范围：PHB 2014 全量六大选择型体系约 76 条成员一次补齐
