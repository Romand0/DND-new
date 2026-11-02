# 需求文档 — 团组之外的世界（outside-campaign-world）

Updated: 2026-11-02
Status: 待审核

## Introduction

站点分为「前厅（团组之外）」与「团组内」两个世界。前厅向三类访客逐层开放内容：
未登录访客可浏览全出版物四库；已登录无团组用户另有主页（团组列表 / 创建 / 加入 / 账号）；
已登录在团组用户从主页团组快捷窗口进入团组内世界，并可随时「离开团组界面」回到主页（成员身份保留）。

## Glossary

- **前厅**：团组之外的站点区域，含公开资料库与登录后的主页。
- **出版物条目**：归属 `campaign_id IS NULL` 的四库条目（玩家手册 2014 / 怪物图鉴 2014 等种子），全局共享。
- **团组条目**：归属某团组的自定义条目，仅该团组成员可见。
- **主页**：登录后落地的真实首页（路由 `/`），承担团组列表卡片墙与各功能区入口。
- **团组主页**：进入团组后的首个视图；站点管理员为 DM 工作台（`/workbench`），玩家为玩家首页（`/player/home`）。
- **规则书集**：团组在团组设置中勾选的出版物集合，决定团组内四库视图的出版物可见范围。
- **四库**：装备库、法术库、怪物图鉴、角色选项。

## Requirements

### R1 未登录访客可浏览全出版物四库

**User Story:** AS 未登录访客, I want 浏览完整的出版物四库, so that 无需注册即可查阅规则资料并决定是否使用本站。

#### Acceptance Criteria

1. WHEN 未登录访客打开 `/equipment`、`/spells`、`/monsters`、`/options` 列表页, the system SHALL 展示全部出版物条目（含各列表的详情页）。
2. WHEN 未登录访客请求任一四库列表或详情, the system SHALL 返回出版物条目且返回内容中不包含任何团组条目。
3. WHEN 未登录访客查看任一资料库页面, the system SHALL 隐藏全部写操作入口（新增、编辑、删除、导入、云端同步）。
4. WHEN 未登录访客点击页面上的「登录」入口, the system SHALL 跳转至登录页。
5. IF 未登录访客访问团组内页面（角色卡、战斗记录、团组设置等）, the system SHALL 重定向至登录页。

### R2 出版物公开读端点

**User Story:** AS 站点, I want 四库读取端点在无凭据时放行出版物条目, so that 前端公开浏览无需伪造任何身份。

#### Acceptance Criteria

1. WHEN 四库 GET 列表请求未携带有效 JWT, the system SHALL 返回 `campaign_id IS NULL` 的全部条目。
2. WHEN 四库 GET 单条详情请求未携带有效 JWT 且条目为出版物条目, the system SHALL 返回该条目。
3. IF 四库 GET 单条详情请求未携带有效 JWT 且条目为团组条目, the system SHALL 返回 404。
4. WHEN 四库写端点（POST/PUT/DELETE）请求未携带有效 JWT, the system SHALL 返回 401。
5. WHEN 请求携带有效 JWT, the system SHALL 按现行团组作用域逻辑返回（规则书集过滤 + 团组条目），行为与现状一致。

### R3 真实主页

**User Story:** AS 已登录用户, I want 一个真实主页, so that 我在一个页面看到我的全部团组与站点入口。

#### Acceptance Criteria

1. WHEN 已登录用户打开 `/`, the system SHALL 展示主页（团组卡片墙 + 资料库入口 + 账号区 + 创建/加入团组入口）。
2. WHEN 已登录用户打开 `/`, the system SHALL 展示其加入的全部团组（名称、我的角色、规则书集摘要）。
3. WHEN 已登录用户点击任一团组卡片, the system SHALL 将当前团组切换为该团组并进入对应团组主页（站点管理员进入 `/workbench`，其余进入 `/player/home`）。
4. WHEN 已登录用户尚无任何团组, the system SHALL 在团组区展示空态并引导创建团组或凭邀请码加入。
5. WHEN 未登录访客打开 `/`, the system SHALL 重定向至登录页。

### R4 从团组界面离开

**User Story:** AS 在团组内的用户, I want 随时回到主页, so that 我可以挂起当前团组去查资料或管理账号而保留成员身份。

#### Acceptance Criteria

1. WHEN 用户在任一登录后界面, the system SHALL 提供回到主页的导航入口（导航栏）。
2. WHEN 用户点击回到主页, the system SHALL 保留其全部团组成员身份与当前团组记忆并展示主页。
3. WHEN 用户回到主页后再次点击原团组卡片, the system SHALL 恢复到该团组视图。

### R5 当前团组记忆保留

**User Story:** AS 回到主页的用户, I want 站点记住我上次使用的团组, so that 下次进入站点时直接回到上次的工作现场。

#### Acceptance Criteria

1. WHEN 用户进入某团组后离开登录会话再重新登录, the system SHALL 将当前团组恢复为该用户上次使用的团组。
2. IF 用户上次使用的团组已将其移出, the system SHALL 将当前团组回退为其仍在的团组列表中的首个团组，主页卡片墙如实反映现有成员关系。

### R6 无团组用户的写边界

**User Story:** AS 尚未加入团组的登录用户, I want 明确的引导, so that 我知道自定义条目需要先有团组归属。

#### Acceptance Criteria

1. WHEN 无团组登录用户打开四库页面, the system SHALL 展示全部出版物条目。
2. WHEN 无团组登录用户尝试新增自定义条目, the system SHALL 禁用新增入口并提示「加入或创建团组后再添加自定义条目」。
3. WHEN 无团组登录用户访问主页, the system SHALL 展示创建/加入团组入口与出版物资料库入口。

### R7 DM 工作台迁移与守卫调整

**User Story:** AS 站点管理员, I want 原 DM 工作台保留完整功能, so that 主页改造后管理路径全部可用。

#### Acceptance Criteria

1. WHEN 站点管理员从主页点击其 DM 团组卡片, the system SHALL 进入 `/workbench`（原 DM 工作台内容）。
2. WHEN 非站点管理员访问 `/workbench` 或其余 DM 专属路由, the system SHALL 重定向至 `/player/home`。
3. WHEN DM 专属路由（角色卡、物资、设置、日历、时钟、骰子、笔记、账号等）被访问, the system SHALL 保持现行绝对路径与权限要求（登录 + 站点管理员）。
4. WHEN 玩家端路由（`/player/*`）被访问, the system SHALL 保持现行结构与权限要求。

### R8 创建与加入团组入口归位

**User Story:** AS 已登录用户, I want 在主页创建团组或凭邀请码加入, so that 我从主页即可开始团组之旅。

#### Acceptance Criteria

1. WHEN 已登录用户在主页点击「创建团组」, the system SHALL 以其输入的名称创建团组并将其登记为该团组 DM。
2. WHEN 已登录用户在主页输入有效邀请码, the system SHALL 将其以玩家身份加入对应团组并刷新团组卡片墙。
3. IF 邀请码无效, the system SHALL 展示失败提示且不改变卡片墙。
