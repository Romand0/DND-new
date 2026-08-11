# src/components/combat/RewindDialog.tsx

## 功能概述
该文件定义了一个名为 `RewindDialog` 的 React 组件，用于在游戏中提供一个回溯功能对话框。该对话框允许用户确认是否回溯到指定回合，并展示回溯操作的潜在影响。

## 主要导出/接口
```typescript
interface Props {
  open: boolean;
  round: number;
  combatantName: string;
  onRewind: () => void;
  onClose: () => void;
}
```
- `Props` 接口定义了组件所需的属性：
  - `open`: 布尔类型，指示对话框是否打开。
  - `round`: 数字类型，表示当前回合数。
  - `combatantName`: 字符串类型，表示参战者的名称。
  - `onRewind`: 函数类型，用于执行回溯操作。
  - `onClose`: 函数类型，用于关闭对话框。

## 核心实现说明
`RewindDialog` 组件通过 `useState` 钩子管理一个名为 `firstClickDone` 的状态，用于跟踪用户是否已点击确认回溯按钮。组件首先检查 `open` 属性，如果为 `false`，则不渲染任何内容。

组件的 UI 结构包括：
- 标题和参战者信息。
- 一个警告列表，说明回溯操作的破坏性影响。
- 两个按钮，一个用于确认回溯，另一个用于关闭对话框。

当用户第一次点击确认回溯按钮时，`firstClickDone` 状态被设置为 `true`，并显示一个带有动画效果的按钮，提示用户再次点击以确认回溯。当用户第二次点击该按钮时，会触发 `onRewind` 函数执行回溯操作。

## 注意事项或使用方式
- 该组件应在游戏状态管理中正确使用，确保 `onRewind` 和 `onClose` 函数能够正确处理游戏状态。
- 使用该组件前，应确保用户理解回溯操作的后果，因为这是一个破坏性操作。
