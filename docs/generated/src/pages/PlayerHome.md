# src/pages/PlayerHome.tsx

## 功能概述

该文件 `PlayerHome.tsx` 是一个 React 组件，负责渲染玩家主页界面。它从后端 API 读取角色列表，并允许用户查看和选择角色。该组件存在的主要目的是为用户提供一个直观的方式来浏览和管理他们的角色。

## 主要导出/接口

- `PlayerHome`: 默认导出的 React 组件，用于渲染玩家主页。
  - `loadPlayers`: 异步函数，用于从 API 获取角色列表并更新状态。
  - `hpPercentage`: 函数，计算角色的生命值百分比。
  - `getHpColor`: 函数，根据生命值百分比返回相应的背景颜色类名。

## 核心实现说明

该组件使用 React 的 `useState` 和 `useEffect` 钩子来管理状态和副作用。`useState` 用于创建 `players`、`loading` 和 `error` 状态，`useEffect` 用于在组件挂载时调用 `loadPlayers` 函数来加载数据。

`loadPlayers` 函数通过调用 `fetchAllCharacters` API 获取角色列表，并对结果进行排序和错误处理。排序依据是角色的最后更新时间。

组件根据 `loading` 和 `error` 状态渲染不同的界面。如果正在加载数据，则显示加载指示器；如果发生错误，则显示错误信息并提供重试按钮。

## 注意事项或使用方式

- 该组件在挂载时会自动调用 `loadPlayers` 函数加载数据。
- 用户可以通过点击“刷新列表”按钮手动触发数据加载。
- 如果没有角色数据，则显示提示信息，告知用户等待 DM 同步角色数据。
- 每个角色卡片包含角色的基本信息、生命值、护甲和速度等数据，并提供查看详情的链接。
