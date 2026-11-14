# 设计模式与可复用技巧

> AGENTS.md §5 的正文，按需查阅。每个模式对应一处已落地的实现，做新功能前先看这里。

### 5.1 工厂函数：`equipmentFactory.extractBaseFields`（`data/equipmentFactory.ts`）

**为什么用**：装备字段从不同来源进来（编辑器 formData、装备库模板、战斗快照、import 表格）字段名/默认值乱，统一走 `extractBaseFields` 得到 `Omit<EquipmentItem, 'id' | 'isCustom'>` 标准对象，新增字段只改这一个地方所有使用方同步。

**应用场景**：`useEquipmentActions.handleAddEquipmentFromLibrary`、`useEquipmentActions.handleSaveEquipment`、`TreasureDistribute` 分配装备、战斗拾取快照标准化。

### 5.2 自定义 Hook：`useEquipmentActions(charId, refresh)`（`hooks/useEquipmentActions.ts`）

**为什么用**：装备操作（加/改/删/从装备库加/同步装备库/备战/穿戴/卸下）涉及 characterStore CRUD + 云端 api 双向同步 + AC 重算 + UI 刷新，重复代码 100+ 行，打包成 hook 在 `CharacterDetail` / `CharacterInventory` / `PlayerInventory` 三处复用。

**做新的聚合操作时**（比如角色批量转移装备）：优先加进 `useEquipmentActions` 暴露新 callback，不要在页面里直接写 characterStore + api。

### 5.3 变更漏斗（Change Funnel）：`EquipmentChanges` + `computeChildQtyMap`

**为什么用**：战斗是一个"临时副本"——战斗中的装备变更不能污染角色源背包，也不能每次变更都 clone 一整个装备数组。三件套 `added / removedChildIds / quantityDeltas` 是纯增量记录，统一进入 `computeChildQtyMap` 按 `childId` 抵消，得到 `{ srcQty, combatQty }`，O(N) 时间，无副作用。

**规则**：
- **新增物品**（拾取、宝藏战斗内分配）：push 到 `added`，`childId` 尽量复用源；源没有时生成 `combat-${Date.now()}-${rand}`
- **整件移除**（最后一发射完、投掷武器）：push childId 到 `removedChildIds`（优先级最高，`computeChildQtyMap` 第 4 步覆盖一切 delta）
- **数量加减**（每发弹药 -1、部分拾取 +N）：写 `quantityDeltas[childId] = delta`（同 id 会在后续被合并，取累计）

### 5.4 双轨认证：`src/lib/api.ts` + `functions/_utils.ts`

**为什么用**：站点管理员是账号属性（`users.is_admin`），与「本场游戏的 DM」解耦——同一个人可以在 A 战役当 DM、在 B 战役当玩家，但这不影响他是否拥有站点编辑权。JWT 携带身份快照，但 `authenticateRequest` 每次都会查库取权威值，撤销管理员立即生效。DM Token 退化为服务端应急通道，只在没有任何管理员账号时用于救场。

**做新端点时**：
- 需要写权限：`const auth = await authenticateRequest(request, env)`，再判断 `auth.isAdmin`（未登录 401 / 非管理员 403）
- 需要登录但只读：验 JWT 即可（如角色卡列表）
- 管理员端点：同样走 `authenticateRequest`，不要再用 `verifyDmToken`
- 前端权限判断一律用 `useAuth().isAdmin`；`isDM` 只用于展示游戏身份

### 5.5 拖拽锚点保持：Battleground 双指缩放

**公式**（`components/Battleground.tsx` `handlePointerMove` 双指分支）：
```
newTranslate = startTranslate + (startScale - newScale) × startMid + (curMid - startMid)
```
- `(startScale - newScale) × startMid`：把按下时的双指中点维持在屏幕原位（标准锚点保持——对 `translate → scale` 变换顺序的反向补偿）
- `(curMid - startMid)`：双指整体平移跟随

**做新的 pinch-zoom 类交互时**：直接复用这套公式，不要重推。

### 5.6 长按落空 → 回退 click：Battleground `dragLockMissed`

**为什么用**：移动端点击棋子极易超过 350ms 长按阈值 → 触发 dragLock → `ts.moved=true` → click 被吞。解法：`handlePointerUp` 的 dragLock 分支里，如果松手时**没 hover 到任何目标**（既没角色也没物品），记为 dragLockMissed 并 `ts.moved=false`，让后续原生 click 正常进入 `handleCellClick` 选中棋子。

**做新的长按→白圈类交互时**：一定要加这个回退机制，否则 click 会被长按误触发系统性吞掉。

