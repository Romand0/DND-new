# src/pages/CalendarPage.tsx

## 功能概述
该文件 `CalendarPage.tsx` 是一个 React 组件，负责渲染和管理哈普托斯历的日历页面。它展示了一个交互式的日历，用户可以通过它查看和选择日期，以及查看和选择特定的节日。该组件还与 `calendarStore` 和 `gameTimeStore` 进行交互，以获取和更新日历和游戏时间信息。

## 主要导出/接口
```typescript
export default function CalendarPage() {
  // ...
}
```

- `CalendarPage`: React 组件，负责渲染日历页面。

## 核心实现说明
该组件的核心功能包括：

- 从 `calendarStore` 和 `gameTimeStore` 获取日历和游戏时间信息。
- 使用 `useState` 和 `useEffect` 钩子来管理组件的状态和副作用。
- 提供方法来更新日历视图、选择日期和节日。
- 渲染日历网格和节日卡片。
- 与 `gameTimeStore` 链接，显示当前游戏时间。

该组件与项目其他模块的关系包括：

- 与 `calendarStore` 和 `gameTimeStore` 交互，以获取和更新数据。
- 通过 `Link` 组件与路由系统交互，提供导航到其他页面的功能。

## 注意事项或使用方式
- 组件依赖于 `calendarStore` 和 `gameTimeStore` 的数据，确保这些 Store 已经正确初始化。
- 用户可以通过点击日历网格中的日期来选择日期，点击节日卡片来选择节日。
- 如果 `calendar.linkedToClock` 为 `true`，则显示当前游戏时间。
- 可以通过点击“重置为今天”按钮将日历重置为当前日期。
