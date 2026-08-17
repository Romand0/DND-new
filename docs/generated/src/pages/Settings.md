# src/pages/Settings.tsx

## 功能概述

该文件 `Settings.tsx` 是一个 React 组件，负责渲染应用程序的设置页面。它承担着展示设置选项、管理用户认证状态以及导航到子页面的职责。该文件的存在是为了提供一个集中的位置来配置和管理应用程序的各种选项，确保用户能够根据需要调整应用程序的行为。

## 主要导出/接口

- `SettingsPage`: React 组件，负责渲染设置页面。
  - `hasToken`: 布尔值，表示是否存储了有效的 DM Token。
  - `isVerified`: 布尔值，表示 DM Token 是否已验证。
  - `isOnSubPage`: 布尔值，表示当前是否在设置页面的子页面。

## 核心实现说明

`SettingsPage` 组件使用 `react-router-dom` 库中的 `Outlet`、`useNavigate` 和 `useLocation` 钩子来处理路由和导航。它首先检查 `localStorage` 中是否存在有效的 DM Token，并根据 Token 的存在和验证状态来决定显示主页面还是子页面。

- **状态管理**：通过 `localStorage` 来存储和检查 DM Token 的存在和验证状态。
- **与项目其他模块的关系**：该组件依赖于 `lucide-react` 库中的图标组件，以及 `react-router-dom` 库的路由功能。
- **被谁引用**：该组件可能被应用程序的主路由组件引用，以展示设置页面。

## 注意事项或使用方式

- 该组件应在应用程序的路由配置中使用，通常作为 `/settings` 路径的组件。
- 用户访问 `/settings` 路径时，如果未配置 DM Token，将显示提示信息并引导用户前往管理员认证页面。
- 如果 DM Token 已配置且验证通过，将显示设置页面，包括不同的设置入口卡片。
- 设置入口卡片点击后将导航到相应的子页面，如 `/settings/admin`、`/settings/accounts` 等。