### 5.7 武器属性解析：`AttackEditor.parseWeaponData(equipment: Equipment)`

**为什么用**：D&D 武器属性是复合文本（如「投掷(20/60)」「弹药(100/400)」「多用(M)1d10」），解析成结构化 `Attack.properties / normalRange / maxRange / twoHandedDamage`。同一份解析在「新增武器自动生成 Attack 条目」和「NPC 武器录入」两处复用。

**新增武器属性时**（比如「双持」「反冲」）：先加进 `WEAPON_PROPERTIES` 数组（`AttackEditor.tsx` L14-17），再扩展 `parseWeaponData`。

### 5.8 回合待办（TurnTodo）：`combatStore` + `TurnTodoBoard.tsx`

**为什么用**：D&D 战斗里大量持续效果（中毒、祝福、专注法术、再生、昏迷豁免……）需要跨多个回合提醒 DM「轮到这个参战者时要处理什么」。靠 DM 脑记极易漏，记在便签上又脱离战斗上下文。把待办项挂在 `CombatRecord` 上、按回合重置已执行状态，能保证每回合开始时自动恢复「未完成」清单，DM 勾掉一项才算处理过。

**存储模式**：待办数据内嵌在 `CombatRecord` 里（与 `equipmentChanges` 同层级），是「战斗临时数据」而非角色源数据——战斗结束随 CombatRecord 一起保留/丢弃，不污染角色卡。这跟 §5.3 变更漏斗是同一种「战斗副本」思想：临时状态挂在 CombatRecord 上，不写回源。

**核心接口**（`data/combatStore.ts`）：
- `addTurnTodo(recordId, todo)`：新增一条待办（自动生成 id，`executed=false`）
- `removeTurnTodo(recordId, todoId)`：删除一条
- `toggleTurnTodo(recordId, todoId)`：切换 `executed` 状态
- `resetTurnTodosForRound(recordId, round)`：进入新回合时把所有待办 `executed` 重置为 false（DM 每回合重新处理一遍持续效果）
- `cleanupDeathSaveTodos(recordId)`：扫描所有 `type==='death_save'` 待办，按终止条件（HP>0 / isDead / 成功≥3）移除已结束的死亡豁免。在 HP 变更 / 死亡豁免结算后调用
- `applyDeathSaveResult(recordId, todoId, roll)`：把 d20 结果落到 combatant（更新 `deathSaveFailures / deathSaveSuccesses / HP / isUnconscious / isDead`），标记 todo `executed=true`，并在复活/死亡/稳定时自动移除 todo。返回更新后的 combatant 与 outcome（`crit_fail | fail | success | revive`）

**组件**：`components/TurnTodoBoard.tsx` 渲染看板 UI，调用上述接口读写 combatStore，本身不持有路由也不直连 API，符合「组件只通过 props / store 订阅」的约定。死亡豁免类型有独立弹窗（`DeathSaveDialog` 子组件，含 d20 手动输入 + 一键掷骰按钮 + 失败/成功进度回显）。

**触发条件**：仅在「放映模式（projection）」+「已开始放映」时显示。备战/编辑态下不展示，避免 DM 在编排参战者时被待办干扰。

**做新的「跨回合持续效果」类功能时**（比如新增专注法术、再生体质）：优先走这套 TurnTodo 机制，把效果注册成一条待办并设定每回合重置，不要在 CombatSession 里另起一套独立的 effect 追踪数组。

### 5.9 状态驱动待办自动生命周期：`death_save` 模式

**为什么用**：死亡豁免（D&D 5e 标准规则）是「状态触发型」待办——PC HP 归零进入昏迷的瞬间就应该开始提醒，HP 恢复或死亡时自动结束。靠 DM 手动 add/remove 待办极易漏。把触发条件编码到 `handleApplyDamage` 里：检测到 `target.isPc && result.newHp<=0 && result.status==='unconscious'` 时自动 `addTurnTodo`，HP 变化后调 `cleanupDeathSaveTodos` 让待办随状态结束。

**终止条件编码在 store 而非 todo 字段**：用户需求里写「终止条件：HP>0」是**业务规则**，不是 todo 数据结构里的 `endRound`。`TurnTodo.endRound=-1`（无限期）+ `cleanupDeathSaveTodos` 的状态扫描一起实现「状态终止」。这样 `resetTurnTodosForRound` 的回合重置逻辑不会误清状态型待办，待办只在 `cleanup` 显式判定终止时移除。

