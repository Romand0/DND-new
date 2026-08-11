# src/components/combat/InitiativeTiebreakerDialog.tsx

## 功能概述
该文件定义了 `InitiativeTiebreakerDialog` 组件，用于处理战斗中的先攻平局情况。当多个参战者的先攻值相同时，该对话框会显示出来，允许用户通过拖动来调整参战者的行动顺序。

## 主要导出/接口
- `Props` 接口：
  - `open`: `boolean`，表示对话框是否打开。
  - `tiedOrder`: `Combatant[]`，表示先攻值相同的参战者列表。
  - `cardRefs`: `React.MutableRefObject<(HTMLDivElement | null)[]>`，用于引用拖动元素。
  - `draggingIndex`: `number | null`，表示当前正在拖动的参战者的索引。
  - `onDragStart`: `(e: React.PointerEvent, index: number) => void`，拖动开始时的回调函数。
  - `onDragMove`: `(e: React.PointerEvent) => void`，拖动移动时的回调函数。
  - `onDragEnd`: `() => void`，拖动结束时的回调函数。
  - `onConfirm`: `() => void`，确认顺序时的回调函数。
  - `onClose`: `() => void`，关闭对话框时的回调函数。

## 核心实现说明
- `InitiativeTiebreakerDialog` 组件根据 `open` 属性的值决定是否渲染对话框。
- 当对话框打开时，会显示所有先攻值相同的参战者，并允许用户通过拖动来调整他们的顺序。
- 拖动操作通过 `onDragStart`、`onDragMove` 和 `onDragEnd` 事件处理函数来实现。
- 对话框底部有两个按钮，一个用于取消操作，另一个用于确认顺序。

## 注意事项或使用方式
- 该组件应在 `Combat` 模块中使用，需要传入相应的 `Props`。
- 使用时，确保提供正确的 `onDragStart`、`onDragMove`、`onDragEnd`、`onConfirm` 和 `onClose` 回调函数。
- 确保传入的 `tiedOrder` 列表中的 `Combatant` 对象具有正确的 `id`、`name`、`characterId`、`isPc`、`race` 和 `class` 属性。
