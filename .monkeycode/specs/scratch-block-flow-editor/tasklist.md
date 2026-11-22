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

## P2 上下游
- [x] T9 FlowView 只读渲染：script 存在 → FlowScriptCanvas readOnly（复用编辑器积木组件，块无拖柄/删除钮、插槽静态）+ tab 改名「积木图」+ 头部块数统计；无 script → FlowGraphView 回退不变。readOnly 一路透传到 BranchBody 递归（含嵌套插槽）
- [x] T10 生成器改产脚本树：skills/流程生成器 SKILL.md 配方/产出格式/审查门 A 全部改写为 script 树表达（检定块即 C 形、分支语义对照表、位置布局节删除）；templates 两份示例 JSON 改 script 格式；flowStore.import 编译桥（ensureCompiledGraph：compileScriptToGraph + ensureNodePositions，过「节点缺少位置」门禁后直入 publish）
- [x] T11 探针 `probe-flow-view-script.cjs` 20 项全绿——A 积木只读渲染（块数/插槽标签/无删除钮/无调色板）、B 图回退、C 编译桥（节点5/边5/全节点坐标/C 形边语义/缺 description 拒绝）
- [x] T12 验证收尾：tsc + build 通过；全量基线 29/29
- [x] T13 卡片选中自动展开右侧编辑面板：FlowBlockCard/帽子块点击 → selectBlock（选中 + 清锚点 + setShowRightPanel(true)），帽子块补选中高亮；UI 链按 §8.2 人工验收（探针只跑既有回归 23/23 + 26/26）
- [x] T14 调色板添加不展开右栏：addBlock 只选中高亮新块，setShowRightPanel(true) 移除（点卡片才展开）；UI 链人工验收
- [x] T15 块形态语义分层（用户观察：检定=信号发射器/效果=信号反应器/分级=内嵌条件作用器）：buildNewBlock 检定块默认堆叠（仅 condition_branch 建 C 形）；flowScriptTree.convertBlockForm（堆叠⇄分支，分支体非空不可收敛）；右栏「块形态」切换条；SKILL.md 语义分层表 + 配方改信号传递默认（halfDamageOnSave 留效果节点）、templates 示例改堆叠形态（旧 onFalse 体放 halfDamageOnSave 是语义 bug）；design.md Data Models 记原则；回归 23/23+26/26+20/20
- [x] T16 单分支 detour 形态（用户观察：D&D 法术多为「一方特殊效果，另一方正常进下一环节」，大路+小路拐回大路而非岔路口）：ScriptIf.form?: 'ifelse'|'detour'（缺省 ifelse 兼容存量）；detour 恒 onFalse 空、编译语义=双分支且否则体为空（零编译器改动）；convertBlockForm 三态（step/detour/ifelse，ifelse→detour 需清否则体）；FlowBlockCard detour 渲染否则路径为「直接向下」提示条（无插槽）；右栏三态切换（检定块 堆叠/单分支/双分支，condition_branch 单分支/双分支且默认 detour）；SKILL.md 三态表 + detour 配方；回归 23/23+26/26+20/20
