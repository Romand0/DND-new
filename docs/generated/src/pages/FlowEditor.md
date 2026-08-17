# src/pages/FlowEditor.tsx

## 功能概述

该文件 `src/pages/FlowEditor.tsx` 是一个可视化流程图编辑器的核心组件，负责在画布上拖拽节点、连线、配置属性，编排流程编码。它承担着以下职责：

- 提供一个用户界面，允许用户通过拖拽和配置节点和连线来创建流程图。
- 管理流程图的状态，包括节点、连线、属性等。
- 与本地存储交互，实现流程图的保存和加载。
- 提供验证功能，确保流程图的正确性。

## 主要导出/接口

- `resolveNodeIcon(iconName?: string): React.ReactNode`：根据图标名称解析为对应的 React 元素。
- `nodesOverlap(a: FlowNodeDef, b: FlowNodeDef, cardWidth: number): boolean`：检查两个节点是否重叠。
- `findNonOverlappingPosition(node: FlowNodeDef, allNodes: FlowNodeDef[], cardWidth: number, dx = 40, maxAttempts = 20): { x: number; y: number }`：寻找不与其他节点碰撞的位置。
- `FlowEditor`：主组件，包含流程图编辑器的所有功能。

## 核心实现说明

- `FlowEditor` 组件使用 `DndContext` 和 `useDraggable` 从 `@dnd-kit/core` 库中提供拖拽功能。
- 状态管理通过 `useState` 和 `useEffect` 实现，包括流程图数据、选中节点、连接状态等。
- 与项目其他模块的关系：与 `flowStore` 模块交互进行数据存储和加载，与 `NODE_TYPE_REGISTRY` 和 `NODE_CONFIG_SCHEMA` 定义节点类型和配置。
- 被 `App` 组件引用，作为页面的一部分。

## 注意事项或使用方式

- 用户可以通过拖拽节点到画布上创建流程图。
- 可以通过配置节点和连线的属性来定义流程的行为。
- 可以通过点击“保存”按钮将流程图保存到本地存储。
- 可以通过点击“验证”按钮检查流程图的正确性。
