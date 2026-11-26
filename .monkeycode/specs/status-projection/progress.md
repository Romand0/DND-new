# 状态投影 + rounds 双通道 — 进度

## 阶段状态
- [x] 侦查完成（接线点全部确认）
- [x] design.md 落档
- [x] P1 类型 + 投影 + flush 订阅
- [x] P1 玩家端 UI 三处
- [x] P2 roundsDm 类型 + 写入路径 + 明细输出
- [x] P2 消费点（InitiativeTable / CombatSession / 投影）
- [x] 探针（probe-status-projection 11 断言全绿；probe-search 20 / probe-reaction 72 回归全绿）
- [x] tsc + build 通过 → 合 main 推送

## 已决策
- 数据全量透传（君子协定），默认可见性在渲染层：SpectatorTable 不显示 hidden；自己的 PC 可见隐匿总值；SpectatorBoard token 幽灵化（半透明+虚线边+图例）
- statusManager.subscribe 补挂 scheduleFlush（状态变更此前不触发 delta）
- roundsDm 与 rounds 平行稀疏；DM 手动编辑清对应 roundsDm 格（机器明细失效）
- 明细与玩家行分离：search DM 行含掷骰拆解+目标名+隐匿值，玩家行只回数量（不再含察觉总值）；hide 玩家行只写「躲藏」；hide DM 行含总值+观察者被动察觉清单
- summarizeOpDetail 与 summarizeOp 同 op 同 ctx 双写（turnCommitApply 一次遍历产出两通道）
- 回溯/退出放映/重开放映三条还原路径均带 roundsDm（TurnSnapshot + initial 快照）

## 关键接线点（实现后核对）
- useCombatBroadcast.ts：projectStatuses（scope 'combat'，与 DM 侧同语义）+ delta.roundsDm + unsubStatus
- realtime.ts：RosterStatusEntry {definitionId, name, stealthTotal?}；CombatRosterEntry.statuses；CombatDeltaPayload.roundsDm
- useRoundTurn.ts：handleCellChange 清 roundsDm 格 / appendRoundsDmLine / recordOperation 4 参 / takeTurnSnapshot+applyRollback 带 roundsDm
- combatActionSummary.ts：SummaryContext.search.hits/skippedNames + hide；summarizeOpDetail（search/hide）
- turnCommitApply.ts：hide 分支填 opCtx.hide（观察者=其余存活参战者）；search 分支填 hits/skippedNames；patch.roundsDm 双写
- CombatSession.tsx：dmMergedRounds（roundsDm 格非空优先）传 InitiativeTable；hideFor/searchFor 玩家行瘦身 + detail 参数
- 玩家端 UI：MyCombatantPanel 卡头徽章（全量含隐匿总值）/ SpectatorTable 表头徽章（滤 hidden）/ SpectatorBoard token 幽灵化

## 下一步
- 人工验收：DM 端放两单位对躲/搜，玩家观战页看徽章与 token 幽灵化、表格玩家行
- 待办（独立立项）：② hide 入账自动对抗 observers passiveChecks（per-observer hidden 建模）③ 状态持久化进 CombatRecord

## 验证命令
```bash
npx tsc -p tsconfig.app.json --noEmit && npm run build
NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-status-projection.cjs
NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-search.cjs
NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-reaction.cjs
```
