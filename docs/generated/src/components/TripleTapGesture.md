# src/components/TripleTapGesture.tsx

## 功能概述
该文件定义了一个名为 `TripleTapGesture` 的 React 组件，用于处理屏幕上的三指快速点击手势。该组件的主要职责是检测用户在屏幕上半部分的三指快速点击事件，并在检测到有效手势时导航到相应的战斗页面。

## 主要导出/接口
- **组件**：`TripleTapGesture`
  - 无参数构造函数，返回一个无内容的组件，用于处理手势事件。

## 核心实现说明
- **关键逻辑**：组件通过监听 `pointerup` 事件来检测用户在屏幕上半部分的三指快速点击。当检测到三个连续的点击事件且点击间隔小于500毫秒时，触发 `handleTripleTap` 函数。
- **状态管理**：组件内部维护一个 `timestamps` 数组来记录点击事件的时间戳，用于判断点击间隔。
- **与项目其他模块的关系**：组件依赖于 `useNavigate` 钩子进行页面导航，以及 `hookedCombatStore` 用于获取战斗信息。
- **被谁引用**：该组件可能被集成到需要手势导航功能的页面中。

## 注意事项或使用方式
- 调用方式：将 `TripleTapGesture` 组件添加到需要手势导航功能的页面中。
- 使用前提：确保页面已正确安装并配置了 `react-router-dom` 和 `@/data/hookedCombatStore`。
