# FlowEditor.tsx 拆解规划方案

## 项目概述

**目标文件**: `src/pages/flow-editor/FlowEditor.tsx`  
**当前行数**: 2744 行  
**预期最终行数**: < 200 行  
**拆解策略**: 分阶段、按职责边界切片，每步可独立验证

---

## 总体原则

1. **每一步只做一件事**——提取 + 原地调用，不改行为
2. **每步完成后跑测试/人工验证**，确认无回归
3. **提取顺序：纯函数 → 自定义 Hook → 子组件**——依赖关系由底向上
4. **依赖方向单一化**：纯函数 → Hook → 子组件 → 主组件，每层只依赖更底层

---

## 阶段规划

### 阶段 0：前置准备（建立安全网）

| 任务 | 状态 | 说明 | 负责人 | 完成时间 |
|------|------|------|--------|----------|
| 0-1 | ⏳ | 为 `validateFlowWithDetails` 和 `validateForPublish` 编写单元测试 | | |
| 0-2 | ⏳ | 为 `findNonOverlappingPositionV2` / `nodesOverlap` 编写单元测试 | | |
| 0-3 | ⏳ | 在浏览器中手动走一遍核心路径（新建→添加节点→连线→拖拽→保存→发布），录屏留档 | | |

**没有测试的拆解是赌博。**

---

### 阶段 1：提取纯函数 / 常量（零风险，无状态依赖）

| 步骤 | 目标模块 | 行号范围 | 提取内容 | 状态 | 负责人 | 完成时间 |
|------|----------|----------|----------|------|--------|----------|
| 1-1 | `src/pages/flow-editor/constants.ts` | L215-225 | `NODE_W`, `NODE_H`, `CARD_NODE_W`, `CARD_NODE_H`, `SCALE_MIN/MAX/STEP` | ⏳ | | |
| 1-2 | `src/pages/flow-editor/validation.ts` | L45-192 | `ValidationError` 接口、`validateFlowWithDetails()`、`validateForPublish()` | ⏳ | | |
| 1-3 | `src/pages/flow-editor/nodeIcon.ts` | L200-212 | `resolveNodeIcon()` | ⏳ | | |
| 1-4 | `src/pages/flow-editor/collision.ts` | L227-308 | `nodesOverlap()`、`findNonOverlappingPositionV2()`、`activeSpatialGrid` 变量 | ⏳ | | |

**验证**: 跑阶段 0 的单元测试，确认绿。主组件 import 替换后页面功能不变。

---

### 阶段 2：提取自定义 Hooks（状态逻辑与 UI 分离）

当前组件有 **~30 个 useState** 和 **~15 个 useEffect**，全挤在一个函数里。

| 步骤 | 目标 Hook | 包含的状态/逻辑 | 状态 | 负责人 | 完成时间 |
|------|-----------|-----------------|------|--------|----------|
| 2-1 | `useFlowDraft(flowId)` | `flow`, `setFlow`, `drafts`, `createEmptyFlow`, `loadDraft`, `deleteDraft`, `saveDraft`, flowStore 同步 effect (L318-325, L337, L500-527, L621-634, L937-956, L1022-1035) | ⏳ | | |
| 2-2 | `useViewportSnapshot(flowId, canvasRef)` | viewportRef, saveViewport, scheduleViewportSave, scroll 事件, beforeunload, 恢复逻辑 (L529-618) | ⏳ | | |
| 2-3 | `useCanvasZoom(canvasRef)` | `canvasScale`, `canvasTranslate`, pinch 处理, 缩放按钮回调 (L364-365, L382-499) | ⏳ | | |
| 2-4 | `useNodeDrag(flow, canvasScale, spatialGridRef)` | `draggingNodeId`, `isColliding`, `collisionDir`, `animateMove`, rafIdRef, `handleDragMove`, `handleDragEnd` (L356-363, L690-879) | ⏳ | | |
| 2-5 | `useFlowValidation(flow)` | `validationErrors`, `showValidation`, `validationStatus`, `runValidation` (L914-935) | ⏳ | | |
| 2-6 | `useFlowEditorToast()` | `toast`, `showToast`, toastTimerRef (L374-380) | ⏳ | | |
| 2-7 | `useSpellBinding(flow, setFlow)` | `boundSpell`, `showSpellPicker`, `handleBindSpell`, `handleUnbindSpell` (L348-351, L958-991) | ⏳ | | |

**每步验证**: 提取后主组件改为调用 Hook，页面完整跑一遍。任何 Hook 提取失败都可以单独回滚。

