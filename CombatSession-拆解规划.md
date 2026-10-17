# CombatSession 拆解规划

> **目标**：将 `src/pages/CombatSession.tsx`（3646 行）拆解为 9 个 combat hooks + 9 个 combat 子组件的组合体，最终 CombatSession 仅保留顶层编排与路由逻辑（目标 < 400 行）。
>
> **原则**：每个阶段独立可验证。宁可慢一步，不可错一步。

---

## 一、现状快照

> 下列数值均为 **2026-10-14 实测**（非估算），命令见括号内。

| 项目 | 数值 |
|---|---|
| CombatSession.tsx 行数 | 3656（`wc -l`，较规划初稿 3646 微增） |
| useState 声明数 | 42（`grep -cE "useState[<(]"`） |
| useRef 声明数 | 7（`grep -cE "useRef[<(]"`） |
| useEffect 声明数 | 5（`grep -cE "useEffect\("`） |
| useMemo 声明数 | 2 |
| 已抽取 hook 文件 | 9 个，合计 1253 行（`wc -l src/hooks/combat/*.ts`） |
| 已抽取组件文件 | 8 个 combat 子组件 + CombatantInfoPanel，合计 2784 行 |
| hook/组件运行时调用 | **0**。全部靠文件顶部 `import type {}` 占位引用，CombatSession 内联实现原封未动 |
| 共享 ref（跨 hook） | `rollbackSnapshotRef`、`playbackSnapshotRef`、`autoAdvanceRef`、`autoAdvanceTimerRef`、`pausedTurnRef` |

### 1.1 当前真实进度（重要）

**实际完成度 = 阶段 0（文件骨架抽取）完成，迁移进度 0%。**

- 拆分产物（9 hook + 9 组件）是**先行落盘的目标形态**，每个 hook 内都是**完整可读的真实实现**，不是 `TODO` 空壳。
- 但 CombatSession.tsx 顶部第 1 行注释明确写着「原内容：完全保留，一个字都没改」，页面仍以 3656 行巨型单文件运行，所有内联实现与 hook 内容**并存（重复）**。
- 因此 hook/组件文件当前处于「已存在但零接线」状态，仅用于防止被当作废文件清理。

### 1.2 抽取产物已过期（接线前必须先同步）

hook 是从页面某个历史时点拷贝出来的快照，**落后于页面现行逻辑**。实测差异：

| 页面独有逻辑 | 页面出现次数 | hook 中是否存在 |
|---|---|---|
| 自动推进定时器（`autoAdvanceRef` / `autoAdvanceTimerRef`） | 有 | 无（`useRoundTurn` / `usePlayback` 均缺） |
| `handleComatoseTurn`（昏迷回合自动处理） | 有 | 无 |
| `checkAndAutoAdvance` / `pausePlayback` / `resumePlayback` / `startPlaybackFromBeginning` | 有 | 无 |
| `clearAdvantageByExpireCombatant` / `clearExpiredAdvantage` / `resetTurnTodosForRound` | 有 | 部分：`useRoundTurn` 有，其余无 |

> 结论：迁移任何一个 hook 前，必须先将其实现与页面现行版本**逐函数对齐**，不能直接 swap。`useRoundTurn` / `usePlayback` 缺口最大（缺自动推进与昏迷处理），优先级和风险需重新评估。

### 1.3 逐 hook 漂移对账（2026-10-14）

> 方法：逐个 hook 与页面同名内联实现逐行比对。**页面是权威源**（含最新特性），hook 是历史分叉。

