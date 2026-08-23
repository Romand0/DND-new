# FlowEditor 拆解待办清单 - 20260823

## 📋 总体目标
将 FlowEditor.tsx 从当前的 2723 行拆解为模块化的架构，最终目标是将主文件压缩到 200 行以内。

## 🎯 当前状态
- **当前进度**: 第二阶段第四个文件（useNodeDrag）
- **文件总行数**: 2723 行（目标: 200 行）
- **已提取模块**: 5个 + 4个Hook + 4个子组件
- **主要问题**: 已提取模块在原文件中未清理，存在严重代码重复

---

## 📝 任务清单

### 🔥 高优先级 - 立即执行

#### 任务1: 清理已提取模块的原始实现
**目标**: 删除已导入模块的重复代码，确保单一职责原则

**1.1 清理常量模块重复**
- **文件**: `/workspace/src/pages/FlowEditor.tsx`
- **位置**: 第215-225行附近
- **操作**: 删除 `NODE_W`, `NODE_H`, `CARD_NODE_W`, `CARD_NODE_H`, `SCALE_MIN`, `SCALE_MAX`, `SCALE_STEP` 的重复定义
- **验证**: 确保所有引用都来自 `./flow-editor/constants`
- **风险**: 低，只是删除常量定义

**1.2 清理验证逻辑重复**
- **文件**: `/workspace/src/pages/FlowEditor.tsx`
- **位置**: 第45-192行附近
- **操作**: 删除 `validateFlowWithDetails`, `validateForPublish`, `ValidationError` 的重复实现
- **验证**: 确保所有验证都来自 `./flow-editor/validation`
- **风险**: 中，需要检查验证逻辑是否完全一致

**1.3 清理碰撞检测重复**
- **文件**: `/workspace/src/pages/FlowEditor.tsx`
- **位置**: 第573-605行
- **操作**: 删除 `nodesOverlap`, `findNonOverlappingPositionV2`, `setActiveSpatialGrid` 的重复实现
- **验证**: 确保所有碰撞检测都来自 `./flow-editor/collision`
- **风险**: 中，需要检查函数参数和返回值一致性

**1.4 清理连线路径计算重复**
- **文件**: `/workspace/src/pages/FlowEditor.tsx`
- **位置**: 第1027-1029行的 `getEdgePath` 函数
- **操作**: 删除路径计算逻辑，确保使用 `./flow-editor/edgeConnection` 中的函数
- **验证**: 检查 `getEdgePath` 是否与 `getSmartEdgePath` 功能重复
- **风险**: 中，需要确保路径计算逻辑正确迁移

#### 任务2: 提取子组件到独立文件
**目标**: 将内联组件提取为独立文件，提高代码可维护性

**2.1 提取 DraggableFlowNode 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第2456-2639行
- **目标文件**: `/workspace/src/pages/flow-editor/components/DraggableFlowNode.tsx`
- **依赖**: `useDraggable`, `NODE_TYPE_REGISTRY`, `resolveNodeIcon`
- **注意事项**: 
  - 保持 props 接口不变
  - 确保 CSS 样式正确迁移
  - 测试拖拽功能正常工作

**2.2 提取 PaletteDragItem 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第2642-2674行
- **目标文件**: `/workspace/src/pages/flow-editor/components/PaletteDragItem.tsx`
- **依赖**: `useDraggable`, `NodeTypeMeta`
- **注意事项**: 
  - 保持拖拽功能完整
  - 确保 CSS 样式正确迁移

**2.3 提取 NodeCardGhost 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第2676-2685行
- **目标文件**: `/workspace/src/pages/flow-editor/components/NodeCardGhost.tsx`
- **依赖**: `NodeTypeMeta`
- **注意事项**: 
  - 确保样式与原组件一致

**2.4 提取 ExtraConfigField 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第2688-2723行
- **目标文件**: `/workspace/src/pages/flow-editor/components/ExtraConfigField.tsx`
- **依赖**: `useTextInput`
- **注意事项**: 
  - 确保 `useTextInput` Hook 可用
  - 测试输入框功能正常

---

### 🔶 中优先级 - 阶段性执行

#### 任务3: 清理已提取Hook的原始实现
**目标**: 删除已提取Hook的重复实现，确保状态管理逻辑集中化

**3.1 清理 useFlowDraft Hook**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx`
- **位置**: 第876-901行的 `saveDraft`, `loadDraft`, `deleteDraft` 逻辑
- **操作**: 删除重复的草稿管理逻辑
- **验证**: 确保所有草稿操作都通过 Hook 进行
- **风险**: 中，需要确保草稿数据同步

**3.2 清理 useViewportSnapshot Hook**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx`
- **位置**: 第337-426行的视口快照逻辑
- **操作**: 删除重复的视口状态管理
- **验证**: 确保缩放和平移功能正常
- **风险**: 中，需要检查视口状态更新逻辑

