# Requirements Document — 账号一览页面

## Introduction

在设置页面中新增「账号一览」入口，为携带 DM Token 的网站管理员提供全部注册账号的管理视图。列表展示每个账号的名称、ID、权限（玩家/DM）、身份（成员/管理员）与登录状态，并支持修改权限/身份、删除账号、重置密码等管理操作。

## Glossary

- **系统（System）**：DND 在线工具（前端 React SPA + Cloudflare Pages Functions + D1 数据库）
- **网站管理员（Site Admin）**：持有有效 DM Token（环境变量 `DM_TOKEN`）并通过管理员认证的人；是页面唯一可访问主体
- **DM Token**：后端 `DM_TOKEN` 环境变量，通过 `Authorization: Bearer <dm_token>` 传递，用 `/api/auth/verify` 校验
- **账号（Account）**：`users` 表中的一条注册记录，字段包含 `id`、`username`、`password_hash`、`role`、`created_at`
- **权限（Permission）**：账号访问的端类型，取值为 玩家（player）或 DM（dm），对应 `users.role`
- **身份（Identity）**：账号在网站内的管理等级，取值为 成员（member）或 管理员（admin）。管理员为 DM Token 持有者的登录账号，其余账号均为成员。身份为派生属性，不持久化存储
- **登录状态（Login Status）**：账号的会话状态，取值为 在线（online）或 离线（offline），由账号是否存在未过期的会话记录（JWT）派生

## Requirements

### Requirement 1: 设置页入口

**User Story:** 作为网站管理员，我想从设置页面进入账号一览，以便在集中位置管理账号。

#### Acceptance Criteria

1. WHEN 用户访问设置页 `/settings`，且本地存在 DM Token，系统 SHALL 在导航入口列表中展示「账号一览」入口卡片
2. WHEN 用户点击「账号一览」入口，系统 SHALL 导航至 `/settings/accounts`
3. WHEN 用户访问 `/settings/accounts` 且本地不存在 DM Token，系统 SHALL 重定向至管理员认证页 `/settings/admin`

### Requirement 2: 管理员鉴权

**User Story:** 作为网站管理员，我想保证只有持有 DM Token 的人能查看和管理账号，以便保护账号数据隐私。

#### Acceptance Criteria

1. WHEN 后端收到账号列表或管理请求，系统 SHALL 校验请求头 `Authorization` 中的 DM Token 与 `DM_TOKEN` 环境变量一致，IF 不一致系统 SHALL 返回 401
2. WHEN 前端进入账号一览页面，系统 SHALL 通过已配置的 DM Token 发起请求；IF 后端返回 401，系统 SHALL 清除本地 DM Token 并引导重新认证

### Requirement 3: 账号列表展示

**User Story:** 作为网站管理员，我想查看所有账号的名称、ID、权限、身份与登录状态，以便了解注册用户构成。

#### Acceptance Criteria

1. WHEN 账号一览页面加载成功，系统 SHALL 展示账号列表，每行包含 名称、ID、权限（玩家/DM）、身份（成员/管理员）、登录状态 五个字段
2. WHEN 账号的 id 等于当前登录用户且 DM Token 验证通过，系统 SHALL 将该账号身份展示为「管理员」，其余账号展示为「成员」
3. WHEN 账号存在未过期的会话记录，系统 SHALL 将登录状态展示为「在线」；否则展示为「离线」
4. WHEN 列表为空，系统 SHALL 展示空态提示「暂无账号」
5. WHEN 请求失败或网络异常，系统 SHALL 展示错误提示并提供重试按钮

### Requirement 4: 权限修改

**User Story:** 作为网站管理员，我想修改账号的权限（玩家/DM），以便调整账号可访问的端。

#### Acceptance Criteria

1. WHEN 管理员点击某账号的权限修改按钮，系统 SHALL 展示权限选择弹窗，提供 玩家 与 DM 两个选项
2. WHEN 管理员确认修改，系统 SHALL 调后端更新该账号的 `role` 并刷新列表，IF 成功系统 SHALL 展示成功提示
3. WHEN 目标账号为管理员本人，系统 SHALL 禁止修改其权限

### Requirement 5: 删除账号

**User Story:** 作为网站管理员，我想删除无用账号，以便清理注册用户。

#### Acceptance Criteria

1. WHEN 管理员点击某账号的删除按钮，系统 SHALL 弹出二次确认对话框展示该账号名称
2. WHEN 管理员确认删除，系统 SHALL 调后端删除该账号并刷新列表，IF 成功系统 SHALL 展示成功提示
3. WHEN 目标账号为管理员本人，系统 SHALL 禁止删除

### Requirement 6: 重置密码

**User Story:** 作为网站管理员，我想为忘记密码的账号重置密码，以便账号可重新登录。

#### Acceptance Criteria

1. WHEN 管理员点击某账号的重置密码按钮，系统 SHALL 弹出输入框要求输入新密码，且输入长度不少于 6 位
2. WHEN 管理员确认重置，系统 SHALL 调后端更新该账号的密码哈希并刷新列表，IF 成功系统 SHALL 展示成功提示