| Hook | 页面对应实现（行号） | 漂移 | 具体差异 |
|---|---|---|---|
| `useSurprise` | openSurpriseAttackModal(867) / confirmSurpriseAttack(882) | 小 | hook 的 `confirmSurpriseAttack` 缺页面末尾的 `pendingRestartPlayback → startPlaybackFromBeginning()` 联动 |
| `useManualRecord` | confirmManualRecord(1531) / cancelManualRecord(1613) | 无 | 逐行一致；仅缺 `!record` 守卫（页面已提前 return） |
| `useCombatInventories` | combatInventories(279) + getEffectiveAc(258) | 无 | 功能一致；页面 `getEffectiveAc` 有未使用的 `changes` 变量 |
| `useDamageAndHp` | handleApplyDamage(567) / autoFillDownedMarkers(1154) | 极小 | 仅入参形式不同（hook 走 `playbackMode` prop，页面读 `record.mode`） |
| `useInitiative` | 406-533 / 536 / 1627-1671 | 小 | hook 多处新增 `!record` 守卫；其余逐行一致 |
| `useThrownDrop` | chebyDist(707) / calcThrownDropPos(713) / executeThrownDrop(764) | 小 | `executeThrownDrop` **签名被改**：hook 加 `record` 入参并返回 `ItemToken`，页面用闭包且返回 `void`（抽取时做了重构，违反 §5.4「禁止重构」） |
| `useActions` | currentMode/isPlaybackActive(643-703) | 中 | hook 用 `currentMode()` 判定可用性，**丢了 `playbackPaused` 判定**（页面走 `isPlaybackActive()`）；导致暂停期间 hook 会误消耗动作 |
| `useRoundTurn` | 1189-1528 | 大 | 双向分叉：页面 `applyRollback` 是 `async` 且走 IndexedDB（`snapDb.getBestTurnSnapshot`）+ 截断/补轮逻辑，hook 是同步纯内存简化版；页面 `takeTurnSnapshot` 双写 IDB，hook 仅内存。**反向差异**：hook 的 `advanceTurn` 含 `clearExpiredAdvantage` / `clearAdvantageByExpireCombatant`，页面 `advanceTurn` 完全没有 |
| `usePlayback` | 909-1062 | 大 | 页面 `handleModeChange` 写 IDB 初始快照、`finalizeExitPlayback` 复位 `playbackPaused/pausedTurnRef` + `deleteSessionSnapshots`；hook 完全没有 IDB / 暂停 / 从头播放 |

### 1.4 结构性缺口（hook 从未拥有的页面能力）

以下能力只存在于页面，任何 hook 里都没有；接线时若直接采用 hook 会**静默丢失**这些功能：

| 能力 | 页面实现位置 |
|---|---|
| IndexedDB 快照持久化（刷新/关闭后可回溯） | `snapDb` 导入(27)：getInitialSnapshot(194)、putInitialSnapshot(946)、deleteSessionSnapshots(988/1132)、putTurnSnapshot(1419)、getBestTurnSnapshot(1438)、deleteTurnSnapshot(1516) |
| 放映暂停 / 恢复 | `playbackPaused`(133)、`pausedTurnRef`、`pausePlayback`(997)、`resumePlayback`(1006)，共 19 处引用 |
| 自动推进（昏迷角色延迟推进） | `autoAdvanceRef`(163)、`autoAdvanceTimerRef`(165)、`checkAndAutoAdvance`(1336)、`handleComatoseTurn`(1211) |
| 从头播放 / 突袭联动 | `handleRestartPlayback`(1065)、`startPlaybackFromBeginning`(1103)、`pendingRestartPlayback`(116) |
| 战斗结束回传弹窗 | `setCommitModalOpen(true)`（advanceTurn 全灭分支，1295） |

> 反向疑点：`clearExpiredAdvantage` / `clearAdvantageByExpireCombatant` 全项目**仅被 stale hook 调用**，页面从未调用（`combatStore` 有定义无调用）。需人工判定：是页面漏调（潜在 bug），还是过期逻辑已迁移到别处。**这一项不能在「对齐到页面」时被无脑删除。**

---

## 二、依赖拓扑与迁移顺序

依赖关系决定迁移顺序——被依赖方必须先就位。

```
  ┌─────────────────────── 叶子层（零依赖）───────────────────────┐
  │  useActions          useCombatInventories    useSurprise      │
  │  useThrownDrop                                                │
  └───────────────────────────────────────────────────────────────┘
          │
          ▼
  ┌─────────────────────── 中间层 ───────────────────────────────┐
  │  useDamageAndHp  ← currentTurn, playbackMode                │
  │  useRoundTurn    ← resetCombatantActions, autoFillDownedMarkers,
  │                    rollbackSnapshotRef                       │
  └───────────────────────────────────────────────────────────────┘
          │
          ▼
  ┌─────────────────────── 消费层 ───────────────────────────────┐
  │  useInitiative    ← onAddCombatant 等回调（回指 CombatSession）│
  │  useManualRecord  ← canUseAction, handleApplyDamage,         │
  │                    handleCellChange（跨 3 个 hook）           │
  └───────────────────────────────────────────────────────────────┘
          │
          ▼
  ┌─────────────────────── 终局 ─────────────────────────────────┐
  │  usePlayback      ← 几乎全图：playbackStarted, currentTurn,  │
  │                    findNextValidTurn, takeTurnSnapshot,       │
  │                    autoFillDownedMarkers, resetCombatantActions│
  └───────────────────────────────────────────────────────────────┘
```

