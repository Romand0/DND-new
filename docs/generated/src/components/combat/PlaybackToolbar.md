# src/components/combat/PlaybackToolbar.tsx

## 功能概述
该文件定义了 `PlaybackToolbar` 组件，该组件负责在战斗界面中提供模式切换、回合完成确认和放映退出等功能。它允许用户在模拟模式和放映模式之间切换，并在放映模式下提供完成当前回合和退出放映的选项。

## 主要导出/接口
```typescript
interface Props {
  mode: 'simulation' | 'playback';
  playbackStarted: boolean;
  currentTurnText: string;
  onModeChange: (mode: 'simulation' | 'playback') => void;
  onConfirmEndTurn: () => void;
  onExitPlayback: () => void;
}
```

- `mode`: 当前模式，可以是 `'simulation'` 或 `'playback'`。
- `playbackStarted`: 布尔值，指示放映模式是否已经开始。
- `currentTurnText`: 当前回合的文本描述。
- `onModeChange`: 函数，用于切换模式。
- `onConfirmEndTurn`: 函数，用于确认完成当前回合。
- `onExitPlayback`: 函数，用于退出放映模式。

## 核心实现说明
`PlaybackToolbar` 组件通过接收 `Props` 接口定义的属性，渲染一个包含模式切换按钮、完成回合按钮和退出放映按钮的界面。模式切换按钮允许用户在模拟模式和放映模式之间切换，而完成回合按钮和退出放映按钮仅在放映模式下显示。

该组件的状态管理依赖于传入的属性，如 `mode` 和 `playbackStarted`。它与项目其他模块的关系在于，它依赖于外部传入的函数来处理模式切换、回合完成和放映退出等操作。

`PlaybackToolbar` 组件可能被战斗界面或其他相关组件引用，以提供用户界面交互。

## 注意事项或使用方式
- `PlaybackToolbar` 组件应在放映模式或模拟模式下使用。
- 在放映模式下，用户可以通过点击“完成回合”按钮来确认完成当前回合。
- 用户可以通过点击“退出放映”按钮来退出放映模式。
- 模式切换按钮在放映模式下不可用，以避免在放映过程中切换模式。