**昏迷 PC 仍要推进回合**：`findNextValidTurn` 默认跳过 `昏迷` 单元格（昏迷角色不能行动），但带未执行 `death_save` 待办的昏迷 PC 例外——D&D 5e 规定昏迷角色在自己回合开始时做死亡豁免。所以 `findNextValidTurn` 增加例外分支：`昏迷` 单元格若对应 combatant 有 active death_save todo（`!executed && startRound<=round && endRound=-1||>=round`），仍返回该回合。掷骰后 `executed=true`，本回合后续扫描自然跳过；下一回合 `resetTurnTodosForRound` 重置为 false，PC 回合再次推进。

**做新的状态触发型待办时**（比如「中毒每回合扣血」「断魂术每回合检定」）：复用这套模式——在 HP / 状态变更点（`handleApplyDamage` 或类似入口）调 `addTurnTodo` + `cleanupXxxTodos`，让待办与角色状态绑定，而不是让 DM 手动管理生命周期。

伤害落地统一走 `handleApplyDamage(DamageApplication)`：攻击方把结算后的最终伤害量、来源、致命状态一并传入，hook 内部处理临时 HP 吸收、HP 写入、死亡豁免与专注豁免；治疗走 `handleApplyHealing(targetId, amount)`。不要在调用方用 `newHp` 差值反推伤害量。

### 5.10 受控输入 hook：`useNumberInput` / `useTextInput`（`hooks/useInput.ts`）

**为什么用**：原生 number input 最常见的写法是 `onChange={e => setX(parseInt(e.target.value) || 0)}`，这会导致用户清空输入框时立刻被填回 0，无法删除全部数字重新输入（典型痛点：把 100 改成 50 必须先删成 "10" 再改 "5"，不能清空再输 "50"）。把"输入态字符串"和"业务态数值"分离后，onChange 只更新字符串、不立即兜底，onBlur 时才按 fallback 补全占位——这就是用户期望的「光标闪烁时可清空，光标消失时按需补全」。

**核心 API**：
```ts
const r = useNumberInput(initialValue, { fallback?: number; allowEmpty?: boolean; parse?: (s) => number });
// r.text   —— input 的 value（输入态字符串，可能为空或 "-"）
// r.value  —— 业务数值（输入无效时为上一个有效值；allowEmpty=true 时可能 undefined）
// r.onChange(s) —— 接 e.target.value，不兜底
// r.onBlur()    —— 失焦时按 fallback 补全 + 规范化显示
// r.setExternal(n) —— 父组件外部重置（如选中不同 record 时）
// r.reset() —— 重置到 initialValue

const t = useTextInput(initialValue, { fallback?: string; trimOnBlur?: boolean });
// 同构 API：onChange 不 trim 不补全，onBlur 时按需 trim 和补 fallback
```

**与 §5.1 equipmentFactory 同属"统一入口消除重复"思路**：所有数字/文本输入都走这两个 hook，兜底值由 options 显式声明，不在每个 onChange 里散写 `|| N`。改造前项目里有 21+ 处 `parseInt(e.target.value) || N` 散落在 8+ 个文件，兜底值 0 / 1 / 2 / -1 / 10 随场景各异；改造后调用方写 `useNumberInput(0, { fallback: -1 })`，意图一目了然。

**典型用法**（参考 `TurnTodoBoard.tsx`）：
```tsx
const formStartRoundInput = useNumberInput(0);
const formEndRoundInput = useNumberInput(-1);
// ...
<input
  type="number"
  value={formStartRoundInput.text}
  onChange={e => formStartRoundInput.onChange(e.target.value)}
  onBlur={formStartRoundInput.onBlur}
/>
// 提交时取 formStartRoundInput.value（已是 onBlur 规范化后的业务值）
```

**做新表单 / 新弹窗输入框时**：优先用这两个 hook，不要在 onChange 里直接 `parseInt(...) || N`。如果字段是可选的（如 TreasureEdit 的 normalRange/maxRange），用 `allowEmpty: true` 让 value 类型变为 `number | undefined`。

### 5.11 放映模式回溯：`startPlayback` 从非最新回合开始 ≡ 回溯

**为什么用**：DM 在放映过程中可能想"如果这一回合换一种打法会怎样"——从先攻表格中间某格重新开始放映。如果只重置沙盘而不还原战斗数据（HP/状态/装备变更/回合记录），之前放映的结果会残留，导致状态不一致。所以从非最新回合开始放映必须等同于回溯：完整还原到初始快照 + 清空选中格之后的所有记录。

