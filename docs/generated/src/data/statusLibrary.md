# src/data/statusLibrary.ts

## 功能概述

该文件定义了一个状态效果库，作为状态定义的注册中心。其职责是存储和管理所有状态定义，包括核心状态和自定义状态。状态效果库的存在是为了提供一个集中管理状态定义的机制，使得状态可以在运行时通过 `StatusManager` 进行操作。

## 主要导出/接口

- `StatusLibraryImpl` 类：实现了 `StatusLibrary` 接口，包含状态定义的注册、获取、列表和按效果类型查找等功能。
  - `register(definition: StatusDefinition)`: 注册一个新的状态定义。
  - `get(id: string)`: 根据状态定义的 ID 获取状态定义。
  - `list()`: 获取所有状态定义的列表。
  - `findByEffect(effectType: EffectType)`: 根据效果类型查找状态定义。
- `statusLibrary`: 全局单例，类型为 `StatusLibraryImpl`，用于访问状态定义库。

## 核心实现说明

`StatusLibraryImpl` 类通过一个私有成员 `definitions` 来存储状态定义，它是一个 `Map`，键为状态定义的 ID，值为状态定义对象。类在构造函数中初始化核心状态定义，并从 `localStorage` 加载自定义状态。状态定义注册和获取操作通过 `register`、`get`、`list` 和 `findByEffect` 方法实现。

状态定义注册中心与项目其他模块的关系是，它为其他模块提供了一个统一的接口来访问和管理状态定义。其他模块可以通过 `statusLibrary` 单例来获取所需的状态定义。

## 注意事项或使用方式

- 使用 `statusLibrary` 单例来访问状态定义库。
- 通过 `register` 方法注册新的状态定义。
- 使用 `get` 方法根据状态定义的 ID 获取状态定义。
- 使用 `list` 方法获取所有状态定义的列表。
- 使用 `findByEffect` 方法根据效果类型查找状态定义。
