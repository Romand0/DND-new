# src/components/Navbar.tsx

## 功能概述
该文件定义了 `Navbar` 组件，它是 DM Toolkit 项目中的导航栏组件。该组件负责显示网站的顶部导航菜单，并根据用户的角色（DM 或玩家）显示不同的导航项。它还包含一些剧情工具的入口，如游戏时钟、日历和线上骰子。

## 主要导出/接口
- **导出类型**: `Navbar`
- **函数**:
  - `useEffect`: 用于处理组件的生命周期事件，如订阅数据存储和监听点击事件。
  - `useState`: 用于管理组件的状态，如菜单展开状态、游戏时间和日历日期。
  - `useRef`: 用于创建一个引用，用于处理点击外部关闭下拉菜单的逻辑。
  - `useLocation` 和 `useNavigate`: 来自 `react-router-dom`，用于获取当前路由信息和导航到不同的路径。
  - `useTheme` 和 `useAuth`: 来自自定义上下文，用于获取主题和认证信息。
- **组件**:
  - `Link`: 来自 `react-router-dom`，用于创建可导航的链接。
  - `Swords`, `Users`, `Coins`, `Sparkles`, `Menu`, `X`, `Sun`, `Moon`, `Settings`, `Clock`, `Calendar`, `ChevronDown`, `BookOpen`, `Dices`, `UserCircle`: 来自 `lucide-react`，用于显示图标。
- **Store**:
  - `gameTimeStore`: 用于获取和更新游戏时间。
  - `calendarStore`: 用于获取和更新日历信息。
- **常量**:
  - `allNavItems`: 包含所有导航项的数组。
  - `playerNavItems`: 包含玩家专属导航项的数组。

## 核心实现说明
`Navbar` 组件的核心逻辑包括：
- 根据用户角色和当前路径动态显示不同的导航项。
- 使用 `useEffect` 来订阅 `gameTimeStore` 和 `calendarStore`，以便在数据更新时更新组件的状态。
- 使用 `useRef` 来处理点击外部关闭下拉菜单的逻辑。
- 使用 `useState` 来管理菜单展开状态、游戏时间和日历日期。
- 使用 `useTheme` 和 `useAuth` 来获取主题和认证信息。

该组件与项目其他模块的关系包括：
- 与 `react-router-dom` 集成，用于处理导航。
- 与自定义上下文 `ThemeContext` 和 `AuthContext` 集成，用于获取主题和认证信息。
- 与 `gameTimeStore` 和 `calendarStore` 集成，用于获取和更新游戏时间和日历信息。

该组件被 `App` 组件引用，并在应用程序的顶部显示。

## 注意事项或使用方式
- 该组件接受一个 `variant` 属性，用于指定用户角色（DM 或玩家）。
- 组件使用 `useEffect` 来处理订阅和事件监听，因此在使用时不需要额外的调用。
- 组件使用 `useTheme` 和 `useAuth` 来获取主题和认证信息，因此在使用时不需要额外的调用。