**迁移阶段**：

| 阶段 | Hook | 前置条件 | 风险等级 |
|---|---|---|---|
| P1-1 | `useActions` | 无 | 🟢 低 |
| P1-2 | `useCombatInventories` | 无 | 🟢 低 |
| P1-3 | `useSurprise` | 无 | 🟢 低 |
| P1-4 | `useThrownDrop` | 无 | 🟢 低 |
| P2-1 | `useDamageAndHp` | P1-1 就位（需 canUseAction） | 🟡 中 |
| P2-2 | `useRoundTurn` | P2-1 就位（需 autoFillDownedMarkers） | 🟡 中 |
| P3-1 | `useInitiative` | P1-1 就位（需部分回调） | 🟡 中 |
| P3-2 | `useManualRecord` | P1-1 + P2-1 + P2-2 全部就位 | 🟠 高 |
| P4 | `usePlayback` | P1 ~ P3 全部就位 | 🔴 最高 |

---

## 三、每个阶段的操作规程

### 3.1 标准迁移步骤（每个 hook 逐一执行）

```
Step 1  将 import type {} 改为 import { useXxx }
Step 2  在 CombatSession 函数体内调用 hook，传入所需 props
Step 3  从 hook 返回值中解构出状态与回调
Step 4  删除 CombatSession 中被 hook 接管的 useState 声明
Step 5  全局搜索被删变量名，修正所有引用指向 hook 返回值
Step 6  删除因迁移而变为死代码的函数/计算属性
Step 7  运行 TypeScript 类型检查（tsc --noEmit）
Step 8  启动 dev server，执行冒烟测试清单
Step 9  更新本文档「进度看板」
```

### 3.2 冒烟测试清单（每阶段必做）

| # | 测试场景 | 验证点 |
|---|---|---|
| 1 | 参战：添加 PC / NPC | 先攻排序正确，先攻表格出现 |
| 2 | 先攻：投掷 / 编辑 / 平局拖拽 | 弹窗交互正常，排序生效 |
| 3 | 攻击：攻击检定 → 命中/未命中 | 弹窗流程完整，结果写入先攻表格 |
| 4 | 伤害：应用伤害 → HP 更新 → 昏迷/死亡 | 状态转换正确，死亡豁免待办出现 |
| 5 | 法术：施放流程 | 法术弹窗独立运作 |
| 6 | 放映：启动 → 暂停 → 恢复 → 推进回合 | 回合推进正确，快照可回溯 |
| 7 | 回溯：删格 → 还原 HP/沙盘 | 回溯不丢数据 |
| 8 | 退出放映：保存 / 丢弃 | 两种路径结果正确 |
| 9 | 突袭：设置突袭轮 → 确认 → 自动放映 | 突袭标记和自动放映联动 |
| 10 | 手动记录：攻击 / 恢复 | 手动记录写入正确 |
| 11 | 投掷武器掉落 | 掉落位置和装备扣除正确 |
| 12 | 批量操作 / 批量删除 NPC | 多选交互正常 |

---

## 四、关键风险与对策

### 4.1 状态所有权冲突（最高优先级）

CombatSession 和 hook 中**重复声明了同一组 useState**。迁移时必须保证：
- 每个 state 只存在 **1 处声明**
- 迁移到 hook 后，CombatSession 中对应 `useState` **必须删除**
- 所有消费该 state 的地方改为从 hook 返回值解构

**易遗漏点**：JSX 中直接内联使用 state（如 `onClick={() => setXxx(...)}`），grep 搜索时需覆盖 JSX 属性。

### 4.2 共享 Ref 归属

以下 ref 被 **多个 hook + CombatSession** 同时读写，**不能搬进任何单个 hook**：