**3.3 清理 useCanvasZoom Hook**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx`
- **位置**: 第190-261行的缩放处理逻辑
- **操作**: 删除重复的缩放事件处理
- **验证**: 确保缩放功能正常工作
- **风险**: 中，需要检查缩放比例计算

**3.4 清理 useNodeDrag Hook**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx`
- **位置**: 第607-779行的拖拽事件处理
- **操作**: 删除重复的拖拽逻辑
- **验证**: 确保拖拽功能正常
- **风险**: 高，这是核心功能，需要全面测试

---

### 🔵 低优先级 - 优化阶段

#### 任务4: 代码优化和重构
**目标**: 进一步优化代码结构，提高性能和可维护性

**4.1 优化导入语句**
- **操作**: 整理所有导入语句，按类型分组
- **目标**: 提高代码可读性
- **风险**: 低，纯格式化工作

**4.2 提取自定义Hook**
**4.2.1 提取 useFlowSelection Hook**
- **源**: `setSelectedNodeId`, `setSelectedEdgeId` 相关逻辑
- **目标**: `/workspace/src/pages/flow-editor/hooks/useFlowSelection.ts`
- **功能**: 统一管理选中状态

**4.2.2 提取 useFlowUI Hook**
- **源**: `showRightPanel`, `showDrafts`, `exitModalOpen` 等UI状态
- **目标**: `/workspace/src/pages/flow-editor/hooks/useFlowUI.ts`
- **功能**: 统一管理UI状态

**4.2.3 提取 useFlowToast Hook**
- **源**: `toast` 相关逻辑
- **目标**: `/workspace/src/pages/flow-editor/hooks/useFlowToast.ts`
- **功能**: 统一管理提示消息

**4.3 提取工具函数**
**4.3.1 提取 flowUtils.ts**
- **源**: 工具函数（如 `sampleEdgeToPolyline`）
- **目标**: `/workspace/src/pages/flow-editor/utils/flowUtils.ts`
- **功能**: 集中管理工具函数

---

## ⚠️ 重要注意事项

### 1. **代码一致性检查**
- 每次删除代码前，确保所有引用都指向正确的导入模块
- 使用 `grep` 检查是否有遗漏的引用
- 删除后运行 `npm run dev` 测试功能是否正常

### 2. **测试策略**
- **功能测试**: 确保所有核心功能（拖拽、缩放、连接、验证）正常
- **性能测试**: 检查拆解后性能是否有提升
- **兼容性测试**: 确保与现有代码集成无问题

### 3. **风险控制**
- **备份策略**: 每个重大修改前先提交当前状态
- **渐进式修改**: 一次只处理一个模块，避免大规模修改
- **回滚准备**: 准备好回滚方案，以防修改出现问题

### 4. **代码质量保证**
- **类型检查**: 运行 `npx tsc --noEmit` 确保类型正确
- **代码格式化**: 使用 Prettier 统一代码风格
- **注释更新**: 更新相关注释，确保文档同步

### 5. **性能优化考虑**
- **减少重复渲染**: 确保拆解后的组件正确使用 React.memo
- **优化导入**: 只导入需要的模块，减少包大小
- **懒加载**: 考虑对非核心功能使用懒加载

---

## 📊 进度跟踪

| 阶段 | 任务数量 | 已完成 | 进行中 | 待开始 | 完成率 |
|------|----------|--------|--------|--------|--------|
| 高优先级 | 8 | 0 | 0 | 8 | 0% |
| 中优先级 | 4 | 0 | 0 | 4 | 0% |
| 低优先级 | 7 | 0 | 0 | 7 | 0% |
| **总计** | **19** | **0** | **0** | **19** | **0%** |

---

## 🎯 最终目标

完成所有拆解任务后，FlowEditor.tsx 应该只包含：
- 主组件定义和核心逻辑
- 必要的导入语句
- 核心状态管理
- 页面布局和主要组件组合

预计最终文件大小：200-300行（相比当前的2723行减少90%+）

---

## 📞 协作说明

- **每日站会**: 每天开始前检查任务进度
- **代码审查**: 每个模块完成后进行代码审查
- **问题跟踪**: 及时记录和解决遇到的问题
- **文档更新**: 同步更新相关文档和注释

---

*创建日期: 20260823*
*最后更新: 20260823*