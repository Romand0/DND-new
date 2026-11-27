# 战斗状态持久化进 CombatRecord — 技术设计

## 背景

statusManager 是纯内存单例：hidden / 专注 / 死亡豁免等状态机实例刷新页面即全丢（参战者 HP 却还在），换端/交接时战斗不可恢复。状态实例已带 `combatId`，只需把「内存状态机 ↔ CombatRecord」桥接起来。

## 模型

- `CombatRecord.statusInstances?: StatusInstance[]`：该战斗的**活跃**实例（历史已结束实例不持久化，避免记录无限膨胀）
- `TurnSnapshot.statusInstances?: StatusInstance[]`：回合快照一并捕获状态机（回溯/从头放映还原状态）
- 持久化字段走 combatStore.load() **白名单重建**（否则下次保存被抹掉——与 heldLeft 同坑）
- 云备份自动生效：combatStore.save 的 `syncListDiff('combat')` 整记录上传

## 桥接模块 `src/data/statusPersistence.ts`

| 函数 | 语义 |
|------|------|
| `hydrateCombatStatuses(recordId)` | 每场战斗只水合一次（模块级 Set 防重）；记录无 statusInstances 时保持内存现状（老数据零迁移） |
| `persistCombatStatuses(recordId)` | 内存活跃实例写回记录；JSON 相等跳过（避免 updatedAt 空转） |
| `startStatusPersistence(recordId)` | 订阅状态变更 → 100ms 防抖写回；清理时立即补写（防 100ms 内离开丢改动） |

## statusManager 新增 API

- `getActiveCombatInstances(combatId)`：按 combatId 取活跃实例（深拷贝 metadata）
- `loadCombatInstances(combatId, instances)`：整场替换（hydration / 回溯），逐条广播 `start` 供订阅方刷新（含广播投影）

## 快照抽取 `src/data/turnSnapshot.ts`

`buildTurnSnapshot(recordId)` 统一 useRoundTurn.takeTurnSnapshot 与 usePlayback 初始快照两处近似重复的构建逻辑（combatants / rounds / roundsDm / 沙盘 / 装备 / 法术位 / 特性 / **statusInstances**）。

## 还原点（三处，与 roundsDm 同构）

1. `useRoundTurn.applyRollback`：`snap.statusInstances` 存在才还原（legacy 快照缺字段保持内存现状）
2. `usePlayback.finalizeExitPlayback`（丢弃恢复）
3. `usePlayback.startPlaybackFromBeginning`

## 集成

`CombatSession` 记录加载 effect 旁挂：`hydrateCombatStatuses(record.id)` + `startStatusPersistence(record.id)`（deps `[record?.id]`）。

## 不做

- 已结束实例的历史持久化（内存即弃）
- 状态实例跨记录迁移（combatId 隔离）
- 玩家端水合（玩家端吃投影，不跑状态机）

## 验证

- 新探针 `probe-status-persistence.cjs`：防抖写回、刷新水合（含 hidden metadata）、快照捕获/还原、declareEnd 移除、白名单过滤、无变化不 bump updatedAt
- 回归：probe-hidden-per-observer / probe-search / probe-status-projection / probe-reaction
- tsc + build
