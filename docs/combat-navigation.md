# Combat 模块导航

> 战斗追踪（CombatSession）拆解完成后的模块地图。页面只保留组装层职责，状态与逻辑在 hooks，展示与交互在组件。
> 拆解过程的完整裁定记录见仓库根目录 `CombatSession-拆解规划.md`（§零 完结总结 + §七 进度看板）。

## 1. 模块全景

```
src/pages/CombatSession.tsx（组装层，1580 行）
│   路由参数 / record 加载 / 弹窗装配 / 共享 ref 持有
│
├── src/hooks/combat/*（9 个，状态与逻辑层）
│     依赖数据层：combatStore（CRUD + 变更漏斗 + TurnTodo + pendingAdvantage）
│                snapDb（src/lib/combatSnapshots.ts，IndexedDB 快照持久化）
│
├── src/components/combat/*（8 个，展示与交互层）
│     + src/components/CombatantInfoPanel.tsx（参战者详情面板）
│     + src/components/Battleground.tsx（网格沙盘，页面装配 props）
│
└── src/types/combat.ts（CombatRecord / Combatant / RoundAction /
      EquipmentChanges / TurnTodo / PendingAdvantageSource / TurnSnapshot 共享类型）
```

## 2. Hooks 导航（状态与逻辑层）

调用顺序即页面装配顺序（CombatSession.tsx 实测行号）：

| # | Hook（页面行号） | 签名要点 | 拥有的状态 | 核心导出 |
|---|---|---|---|---|
| 1 | `useRoundTurn`（L131） | `(record, props)` props 含共享 ref 与惰性回调 | playbackStarted、currentTurn（**仅 `{round, combatantId}`**）、confirmEndTurnOpen、rewindModal | handleCellChange、findNextValidTurn、handleComatoseTurn、advanceTurn、checkAndAutoAdvance、resolveWriteCell、appendRoundRecord、takeTurnSnapshot、applyRollback、confirmEndTurn |
| 2 | `usePlayback`（L171） | `(record, props)` props 含 useRoundTurn 的 playbackStarted/currentTurn 直传 | playbackPaused、pausedTurnRef、playbackSnapshotRef、exitPlaybackModalOpen、pendingRestartPlayback | commitModeChange、handleModeChange、finalizeExitPlayback、pausePlayback、resumePlayback、startPlayback、handleRestartPlayback、startPlaybackFromBeginning |
| 3 | `useActions`（L197） | `(record, { playbackStarted, playbackPaused, currentTurn })` | 无（纯计算 + store 写入） | currentMode、isPlaybackActive、canUseAction、canUseBonusAction、consumeCombatantAction、consumeCombatantBonusAction、markLoadingAttacked、resetCombatantActions |
| 4 | `useCombatInventories`（L275） | `(record)` | 无 | combatInventories（背包派生 Memo）、getEffectiveAc |
| 5 | `useDamageAndHp`（L278） | `(record, props)` | 无 | handleApplyDamage（DamageApplication 事件：伤害量/来源/状态，含死亡豁免待办触发）、handleApplyHealing、autoFillDownedMarkers |
| 6 | `useThrownDrop`（L284） | `(recordId)` | 无 | executeThrownDrop（显式 `record` 入参，返回 ItemToken）、calcThrownDropPos、chebyDist |
| 7 | `useSurprise`（L316） | `(record, props)` | surpriseAttackOpen、surpriseAttackRound、surprisedCombatants | openSurpriseAttackModal、closeSurpriseAttackModal、toggleSurprisedCombatant、confirmSurpriseAttack（onConfirmed 联动从头播放） |
| 8 | `useManualRecord`（L340） | `(record, props)` | manualRecord* 9 组弹窗 state | confirmManualRecord、cancelManualRecord |
| 9 | `useInitiative`（L392） | `(record, props)` | initiativeRollOpen、selectedPc、d20Input、tiebreakerOpen、tiedOrder、draggingIndex、editingInitiative（只读化遗留） | handleConfirmInitiative、checkTieAndOpen、handleConfirmTiebreaker、handleDragStart/Move/End、handleAddRound、handleInitiativeSave、handleBatchDelete、toggleSelect |

**顺序约束**（调整时必须保持）：
- `useRoundTurn` 在 record-loading effect **之前**（其 props 依赖数组的渲染期读取）
- `usePlayback` 在 record-loading effect **之后**、useActions **之前**（isPlaybackActive 依赖 playbackPaused）
- 跨 hook 引用（如 usePlayback 引 useRoundTurn 的 currentTurn、useSurprise 引 usePlayback 的 startPlaybackFromBeginning）一律**惰性箭头**规避 TDZ

## 3. 组件导航（展示与交互层）

