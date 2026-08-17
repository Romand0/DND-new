# src/App.tsx

## 功能概述
该文件是DM Toolkit项目的入口文件，负责整个应用的路由配置和布局管理。它通过React Router库管理应用的页面跳转，根据用户的角色和权限展示不同的页面内容。

## 主要导出/接口
- `AuthProvider`: 用于全局状态管理，提供用户认证信息。
- `useAuth`: 钩子函数，用于获取当前用户的认证状态。
- `ProtectedRoute`: 组件，用于保护路由，确保只有认证用户才能访问。
- `ThemeProvider`: 组件，用于全局主题管理。
- `Layout`: 组件，应用的主布局组件。
- `PlayerLayout`: 组件，玩家端的主布局组件。
- `BrowserRouter`: React Router的包裹器，用于设置应用的路由。
- `Routes`, `Route`, `Navigate`, `Outlet`: React Router的路由组件。
- `TripleTapGesture`: 组件，用于处理三指点击手势。

## 核心实现说明
- `RoleShell` 函数根据用户的角色返回不同的布局，玩家角色返回`PlayerLayout`，其他角色返回`Layout`。
- 应用通过`AuthProvider`和`useAuth`管理用户认证状态，并通过`ProtectedRoute`保护需要认证的路由。
- 应用使用`ThemeProvider`管理全局主题，确保主题的一致性。
- 应用使用`BrowserRouter`和`Routes`组件配置路由，通过`Route`组件定义具体的路由规则。
- 应用中的多个页面组件被导入并用于渲染对应的页面内容。

## 注意事项或使用方式
- 使用该文件时，需要确保已经正确配置了`AuthProvider`和`ThemeProvider`。
- 应用中的路由配置需要根据实际需求进行调整。
- 使用`ProtectedRoute`时，需要指定`requireDM`属性来确保只有DM角色可以访问。
