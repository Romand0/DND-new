# Task List — scratch-block-flow-editor

依据：design.md P0-P3 分期。当前推进 P0（数据层）。

## P0 数据层

- [x] T1 `src/types/flowScript.ts`：脚本树类型（ScriptHat/ScriptStep/ScriptIf/FlowScript）+ BLOCK_SHAPE_REGISTRY（节点类型→块形状、C 形双体 trigger 映射与体标签）+ `FlowDefinition.script` 字段
- [x] T2 `src/lib/flowScriptMigrate.ts`：migrateGraphToScript——probeChain/expandChain（stopAt 汇合点机制）、汇合点提升、回流边死代码丢弃、孤儿/多入口告警、on_partial 出边告警丢弃、lossless 标记
- [x] T3 `src/lib/flowScriptCompile.ts`：compileScriptToGraph——compileSequence(blocks, tail)、C 形双体边（on_true|on_success / on_false|on_failure）、汇合点逐级上溯、空体直连汇合点、块 id 沿用
- [x] T4 `src/utils/flow-editor/validation.ts`：validateForPublish 按 script 分流（有 script → validateBlockConfig/validateScript；无 script → 旧图校验不变）
- [x] T5 `scripts/probes/probe-flow-script.cjs`：26 项断言全绿——10 场景对拍 + fireball 黄金对照 + T4 校验分流
- [x] T6 验证收尾：tsc + build 通过；已合入 main（见 progress.md）

## P1 编辑器
- [x] T7 FlowScriptCanvas / FlowBlockCard / FlowDropSlot / use-script-dnd / palette 改造（另增 `src/lib/flowScriptTree.ts` 树操作层 + FlowMigrationPanel）
- [x] T8 FlowEditor 状态切换 + 迁移告警面板；旧画布退役（探针 `probe-flow-editor-script.cjs` 23 项全绿）
