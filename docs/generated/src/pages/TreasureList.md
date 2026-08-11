# src/pages/TreasureList.tsx

## 功能概述
该文件定义了宝藏列表页的组件，负责展示和管理宝藏列表。它允许用户查看、创建、编辑和删除宝藏。宝藏列表页是用户与宝藏数据交互的主要界面。

## 主要导出/接口
- `formatCurrency(c: { pp: number; gp: number; sp: number; cp: number }): string`
  - 格式化货币对象为字符串形式。
- `TreasureList()`
  - 宝藏列表页组件，包含状态管理、事件处理和渲染逻辑。

## 核心实现说明
- `useState` 和 `useEffect` 钩子用于管理组件的状态和副作用。
- `treasureStore` 用于获取和操作宝藏数据。
- `formatCurrency` 函数将货币对象转换为字符串形式，用于显示在界面上。
- 组件使用 `filtered` 状态来存储过滤后的宝藏列表，该列表基于搜索输入进行过滤。
- `handleCreate` 函数用于创建新的宝藏并导航到编辑页面。
- `handleDelete` 函数用于删除宝藏。
- 组件包含一个顶栏，用于导航和创建宝藏。
- 搜索输入允许用户搜索宝藏标题。
- 宝藏列表以网格形式展示，每个宝藏条目包含标题、货币、物品数量和操作按钮。
- 删除操作会显示一个确认对话框。

## 注意事项或使用方式
- 组件依赖于 `react-router-dom` 库进行页面导航。
- 使用 `treasureStore` 来获取和操作宝藏数据。
- 在删除宝藏之前，用户需要确认删除操作。
