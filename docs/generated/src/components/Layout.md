# src/components/Layout.tsx

## 功能概述
该文件定义了应用的布局组件 `Layout`，它负责渲染应用的导航栏（`Navbar`）和主要内容区域。`Layout` 组件确保了应用的每个页面都包含相同的布局结构，包括顶部导航栏和同步按钮（如果需要的话）。该组件的存在是为了提供一致的用户界面和简化页面布局的代码复用。

## 主要导出/接口
- 类型：无
- 函数：无
- 组件：`Layout`
  - `Layout` 组件导出以下属性：
    - `HIDE_SYNC_BUTTON_PATHS`: 一个正则表达式数组，用于确定哪些路径下不应显示同步按钮。
- Store：无
- 常量：`HIDE_SYNC_BUTTON_PATHS`
  - `HIDE_SYNC_BUTTON_PATHS`: 正则表达式数组，用于匹配不应显示同步按钮的路径。

## 核心实现说明
`Layout` 组件使用 `react-router-dom` 的 `Outlet` 组件来渲染当前路由对应的子组件，同时使用 `Navbar` 和 `SyncButton` 组件来构建应用的顶部导航和同步功能。

- **关键逻辑**：组件首先通过 `useAuth` 钩子获取当前用户的认证信息，然后使用 `useLocation` 钩子获取当前路由信息。通过检查 `HIDE_SYNC_BUTTON_PATHS` 数组中的正则表达式是否匹配当前路径，决定是否渲染同步按钮。
- **状态管理**：通过 `AuthContext` 管理用户认证状态，包括用户信息和角色。
- **与项目其他模块的关系**：`Layout` 组件依赖于 `AuthContext`、`Navbar` 和 `SyncButton` 组件。
- **被谁引用**：该组件被应用的各个页面组件引用，作为它们的父组件。

## 注意事项或使用方式
- 调用 `Layout` 组件时，应确保所有子组件都已正确导入并使用。
- 使用 `Layout` 组件的前提是应用已正确配置了 `AuthContext` 和 `react-router-dom`。
- 在开发过程中，可以通过修改 `HIDE_SYNC_BUTTON_PATHS` 数组来控制同步按钮的显示。
