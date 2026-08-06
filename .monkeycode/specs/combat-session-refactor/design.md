# CombatSession.tsx 模块化拆分 — 设计文档

## 涉及文件清单（按 dnd-tool-core.md §一 速查表定位）

| 分类 | 文件 | 动作 | 说明 |
|------|------|------|------|
| 页面 | `src/pages/CombatSession.tsx` | 修改（瘦身） | 保留：顶层 state/ref、useEffect 加载、授权校验、页面整体布局、Battleground、攻击/伤害/法术/NPC 弹窗。移除：各子域逻辑，改由 hook 接管 |
| 新 hook | `src/hooks/combat/useInitiative.ts` | 新增 | 先攻管理：参战者增删、先攻掷骰、平局排序、触屏拖拽、initiative 编辑、批量删除 |
| 新 hook | `src/hooks/combat/useDamageAndHp.ts` | 新增 | HP/状态：handleApplyDamage、死亡豁免自动生命周期、autoFillDownedMarkers |
| 新 hook | `src/hooks/combat/useActions.ts` | 新增 | 动作机制：currentMode、canUseAction、consumeCombatantAction、markLoadingAttacked、resetCombatantActions |
| 新 hook | `src/hooks/combat/useThrownDrop.ts` | 新增 | 投掷武器掉落：chebyDist、calcThrownDropPos、executeThrownDrop |
| 新 hook | `src/hooks/combat/useSurprise.ts` | 新增 | 突袭：openSurpriseAttackModal、confirmSurpriseAttack、surpriseRound state |
| 新 hook | `src/hooks/combat/usePlayback.ts` | 新增 | 放映模式：commitModeChange、handleModeChange、finalizeExitPlayback、startPlayback、exitPlaybackModal state |
| 新 hook | `src/hooks/combat/useRoundTurn.ts` | 新增 | 回合推进：findNextValidTurn、advanceTurn、takeTurnSnapshot、applyRollback、currentTurn/playbackStarted state、endTurn confirm modal |
| 新 hook | `src/hooks/combat/useManualRecord.ts` | 新增 | 手动记录：confirmManualRecord、cancelManualRecord、所有 manualXxx state |
| 新 hook | `src/hooks/combat/useCombatInventories.ts` | 新增 | 战斗背包派生：getEffectiveAc、combatInventories 记忆化 |
| 新组件 | `src/components/combat/InitiativeTable.tsx` | 新增 | 先攻表格渲染 + 回合格子的开始放映/记录/手动输入/回溯按钮 |
| 新组件 | `src/components/combat/CombatantList.tsx` | 新增 | 参战者卡片列表 + 增删按钮 + 先攻编辑 + 批量删除 |
| 新组件 | `src/components/combat/PlaybackToolbar.tsx` | 新增 | 放映模式工具栏 + 模式切换/当前回合显示/确认完成回合/退出放映 |
| 新组件 | `src/components/combat/ManualRecordDialog.tsx` | 新增 | 手动记录弹窗 |
| 新组件 | `src/components/combat/TiebreakerDialog.tsx` | 新增 | 先攻平局拖拽排序弹窗 |
| 新组件 | `src/components/combat/InitiativeRollDialog.tsx` | 新增 | PC 先攻投掷弹窗 |
| 新组件 | `src/components/combat/RollbackConfirmDialog.tsx` | 新增 | 回溯确认弹窗（双击确认） |
| 新组件 | `src/components/combat/SurpriseDialog.tsx` | 新增 | 突袭选择弹窗 |
| 文档 | `AGENTS.md` | 修改 | §2.2 目录速查、§0 速查表 新增条目 |
| 文档 | `.trae/rules/dnd-tool-core.md` | 修改 | 对应速查表条目（如新增新组件/hook 类型） |

## 核心调用链路

### 1. 顶层共享状态（由 CombatSession.tsx 创建后通过参数传入各 hook）

这些 state/ref 被多个子域共享，不能藏在单个 hook 里：
```ts
// CombatSession.tsx 顶层
const [record, setRecord] = useState<CombatRecord | null>(null);
const [selectedCell, setSelectedCell] = useState<{ round: number; combatantId: string } | null>(null);
const [editingCell, setEditingCell] = useState<... | null>(null);
const [editingInitiative, setEditingInitiative] = useState<string | null>(null);
const [initiativeInput, setInitiativeInput] = useState('');
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [batchMode, setBatchMode] = useState(false);
const [attackModal, setAttackModal] = useState<{ attacker: Combatant; target: Combatant; targetId?: string } | null>(null);
const [damageModal, setDamageModal] = useState<{ info: DamageInfo; target: Combatant; targetCharacter?: Character } | null>(null);
const [spellModal, setSpellModal] = useState<{ caster: Combatant } | null>(null);
const [rewindModal, setRewindModal] = useState<{ round: number; combatantId: string; combatantIdx: number; firstClickDone: boolean } | null>(null);
const playbackSnapshotRef = useRef<...>(null);
const rollbackSnapshotRef = useRef<{ initial: TurnSnapshot | null; snapshots: Record<string, TurnSnapshot> }>(...);
const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
```

### 2. hook 之间的依赖关系（无环）

