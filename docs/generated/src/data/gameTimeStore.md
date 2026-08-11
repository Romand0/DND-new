# src/data/gameTimeStore.ts

## 功能概述
该文件负责存储和管理游戏内的时间信息，包括小时、分钟和最后更新时间。它提供了加载、保存、获取当前时间、设置时间和订阅时间变更通知的功能。该文件的存在是为了确保游戏时间的一致性和可追踪性。

## 主要导出/接口
- `STORAGE_KEY`: 常量，用于存储游戏时间的本地存储键。
- `Listener`: 类型，表示一个回调函数类型，用于订阅时间变更通知。
- `GameTime`: 接口，定义了游戏时间的结构，包含小时、分钟和最后更新时间。
- `gameTimeStore`: 对象，导出的游戏时间存储实例，包含以下方法：
  - `get()`: 获取当前游戏时间。
  - `set(hour: number, minute: number)`: 设置游戏时间。
  - `addMinutes(minutes: number)`: 按分钟调整游戏时间。
  - `subscribe(listener: Listener)`: 订阅时间变更通知。

## 核心实现说明
该文件的核心实现包括以下部分：
- 使用 `localStorage` 来存储和加载游戏时间。
- `load()` 函数从本地存储中加载游戏时间，如果不存在则初始化为默认值。
- `save(time: GameTime)` 函数将游戏时间保存到本地存储，并通知所有订阅者时间已变更。
- `getTimeOfDay(hour: number, minute: number)` 函数根据给定的小时和分钟返回一天中的时间段。
- `gameTimeStore` 对象提供了获取、设置、调整和订阅游戏时间的方法。

该模块与项目其他模块的关系主要体现在提供统一的接口来访问和修改游戏时间，其他模块可以通过订阅时间变更来响应时间的变化。

## 注意事项或使用方式
- 调用 `get()` 方法可以获取当前游戏时间。
- 调用 `set(hour: number, minute: number)` 方法可以设置游戏时间，小时和分钟应在合理的范围内。
- 调用 `addMinutes(minutes: number)` 方法可以按分钟调整游戏时间，正数表示前进，负数表示后退。
- 通过调用 `subscribe(listener: Listener)` 方法可以订阅时间变更通知，当游戏时间发生变化时，将调用订阅的回调函数。
