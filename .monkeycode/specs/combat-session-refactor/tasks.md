# CombatSession.tsx 模块化拆分 — 任务清单

> 任务分四组：A(类型+store 骨架校验)/B(hooks 实现)/C(组件实现)/D(集成收尾+文档更新)
> **可并行组**：B 组中无相互 import 的 hook 可并行；C 组组件都依赖 hook 返回值，但 hook 接口签名确定后也可并行

---

## 组 A：类型 + 共享骨架（串行，1 个 agent，做基准）
> 产物：确认 Props 接口，不改代码，只作为 B 组和 C 组的约定输入（写入 design.md 已有，此处只做签名校验）

| 任务 | 说明 | 依赖 |
|------|------|------|
| A1 | 校验 combatStore / characterStore / battlegroundStore 全部被 hook 用到的 API 签名（consumeAction / resetActions / resetTurnTodosForRound / update / get / cleanupDeathSaveTodos / applyDeathSaveResult / deriveCombatInventory） | 无 |
| A2 | 在 `src/types/` 下新增共享类型文件 `src/types/combatSession.ts`（可选，若接口过散则建），导出各 hook 的 Props/Returns 接口类型；如果直接 inline 类型足够清晰则跳过此步（可由 agent 判断） | A1 |

**预计文件**：0~1 个（types/combatSession.ts 可选）

---

## 组 B：10 个 Hook 实现（按依赖链，B1 完成后 B2-B5 可并行，B6-B10 依赖 B1-B5 的返回接口）
> 注意：每个 hook 独立文件，文件头部 `import` 只引入需要的 store / 类型，保持小模块。

### 可并行第一波（B1-B5，互不 import）

| 任务 | 新文件 | 函数/导出 | 对应原代码行（估算） | 依赖 |
|------|--------|----------|---------------------|------|
| B1 | `src/hooks/combat/useCombatInventories.ts` | `useCombatInventories(record)` 返回 `{ combatInventories, getEffectiveAc(c) }` | ~140-185 | 无 |
| B2 | `src/hooks/combat/useThrownDrop.ts` | `useThrownDrop(recordId)` 返回 `{ calcThrownDropPos, executeThrownDrop, chebyDist(导出纯函数) }`；execute 内部写 combatStore.equipmentChanges + battlegroundStore.addItemToken | ~562-722 | 无 |
| B3 | `src/hooks/combat/useSurprise.ts` | `useSurprise(record)` 返回 `{ surpriseRound, setSurpriseRound, openSurpriseAttackModal(round), confirmSurpriseAttack(), dialogProps }`；写入 rounds['突袭'] | ~723-758 | 无 |
| B4 | `src/hooks/combat/useActions.ts` | `useActions(record, { playbackOnlyMovableId 不需要，纯读 store })` 返回 `{ currentMode(), canUseAction(id), consumeCombatantAction(id), markLoadingAttacked(id), resetCombatantActions(id) }`；consume/mark/reset 内部写 combatStore | ~521-560 | 无 |
| B5 | `src/hooks/combat/useInitiative.ts` | `useInitiative(record, { editingInitiative, setEditingInitiative, initiativeInput, setInitiativeInput, selectedIds, setSelectedIds, batchMode, setBatchMode, onAddCombatant, onRemoveCombatant })` 返回 `{ initiativeOrder, getInitiativeCircle(id), tableProps（参战者列表列）, handleConfirmInitiative(), checkTieAndOpen(id), handleConfirmTiebreaker(), dragHandlers{handleDragStart/Move/End}, handleInitiativeSave(id), handleBatchDelete(), toggleSelect(id), handleAddRound, handleRemoveCombatant, listProps, tiebreakerProps, rollProps }`；内部写 combatStore + combatant 排序 | ~223-443 + ~1051-1070 + ~1281-1327 | 无 |

### 可并行第二波（B6-B8，依赖 B4/B5 返回的接口签名）