```
useCombatInventories （只依赖 record + 参战者列表）
    ↓ 被使用
useActions           （依赖 record + currentMode）
useDamageAndHp       （依赖 record + useActions 的 markLoadingAttacked? → 不需要，Hp 改动直接写 combatStore）
useRoundTurn         （依赖 record + playbackStarted + useActions.resetCombatantActions + rollbackSnapshotRef + autoFillDownedMarkers）
    ↑ 被依赖
usePlayback          （依赖 record + playbackStarted/setPlaybackStarted + currentTurn/setCurrentTurn + rollbackSnapshotRef + playbackSnapshotRef + useRoundTurn.resetTurnTodosForRound 直接走 combatStore）
useManualRecord      （依赖 record + selectedCell + resolveWriteCell + appendRoundRecord + handleApplyDamage）
useInitiative        （依赖 record + combatants 顺序 + initiativeOrder 计算）
useSurprise          （依赖 record + rounds 写入）
useThrownDrop        （无 combatStore 写以外的依赖）
```

设计原则：**所有子域的 combatStore / battlegroundStore 读写都直接在各 hook 内部调 store API 完成，不通过 CombatSession 中转**，只把需要在 UI 展示的 state 和事件回调暴露给 CombatSession 骨架。

### 3. CombatSession 骨架的返回结构

```tsx
// CombatSession.tsx 简化后结构
export default function CombatSession() {
  // 顶层共享 state / ref
  const sessionId = useParams()['id'] ?? '';
  // ...

  // 各子域 hook（按依赖顺序声明，保持 hooks 调用顺序稳定）
  const inventories = useCombatInventories(record);
  const actions = useActions(record, { attackModal, onAttackMiss, onConfirmHit });
  const hp = useDamageAndHp(record, { combatInventories: inventories.combatInventories });
  const roundTurn = useRoundTurn(record, { playbackStarted, setPlaybackStarted, rollbackSnapshotRef, autoFillDownedMarkers: hp.autoFillDownedMarkers });
  const playback = usePlayback(record, { playbackStarted, setPlaybackStarted: roundTurn.setPlaybackStarted, currentTurn: roundTurn.currentTurn, setCurrentTurn: roundTurn.setCurrentTurn, rollbackSnapshotRef, playbackSnapshotRef });
  const initiative = useInitiative(record, { editingInitiative, setEditingInitiative, initiativeInput, setInitiativeInput, selectedIds, setSelectedIds, batchMode, setBatchMode, combatInventories: inventories.combatInventories });
  const surprise = useSurprise(record, {});
  const manual = useManualRecord(record, { selectedCell, setSelectedCell, combatInventories: inventories.combatInventories, handleApplyDamage: hp.handleApplyDamage });
  const thrown = useThrownDrop(record, { bgId: record?.id ?? '' });

  // 顶层事件（攻击命中/未命中回调，由 CombatAttackModal 触发，串起 actions + hp + thrown + round record 写入）
  const onConfirmHit = (attack, info) => { /* 调 actions.consume + actions.markLoading(若装填) + thrown.execute(若投掷) + damageModal 打开 */ };
  const onAttackMiss = (missInfo) => { /* 调 actions.consume + actions.markLoading(若装填) + thrown.execute(若投掷) + appendRoundRecord */ };

  if (!record) return <NotFound />;

  return (
    <div className="...">
      <CombatantList {...initiative.listProps} {...actions.actionProps} onAttackClick={(t) => setAttackModal({...})} />
      <TurnTodoBoard ... />
      <PlaybackToolbar {...playback.toolbarProps} {...roundTurn.toolbarProps} />
      <InitiativeTable {...initiative.tableProps} {...playback.cellProps} {...manual.cellProps} currentTurn={roundTurn.currentTurn} selectedCell={selectedCell} setSelectedCell={setSelectedCell} setRewindModal={setRewindModal} />
      <Battleground ... />
      {/* 各弹窗 */}
      <CombatAttackModal {...} />
      <CombatDamageModal {...} />
      <ManualRecordDialog {...manual.dialogProps} />
      <TiebreakerDialog {...initiative.tiebreakerProps} />
      <InitiativeRollDialog {...initiative.rollProps} />
      <RollbackConfirmDialog rewindModal={rewindModal} setRewindModal={setRewindModal} onConfirm={roundTurn.applyRollback} />
      <SurpriseDialog {...surprise.dialogProps} />
      <NpcCreator ... />
    </div>
  );
}
```

## 权限/认证

- 所有新 hook 不接触 AuthContext，仍由 CombatSession 顶层做授权守卫（ProtectedRoute + requireDM）
- 所有 store 读写（combatStore / characterStore / battlegroundStore）仍直接用现有 store 订阅机制，不涉及云 API，不需要双轨认证头

## 预读文件清单（实现阶段一次读入，不再每步重读）

1. `src/pages/CombatSession.tsx` 全文 2937 行 → 拆出各段后就不再回头读
2. `src/types/combat.ts` 全文 209 行 → 所有类型引用基础
3. `src/data/combatStore.ts` 全文 756 行 → store API 签名确认（consumeAction / resetActions / resetTurnTodosForRound / update 等）
4. `src/hooks/useEquipmentActions.ts` → 仅作 hook 结构范本
5. `src/components/TurnTodoBoard.tsx` → 仅作组件通过 props 接入 record 的范本
6. `AGENTS.md` §2.2 目录速查 → 实现完同步更新目录计数