| Ref | 消费方 | 归属策略 |
|---|---|---|
| `rollbackSnapshotRef` | useRoundTurn, usePlayback, CombatSession | 留在 CombatSession，作为 prop 传入 |
| `playbackSnapshotRef` | usePlayback, CombatSession | 同上 |
| `autoAdvanceRef` | CombatSession 放映推进逻辑 | 留在 CombatSession |
| `autoAdvanceTimerRef` | 同上 | 留在 CombatSession |
| `pausedTurnRef` | usePlayback, CombatSession | 留在 CombatSession |

### 4.3 `record` 闭包陷阱

- hook 内部通过参数接收 `record`，但 `record` 是 React state
- 异步操作（setTimeout、Promise）中闭包可能读到旧值
- 原文件中已有 `combatStore.get(record.id)` 的"读最新值"模式，迁移时必须保留
- **规则**：hook 中涉及异步或定时器的逻辑，必须从 `combatStore.get()` 取最新值，不可依赖闭包中的 `record`

### 4.4 类型强转对齐

`useSurprise` 中存在 `as unknown as React.Dispatch<SetStateAction<Set<string>>>` 强转。
迁移时必须确保 CombatSession 消费侧的类型与 hook 返回值类型**完全一致**，消除强转。

### 4.5 Hook 调用顺序

React 要求 hook 调用顺序在每次渲染间保持一致。迁移后的调用顺序必须：
- `useActions` 最先（其他 hook 可能依赖其返回值）
- `usePlayback` 最后（依赖几乎所有前置 hook）
- 不可在任何条件分支内调用 hook

---

## 五、工作流规范

### 5.1 分支与提交

| 规范 | 说明 |
|---|---|
| 分支命名 | `refactor/combat-session-p{阶段号}`，如 `refactor/combat-session-p1-1` |
| 提交粒度 | 每个 hook 完成迁移 + 验证后提交一次，不跨 hook 提交 |
| 提交信息 | `refactor(combat): migrate useXxx from CombatSession monolith` |
| 禁止事项 | ❌ 不允许同时迁移两个 hook；❌ 不允许跳过冒烟测试提交 |

### 5.2 验证门禁

每个阶段必须通过以下检查才能进入下一阶段：

```
□ tsc --noEmit 零错误
□ dev server 正常启动
□ 冒烟测试清单中与已迁移 hook 相关场景全部通过
□ CombatSession 行数较上一阶段减少
□ 无遗留的重复 useState 声明（grep 验证）
□ import type {} 引用数较初始值递减
```

### 5.3 回滚策略

- 每个阶段开始前确认当前 git 状态干净
- 若迁移中发现无法解决的问题，`git checkout -- .` 回滚到上一阶段完成点
- 不允许部分回滚（如只回滚 hook 调用但保留 useState 删除）

### 5.4 Agent 行为约束

| 约束 | 说明 |
|---|---|
| 单次任务范围 | 一次只处理 1 个 hook 的迁移 |
| 代码修改范围 | 仅修改 `CombatSession.tsx` 本身 + 该 hook 文件（如需调整接口） |
| 搜索范围 | 修改后必须 grep 全项目确认无遗漏引用 |
| 禁止重构 | 迁移过程中不做与当前 hook 无关的任何重构（不改其他文件逻辑） |
| 状态声明检查 | 每步操作后自动 grep 验证被迁移 state 在 CombatSession 中仅剩 0 处 `useState` 声明 |

---

## 六、组件迁移（Hook 迁移完成后执行）

Hook 迁移完成后，9 个 combat 子组件的迁移相对简单——它们是纯展示/交互组件，状态由 hook 提供。

| 组件 | 预计依赖的 hook | 复杂度 |
|---|---|---|
| `CombatantList` | useInitiative | 中 |
| `InitiativeTable` | useRoundTurn, useActions | 高 |
| `InitiativeRollDialog` | useInitiative | 低 |
| `InitiativeTiebreakerDialog` | useInitiative | 低 |
| `ManualRecordDialog` | useManualRecord | 中 |
| `PlaybackToolbar` | usePlayback, useRoundTurn | 高 |
| `RewindDialog` | useRoundTurn | 中 |
| `SurpriseAttackDialog` | useSurprise | 低 |
| `QuickCreateCombatDialog` | 无（纯 UI） | 低 |

