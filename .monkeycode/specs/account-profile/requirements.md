# Requirements Document — 用户账号页与顶栏用户信息

## Introduction

在顶栏（导航栏）删除导入/导出按钮，改为展示当前登录用户信息（头像 + 用户名），点击进入用户账号页。账号页展示用户的头像、用户名、ID、权限（成员/管理员）、用户类型（玩家/DM），并提供编辑资料（头像/用户名）、修改密码、退出登录功能。

## Glossary

- **系统（System）**：DND 在线工具（前端 React SPA + Cloudflare Pages Functions + D1 数据库 + R2 对象存储）
- **用户账号页（User Profile Page）**：展示当前登录账号信息的页面
- **顶栏（Navbar）**：位于页面顶部的导航栏，DM 端与玩家端共用
- **用户权限（Permission）**：账号在网站内的管理等级，取值为 成员（member）或 管理员（admin）。管理员为 DM Token 持有者的登录账号，身份为派生属性，不持久化
- **用户类型（Type）**：账号访问的端类型，取值为 玩家（player）或 DM（dm），对应 `users.role`
- **头像（Avatar）**：账号头像图片，存储于 R2 对象存储，`users.avatar` 记录其 URL；未上传时显示默认头像
- **默认头像（Default Avatar）**：未上传头像时展示的系统默认图标

## Requirements

### Requirement 1: 顶栏删除导入/导出并展示用户信息

**User Story:** 作为用户，我想顶栏腾出位置展示我的头像和用户名，以便快速进入账号页。

#### Acceptance Criteria

1. WHEN 用户访问任意页面，系统 SHALL 在顶栏显示当前登录用户的头像与用户名
2. WHEN 用户点击顶栏用户信息，系统 SHALL 导航至用户账号页
3. WHEN DM 端顶栏渲染，系统 SHALL 不再展示导入与导出按钮

### Requirement 2: 账号页头部展示

**User Story:** 作为用户，我想在账号页顶部看到我的头像与用户名，以便确认账号身份。

#### Acceptance Criteria

1. WHEN 用户进入账号页，系统 SHALL 在页面最上方居中展示圆形头像框与用户名
2. WHEN 用户未上传头像，系统 SHALL 展示默认头像
3. WHEN 用户名下方展示 ID，系统 SHALL 以较浅的颜色渲染
4. WHEN 居中内容下方，系统 SHALL 依次展示用户权限（成员/管理员）与用户类型（玩家/DM）

### Requirement 3: 编辑资料

**User Story:** 作为用户，我想编辑我的头像和用户名，以便个性化我的账号。

#### Acceptance Criteria

1. WHEN 用户点击头像右上角的编辑按钮，系统 SHALL 弹出编辑弹窗，包含头像上传与用户名输入
2. WHEN 用户选择新头像图片，系统 SHALL 上传图片至 R2 并在成功后更新预览
3. WHEN 用户修改用户名并确认，系统 SHALL 校验用户名长度不少于 2 字符且不与已有账号重复，IF 校验通过系统 SHALL 更新账号并刷新页面展示
4. WHEN 用户名重复或格式非法，系统 SHALL 展示错误提示且不提交
5. WHEN 用户仅修改头像或仅修改用户名，系统 SHALL 提交对应的变更字段

### Requirement 4: 修改密码

**User Story:** 作为用户，我想修改我的登录密码，以便保障账号安全。

#### Acceptance Criteria

1. WHEN 用户进入修改密码区块，系统 SHALL 提供 原密码、新密码、确认新密码 三个输入框
2. WHEN 用户提交修改，系统 SHALL 校验 新密码与确认新密码一致且长度不少于 6 位，IF 不一致或过短系统 SHALL 展示错误提示
3. WHEN 用户提交修改，系统 SHALL 调后端验证原密码，IF 原密码错误系统 SHALL 返回错误提示
4. WHEN 修改成功，系统 SHALL 清除该账号会话记录并退出登录，引导用户使用新密码重新登录

### Requirement 5: 退出登录

**User Story:** 作为用户，我想退出当前账号，以便切换其他账号。

#### Acceptance Criteria

1. WHEN 用户点击页面底部的退出登录按钮，系统 SHALL 清除本地登录状态并导航至登录页
2. WHEN 用户退出登录，系统 SHALL 清除该账号的会话记录使「在线」状态失效
