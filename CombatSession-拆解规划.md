# CombatSession 拆解规划

> **目标**：将 `src/pages/CombatSession.tsx`（3646 行）拆解为 9 个 combat hooks + 9 个 combat 子组件的组合体，最终 CombatSession 仅保留顶层编排与路由逻辑（目标 < 400 行）。
>
> **原则**：每个阶段独立可验证。宁可慢一步，不可错一步。

---

## 一、现状快照

| 项目 | 数值 |
|---|---|
| 原文件行数 | 3646 |
| useState 声明数 | ~40+ |
| useRef 声明数 | ~8 |
| useEffect 声明数 | ~10 |
| 已抽取 hook 文件 | 9（全部仅 `import type {}` 引用，零运行时调用） |
| 已抽取组件文件 | 9（同上，零运行时调用） |
| 共享 ref（跨 hook） | `rollbackSnapshotRef`、`playbackSnapshotRef`、`autoAdvanceRef`、`autoAdvanceTimerRef`、`pausedTurnRef` |

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
| P1-1 | useActions | ⬜ | — | 3646 | — |
| P1-2 | useCombatInventories | ⬜ | — | — | — |
| P1-3 | useSurprise | ⬜ | — | — | — |
| P1-4 | useThrownDrop | ⬜ | — | — | — |
| P2-1 | useDamageAndHp | ⬜ | — | — | — |
| P2-2 | useRoundTurn | ⬜ | — | — | — |
| P3-1 | useInitiative | ⬜ | — | — | — |
| P3-2 | useManualRecord | ⬜ | — | — | — |
| P4 | usePlayback | ⬜ | — | — | — |

### 组件迁移

| 组件 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| CombatantList | ⬜ | — | — |
| InitiativeTable | ⬜ | — | — |
| InitiativeRollDialog | ⬜ | — | — |
| InitiativeTiebreakerDialog | ⬜ | — | — |
| ManualRecordDialog | ⬜ | — | — |
| PlaybackToolbar | ⬜ | — | — |
| RewindDialog | ⬜ | — | — |
| SurpriseAttackDialog | ⬜ | — | — |
| QuickCreateCombatDialog | ⬜ | — | — |

### 验证门禁记录

| 阶段 | tsc | 冒烟 | 行数递减 | 无重复声明 | 门禁通过 |
|---|---|---|---|---|---|
| P1-1 | — | — | — | — | — |
| P1-2 | — | — | — | — | — |
| P1-3 | — | — | — | — | — |
| P1-4 | — | — | — | — | — |
| P2-1 | — | — | — | — | — |
| P2-2 | — | — | — | — | — |
| P3-1 | — | — | — | — | — |
| P3-2 | — | — | — | — | — |
| P4 | — | — | — | — | — |

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