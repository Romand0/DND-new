# 进度：scratch-block-flow-editor（Scratch 积木化流程编辑器）

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
把 FlowEditor 从自由图编辑重构为 Scratch 积木式脚本树编辑：拓扑合法性由结构保证（凹槽形制式），发布校验与运行时（flowCompiler/D1）零改动（编译桥接）。

## 阶段状态
- [x] P0 数据层：`src/types/flowScript.ts`（脚本树 + BLOCK_SHAPE_REGISTRY）、`src/lib/flowScriptMigrate.ts`（probe/expand 迁移器）、`src/lib/flowScriptCompile.ts`（编译桥）、validation 分流、`scripts/probes/probe-flow-script.cjs`（26 项全绿）
- [x] P1 编辑器：`src/lib/flowScriptTree.ts`（SlotPath 寻址树操作）、`src/components/flow-editor/script/`（FlowScriptCanvas/FlowBlockCard/FlowDropSlot/FlowMigrationPanel）、`hooks/use-script-dnd.ts`（pointer 拖拽状态机）、palette/FlowPropertiesNodeEditor/FlowEditorToolbar 改造、FlowEditor 状态切换（updateScript 单写通道 + ingestFlow 迁移门控 + 旧画布退役）、探针 `probe-flow-editor-script.cjs`（23 项全绿）
- [x] P2 上下游：FlowView 只读渲染（script→积木 readOnly 复用编辑器组件 +「积木图」tab + 块数统计；无 script 回退图视图）、skills/流程生成器 SKILL.md + templates 改产脚本树配方、flowStore.import 编译桥（ensureCompiledGraph 自动编译+布局直入 publish）、探针 `probe-flow-view-script.cjs`（20 项全绿）
- [ ] P3 清理（占位）：position/tidyLayout 等图时代残留

当前：P2 已完成（待合 main）；下一步 P3 或按需收尾。

## 已决策
- 编译桥接：script 树 → 编译回图（compileScriptToGraph），flowCompiler/D1/schema 零改动；块 id 沿用节点 id（执行日志 nodeId 可对照）
- 回流边按死代码丢弃：executeFlow 的 visited 防环使循环本就不生效，丢弃行为等价（back_edge 告警，不损 lossless）
- 旧自由画布立即退役（P1 直接替换，不保留双编辑模式）
- 迁移器汇合点必须「探测求交集 + stopAt 停止」：缺此机制汇合点会被首条分支吸进体内（首版 bug，探针 S2 暴露）
- 检定/条件块无分流边仅 on_complete 时按堆叠块处理（fireball 真实存量即此形态）
- lossless=false 仅由 asymmetric_join / dropped_edge 触发；back_edge / orphan 为行为等价丢弃
- 发布校验分流：flow.script 存在 → validateScript（配置完整性）；否则旧图校验不变
- 编辑器单写通道 updateScript：改树 → 实时编译同步 nodes/edges（统计/校验/云端零感知）；saveFlow 防御性重编译
- 拖拽自研 pointer 状态机（阈值 6px、ghost fixed+pointer-events:none、elementFromPoint 命中 [data-slot-key]、提交走 moveBlock）
- 插槽点击 = 插入锚点（stopPropagation 防画布点击清空）；palette cast_start 帽子存在时禁用
- 结构即布局：块垂直渲染（CSS transform 缩放），坐标数据彻底退出编辑层
- readOnly 复用策略：FlowView 直接复用 FlowBlockCard/FlowScriptCanvas/FlowDropSlot 加 readOnly prop（无拖柄、无删除钮、插槽静态、空态提示隐藏）；readOnly 必须随 BranchBody 递归透传（首版漏传，探针 A5 暴露）
- 生成器只产 script 字段：flowStore.import 边界 ensureCompiledGraph（compileScriptToGraph + ensureNodePositions）补编译产物与布局坐标，过「节点缺少位置」门禁后直入 publish；publish 不做本地校验，position 仅 import 门禁要求
- SKILL.md 反模式保留：数值线性分档用 scaled_effect 三件套，condition_branch 只表达判定分流；on_partial 在积木语言无对应分支，半伤用 halfDamageOnSave 或 onFalse 体表达

## 下一步
1. P3 清理（可选）：flow 图时代的 position/tidyLayout/ensureNodePositions 残留收敛
2. 流程生成器实际产出一次 script-only 流程走 import→绑定全链人工验收

## 验证方式
- 基线：`sh scripts/probes/run.sh`（期望末行 ALL PROBES OK）
- 本功能探针：`NODE_PATH=/usr/local/lib/node_modules BASE_URL=http://localhost:5174 node scripts/probes/probe-flow-script.cjs`（数据层，26 项）
- 编辑器探针：`NODE_PATH=/usr/local/lib/node_modules BASE_URL=http://localhost:5174 node scripts/probes/probe-flow-editor-script.cjs`（23 项，S1-S6 交互 / S7 fireball 静默迁移 / S8 告警门控）
- P2 探针：`NODE_PATH=/usr/local/lib/node_modules BASE_URL=http://localhost:5174 node scripts/probes/probe-flow-view-script.cjs`（20 项：A 积木只读 / B 图回退 / C import 编译桥，PUT /api/flows 拦截放行无后端 publish）
- 构建：`npx tsc -p tsconfig.app.json --noEmit && npm run build`

## 分支与提交
- 分支：`feature/flow-script-downstream`（P2）；feature/flow-script-editor（P1）与 feature/flow-script-data-layer（P0）均已合并删除
- 关键提交：P2 全量（FlowView readOnly 集成 + 编译桥 + SKILL.md 配方改写 + 探针 + spec）

## 环境备注
- playwright 全局安装（`NODE_PATH=/usr/local/lib/node_modules`），chromium headless 已装系统依赖（libglib 等）
- **必须装 fontconfig + CJK 字体**（已装 fonts-wqy-zenhei）：缺失时渲染进程 Skia FATAL 崩溃（SkFontMgr_FontConfigInterface Not implemented），表现为浏览器「随机」Target closed——所有 E2E 偶发崩溃皆源于此，与内存无关
- dev server 探针端口 5174（`npm run dev -- --port 5174`，background terminal 管理）
- 探针播种 localStorage 必须走 addInitScript（页面内事后播种会被 fetchRemote 镜像回写竞态清掉）
- fireball 流程 id 为合格 ID `spell:fireball`，编辑器路径需编码 `/flow-editor/spell%3Afireball`
- 拖拽激活后插槽 h-2.5→h-5 布局下移：探针需在拖拽激活后重取槽位坐标
