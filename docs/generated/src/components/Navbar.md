# src/components/Navbar.tsx

## 功能概述
该文件定义了 `Navbar` 组件，负责显示和管理网页顶部的导航栏。导航栏包含网站的主要链接和工具，如角色卡库、战斗记录、物资钱币等，同时提供用户信息和主题切换功能。该组件根据用户角色（DM或玩家）显示不同的导航项。

## 主要导出/接口
- **组件**：`Navbar`
  - `props`:
    - `variant?: 'dm' | 'player'`: 组件的变体，用于区分DM和玩家视图，默认为 `'dm'`。

## 核心实现说明
`Navbar` 组件使用 React 的 `useState`、`useEffect` 和 `useRef` 钩子来管理组件状态和副作用。它通过 `useLocation` 和 `useNavigate` 钩子与 React Router 集成，以便于导航和获取当前路由信息。

组件使用 `useTheme` 和 `useAuth` 钩子来访问主题上下文和认证上下文，从而实现主题切换和用户信息展示。

- **状态管理**:
  - `mobileMenuOpen`: 控制移动端菜单的展开和收起。
  - `toolsOpen`: 控制剧情工具下拉菜单的展开和收起。
  - `gameTime`: 存储游戏时间信息。
  - `calendarDate`: 存储游戏日历信息。

- **与项目其他模块的关系**:
  - `gameTimeStore` 和 `calendarStore`: 用于获取和更新游戏时间和日历信息。
  - `flowStore`: 用于获取和更新流程信息。
  - `ThemeContext` 和 `AuthContext`: 用于访问主题和用户认证信息。

- **被谁引用**:
  - 该组件可能被网站的其他页面或组件引用，以提供统一的导航栏。

## 注意事项或使用方式
- 该组件根据用户角色（DM或玩家）显示不同的导航项。
- 用户可以通过点击导航项进行页面跳转。
- 用户可以通过点击用户信息入口进入账号页面。
- 用户可以通过点击主题切换按钮来切换主题。