| 任务 | 新文件 | 函数/导出 | 对应原代码行（估算） | 依赖 |
|------|--------|----------|---------------------|------|
| B6 | `src/hooks/combat/useDamageAndHp.ts` | `useDamageAndHp(record, { combatInventories })` 返回 `{ handleApplyDamage(targetId, newHp, status?), autoFillDownedMarkers() }`；内部写 combatStore（HP/status/deathSaveFailures+Successes） + 调 combatStore.addTurnTodo(type=death_save) + cleanupDeathSaveTodos | ~444-520 | B1 (combatInventories 传参但可能不用，接口对齐即可) |
| B7 | `src/hooks/combat/useRoundTurn.ts` | `useRoundTurn(record, { playbackStarted, setPlaybackStarted, rollbackSnapshotRef, autoFillDownedMarkers })` 返回 `{ currentTurn, setCurrentTurn, playbackStarted, setPlaybackStarted, findNextValidTurn(round, col, roundsOverride?), advanceTurn(), confirmEndTurn(), takeTurnSnapshot(round, combatantId), applyRollback(round, combatantIdx), resolveWriteCell(attackerId), appendRoundRecord(round, combatantId, line), handleCellChange, confirmEndTurnOpen, setConfirmEndTurnOpen }`；advanceTurn 内部调 resetCombatantActions(若暴露则直接传参用) 以及 combatStore.resetTurnTodosForRound | ~210-222 + ~924-1050 + ~1071-1178 | B6 (autoFillDownedMarkers 作为参数注入即可) |
| B8 | `src/hooks/combat/useManualRecord.ts` | `useManualRecord(record, { selectedCell, setSelectedCell, combatInventories, handleApplyDamage, resolveWriteCell, appendRoundRecord })` 返回所有 manual* state + confirmManualRecord/cancelManualRecord + dialogProps；写入 rounds + HP（通过调用注入的 handleApplyDamage） | ~82-96 + ~1185-1279 | B7 (resolveWriteCell / appendRoundRecord 注入) |

### 串行收尾（B9-B10）

| 任务 | 新文件 | 函数/导出 | 对应原代码行（估算） | 依赖 |
|------|--------|----------|---------------------|------|
| B9 | `src/hooks/combat/usePlayback.ts` | `usePlayback(record, { playbackStarted, setPlaybackStarted, currentTurn, setCurrentTurn, rollbackSnapshotRef, playbackSnapshotRef, findNextValidTurn, resetTurnTodosForRound: () => combatStore.resetTurnTodosForRound })` 返回 `{ exitPlaybackModalOpen, setExitPlaybackModalOpen, commitModeChange(mode), handleModeChange(mode), finalizeExitPlayback(preserveChanges), startPlayback(), toolbarProps }`；startPlayback 内部写 combatStore 完整还原 + 清理死亡豁免 + battlegroundStore.setTokens | ~760-920 | B7 (startPlayback 里的 findNextValidTurn 调 roundTurn 暴露的；resetTurnTodosForRound 直接 store 调) |
| B10 | 综合验证 | 跑 `npx tsc --noEmit` 确保 B1-B9 所有 hook 类型都通过；如果 B9 有接口不对立即回修 | B1-B9 全部 |

---

## 组 C：9 个 渲染组件 实现（B 组 hook 接口签名确定后，可与 B 组后半并行）

> 原则：组件里不写路由/不直连 store CRUD（store subscribe 由 CombatSession 顶层做完后 props 传入），全部通过 props 传入。

| 任务 | 新文件 | Props（简要） | 对应原代码行（估算） | 依赖 |
|------|--------|--------------|---------------------|------|
| C1 | `src/components/combat/InitiativeRollDialog.tsx` | `open, selectedPc, onClose, onConfirm(d20Value)` | ~1440-1530 | 无 |
| C2 | `src/components/combat/TiebreakerDialog.tsx` | `open, tiedOrder, onClose, onReorder(newOrderedIds), dragStart/Move/End handlers from initiative` | ~1540-1610 | 无 |
| C3 | `src/components/combat/SurpriseDialog.tsx` | `open, surpriseRound, onClose, onConfirm` | ~773（突袭 window）+ CombatSession 顶部突袭相关 UI | 无 |
| C4 | `src/components/combat/RollbackConfirmDialog.tsx` | `open/rewindModal, combatantName, round, onFirstClick, onConfirmClose, onFinalConfirm(round, combatantIdx)` | ~2809-2890 | 无 |
| C5 | `src/components/combat/ManualRecordDialog.tsx` | `open, all manual* state setters / getters, combatantName, onClose, onConfirm` | ~2640-2740（手动记录弹窗原 UI） | 无 |
| C6 | `src/components/combat/PlaybackToolbar.tsx` | `mode, playbackStarted, currentTurnName, currentRoundNum, onModeChange, onStartPlayback, onConfirmEndTurn, onExitPlaybackRequest, exitOpen, onExitSave, onExitDiscard, onExitCancel` | ~1555-1600（顶部模式切换） + ~2750-2800（底部放映工具条）+ 退出放映弹窗 | 无 |
| C7 | `src/components/combat/CombatantList.tsx` | `combatants, combatInventories, actionsRemaining, isDead, isUnconscious, initiativeOrder, initiativeCircle, editingInitiativeHandlers, batchMode/selectedIds/toggleSelect/handleBatchDelete, addRound, handleAddCombatant/Remove, handleApplyDamageClick(open damage modal), handleAttackClick(open attack modal), handleSpellClick(open spell modal), surprise markers, npcCreator open button, rollInitiativeClick(open InitiativeRollDialog), initiative 保存, tiebreaker 打开触发, batchModeToggle button` | 顶部参战者列表（卡片行）~1328-1440 | B1 (combatInventories props) / B4 (actionsRemaining) / B5 (initiativeOrder/initiativeCircle/initiativeEdit/batch/增删) |
| C8 | `src/components/combat/InitiativeTable.tsx` | `rounds, combatants, initiativeOrder, currentTurn, playbackStarted, selectedCell/setSelectedCell, editingCell/setEditingCell, onStartPlayback(cell 点击开始放映), onManualRecord(cell 打开手动记录弹窗), onCellEdit, onRollbackClick(cell 打开回溯弹窗), isCurrentTurn(cell) 判定` | 先攻表格主体 ~1620-1930 | C4 (Rollback 触发) / C5 (ManualRecord 触发) |
| C9 | 响应式 + 样式校验 | 9 个新组件整体用 Tailwind，与原页面视觉完全一致；用 diff 截图对比（若能）或肉眼对比 | 全部 C1-C8 | C1-C8 |

