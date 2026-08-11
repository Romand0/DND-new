# src/App.tsx

## 功能概述
该文件是DM Toolkit项目的入口文件，负责整个应用的路由配置和页面渲染。它通过React Router库管理应用的导航，根据用户的角色和权限展示不同的页面内容。

## 主要导出/接口
- `AuthProvider`: 用于全局的认证状态管理。
- `useAuth`: 用于在组件中访问认证状态。
- `ProtectedRoute`: 用于保护路由，确保只有认证用户可以访问。
- `ThemeProvider`: 用于全局的主题状态管理。
- `Layout`: 应用的基础布局组件。
- `PlayerLayout`: 玩家端的布局组件。
- `BrowserRouter`: React Router的浏览器路由组件。
- `Routes`, `Route`, `Navigate`, `Outlet`: React Router的路由相关组件。
- `Home`, `Login`, `Register`, `CharacterList`, `CharacterDetail`, `CharacterInventory`, `SpellList`, `SpellDetail`, `Settings`, `AdminAuth`, `AdminAccounts`, `MigrationBackup`, `Placeholder`, `InventoryPage`, `TradePage`, `EquipmentList`, `EquipmentDetail`, `PlayerHome`, `PlayerView`, `PlayerInventory`, `DataManagement`, `CombatList`, `CombatSession`, `BattlegroundEditor`, `GameClockPage`, `CalendarPage`, `NotesPage`, `DicePage`, `UserProfile`, `TreasureList`, `TreasureEdit`, `TreasureDistribute`: 应用中的页面组件。

## 核心实现说明
- `RoleShell` 函数根据用户的角色决定是否重定向到玩家主页或保持当前布局。
- 使用 `ProtectedRoute` 来保护需要认证的路由。
- 使用 `ThemeProvider` 和 `AuthProvider` 来管理全局的状态，如主题和认证信息。
- 通过 `BrowserRouter` 和 `Routes` 组件来配置路由和页面跳转。
- 与项目其他模块的关系：`App.tsx` 是项目的入口，它依赖于认证、主题、布局和页面组件。

## 注意事项或使用方式
- 使用 `App.tsx` 时，确保所有页面组件和路由配置都已正确导入。
- 在开发过程中，注意维护路由的清晰和组件的复用性。
- 使用 `ProtectedRoute` 时，确保正确设置 `requireDM` 属性以区分不同角色的访问权限。