---

### 阶段 3：提取子组件（JSX 分片）

主组件的 return 块约 **1600 行** (L1078-2744)，需要拆成可维护的子组件。

| 步骤 | 目标组件 | 行号范围 | Props 接口要点 | 状态 | 负责人 | 完成时间 |
|------|----------|----------|---------------|------|--------|----------|
| 3-1 | `FlowEditorToolbar` | L1123-1171 | `flowName`, `onNameChange`, `onPublish`, `onSave`, `saveStatus`, `validationStatus` | ⏳ | | |
| 3-2 | `FlowEditorFunctionBar` | L1173-1199 | `showLeftPanel`, `onToggleLeftPanel`, `canvasScale`, `onScaleChange`, `onValidate`, `showDrafts`, `drafts.length`, `onClear` | ⏳ | | |
| 3-3 | `FlowNodePalette` | 左侧面板整块 | `nodeGroups`, `onAddNode`, `isDark` | ⏳ | | |
| 3-4 | `FlowCanvasArea` | 画布区域（含 SVG 连线、节点卡片） | `flow`, `canvasScale`, `selectedNodeId`, `onNodeClick`, `onCanvasClick`, DnD sensors... | ⏳ | | |
| 3-5 | `FlowPropertyPanel` | 右侧面板整块 | `flow`, `selectedNode`, `selectedEdge`, `onUpdateFlow`, `onUpdateNode`, `onUpdateEdge`, `onDeleteEdge`... | ⏳ | | |
| 3-6 | `FlowNodeConfigEditor` | L1726-1799+ 节点配置区 | `node`, `schema`, `onConfigChange`, `onLabelChange` | ⏳ | | |
| 3-7 | `FlowEdgeConfigEditor` | L2000-2140 连线属性区 | `edge`, `onUpdate`, `onDelete` | ⏳ | | |

**策略**: 先提取最内层的叶子组件 (3-6, 3-7)，再提取面板 (3-5)，最后提取工具栏。自底向上，每步确保 Props 类型正确、回调连线无误。

---

### 阶段 4：收尾与治理

| 任务 | 状态 | 说明 | 负责人 | 完成时间 |
|------|------|------|--------|----------|
| 4-1 | ⏳ | 主组件 `FlowEditor.tsx` 最终应 **< 200 行**——仅做 Hook 调用和子组件组装 | | |
| 4-2 | ⏳ | 新建 `src/pages/flow-editor/index.tsx` 作为入口，旧路径做 re-export 保持路由不破 | | |
| 4-3 | ⏳ | 将 L1082-1122 的 `<style>` 标签内 CSS 移入 `public/css/flow-editor.css` 或 CSS Modules | | |
| 4-4 | ⏳ | 删除所有 `// =====` 风格的分隔注释（模块化后不再需要） | | |
| 4-5 | ⏳ | 全量 E2E 验证：新建→编辑→拖拽→连线→保存→发布→回滚 | | |

---

## 目录结构预期

```
src/pages/flow-editor/
├── index.tsx                  # 入口，re-export 或薄壳
├── FlowEditor.tsx             # 主组件（~150 行）
├── constants.ts               # 常量
├── validation.ts              # 校验纯函数
├── nodeIcon.ts                # 图标映射
├── collision.ts               # 碰撞检测 + 空间索引
├── hooks/
│   ├── useFlowDraft.ts
│   ├── useViewportSnapshot.ts
│   ├── useCanvasZoom.ts
│   ├── useNodeDrag.ts
│   ├── useFlowValidation.ts
│   ├── useFlowEditorToast.ts
│   └── useSpellBinding.ts
└── components/
    ├── FlowEditorToolbar.tsx
    ├── FlowEditorFunctionBar.tsx
    ├── FlowNodePalette.tsx
    ├── FlowCanvasArea.tsx
    ├── FlowPropertyPanel.tsx
    ├── FlowNodeConfigEditor.tsx
    └── FlowEdgeConfigEditor.tsx
```

---

## Agent 任务分配建议

| Agent | 任务 | 上下文预估 | 状态 | 完成时间 |
|-------|------|-----------|------|----------|
| A | 阶段 1 全部（4 个纯函数文件提取） | ~800 行输入，低风险 | ⏳ | |
| B | 阶段 2-1 + 2-2（useFlowDraft + useViewportSnapshot） | ~300 行逻辑 | ⏳ | |
| C | 阶段 2-3 + 2-4（useCanvasZoom + useNodeDrag） | ~500 行逻辑，最复杂 | ⏳ | |
| D | 阶段 2-5 + 2-6 + 2-7（小 Hook 们） | ~200 行逻辑 | ⏳ | |
| E | 阶段 3-6 + 3-7（叶子组件） | ~400 行 JSX | ⏳ | |
| F | 阶段 3-1 ~ 3-5（面板/工具栏组件）| 依赖 E 完成 | ⏳ | |
| G | 阶段 4（收尾） | 依赖全部完成 | ⏳ | |

