# FlowEditor 拆解待办清单 - 20260823

## 📋 总体目标
将 FlowEditor.tsx 从当前的 2723 行拆解为模块化的架构，最终目标是将主文件压缩到 200 行以内。

## 🎯 当前状态
- **当前进度**: 任务2.3完成，准备任务2.4
- **文件总行数**: 2499 行（目标: 200 行，已减少224行）
- **已提取模块**: 3个组件（DraggableFlowNode、PaletteDragItem、NodeCardGhost）
- **主要问题**: 已提取模块在原文件中未清理，存在严重代码重复

## 📊 校准说明
根据长期规划 FlowEditor-拆解规划.md 校准：
- **阶段1**: ✅ 全部完成（7个纯函数模块）
- **阶段2**: 完成50%（4个Hook，剩余4个待完成）
- **阶段3**: 进行中（已提取3个子组件，还需4个）
- **阶段4**: 未开始

---

## 📝 任务清单

### 🎯 阶段1：纯函数提取 ✅ 已完成
**状态**: 全部完成，包含7个纯函数模块

**已完成模块**:
- ✅ 1-1: `constants.ts` - 节点尺寸、缩放范围常量
- ✅ 1-2: `validation.ts` - 流程验证逻辑
- ✅ 1-3: `nodeIcon.tsx` - 节点图标解析
- ✅ 1-4: `collision.ts` - 碰撞检测和空间索引
- ✅ 1-5: `dragEffects.ts` - 拖拽视觉效果状态管理
- ✅ 1-6: `edgeConnection.ts` - SVG连线路径计算
- ✅ 额外完成: 常量、验证、碰撞检测等模块清理

### 🔥 高优先级 - 立即执行

#### 任务2: 提取子组件到独立文件
**目标**: 将内联组件提取为独立文件，提高代码可维护性

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

**2.3 提取 NodeCardGhost 组件** ✅ **已完成**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第2462-2471行
- **目标文件**: `/workspace/src/pages/flow-editor/components/NodeCardGhost.tsx`
- **依赖**: `NodeTypeMeta`
- **状态**: 已完成，通过类型检查和构建验证
- **减少代码**: 10行

**2.4 提取 ExtraConfigField 组件** ✅ **已完成**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第2465-2501行
- **目标文件**: `/workspace/src/pages/flow-editor/components/ExtraConfigField.tsx`
- **依赖**: `useTextInput`
- **状态**: 已完成，通过类型检查和构建验证
- **减少代码**: 37行

### 🔶 中优先级 - 阶段性执行

#### 任务3: 提取剩余Hook（阶段2剩余任务）
**目标**: 完成阶段2的Hook提取，实现状态逻辑与UI分离

**3.1 提取 useFlowValidation Hook**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第914-935行
- **目标文件**: `/workspace/src/pages/flow-editor/hooks/useFlowValidation.ts`
- **依赖**: `flow`, `validationErrors`, `showValidation`, `validationStatus`
- **功能**: 流程验证状态管理

**3.2 提取 useFlowEditorToast Hook**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第374-380行
- **目标文件**: `/workspace/src/pages/flow-editor/hooks/useFlowEditorToast.ts`
- **依赖**: `toast`, `showToast`, `toastTimerRef`
- **功能**: 提示消息管理

**3.3 提取 useSpellBinding Hook**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第348-351, L958-991行
- **目标文件**: `/workspace/src/pages/flow-editor/hooks/useSpellBinding.ts`
- **依赖**: `boundSpell`, `showSpellPicker`, `handleBindSpell`, `handleUnbindSpell`
- **功能**: 法术绑定功能

**3.4 提取 useDragEffects Hook**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 拖拽视觉效果相关状态
- **目标文件**: `/workspace/src/pages/flow-editor/hooks/useDragEffects.ts`
- **依赖**: `isColliding`, `collisionDir`, `animateMove`, 拖拽视觉效果
- **功能**: 拖拽视觉效果状态管理

#### 任务4: 提取剩余子组件（阶段3剩余任务）
**目标**: 完成阶段3的子组件提取

**4.1 提取 FlowEditorToolbar 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第1123-1171行
- **目标文件**: `/workspace/src/pages/flow-editor/components/FlowEditorToolbar.tsx`
- **依赖**: `flowName`, `onNameChange`, `onPublish`, `onSave`, `saveStatus`, `validationStatus`
- **功能**: 编辑器工具栏

**4.2 提取 FlowEditorFunctionBar 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第1173-1199行
- **目标文件**: `/workspace/src/pages/flow-editor/components/FlowEditorFunctionBar.tsx`
- **依赖**: `showLeftPanel`, `onToggleLeftPanel`, `canvasScale`, `onScaleChange`, `onValidate`, `showDrafts`, `drafts.length`, `onClear`
- **功能**: 编辑器功能栏

**4.3 提取 FlowNodePalette 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 左侧面板整块
- **目标文件**: `/workspace/src/pages/flow-editor/components/FlowNodePalette.tsx`
- **依赖**: `nodeGroups`, `onAddNode`, `isDark`
- **功能**: 左侧节点面板

**4.4 提取 FlowCanvasArea 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 画布区域（含SVG连线、节点卡片）
- **目标文件**: `/workspace/src/pages/flow-editor/components/FlowCanvasArea.tsx`
- **依赖**: `flow`, `canvasScale`, `selectedNodeId`, `onNodeClick`, `onCanvasClick`, DnD sensors...
- **功能**: 画布区域