组件迁移顺序：低复杂度优先，按依赖 hook 就位顺序推进。

---

## 七、进度看板

> **使用方式**：每完成一个阶段，将对应状态从 `⬜` 改为 `✅`，并填写完成日期与备注。

### Hook 迁移

| 阶段 | Hook | 状态 | 完成日期 | CombatSession 行数 | 备注 |
|---|---|---|---|---|---|
| P0 | 文件骨架抽取（hook + 组件落盘，`import type {}` 占位） | ✅ | — | 3646→3656 | 产物完整但**过期**，见 §1.2 |
| P1-1 | useActions | ✅ | 2026-10-17 | 2682 | 方案 A 重新抽取：hook 签名 `useActions(record, { playbackStarted, playbackPaused, currentTurn })`，可用性统一走 isPlaybackActive()（**playbackPaused 判定已补回**，暂停期间按模拟模式处理——恒可用/不消耗/不标记装填）；**裁定：丢弃 hook 版自加的 isIncapacitated/isUnconscious/isDead 门控**（页面无此判定，对齐页面权威；isIncapacitated 辅助函数无消费者一并移除）；hook 调用置于 record-loading effect 之后（依赖 useRoundTurn 的 playbackStarted/currentTurn）；useRoundTurn 惰性箭头注释已同步更新；删内联动作机制块 -63 行；占位 11→10 |
| P1-2 | useCombatInventories | ✅ | 2026-10-16 | 3507 | 零漂移直接接线（页面版 `getEffectiveAc` 含一行未使用死代码 `const changes`，hook 已去掉）；同时清掉页面对 `computeCombatantAc` 的 import |
| P1-3 | useSurprise | ✅ | 2026-10-14 | 3611 | Pilot：按方案 A 重新抽取并真实接线；`onConfirmed` 承接 `pendingRestartPlayback → startPlaybackFromBeginning` 联动；tsc/build/dev 三验通过 |
| P1-4 | useThrownDrop | ✅ | 2026-10-17 | 3245 | 小漂移对账：chebyDist/calcThrownDropPos 逐行一致；executeThrownDrop 按 §9.3 第二路径「同步更新调用点」——保留 hook 显式 `record` 入参 + 返回 `ItemToken`，页面 2 个调用点（命中/未命中）在 usageMode 前插入 `record`；删内联 3 函数（-161 行）；清死 import `getCombatInventoryRaw`/`ItemToken`；占位 14→13；tsc/build 双验通过 |
| P2-1 | useDamageAndHp | ✅ | 2026-10-16 | 3406 | 小漂移对账：hook 仅多 `!record` 守卫、`playbackMode` 改为 props 传入（页面语义等价）；删 handleApplyDamage + autoFillDownedMarkers 内联（~100 行） |
| P2-2 | useRoundTurn | ✅ | 2026-10-17 | 2732 | 方案 A 重新抽取（页面为权威源）：hook 带上完整页面能力——IDB 双写快照（takeTurnSnapshot/applyRollback 走 snapDb）、自动推进（checkAndAutoAdvance + handleComatoseTurn 含 PC death_save 待办判定/NPC 自动掷骰）、全灭 → setCommitModalOpen、rewindModal 弹窗状态；autoAdvanceRef/autoAdvanceTimerRef/rollbackSnapshotRef 按 §4.2 留在页面以 props 传入；**clearExpiredAdvantage 裁定：保留**（AGENTS.md §5.13 记载的设计行为，页面此前漏调，接线时补齐 3 个分支）；resetCombatantActions/isPlaybackActive 惰性箭头传入；hook 调用必须置于 playback effect 之前（L173/197 依赖数组渲染期读取 playbackStarted）；删除 autoFillDownedMarkers 死 prop（仅 startPlayback 用，P4 时给 usePlayback）；TurnSnapshot 改用 types/combat 共享类型并对 stale usePlayback 再导出；删 4 state + 10 内联函数（-325 行）；占位 12→11；注意：本仓库 `npx tsc --noEmit` 为 no-op（solution-style tsconfig），真门禁是 `tsc -b`（本次 `tsc -b --force` 才暴露 stale usePlayback 的缓存掩盖问题） |
| P3-1 | useInitiative | ✅ | 2026-10-17 | 3057 | 小漂移对账：除 hook 多 `!record` 守卫外逐行一致，直接接线；接口清理：删除从未被 hook 内部调用的 4 个死 props（onAddCombatant/onRemoveCombatant/onAddNpc/onBatchAddNpc，避免 handleAddCombatant 依赖 hook setter 的循环依赖），editingInitiative/initiativeInput 由页面死代码移入 hook 内部持有（内联编辑 UI 已只读化，无 JSX 调用方）；页面删 7 state + cardRefs + 9 内联函数；占位 13→12；tsc/build/dev 三验通过 |
| P3-2 | useManualRecord | ✅ | 2026-10-16 | 3533 | hook 与页面逐行对账零漂移（仅多 `!record` 守卫），直接接线；4 个依赖函数在 `!isDM` 早退之后定义，以惰性箭头传入规避 TDZ；删 9 个 state + confirm/cancel 内联 |
| P4 | usePlayback | ✅ | 2026-10-17 | 2468 | 方案 A 重新抽取：拥有 playbackPaused/pausedTurnRef/playbackSnapshotRef/exitPlaybackModalOpen/pendingRestartPlayback 5 个状态与 commitModeChange/handleModeChange/finalizeExitPlayback/pausePlayback/resumePlayback/startPlayback/handleRestartPlayback/startPlaybackFromBeginning 全链路；**initial 快照 IDB 持久化收口在 hook**（handleModeChange 写入 putInitialSnapshot，finalizeExitPlayback/startPlaybackFromBeginning 清理 deleteSessionSnapshots，陈旧 hook 均缺）；调用顺序：record-loading effect 之后、useActions 之前（isPlaybackActive 依赖 playbackPaused）；对 useRoundTurn 直接传 playbackStarted/currentTurn/findNextValidTurn/checkAndAutoAdvance/takeTurnSnapshot，对 useActions/useDamageAndHp/useSurprise 用惰性箭头（resetCombatantActions/autoFillDownedMarkers/openSurpriseAttackModal）；startPlayback 增加 selectedCell prop；**裁定：丢弃陈旧 hook startPlayback 的"还原快照+清空选中格后记录"逻辑**（页面权威版为纯扫描启动，完整回溯已由 useRoundTurn.applyRollback + startPlaybackFromBeginning 分担，§5.11 描述系陈旧 hook 时代设计）；页面 2682→2468（-214），占位 10→9 |