---

## 组 D：集成收尾（串行，最后一组）

| 任务 | 文件 | 说明 | 依赖 |
|------|------|------|------|
| D1 | `src/pages/CombatSession.tsx` | 最终集成：所有 B hook 按顺序声明；所有 C 组件 props 对齐填入；顶层 onConfirmHit/onAttackMiss 组合各子回调；保留 Battleground / CombatAttackModal / CombatDamageModal / CombatSpellModal / NpcCreator 原文件引入不变 | B 组 + C 组全部 |
| D2 | `src/pages/CombatSession.tsx` | 删除已搬到 hook/组件的旧代码（不要误删顶层 state/ref 还在用的）；删除后 CombatSession.tsx 期望缩至 ~600 行以内 | D1 |
| D3 | 运行 `npx tsc --noEmit` | 零错误；如果有遗漏立即修复 | D1-D2 |
| D4 | 运行 `npm run build` | 零错误；如果打包找不到 import 路径/别名立即修 | D3 |
| D5 | 更新 `AGENTS.md` §0 速查表 + §2.2 目录速查（新增 10 hook + 9 组件条目，更新文件计数）；同步 `.trae/rules/dnd-tool-core.md` §一 速查表对应项（若改到战斗放放映/先攻/手动记录/平局排序/沙盘 token 触达点，补对应定位指引行） | 纯文档 | D1-D4 |
| D6 | 构建通过后自动按 Git 工作流建分支、提交、合并 main、推送 | D5 |

---

## 关键注意事项（§一 速查表 + §四 store 骨架约束对齐）

1. **所有 hook 用 store 订阅时**：如果读 Combatant/HP/状态，统一用 `combatStore.get(record.id)` 取最新，不要闭包缓存 `record` 快照里的旧值（原代码里 autoFillDownedMarkers / handleApplyDamage 都有这个兜底模式，搬到 hook 里保持一致）
2. **新建 9 个组件**：保持命名大驼峰 + default export + interface Props 写在文件顶部，不 inline 参数解构（对齐 §六 命名约定）
3. **新建 10 个 hook 文件**：按现有 `hooks/useInput.ts` 结构写，小驼峰文件名
4. **绝对路径 `@/xxx/yyy`** 优先，不写 `../../`（vite.config.ts 的 `@ → src` 已配）
5. **store 8 件套不变更**：hook 内部调 store 现有 API，不改 store 本身（除非 design.md §A1 校验发现缺失 API，这一步再讨论）
6. **CombatSession 顶层 hooks 顺序**：按依赖顺序稳定声明（先 useCombatInventories 再 useActions 再 useDamageAndHp 再 useRoundTurn 再 usePlayback 再 useInitiative 再 useSurprise 再 useManualRecord 再 useThrownDrop），保持 hooks 调用顺序一致避免 react hooks order 告警
7. **删除时勿误删**：D2 阶段删除旧代码前，先 `grep` 所有 state/ref 是否还有被 hooks 的 props 注入在用，确认后再删
