# src/components/GameClock.tsx

## 功能概述
该文件定义了一个名为 `GameClock` 的 React 组件，用于显示和操作游戏中的时间。该组件负责渲染一个时钟界面，允许用户通过拖动时针或分针来调整时间。时间数据通过 `gameTimeStore` 进行管理，确保时间数据的一致性和持久化。

## 主要导出/接口
- **类型**：`Props`
  - `size?: number`：时钟的大小，默认为 240。
  - `interactive?: boolean`：是否允许用户交互，默认为 `true`。
- **函数**：
  - `angleDelta(current: number, last: number): number`：计算角度差，并归一化到 [-180, 180] 范围内。
- **组件**：`GameClock`
  - 接受 `Props` 类型的属性，并渲染一个 SVG 时钟。
- **Store**：`gameTimeStore`
  - 用于获取和设置游戏时间。
- **常量**：
  - `DAY_MINUTES = 24 * 60`：一天中的分钟数。

## 核心实现说明
`GameClock` 组件使用 React 的 `useState`、`useEffect`、`useRef` 和 `useCallback` 钩子来管理状态、副作用和引用。组件通过 `svgRef` 引用 SVG 元素，并通过 `draggingHand` 状态来跟踪当前被拖动的指针（时针或分针）。

组件的核心逻辑包括：
- 计算和更新时针和分针的角度。
- 处理指针的按下、移动和抬起事件，以更新时间。
- 使用 `rafIdRef` 来节流指针移动事件，避免在短时间内多次更新状态。
- 通过 `gameTimeStore` 来同步时间数据。

`GameClock` 组件被其他模块引用，以显示和操作游戏中的时间。

## 注意事项或使用方式
- 使用该组件时，需要传入 `size` 和 `interactive` 属性来定义时钟的大小和交互性。
- 组件依赖于 `gameTimeStore` 来管理时间数据，确保时间的一致性和持久化。
- 组件内部处理了指针的拖动和角度计算，无需外部干预。