### 组件迁移

| 组件 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| SurpriseAttackDialog | ✅ | 2026-10-17 | 预抽取与页面逐字一致，直接接线（open 布尔包裹 + 7 props 直传 useSurprise 输出）；页面 2468→2415（-53），占位 9→8；分支 refactor/combat-session-p6-1（堆叠于 p4） |
| InitiativeRollDialog | ✅ | 2026-10-17 | 预抽取与页面行为等价（dexMod/total 计算与禁用条件一致，组件内部 `!open || !selectedPc` 自守卫替代页面双重包裹）；onClose 为三 setter 组合以惰性箭头传入；onConfirm=handleConfirmInitiative（useInitiative 输出）；页面 2415→2341（-74），占位 8→7；分支 refactor/combat-session-p6-2（堆叠于 p6-1） |
| InitiativeTiebreakerDialog | ✅ | 2026-10-17 | 预抽取与页面逐字一致，直接接线（9 props：tiedOrder/cardRefs/draggingIndex + 拖拽三回调 handleDragStart/Move/End + handleConfirmTiebreaker，均 useInitiative 输出；onClose 两 setter 组合惰性箭头）；页面 2341→2278（-63），占位 7→6；分支 refactor/combat-session-p6-3（堆叠于 p6-2） |
| RewindDialog | ✅ | 2026-10-17 | 预抽取与页面行为等价；**关键差异：firstClickDone 由页面 rewindModal state 改为组件局部 useState，必须保留 `{rewindModal && ...}` 包裹强制重挂载**（组件 open=false 时不卸载，局部状态会残留）；onRewind 惰性箭头捕获 rewindModal.round/combatantIdx；页面 2278→2222（-56） |
| ManualRecordDialog | ✅ | 2026-10-17 | 预抽取与页面全量对账一致（攻击/恢复双模板 + AC 命中判定 + 预览文本）；attacker 解析差异等价：页面在 map 内经 selectedCell 查找 → 组件 attackerId prop（`selectedCell?.combatantId ?? ''`）；315 行内联 JSX 行号脚本替换；页面 2222→1931（-291），占位 6→5 |
| CombatantList | 🗑️ 已删除 | 2026-10-17 | **页面无对应 UI 区块，经用户裁定废弃删除**：参战者卡片列表的批量选择/先攻/删除/信息按钮均已并入先攻表格 `<th>` 表头（P3-1 时内联编辑已只读化），接线会引入重复 UI；已 `git rm` 组件文件 + 移除占位导入，git 历史可随时找回 |
| PlaybackToolbar | ✅ | 2026-10-17 | **方案 A 重写**（陈旧抽取漂移过大：缺从头播放/暂停恢复，完成回合按钮位置错误）：组件 = 模式切换栏 + 右上角按钮组（暂停/恢复/退出）两个 Fragment，页面两处内联（651-690 + 1418-1456）合一；8 props（mode/playbackStarted/playbackPaused/onModeChange/onRestartPlayback/onPausePlayback/onResumePlayback/onExitPlayback）；页面 1654→1585（-69） |
| InitiativeTable | ✅ | 2026-10-17 | **方案 A 重写**（陈旧抽取违反 §5.12：currentTurn 含 combatantIdx；还含死代码 editingInitiative 内联编辑）：以页面 312 行表格 JSX 为权威重写——th 卡片式表头（序号/死亡红叉/批量勾选/信息按钮/只读先攻/HP/删除）+ tbody 单元格（被突袭/编辑 textarea/选中操作面板：开始放映/记录/手动输入/回溯到此，currentTurn 比较 findIndex 实时计算）；新增 playbackPaused prop（暂停不高亮）；onOpenManualRecord 收敛页面重复 2 次的 8-setter 重置序列；页面 1931→1654（-277），占位 5→3 |
| CombatantInfoPanel | ✅ | 2026-10-17 | **早已真实接线**（页面 48 行真导入 + infoPanel IIFE 使用），仅清理冗余占位导入；无需改动 |
| QuickCreateCombatDialog | ✅ 已有 | — | 纯 UI 组件，页面已在使用（规划 §六 列出但本就完成） |

