# src/App.tsx

## 功能概述
该文件 `App.tsx` 是 DM Toolkit 应用程序的主入口文件，负责设置应用的根路由、上下文提供者以及页面布局。它通过 React Router 配置了应用的导航结构，并管理了认证和主题上下文。

## 主要导出/接口
- `AuthProvider`：提供认证上下文，管理用户认证状态。
- `useAuth`：自定义钩子，用于访问认证上下文中的数据。
- `ProtectedRoute`：保护路由组件，确保只有认证用户才能访问。
- `ThemeProvider`：提供主题上下文，管理应用的主题设置。
- `Layout`：应用布局组件，为页面提供统一的布局结构。
- `PlayerLayout`：玩家端布局组件，提供精简的导航栏。
- `BrowserRouter`、`Routes`、`Route`、`Navigate`、`Outlet`：React Router 组件，用于配置路由和页面跳转。
- `Home`、`Login`、`Register`、`CharacterList`、`CharacterDetail`、`CharacterInventory`、`SpellList`、`SpellDetail`、`Settings`、`AdminAuth`、`AdminAccounts`、`MigrationBackup`、`Placeholder`、`InventoryPage`、`TradePage`、`EquipmentList`、`EquipmentDetail`、`PlayerHome`、`PlayerView`、`PlayerInventory`、`DataManagement`、`CombatList`、`CombatSession`、`BattlegroundEditor`、`GameClockPage`、`CalendarPage`、`NotesPage`、`DicePage`、`UserProfile`、`TreasureList`、`TreasureEdit`、`TreasureDistribute`：页面组件，实现应用的各个功能页面。

## 核心实现说明
`App` 组件是应用的根组件，它使用 `ThemeProvider` 和 `AuthProvider` 提供全局的主题和认证状态。通过 `BrowserRouter` 和 `Routes` 组件配置了应用的导航结构，包括公开路由、玩家端路由、DM 端路由等。`ProtectedRoute` 用于确保某些路由只能由认证用户访问。`RoleShell` 函数根据用户的角色决定显示玩家端布局还是 DM 端布局。`Outlet` 组件用于嵌套路由，例如 `Settings` 页面中的嵌套路由。

## 注意事项或使用方式
- 应用程序的所有页面和组件都应通过 `App` 组件的 `Routes` 配置进行访问。
- `ProtectedRoute` 用于保护需要认证的路由。
- `RoleShell` 函数用于根据用户角色决定布局。
- 使用 `useAuth` 钩子可以访问认证状态。
