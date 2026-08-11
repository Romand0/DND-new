# src/data/calendarStore.ts

## 功能概述
该文件负责管理游戏日历的状态，包括日期、是否与游戏时钟同步以及是否选中。它提供了加载、保存、设置日期、添加天数、设置同步状态等功能，并允许订阅日历状态的变化。

## 主要导出/接口
- `GameCalendar` 接口：
  - `dayOfYear`: 数字，表示日历中的天数（1-365/366）。
  - `linkedToClock`: 布尔值，表示日期是否与游戏时钟同步。
  - `selected`: 布尔值，表示是否选中该日期。
- `load()`: 函数，加载日历状态。
- `save(calendar: GameCalendar)`: 函数，保存日历状态。
- `initPrevTotalMinutes()`: 函数，初始化前一次总分钟数。
- `onTimeChange()`: 函数，监听游戏时钟变化并同步日期。
- `get()`: 函数，获取当前日历状态。
- `setDate(year: number, dayOfYear: number, selected = true)`: 函数，设置日期。
- `setSelected(selected: boolean)`: 函数，设置选中状态。
- `addDays(days: number)`: 函数，加减天数。
- `setLinked(linked: boolean)`: 函数，设置与时钟的同步状态。
- `getDateInfo()`: 函数，获取当前日期的月/日/节日信息。
- `subscribe(listener: Listener)`: 函数，订阅日历状态变化。

## 核心实现说明
该模块通过 `localStorage` 存储日历状态，并提供了一系列方法来操作和获取状态。它依赖于 `calendarData` 模块来获取日历数据，以及 `gameTimeStore` 模块来获取游戏时钟信息。

`load` 函数从本地存储中加载日历状态，如果不存在则使用当前现实世界的日期。`save` 函数将状态保存到本地存储，并通知所有订阅者状态已更改。

`onTimeChange` 函数监听游戏时钟的变化，并在日期跨天时更新日历状态。

`get` 函数返回当前日历状态，而 `setDate`、`setSelected`、`addDays`、`setLinked` 和 `getDateInfo` 函数允许用户修改和查询日历状态。

该模块被 `gameTimeStore` 模块引用，以实现日期与游戏时钟的同步。

## 注意事项或使用方式
- 在使用 `setDate`、`setSelected`、`addDays`、`setLinked` 等函数时，需要确保传入的日期和天数在有效范围内。
- 使用 `subscribe` 函数可以订阅日历状态的变化，以便在状态更新时执行相关操作。