### 验证门禁记录

| 阶段 | tsc | 冒烟 | 行数递减 | 无重复声明 | 门禁通过 |
|---|---|---|---|---|---|
| P1-1 | — | — | — | — | — |
| P1-2 | — | — | — | — | — |
| P1-3 | — | — | — | — | — |
| P1-4 | — | — | — | — | — |
| P1-1 | ✅ 零错误 | dev 启动 ✅；动作/暂停场景待人工 | 2732→2682 ✅ | ✅ grep 验证 | ✅（待人工冒烟补录） |
| P2-1 | — | — | — | — | — |
| P2-2 | ✅ `tsc -b --force` 零错误 | dev 启动 ✅；放映/回溯场景待人工 | 3057→2732 ✅ | ✅ grep 验证 | ✅（待人工冒烟补录） |
| P3-1 | ✅ 零错误 | dev 启动 ✅；战斗流程场景待人工 | 3245→3057 ✅ | ✅ grep 验证 | ✅（待人工冒烟补录） |
| P3-2 | — | — | — | — | — |
| P4 | ✅ 零错误 | dev 启动 ✅；放映/暂停/恢复/回溯/刷新恢复场景待人工 | 2682→2468 ✅ | ✅ grep 验证 | ✅（待人工冒烟补录） |
| P6 批次 | ✅ `tsc -b --force` 零错误 | dev 启动 ✅（每组件接续 + 批次末各探活一次）；弹窗/表格/工具条交互待人工 | 2468→1580 ✅ | ✅ grep 验证（**占位归零**，CombatantList 经用户裁定删除） | ✅（待人工冒烟补录） |

---

## 八、最终验收标准

```
□ CombatSession.tsx 行数 < 400
□ 零个 import type {} 占位引用
□ 9 个 hook 全部以真实 import 调用
□ 9 个子组件全部以真实 import 渲染
□ tsc --noEmit 零错误
□ 全量冒烟测试通过
□ 无重复 useState 声明（grep 验证）
□ 无共享 ref 被错误搬入单个 hook
□ git diff --stat 显示 CombatSession.tsx 大幅减少、hook 文件无变化
```

