# src/pages/BattlegroundEditor.tsx

## 功能概述
该文件 `BattlegroundEditor.tsx` 是一个 React 组件，负责沙盘编辑器的用户界面和交互逻辑。它允许用户在沙盘上绘制和编辑格子，选择不同的工具进行操作，如画笔、橡皮和拖拽。该组件通过 `battlegroundStore` 和 `combatStore` 与后端数据存储进行交互，以获取和保存沙盘数据。

## 主要导出/接口
- **类型**:
  - `Tool`: `'brush' | 'eraser' | 'hand'`
  - `Battleground as BG`: 包含沙盘格子的数据结构
  - `Combatant`: 包含战斗单位的数据结构
- **函数**:
  - `BattlegroundEditor()`: 组件入口函数
  - `handlePointerDown()`: 处理指针按下事件
  - `handlePointerMove()`: 处理指针移动事件
  - `handlePointerUp()`: 处理指针释放事件
  - `handleSave()`: 保存沙盘数据
  - `handleSaveAndExit()`: 保存沙盘数据并退出编辑器
  - `handleDiscard()`: 丢弃沙盘数据并退出编辑器
- **常量**:
  - `GRID_PRESETS`: 包含不同尺寸网格预设的常量对象

## 核心实现说明
- **状态管理**: 使用 `useState` 和 `useEffect` 管理组件的状态，如工具选择、草稿格子、缩放与平移、退出确认弹窗、保存成功提示、网格数据和战斗单位数据。
- **与项目其他模块的关系**: 通过 `battlegroundStore` 和 `combatStore` 与后端数据存储进行交互，获取和保存沙盘数据。
- **被谁引用**: 该组件被用于沙盘编辑器的用户界面，由 `App` 组件或其他父组件引入。

## 注意事项或使用方式
- 组件在加载时会根据 `sessionId` 获取沙盘数据，并在 `useEffect` 中订阅数据变化。
- 用户可以通过鼠标或触摸屏进行操作，包括选择工具、绘制、擦除和拖拽。
- 保存数据时，会通过 `battlegroundStore` 将草稿格子数据保存到后端。
- 退出编辑器时，可以选择保存或丢弃当前草稿。
