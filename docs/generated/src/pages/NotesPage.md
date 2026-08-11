# src/pages/NotesPage.tsx

## 功能概述
该文件定义了 NotesPage 组件，负责展示剧情笔记页面。该页面包含游戏时钟、哈普托斯历和线上骰子等剧情工具，用于记录剧情、NPC关系和世界设定，方便玩家随时查阅。

## 主要导出/接口
- `NotesPage`: React 组件，负责渲染剧情笔记页面。
  - `gameTime`: 状态，包含当前游戏时间的小时和分钟。
  - `calendarDate`: 状态，包含当前日期的字符串表示。
  - `timeStr`: 当前时间的字符串表示，格式为 "HH:mm"。
  - `timeOfDay`: 当前时间的时段，如 "Morning"、"Afternoon" 等。
  - `isAM`: 当前时间是否为上午。
  - `hourAngle`: 时针的角度，基于当前时间计算。

## 核心实现说明
- `useEffect` 钩子用于初始化页面状态，并订阅 `gameTimeStore` 和 `calendarStore` 的更新。
- `updateTime` 函数从 `gameTimeStore` 获取当前游戏时间，并更新 `gameTime` 状态。
- `updateCalendar` 函数从 `calendarStore` 获取当前日期信息，并更新 `calendarDate` 状态。
- `getTimeOfDay` 函数根据当前时间计算时段。
- 组件中包含两个链接组件，分别指向时钟和日历页面。

## 注意事项或使用方式
- 组件依赖于 `gameTimeStore` 和 `calendarStore`，确保这两个 Store 已正确初始化。
- 组件中的链接组件使用 `react-router-dom` 的 `Link` 组件，确保路由配置正确。