---

## 九、下一步（2026-10-14 重新基线）

原计划假设 hook「已就绪可直接接线」，实测证伪：hook 是**双向分叉的历史快照**，直接接线会丢功能（IDB 快照、暂停、自动推进、从头播放）且引入暂停期误扣动作。因此**下一步不是按 §二 顺序接线，而是先做「重新基线」**。

### 9.1 推荐动作：三选一（已给出推荐）

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **A. 重新抽取（推荐）** | 以页面现行代码为准，重新生成每个 hook 的 body，再接线删除内联 | 不丢任何页面特性；一次到位；消除双向分叉 | 相当于把 §三 的「迁移」重做一遍，但更可靠 |
| B. 前向对齐 | 把 stale hook 逐函数改动到与页面一致，再接线 | 保留已写好的 hook 骨架 | 双向分叉下等于两边都要改，且易漏 |
| C. 放弃 hook，改抽组件 | 只做 §六 组件迁移，逻辑留页面 | 风险最低 | 不解决 3656 行问题，治标不治本 |

推荐 **方案 A**。

### 9.2 执行顺序（先易后难，先验证管线）

1. **Pilot：`useSurprise`（验证管线）** — 漂移最小之一，先跑通「重新抽取 → 接线 → 删内联 → tsc/build」全流程，量出单 hook 成本。
2. **零/极小漂移组**：`useManualRecord`、`useCombatInventories`、`useDamageAndHp`。
3. **小漂移组**：`useInitiative`、`useThrownDrop`（同时修回被擅自改动的签名）。
4. **中漂移**：`useActions`（必须补回 `playbackPaused` 判定）。
5. **大漂移**：`useRoundTurn`、`usePlayback`（重新抽取时**必须带上 IDB / 暂停 / 自动推进 / 从头播放**；并先裁定 `clearExpiredAdvantage` 归属）。
6. 最后做 **§六 组件迁移**。

### 9.3 接线前置约束（新增，原文档未覆盖）

- [ ] 每个 hook 重新抽取后，必须与页面**逐行**比对通过，才能删内联
- [ ] 涉及 `snapDb` / `playbackPaused` / `autoAdvance*` / `pendingRestartPlayback` 的 hook，接线后必须跑冒烟清单中对应场景（放映启动、暂停恢复、刷新后回溯、从头播放）
- [ ] 裁定 `clearExpiredAdvantage` 是否应保留（页面当前未调用，见 §1.4 反向疑点）
- [ ] `useThrownDrop.executeThrownDrop` 恢复页面原签名或同步更新所有调用点
- [ ] 每次接线后立即 `tsc --noEmit && npm run build`，并确认 `import type {}` 占位逐条减少

### 9.4 Pilot 结果（useSurprise，2026-10-14）

| 指标 | 结果 |
|---|---|
| 方式 | 方案 A：以页面为权威源重写 `useSurprise.ts`，再接线、删内联 |
| CombatSession 行数 | 3656 → 3611（-45） |
| `useSurprise.ts` 行数 | 53 → 92（新增 helper 与 `onConfirmed` 回调） |
| `import type {}` 占位 | 18 → 17 |
| 同步状态 | `surpriseAttackOpen/Round`、`surprisedCombatants` 三处 `useState` 删除，改由 hook 持有；`pendingRestartPlayback` 留在页面 |
| 门禁 | `tsc -b` 零错误、`vite build` 成功、`vite dev` 正常启动 |
| 结论 | 管线跑通，单 hook 成本可接受；方案 A 有效 |

**遗留待办**（接线中发现的非阻塞项）：
- `handleRestartPlayback` 用 `openSurpriseAttackModal(0)` 替代原来的三连 set。二者在场景 A/B 下等价（该轮无突袭标记 → 选中集恒为空），已人工确认。
- `onConfirmed` 在页面中引用后声明的 `startPlaybackFromBeginning`（闭包内引用，运行期安全；tsc 通过）。后续 hook 若涉及同类回调，保持「页面提供回调、hook 只调用」的边界。