**4.5 提取 FlowPropertyPanel 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 右侧面板整块
- **目标文件**: `/workspace/src/pages/flow-editor/components/FlowPropertyPanel.tsx`
- **依赖**: `flow`, `selectedNode`, `selectedEdge`, `onUpdateFlow`, `onUpdateNode`, `onUpdateEdge`, `onDeleteEdge`
- **功能**: 右侧属性面板

**4.6 提取 FlowNodeConfigEditor 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第1726-1799+ 节点配置区
- **目标文件**: `/workspace/src/pages/flow-editor/components/FlowNodeConfigEditor.tsx`
- **依赖**: `node`, `schema`, `onConfigChange`, `onLabelChange`
- **功能**: 节点配置编辑器

**4.7 提取 FlowEdgeConfigEditor 组件**
- **源文件**: `/workspace/src/pages/FlowEditor.tsx` 第2000-2140 连线属性区
- **目标文件**: `/workspace/src/pages/flow-editor/components/FlowEdgeConfigEditor.tsx`
- **依赖**: `edge`, `onUpdate`, `onDelete`
- **功能**: 连线配置编辑器

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

#### 任务5: 收尾治理（阶段4）
**目标**: 完成最终收尾工作，达到目标状态

**5.1 主组件精简至 < 200 行**
- **目标**: FlowEditor.tsx 压缩到 200 行以内
- **内容**: 仅做 Hook 调用和子组件组装

**5.2 创建入口文件**
- **目标**: 新建 `src/pages/flow-editor/index.tsx` 作为入口
- **操作**: 旧路径做 re-export 保持路由不破

**5.3 CSS 样式模块化**
- **目标**: 将 L1082-1122 的 `<style>` 标签内 CSS 移入 `public/css/flow-editor.css`
- **操作**: 或使用 CSS Modules

**5.4 清理分隔注释**
- **目标**: 删除所有 `// =====` 风格的分隔注释
- **原因**: 模块化后不再需要

**5.5 全量 E2E 验证**
- **目标**: 完整验证：新建→编辑→拖拽→连线→保存→发布→回滚

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
| 阶段1（纯函数） | 7 | 7 | 0 | 0 | 100% ✅ |
| 阶段2（Hook） | 8 | 4 | 0 | 4 | 50% |
| 阶段3（子组件） | 7 | 4 | 0 | 3 | 57.1% |
| 阶段4（收尾） | 5 | 0 | 0 | 5 | 0% |
| **总计** | **27** | **15** | **0** | **12** | **55.6%** |

---

## 🎯 最终目标

完成所有拆解任务后，FlowEditor.tsx 应该只包含：
- 主组件定义和核心逻辑
- 必要的导入语句
- 核心状态管理
- 页面布局和主要组件组合

预计最终文件大小：200-300行（相比当前的2723行减少90%+）

## 📁 预期目录结构

```
src/pages/flow-editor/
├── index.tsx                  # 入口，re-export 或薄壳
├── FlowEditor.tsx             # 主组件（~200 行）
├── constants.ts               # 常量
├── validation.ts              # 校验纯函数
├── nodeIcon.tsx               # 图标映射
├── collision.ts               # 碰撞检测 + 空间索引
├── dragEffects.ts             # 拖拽视觉效果
├── edgeConnection.ts          # SVG 连线路径计算
├── hooks/
│   ├── useFlowDraft.ts
│   ├── useViewportSnapshot.ts
│   ├── useCanvasZoom.ts
│   ├── useNodeDrag.ts
│   ├── useFlowValidation.ts   # 待完成
│   ├── useFlowEditorToast.ts   # 待完成
│   ├── useSpellBinding.ts     # 待完成
│   └── useDragEffects.ts       # 待完成
└── components/
    ├── FlowEditorToolbar.tsx   # 待完成
    ├── FlowEditorFunctionBar.tsx # 待完成
    ├── FlowNodePalette.tsx     # 待完成
    ├── FlowCanvasArea.tsx      # 待完成
    ├── FlowPropertyPanel.tsx   # 待完成
    ├── FlowNodeConfigEditor.tsx # 待完成
    ├── FlowEdgeConfigEditor.tsx # 待完成
    ├── DraggableFlowNode.tsx   # ✅ 已完成
    ├── PaletteDragItem.tsx      # ✅ 已完成
    └── NodeCardGhost.tsx       # ✅ 已完成
```

---

## 📞 协作说明

- **每日站会**: 每天开始前检查任务进度
- **代码审查**: 每个模块完成后进行代码审查
- **问题跟踪**: 及时记录和解决遇到的问题
- **文档更新**: 同步更新相关文档和注释

---

*创建日期: 20260823*
*最后更新: 20260823*
*校准完成: 20260823*
*遵循长期规划: FlowEditor-拆解规划.md*

## 🔄 校准说明

根据长期规划文件 FlowEditor-拆解规划.md 进行了全面校准：
1. **重新组织任务结构**: 按照阶段1→阶段2→阶段3→阶段4的层次结构
2. **更新进度统计**: 准确反映各阶段完成情况
3. **调整任务优先级**: 按照长期规划的依赖关系重新排序
4. **补充缺失任务**: 添加了长期规划中提到的所有任务
5. **统一进度追踪**: 与长期规划保持一致

**主要变更**:
- 任务总数从19个调整为27个
- 新增阶段2剩余4个Hook提取任务
- 新增阶段3剩余4个子组件提取任务  
- 新增阶段4收尾治理5个任务
- 进度统计从15.8%更新为51.9%
