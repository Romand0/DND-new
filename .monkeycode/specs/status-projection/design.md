# 状态投影 + rounds 双通道 — 技术设计

## 背景与决策

广播投影现状造成 5 项实际代价（2026-11-26 会话定论）：
1. DM 日志与玩家旁白共用 `rounds` 通道（放映时原文下发）
2. hide 对抗可机械化但未机械（靠 DM 脑内对抗）
3. hidden 全有全无，无 per-observer 可见性
4. 状态不持久化（globalStatusManager 纯内存，reload 即丢）
5. decision_request 往返结构性浪费

用户批准修复顺序（三项独立可分别立项）：
1. **本项目**：状态全量投影进 roster + rounds 拆 DM 明细/玩家旁白双通道
2. hide 入账自动对抗 observers passiveChecks，按观察者粒度建模 hidden
3. 状态持久化进 CombatRecord

**用户设计原则（本会话确立）**：
- 保密是君子协定（等同 DM 屏幕），现阶段不为防 F12 作弊做传输层设计
- 透传与呈现是两回事：数据全量过线，默认可见性在渲染层按角色决定
- 意外渲染才是真事故；透传加密暂缓（未来加固路径是 DO 端按角色双通道过滤）

## P1 状态全量投影

### 类型（types/realtime.ts）

```ts
export interface RosterStatusEntry {
  definitionId: string;
  name: string;                  // statusLibrary.get(definitionId)?.name
  stealthTotal?: number;         // hidden 实例 metadata.stealthTotal（值不剥离，渲染层控制可见）
}
```

`CombatRosterEntry` 增加 `statuses?: RosterStatusEntry[]`。

### 投影（useCombatBroadcast.ts buildCombatDelta）

```ts
statuses: globalStatusManager.getActiveStatuses(c.id, 'combat').map(s => ({
  definitionId: s.definitionId,
  name: statusLibrary.get(s.definitionId)?.name ?? s.definitionId,
  stealthTotal: typeof s.metadata?.stealthTotal === 'number' ? s.metadata.stealthTotal : undefined,
})),
```

与 DM 侧 CombatSession 读取语义一致（scope 'combat'）。

### flush 触发

statusManager 是独立内存单例，现有订阅只挂 combatStore/battlegroundStore（useCombatBroadcast.ts:268-269）。
补：`globalStatusManager.subscribe(scheduleFlush)`（listener 签名带 event 参数，scheduleFlush 无参兼容）。

### 玩家端 UI（渲染层默认可见性）

| 落点 | 规则 |
|------|------|
| SpectatorTable | 每参战者显示状态徽章，**hidden 默认不显示**（防意外渲染） |
| MyCombatantsSection（自己的 PC） | 全部显示，hidden 显示隐匿总值 |
| SpectatorBoard | token 有 hidden → 幽灵化（半透明+虚线边） |

## P2 roundsDm 双通道

### 类型（types/combat.ts）

- `CombatRecord.roundsDm?: RoundAction[]`（与 rounds 平行、稀疏，同形状）
- `TurnSnapshot.roundsDm?: RoundAction[]`（回溯快照含 DM 明细）

### 写入路径（useRoundTurn.ts）

- `handleCellChange(round, id, value)`：写 rounds 格 + **清对应 roundsDm 格**（DM 手动编辑使机器明细失效）
- `appendRoundRecord(round, id, line, detail?)`：先 handleCellChange（清格）再写 roundsDm detail 行
- `recordOperation(combatantId, text, kind, detail?)`：透传 detail
- `takeTurnSnapshot`：快照含 roundsDm

### 明细输出（turnCommitApply.ts / combatActionSummary.ts）

新增 DM 明细行（与玩家行分离）：
- **search**：目标名 + 隐匿总值 + 掷骰拆解 + 发现/未发现结论（玩家行仍只回数量）
- **hide**：掷骰拆解 + 隐匿总值 + 观察者被动察觉清单（DC 对照）

### 消费点

- InitiativeTable：显示 `roundsDm?.[round]?.[id] || rounds[round]?.[id]`；编辑走 handleCellChange（自动清 roundsDm 格）
- CombatSession：searchFor/hideFor 的 recordOperation 调用传 detail
- useCombatBroadcast：delta 增加 `roundsDm: turn ? (record.roundsDm ?? []) : []`（透传；玩家 UI 只渲染 rounds）

## 验证

- 探针（数据级断言）：buildCombatDelta roster 含 statuses（hidden 带 stealthTotal）；search op 写 roundsDm 明细（含目标名）且玩家 rounds 行仍只回数量
- `npx tsc -p tsconfig.app.json --noEmit && npm run build`