**`startPlayback` 流程**（`pages/CombatSession.tsx`）：
1. 从 `rollbackSnapshotRef.current.initial`（进入放映模式时拍的快照）还原 combatants / rounds / 装备变更
2. 若有 `selectedCell`：清空选中格之后的所有回合记录（保留「被突袭/昏迷/死亡」占位）
3. 还原沙盘到初始快照
4. `cleanupDeathSaveTodos`（HP 恢复后可能不再昏迷，待办自动移除）
5. `resetTurnTodosForRound`（重置起始回合的待办执行状态 + 装填武器攻击标记）
6. 用 `roundsOverride` 将还原后的 rounds 传入 `findNextValidTurn`，避免读到旧快照

**从最新回合开始放映时**：选中格之后无数据可清空，行为等同 no-op，与原来一致。

### 5.12 `currentTurn` 纯 `combatantId` 设计（消除 `combatantIdx` 缓存偏移）

**为什么用**：`currentTurn` 原来缓存了 `combatantIdx`（参战者在数组中的下标），但先攻值编辑或平局重排后数组顺序变化，缓存的 `combatantIdx` 就会偏移，导致回合标记跳到错误的列。改为只保留 `{ round, combatantId }`，在需要下标时通过 `findIndex` 实时计算，排序/删除后自动适应。

**影响范围**（`pages/CombatSession.tsx`）：
- `currentTurn` 类型：`{ round: number; combatantId: string }`（无 `combatantIdx`）
- `findNextValidTurn` 返回类型：`{ round: number; combatantId: string }`（无 `combatantIdx`）
- `advanceTurn`：`const currentIdx = record.combatants.findIndex(c => c.id === currentTurn.combatantId)`
- `resolveWriteCell` 返回类型：`{ round: number; combatantId: string }`（无 `combatantIdx`）
- UI 中比较"当前回合之前的格子"：用 `findIndex` 实时计算，不读 `currentTurn.combatantIdx`
- `rewindModal` 和 `applyRollback` 仍保留 `combatantIdx`（在点击时通过 `findIndex` 实时计算传入，不缓存）

### 5.13 注册式优劣势引擎：`advantageRules.ts` + 待消费标记 `PendingAdvantageSource`

**为什么用**：D&D 5e 的优劣势来源极多——装备（不熟练护甲 stealthDisadvantage）、位置（5 尺远程干扰、最大射程段）、动作（协助 Help、回避 Dodge、躲藏 Hide）、状态（中毒、束缚、隐形、妖火）、法术（祝福术、诅咒术）等。如果每加一个特性都去改 `CombatAttackModal` / `CombatSpellModal` 的硬编码判定分支，会让弹窗组件膨胀且难以跨场景复用（攻击检定 / 法术攻击 / 豁免检定都要重写一遍）。

引擎设计为**纯函数 + 注册式检测器**，所有场景（attack_melee / attack_ranged / attack_thrown / spell_attack / saving_throw / damage）共用一份 `detectAdvantage(ctx)` 入口，新特性只需 `registerDetector(name, fn)` 注册一个返回 `AdvantageResult` 的纯函数，无需改引擎核心或弹窗组件。

**核心抽象**（`data/advantageRules.ts`）：

```ts
// 上下文：所有检定场景共用
interface AdvantageContext {
  scene: CheckScene;            // attack_melee / spell_attack / saving_throw / damage ...
  currentRound?: number;
  attacker?: Combatant | null;  // 攻击者 / 施法者 / 待检定方
  target?: Combatant | null;    // 目标（被攻击 / 被施法方）
  attackerCharacter?: Character | null;
  targetCharacter?: Character | null;
  attack?: Attack | NpcAttack | null;
  usageMode?: 'melee' | 'thrown';
  attackerPos?: { col: number; row: number } | null;
  targetPos?: { col: number; row: number } | null;
  distanceCells?: number;
  saveAbility?: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
}

// 检测器签名：纯函数，无副作用
type AdvantageDetector = (ctx: AdvantageContext) => AdvantageResult;

// 引擎入口
detectAdvantage(ctx): AdvantageResult              // 执行所有已注册检测器并合并结果（只读）
resolveRollMode(manual, auto): { mode, reasons }   // 手动优先 > 自动；优劣势互斥抵消（D&D 5e）
getMatchedPendingSourceIds(auto): string[]          // 取本次命中需要消费的 pending 标记 ID
```