| 组件 | 渲染职责 | 数据来源（props 供给方） | 特殊约定 |
|---|---|---|---|
| `components/combat/InitiativeTable.tsx` | 先攻行动表格（th 卡片式表头：批量选择/信息按钮/只读先攻/删除 + tbody 单元格：回合推进/操作面板） | 页面装配 19 props（useRoundTurn + useActions + 批量状态） | currentTurn 比较用 findIndex 实时算下标（AGENTS.md §5.12）；无 combatantIdx |
| `components/combat/InitiativeRollDialog.tsx` | PC 先攻投掷（d20 输入 + 敏捷加值 + 总值预览） | useInitiative（selectedPc/d20Input/handleConfirmInitiative） | 组件内 `!open \|\| !selectedPc` 自守卫 |
| `components/combat/InitiativeTiebreakerDialog.tsx` | 先攻平局拖拽排序 | useInitiative（tiedOrder/cardRefs/拖拽三回调/handleConfirmTiebreaker） | — |
| `components/combat/RewindDialog.tsx` | 回合回滚双击确认 | useRoundTurn（rewindModal + onRewind） | **必须保留页面 `{rewindModal && ...}` 包裹**：firstClickDone 是组件局部 state，须重挂载复位 |
| `components/combat/ManualRecordDialog.tsx` | 手动记录（攻击/恢复双模板 + AC 命中判定 + 预览） | useManualRecord 全部弹窗 state；attackerId 来自 `selectedCell?.combatantId` | — |
| `components/combat/PlaybackToolbar.tsx` | 放映模式工具条（模式切换栏 + 右上按钮组） | usePlayback（mode/playbackStarted/playbackPaused/5 个 handler） | mode 兜底 `record.mode ?? 'simulation'` |
| `components/combat/SurpriseAttackDialog.tsx` | 突袭轮标记批量设置 | useSurprise（7 props） | confirm 后 onConfirmed 联动 startPlaybackFromBeginning |
| `components/combat/QuickCreateCombatDialog.tsx` | 快速创建战斗 | 页面自有 state | 纯 UI，拆解前已接线 |
| `components/CombatantInfoPanel.tsx` | 参战者详情（动作面板/手部状态/变更编辑） | 页面 infoPanel 状态 + useActions 等 | 入口：表格表头名称按钮 / 沙盘双击 |
| ~~`components/combat/CombatantList.tsx`~~ | （已删除）卡片列表 UI 已并入 InitiativeTable 表头 | — | git 历史可找回 |

## 4. 共享 ref 归属（禁止搬入单个 hook）

| Ref | 读写方 | 归属 |
|---|---|---|
| `rollbackSnapshotRef` | useRoundTurn、usePlayback、页面 | 页面持有，props 传入 |
| `playbackSnapshotRef` | usePlayback、页面 | 页面持有 |
| `autoAdvanceRef` / `autoAdvanceTimerRef` | useRoundTurn 自动推进 | 页面持有 |
| `pausedTurnRef` | usePlayback | hook 持有 |

## 5. 数据流要点（改逻辑前必读）

- **战斗装备变更**走 `EquipmentChanges` 三件套（added / removedChildIds / quantityDeltas）→ `combatStore.computeChildQtyMap` 抵消派生；任何弹药消耗/投掷掉落只读 `character.equipment`、只写 combatRecord（AGENTS.md §4.1/§5.3）
- **快照回溯**：`snapDb`（src/lib/combatSnapshots.ts）IndexedDB 双写（initial 快照 + 每回合 turn 快照）；刷新/关闭后仍可回溯。写入点在 usePlayback.handleModeChange，读取点在 useRoundTurn.applyRollback
- **回合待办（TurnTodo）**：内嵌 CombatRecord；`death_save` 类型由 useDamageAndHp.handleApplyDamage 自动触发、cleanupDeathSaveTodos 随状态终止（AGENTS.md §5.8/5.9）
- **优劣势**：注册式引擎 `src/data/advantageRules.ts`；`clearExpiredAdvantage` 在 advanceTurn 回合推进时清理过期 pending 标记（拆解时补齐的调用，勿删）
- **record 闭包陷阱**：hook 内异步/定时器逻辑必须 `combatStore.get(record.id)` 取最新值（拆解规划 §4.3）

## 6. 常见修改路由

| 要改什么 | 去哪里 |
|---|---|
| 回合推进 / 回合记录写入规则 | `useRoundTurn.ts` |
| 放映启动/暂停/恢复/退出/从头播放 | `usePlayback.ts` |
| 动作消耗 / 额外动作 / 装填标记 | `useActions.ts` |
| 战斗背包派生 / 有效 AC | `useCombatInventories.ts` |
| HP 扣减 / 死亡豁免 / 回血 | `useDamageAndHp.ts` |
| 投掷武器掉落位置计算 | `useThrownDrop.ts` |
| 突袭标记 | `useSurprise.ts` |
| 手动记录字段与结算 | `useManualRecord.ts` |
| 先攻投掷/平局/编辑 | `useInitiative.ts` |
| 表格/弹窗的展示与交互 | 对应 `components/combat/*.tsx` |
| 弹窗的开合时机与装配 | `pages/CombatSession.tsx`（组装层） |
| 战斗记录持久化 / TurnTodo / pendingAdvantage 接口 | `src/data/combatStore.ts` |
| 快照存储实现 | `src/lib/combatSnapshots.ts` |
| 类型定义 | `src/types/combat.ts` |
