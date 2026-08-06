# CombatSession.tsx 模块化拆分 — 需求文档

## 背景

`src/pages/CombatSession.tsx` 单文件 2937 行，聚合了先攻管理/攻击结算/伤害结算/法术施放/放映模式/手动记录/平局排序/沙盘交互/批量删除等多个独立子域，导致：
- AI agent 每次读入消耗大量 token，上下文容易截断
- 一处改动需要通读整文件，容易误伤其他子域逻辑
- 没有清晰的职责边界，新增功能不知道该写在哪个 hook 里

## 目标

将 `CombatSession.tsx` 拆分为 **1 个页面骨架 + 若干可复用 hook + 若干渲染组件**，每个文件独立小模块，拆分后 CombatSession.tsx 主体控制在 ~600 行以内（只负责组合各 hook 和渲染）。

## 用户故事

| ID | 作为… | 我希望… | 以便… |
|----|------|--------|------|
| US1 | 后续开发 agent | 能一次读入 1 个小模块（<400 行）完成功能 | 不必反复重读 3k 行主文件 |
| US2 | DM 玩家 | 所有拆分后的功能行为完全不变 | 不用重新学习 UI |
| US3 | 维护者 | 先攻/攻击/放映/手动记录 等子域各自独立文件 | 修改放映回溯不影响先攻拖拽 |

## 输入输出与边界

### 输入
- 现有 CombatSession.tsx 的全部功能（包括本对话前刚加的死亡豁免/装填武器每回合一次/startPlayback 回溯/currentTurn 纯 combatantId）

### 输出
- 新目录结构：
  - `src/hooks/combat/useInitiative.ts` — 先攻相关（参战者增删/先攻掷骰/平局排序/拖拽重排/initiative 编辑）
  - `src/hooks/combat/useDamageAndHp.ts` — HP 变更/伤害结算/昏迷死亡/死亡豁免生命周期
  - `src/hooks/combat/useActions.ts` — 动作机制（currentMode/canUseAction/consumeCombatantAction/markLoadingAttacked/resetCombatantActions）
  - `src/hooks/combat/useThrownDrop.ts` — 投掷武器掉落（chebyDist/calcThrownDropPos/executeThrownDrop）
  - `src/hooks/combat/useSurprise.ts` — 突袭窗口（openSurpriseAttackModal/confirmSurpriseAttack）
  - `src/hooks/combat/usePlayback.ts` — 放映模式全流程（模式切换快照/commitModeChange/handleModeChange/finalizeExitPlayback/startPlayback）
  - `src/hooks/combat/useRoundTurn.ts` — 回合推进（findNextValidTurn/advanceTurn/autoFillDownedMarkers/takeTurnSnapshot/applyRollback）
  - `src/hooks/combat/useManualRecord.ts` — 手动记录（confirmManualRecord/cancelManualRecord/对应弹窗状态）
  - `src/hooks/combat/useCombatInventories.ts` — 战斗背包派生（getEffectiveAc/combatInventories 记忆化/deriveCombatInventory 调用）
  - `src/components/combat/InitiativeTable.tsx` — 先攻表格渲染（含回合格子的开始放映/记录/手动输入/回溯按钮）
  - `src/components/combat/CombatantList.tsx` — 参战者列表（增删按钮/先攻编辑/突袭标记/批量删除选择）
  - `src/components/combat/PlaybackToolbar.tsx` — 放映模式工具栏（模式切换/当前回合显示/确认完成回合/退出放映确认）
  - `src/components/combat/ManualRecordDialog.tsx` — 手动记录弹窗（攻击/恢复两种类型）
  - `src/components/combat/TiebreakerDialog.tsx` — 先攻平局拖拽排序弹窗
  - `src/components/combat/InitiativeRollDialog.tsx` — PC 先攻投掷弹窗
  - `src/components/combat/RollbackConfirmDialog.tsx` — 回溯确认弹窗
  - `src/components/combat/SurpriseDialog.tsx` — 突袭选择弹窗
  - 保留原文件：`src/pages/CombatSession.tsx`（页面骨架 + Battleground + 攻击/伤害/法术弹窗 + NPC创建器）

### 验收标准

✅ 正常（无 bug）：
- `npx tsc --noEmit` 零错误
- `npm run build` 零错误
- 先攻增删/掷骰/平局拖拽/initiative 编辑 行为与拆分前完全一致
- 攻击 → 伤害 → HP 变化 → 昏迷 → 死亡豁免自动待办 行为与拆分前完全一致
- 放映模式：切换快照 / startPlayback 回溯 / 回合推进 / 装填武器每回合一次 / 死亡豁免累计 行为与拆分前完全一致
- 手动记录：攻击型/恢复型写入先攻表格和 HP 变化 行为与拆分前完全一致
- 非装填武器动作数量/装填武器每回合一次 行为与拆分前完全一致
- 投掷武器命中/未命中掉落位置 行为与拆分前完全一致

⚠️ 异常（可降级）：
- 某个子 hook 内部读 store 时，如有 `record` 闭包未及时刷新，可用 `combatStore.get(record.id)` 兜底（与原代码策略一致）
- ref 共享（rollbackSnapshotRef / playbackSnapshotRef）可由 CombatSession 顶层创建后作为 prop 或通过返回接口传给子 hook

❌ 排除（不做）：
- 不改变任何 UI 样式
- 不改变任何业务规则（如先攻排序算法/死亡豁免判定数值）
- 不拆分 CombatAttackModal / CombatDamageModal / CombatSpellModal / NpcCreator / Battleground 等已独立文件的组件
- 不拆分成 `pages/combat/` 多页面，仍为单页面 CombatSession
- 不引入新的第三方依赖