**三种来源（覆盖场景）**：
1. **自动检测器**（`registerDetector`）：装备不熟练 / 5 尺远程干扰 / 射程段劣势。返回 `kind: 'equipment' | 'positional'`
2. **待消费标记**（`PendingAdvantageSource`）：发起者赋予他人一次性优劣势——协助动作、法术效果（祝福术 / 妖光）。挂在被赋予者 `combatant.pendingAdvantageSources[]`，含 `scene` / `targetId` / `expireRound` 限制，**检定确认后才消费**（`combatStore.consumePendingAdvantage`）
3. **手动覆盖**（`ManualMode`）：DM 在弹窗用 `AdvDisadvToggle` 临时指定，优先级最高，覆盖一切自动检测

**合并规则**（D&D 5e 标准）：
- 手动 ≠ 'none' → 用手动模式，原因显示「手动指定」
- 自动优劣势同时存在 → 互相抵消，最终 mode='none'
- 否则取自动检测结果

**消费时机**（关键）：pending 标记是**纯只读**的，引擎检测时不修改 consumed 状态；调用方在检定确认（弹窗 `handleConfirm`）后用 `getMatchedPendingSourceIds(auto)` 取命中 ID，再调 `combatStore.consumePendingAdvantage(recordId, combatantId, ids)` 标记已消费。这样**未确认的检定不会误消费**（DM 关掉弹窗重来时还能再用）。

**过期清理**：回合推进时（`useRoundTurn.advanceTurn`）对进入回合的参战者调 `combatStore.clearExpiredAdvantage(recordId, combatantId, currentRound)`，移除 `expireRound < currentRound` 的标记（`expireRound=-1` 表示永久直到消费）。

**UI 复用**：`components/AdvDisadvToggle.tsx` 是公共手动菜单组件，被 `CombatAttackModal` / `CombatSpellModal` 复用，统一了「点 ⋯ 弹菜单 → 选正常 / 优势 / 劣势」交互。`CombatDamageModal` 通过 `rollMode` + `reasons` props 接收已结算的模式做展示（不再独立判定）。

**做新的优劣势特性时**：
- **持久 / 自动型**（如新装备属性、新位置规则）：写一个 detector 函数 → `registerDetector('myFeature', fn)` → 函数内根据 `ctx` 返回 `{ advantage: [], disadvantage: [...] }`。检测器只在模块加载时注册一次（顶层 `registerDetector(...)` 调用）
- **一次性 / 赋予型**（如协助动作、新法术效果）：在动作 / 法术结算处调 `combatStore.addPendingAdvantage(recordId, targetId, { scene, mode, reason, kind, targetId?, expireRound })`，引擎的 `pending` 检测器会自动扫描未消费标记并返回
- **新检定场景**：扩展 `CheckScene` 类型 + 在新弹窗构造 `AdvantageContext` → 调 `detectAdvantage` + `resolveRollMode` + `getMatchedPendingSourceIds`

**❌ 严禁**：
- 在 `CombatAttackModal` / `CombatSpellModal` 里硬编码优劣势判定分支（应改为注册 detector）
- 在引擎检测时修改 `pendingAdvantageSources[i].consumed`（应只读，由调用方在 confirm 后消费）
- 让弹窗组件直接读 `combatant.pendingAdvantageSources` 自行筛选（应通过 `detectPending` detector 统一返回）

### 5.14 文档路由：侦查先读 `docs/generated` 再读源码

**为什么用**：跨模块侦查（理解战斗/装备/交易等模块后做改动）是长任务额度大头——反复通读大文件叠加 `Read` 工具的 200 行分段限制，每次读取都烧大量输入 token。`docs/generated/` 下的 Markdown 由 GitHub Actions 用智谱 API 按源码路径镜像生成（`scripts/generate-code-docs.mjs` + workflow `docs-generate.yml`），把全部 `src/` 压缩约 6.3x（84% 上下文削减）：`CombatSession.tsx` 163KB 压到 2KB，`characterStore.ts` 64KB 压到 15KB。

**核心约定**：
- 侦查先读 `docs/generated/src/<对应路径>.md` 定位模块职责 / 导出接口 / 核心逻辑，再按需读源码关键段，不要盲目通读大文件
- 文档是路由表，不是唯一事实源：LLM 生成的概述可能有遗漏，关键判断（类型、分支、状态流）仍以源码为准
- 文档幂等生成（`.code-docs-manifest.json` 记源文件 sha，未变化跳过），维护成本≈0；改代码后重新触发 `Generate Code Docs (curl)` workflow 即自动更新

**做新的跨模块侦查时**：先并行读相关 `.md`（每个 2–15KB 一次读完），基于文档列出的函数 / 文件清单决定要精读的 1–2 个源码文件，而非逐个通读。

---
