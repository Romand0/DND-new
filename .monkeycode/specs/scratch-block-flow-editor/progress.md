# 进度：scratch-block-flow-editor（Scratch 积木化流程编辑器）

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
把 FlowEditor 从自由图编辑重构为 Scratch 积木式脚本树编辑：拓扑合法性由结构保证（凹槽形制式），发布校验与运行时（flowCompiler/D1）零改动（编译桥接）。

## 阶段状态
- [x] P0 数据层：`src/types/flowScript.ts`（脚本树 + BLOCK_SHAPE_REGISTRY）、`src/lib/flowScriptMigrate.ts`（probe/expand 迁移器）、`src/lib/flowScriptCompile.ts`（编译桥）、validation 分流、`scripts/probes/probe-flow-script.cjs`（26 项全绿）
- [ ] P1 编辑器：FlowScriptCanvas / FlowBlockCard / FlowDropSlot / use-script-dnd / palette；FlowEditor 状态切换 + 迁移告警面板；旧画布退役（T7/T8 未开工）
- [ ] P2 运行体验打磨（占位，见 design.md）

当前：P0 已完成并合入 main；P1 未开工。

## 已决策
- 编译桥接：script 树 → 编译回图（compileScriptToGraph），flowCompiler/D1/schema 零改动；块 id 沿用节点 id（执行日志 nodeId 可对照）
- 回流边按死代码丢弃：executeFlow 的 visited 防环使循环本就不生效，丢弃行为等价（back_edge 告警，不损 lossless）
- 旧自由画布立即退役（P1 直接替换，不保留双编辑模式）
- 迁移器汇合点必须「探测求交集 + stopAt 停止」：缺此机制汇合点会被首条分支吸进体内（首版 bug，探针 S2 暴露）
- 检定/条件块无分流边仅 on_complete 时按堆叠块处理（fireball 真实存量即此形态）
- lossless=false 仅由 asymmetric_join / dropped_edge 触发；back_edge / orphan 为行为等价丢弃
- 发布校验分流：flow.script 存在 → validateScript（配置完整性）；否则旧图校验不变

## 下一步
1. P1 T7：新建 `src/components/flow-editor/FlowScriptCanvas.tsx` + FlowBlockCard/FlowDropSlot + `src/hooks/use-script-dnd.ts` + palette 改造（先读 design.md 第 5-6 节）
2. P1 T8：`src/pages/FlowEditor.tsx` 状态源从 nodes/edges 切到 flow.script（旧图数据入口处 migrateGraphToScript 一次 + 告警面板）；旧画布组件退役
3. 每步跑 `QUIET=1 NODE_PATH=/usr/local/lib/node_modules BASE_URL=http://localhost:5174 node scripts/probes/probe-flow-script.cjs` 保基线

## 验证方式
- 基线：`sh scripts/probes/run.sh`（期望末行 ALL PROBES OK）
- 本功能探针：`NODE_PATH=/usr/local/lib/node_modules BASE_URL=http://localhost:5174 node scripts/probes/probe-flow-script.cjs`（需 dev server 5174）
- 构建：`npx tsc -p tsconfig.app.json --noEmit && npm run build`

## 分支与提交
- 分支：`feature/flow-script-data-layer`（P0 完成后合入 main 并删除）
- 关键提交：见 main 合并提交（数据层四文件 + 探针 + spec 文档）

## 环境备注
- playwright 全局安装（`NODE_PATH=/usr/local/lib/node_modules`），chromium headless 已装系统依赖（libglib 等）
- dev server 探针端口 5174（`npm run dev -- --port 5174`）