**执行顺序**: A → (B ∥ C ∥ D) → E → F → G，其中 ∥ 表示可并行。

---

## 动态进度跟踪

### 当前进度概览
- **总体进度**: 0%
- **阶段 0 完成**: 0/3
- **阶段 1 完成**: 0/4
- **阶段 2 完成**: 0/7
- **阶段 3 完成**: 0/7
- **阶段 4 完成**: 0/5

### 详细进度日志

#### 阶段 0 - 前置准备
- [ ] 0-1: 为 `validateFlowWithDetails` 和 `validateForPublish` 编写单元测试
- [ ] 0-2: 为 `findNonOverlappingPositionV2` / `nodesOverlap` 编写单元测试
- [ ] 0-3: 核心路径手动测试 + 录屏

#### 阶段 1 - 纯函数提取
- [ ] 1-1: 提取 `constants.ts` (L215-225)
- [ ] 1-2: 提取 `validation.ts` (L45-192)
- [ ] 1-3: 提取 `nodeIcon.ts` (L200-212)
- [ ] 1-4: 提取 `collision.ts` (L227-308)

#### 阶段 2 - Hooks 提取
- [ ] 2-1: 提取 `useFlowDraft` hook
- [ ] 2-2: 提取 `useViewportSnapshot` hook
- [ ] 2-3: 提取 `useCanvasZoom` hook
- [ ] 2-4: 提取 `useNodeDrag` hook
- [ ] 2-5: 提取 `useFlowValidation` hook
- [ ] 2-6: 提取 `useFlowEditorToast` hook
- [ ] 2-7: 提取 `useSpellBinding` hook

#### 阶段 3 - 子组件提取
- [ ] 3-1: 提取 `FlowEditorToolbar` 组件
- [ ] 3-2: 提取 `FlowEditorFunctionBar` 组件
- [ ] 3-3: 提取 `FlowNodePalette` 组件
- [ ] 3-4: 提取 `FlowCanvasArea` 组件
- [ ] 3-5: 提取 `FlowPropertyPanel` 组件
- [ ] 3-6: 提取 `FlowNodeConfigEditor` 组件
- [ ] 3-7: 提取 `FlowEdgeConfigEditor` 组件

#### 阶段 4 - 收尾治理
- [ ] 4-1: 主组件精简至 < 200 行
- [ ] 4-2: 创建 `index.tsx` 入口文件
- [ ] 4-3: CSS 样式模块化
- [ ] 4-4: 清理分隔注释
- [ ] 4-5: 全量 E2E 验证

---

## 问题与风险

### 已知风险
1. **上下文溢出**: 2744 行文件一次性分析可能导致上下文溢出
2. **依赖复杂**: 各个状态之间可能存在复杂的相互依赖
3. **测试覆盖**: 缺少完整的测试套件，拆解后可能引入回归

### 缓解措施
1. **分阶段执行**: 严格按照阶段划分，每步完成后验证
2. **独立验证**: 每个提取的模块都可以独立测试
3. **回滚机制**: 任何步骤失败都可以单独回滚

### 需要澄清的问题
- [ ] 是否有现有的测试文件需要参考？
- [ ] 拆解过程中是否需要保持向后兼容？
- [ ] 是否有特定的性能要求需要考虑？

---

## 成功标准

### 代码质量
- [ ] 主组件行数 < 200 行
- [ ] 所有模块都有明确的职责边界
- [ ] 依赖关系清晰，无循环依赖
- [ ] 代码可读性和可维护性显著提升

### 功能验证
- [ ] 所有原有功能保持不变
- [ ] 拆解后的模块可以独立测试
- [ ] 性能无明显下降
- [ ] 开发体验改善（编辑器支持、类型提示等）

### 文档完善
- [ ] 每个模块都有清晰的文档说明
- [ ] 提供了使用示例和最佳实践
- [ ] 更新了相关的开发指南

---

## 更新日志

| 日期 | 更新内容 | 更新人 |
|------|----------|--------|
| | 初始版本创建 | |
| | | |

---

*最后更新时间: 2026-08-21*