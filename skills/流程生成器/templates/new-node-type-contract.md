# 新节点类型契约 —— <node_type>

> 扩展节点的设计契约。契约未写清前不要提交代码改动。新增类型会同时影响类型层、编译器、编辑器、校验器与文档。

## 1. 语义

- 类型名：`<node_type>`（加入 `FlowNodeType` 联合类型）
- 中文标签：`<标签>`
- 一句话职责：
- 分类：`核心环节` / `检定` / `控制流` / `效果` / `扩展`
- 颜色与图标：

## 2. 配置字段（`NODE_CONFIG_SCHEMA`）

| 键 | 类型 | 必填 | 默认值 | 说明 |
|----|------|------|--------|------|
| | | | | |

复杂度高时新增独立 `XxxConfig` 接口并在此列出。

## 3. 输入

- 依赖 `FlowExecutionContext` 的哪些字段：
- 依赖上游节点输出的哪些字段：
- 目标数量与类型要求：

## 4. 输出

| 输出字段 | 类型 | 含义 |
|----------|------|------|
| | | |

返回 `NodeExecutionResult`，明确 `status` 的取值条件。

## 5. 不变量与校验

- 图中结构约束（出/入边、trigger 要求）：
- 需要同步补充的校验器：`src/utils/flow-validation.ts`、`src/utils/flow-editor/validation.ts`、`src/types/flow.ts` 的 `validateFlow`

## 6. 副作用

- 是否修改游戏状态（HP / 状态 / 资源）：
- 是否写入日志：
- 是否产生 `StateMutation`：

## 7. 失败模式

| 场景 | status | 输出 | 上层处理 |
|------|--------|------|----------|
| | | | |

## 8. 运行实现清单

- [ ] `src/types/flow.ts`：`FlowNodeType` 联合类型
- [ ] `src/types/flow.ts`：`NODE_TYPE_REGISTRY` 元信息
- [ ] `src/types/flow.ts`：`NODE_CONFIG_SCHEMA`
- [ ] `src/lib/flowCompiler.ts`：`executeNode` switch 分支
- [ ] `src/lib/flowCompiler.ts`：`execute<Type>Node` 实现
- [ ] `src/utils/flow-editor/node-icon.tsx`：图标映射（如需要）
- [ ] 校验器补充
- [ ] `docs/nodes/<node_type>.md`
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 通过
- [ ] 编辑器内可拖拽、可配置、可保存、可发布

## 9. 兼容性

- 对既有流程的影响：
- 是否为破坏性变更（删除/重命名类型）：
- 迁移方案：

## 10. 人工评审结论

- 语义审定：
- 兼容性审定：
- 是否通过：
