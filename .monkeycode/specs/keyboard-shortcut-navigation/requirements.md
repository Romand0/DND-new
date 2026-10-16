# Requirements Document

## Introduction

本功能为 DND 5e DM Toolkit 添加全局快捷键导航系统，支持通过键盘快捷键快速跳转到关键页面，并在输入框激活时自动禁用快捷键，提升用户操作效率。

## Glossary

- **快捷键（Hotkey）**: 用户通过键盘输入特定字符组合触发系统功能的机制
- **输入框激活状态**: 当用户正在编辑文本、数字或其他可输入字段时的状态
- **全局快捷键**: 在应用任何页面都生效的快捷键机制
- **三击手势**: 移动端用户快速点击屏幕三次触发的导航功能

## Requirements

### Requirement 1: 全局快捷键系统

**User Story:** AS DM 用户，我想要通过键盘快捷键快速跳转到常用页面，以便在游戏过程中快速切换功能模块，提升操作效率。

#### Acceptance Criteria

1. WHEN 用户按下键盘快捷键组合，系统 SHALL 执行对应的页面跳转功能
2. WHILE 用户正在编辑输入框时，系统 SHALL 禁用所有快捷键功能，避免干扰用户输入
3. WHEN 用户按下快捷键时，系统 SHALL 显示相应的导航反馈（如控制台日志或临时提示）
4. IF 快捷键组合无效，系统 SHALL 忽略该输入，不执行任何操作

### Requirement 2: 战斗场景快捷键

**User Story:** AS DM 用户，我想要通过 CS 快捷键快速跳转至当前战斗场景，以便在游戏过程中快速切换到战斗追踪界面。

#### Acceptance Criteria

1. WHEN 用户按下 "C" + "S" 组合键，系统 SHALL 导航到当前战斗会话页面
2. IF 当前没有活跃的战斗会话，系统 SHALL 不执行跳转并显示提示信息
3. WHILE 输入框激活状态时，系统 SHALL 不响应 CS 快捷键
4. WHEN 用户按下 CS 快捷键时，系统 SHALL 复用现有的三击手势逻辑，跳转到 `/combat/:sessionId`

### Requirement 3: 角色列表快捷键

**User Story:** AS DM 用户，我想要通过 CL 快捷键快速跳转至角色列表页面，以便快速查看和管理所有角色。

#### Acceptance Criteria

1. WHEN 用户按下 "C" + "L" 组合键，系统 SHALL 导航到角色列表页面
2. WHILE 输入框激活状态时，系统 SHALL 不响应 CL 快捷键
3. WHEN 用户按下 CL 快捷键时，系统 SHALL 执行导航到 `/characters` 页面
4. IF 用户已在角色列表页面，系统 SHALL 不重复导航或刷新页面

### Requirement 4: 装备库快捷键

**User Story:** AS DM 用户，我想要通过 EL 快捷键快速跳转至装备库页面，以便快速查看和装备信息。

#### Acceptance Criteria

1. WHEN 用户按下 "E" + "L" 组合键，系统 SHALL 导航到装备库列表页面
2. WHILE 输入框激活状态时，系统 SHALL 不响应 EL 快捷键
3. WHEN 用户按下 EL 快捷键时，系统 SHALL 执行导航到 `/equipment` 页面
4. IF 用户已在装备库页面，系统 SHALL 不重复导航或刷新页面

### Requirement 5: 法术库快捷键

**User Story:** AS DM 用户，我想要通过 SL 快捷键快速跳转至法术库页面，以便快速查看和法术信息。

#### Acceptance Criteria

1. WHEN 用户按下 "S" + "L" 组合键，系统 SHALL 导航到法术库列表页面
2. WHILE 输入框激活状态时，系统 SHALL 不响应 SL 快捷键
3. WHEN 用户按下 SL 快捷键时，系统 SHALL 执行导航到 `/spells` 页面
4. IF 用户已在法术库页面，系统 SHALL 不重复导航或刷新页面

### Requirement 6: 输入框状态检测

**User Story:** AS DM 用户，我想要在编辑输入框时快捷键自动失效，避免误操作，确保输入体验的流畅性。

#### Acceptance Criteria

1. WHEN 用户点击或聚焦到任何输入框（文本输入、数字输入、文本域、选择框），系统 SHALL 检测到输入框激活状态
2. WHILE 输入框处于激活状态，系统 SHALL 禁用所有快捷键功能
3. WHEN 用户失去输入框焦点时，系统 SHALL 重新启用快捷键功能
4. WHEN 用户通过键盘快捷键切换页面时，系统 SHALL 自动检测新页面的输入框状态

### Requirement 8: 快捷键调试功能

**User Story:** AS 开发人员，我想要在开发环境中查看快捷键序列的实时状态，以便调试和测试快捷键功能。

#### Acceptance Criteria

1. WHEN 应用运行在开发环境时，系统 SHALL 在页面右下角显示当前快捷键序列
2. WHEN 快捷键序列匹配成功时，系统 SHALL 显示导航目标的路径信息
3. WHEN 快捷键序列超时重置时，系统 SHALL 清除显示的序列信息
4. WHEN 用户在生产环境中使用时，系统 SHALL 不显示调试信息

**User Story:** AS DM 用户，我想要快捷键系统与应用其他功能无冲突，确保用户体验的一致性。

#### Acceptance Criteria

1. WHEN 用户按下与浏览器快捷键冲突的组合键时，系统 SHALL 优先响应应用快捷键
2. WHEN 用户按下与文本编辑相关的快捷键时（如 Ctrl+C, Ctrl+V），系统 SHALL 优先响应浏览器默认行为
3. IF 快捷键组合与现有功能冲突，系统 SHALL 重新映射或禁用冲突的快捷键
4. WHEN 用户按下快捷键时，系统 SHALL 避免干扰正常的页面滚动和导航功能

### Requirement 8: 快捷键调试功能

**User Story:** AS 开发人员，我想要在开发环境中查看快捷键序列的实时状态，以便调试和测试快捷键功能。

#### Acceptance Criteria

1. WHEN 应用运行在开发环境时，系统 SHALL 在页面右下角显示当前快捷键序列
2. WHEN 快捷键序列匹配成功时，系统 SHALL 显示导航目标的路径信息
3. WHEN 快捷键序列超时重置时，系统 SHALL 清除显示的序列信息
4. WHEN 用户在生产环境中使用时，系统 SHALL 不显示调试信息