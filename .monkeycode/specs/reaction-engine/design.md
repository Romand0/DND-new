# 设计：reaction-engine（通用反应引擎）

> 重建版本：原设计文档在 P1/P2 期间未入库，本文件依据 P1/P2 已合并实现与 P3 代码反推整理。实现以源码为准。

## 1. 目标

把「借机攻击」抽象为通用反应机制：触发时机与解决方式由数据声明（法术 / 特性 / 怪物），引擎只负责三件事：

- 什么时候可以反应（事件 → 候选机会）
- 谁可以反应（阵营、范围、来源）
- 消耗什么（反应次数、法术位）

代码层零法术名、零效果逻辑：效果仍走既有攻击 / 伤害 / 施法 / 状态流程，由 DM 或玩家按提示结算。

## 2. 分层

```
事件源（交互层）
  CombatSession / turnCommitApply
        │ emit ReactionCombatEvent
        ▼
检测引擎（纯只读）
  reactionRules.detectReactions(record, event)
  ├─ 内置：借机攻击（move_leave_reach）
  ├─ 数据：Spell.reaction / Feature.reaction
  └─ registerReactionDetector(...) 可扩展
        ▼ ReactionMatch[]
定义解析
  reactionDefinitions.resolveReactionDefinition(id)
  builtin:* / spell:<id> / feature:<name>
        ▼
机会队列（状态层）
  Combatant.pendingReactions: ReactionPrompt[]
  reactionUsed: boolean
  combatStore.addReactionPrompts / consumePendingReaction / consumeReaction
        ▼
反应弹窗（交互层）
  ReactionPromptModal → 行使 / 放弃
  行使：扣反应（+ 可选法术位）→ DM 按流程结算
```

## 3. 数据模型

### 3.1 事件面

`ReactionTrigger`（`types/combat.ts`）为判别联合：

- `move_leave_reach`（借机攻击，起点在触及内、落点在触及外）
- `enter_reach`（哨兵类，起点在触及外、落点进入触及）
- `attack_targeted`（被攻击，命中判定后、伤害前）
- `damage_taken`（伤害结算前）
- `spell_cast`（施法确认前，用于反制）

`ReactionCombatEvent` 为事件载荷联合；检测器只读 `CombatRecord`，不写状态。

### 3.2 反应声明

`Spell.reaction` 与 `Feature.reaction` 同构（`FeatureReaction`）：

| 字段 | 含义 |
|------|------|
| `trigger` | 触发时机（上表） |
| `resolution` | 解决方式：`attack` / `spell` / `status` / `damage_modifier` / `movement`，缺省 `spell` |
| `scope` | `self` = 事件目标本人（缺省）；`ally` = 同阵营（不含本人） |
| `prompt` | 弹窗提示文案（DM 结算指引） |
| `slotLevel` | 行使消耗的法术位环级；0/缺省 = 不耗环 |

### 3.3 机会快照

`ReactionPrompt` 存快照字段（`ownerId` / `definitionId` / `definitionName` / `trigger` / `cost` / `eventLabel` / 事件上下文），恢复队列不依赖定义表后续变更。

## 4. 检测器

统一签名：

```ts
type ReactionDetector = (record: CombatRecord, event: ReactionCombatEvent) => ReactionMatch[];
```

`detectReactions` 顺序执行全部检测器并合并结果；单检测器异常被捕获，不阻断移动/攻击/施法落库。

现有检测器：

- 借机攻击：敌对且仍可反应持有者，起点 ≤ 近战触及、落点 > 触及。
- `enter_reach`：同上反向跨界，仅对声明了该触发的来源。
- `attack_targeted`：遍历与攻击方敌对的持有者，按 `scope` 匹配被攻击者或同阵营者。
- `damage_taken`：匹配受伤者本人 / 同阵营者，带 `amount` / `damageType` / `eventLabel`。
- `spell_cast`：缺省对敌对施法者（反制）；`scope='ally'` 时保护同阵营施法者。

来源统一视图 `ReactionSource` 合并 `Spell.reaction` 与 `Feature.reaction`：

- 普通战斗取角色卡习得法术（`cantrips + custom` 按名字回查法术库）与角色特性（按等级过滤）。
- 试验场开放全库法术，便于测试受术方反应。
- 无 `characterId` 的参战者不产生法术来源（除非试验场）。

可用性（死亡/昏迷/失能、反应已用、法术位不足）**不在检测阶段过滤**：机会客观存在，由弹窗二次校验，避免丢信息。仅 `canReact` 过滤明显不可行动者。

## 5. 插桩窗口

### 5.1 移动（P1）

移动先落库，再 `detectReactions({kind:'move'})`。机会入队，弹窗串行展示；放弃仅消费机会，保留反应次数。

### 5.2 攻击（P2）

命中确认后、伤害结算前检测 `attack_targeted`。有候选则写入 `pendingDamage` 挂起伤害弹窗；队列清空后由 effect 打开伤害弹窗。

### 5.3 伤害（P3）

`CombatDamageModal` 的 `onApplyDamage` 内先检测 `damage_taken`：

- 有候选 → 机会入队，`damageModal.reactionWindowDone = true`，本次结算返回（弹窗保持打开，保留已计算值）。
- 反应队列处理完 → 用户再次确认 → `applyDamageNow()` 真正写 HP。
- 伤害弹窗在反应期间降为 `z-40`，反应弹窗 `z-60` 浮于其上。

### 5.4 施法（P3）

`CombatSpellModal` 收尾唯一出口 `onCastResolved` / 流程施放 `onFlowResolved`：

1. 将原有结算体包为 `finalize`。
2. `beginSpellCastWindow(casterId, spellId, spellName, finalize)` 检测 `spell_cast`。
3. 无候选 → 立即 `finalize()`。
4. 有候选 → `pendingCast` 挂起，机会入队；队列清空后：
   - 无反应被行使 → 直接 `finalize()`。
   - 有反应被行使 → 进入 `pendingCastConfirm`，DM 选择「应用施法效果」或「不应用（视为被反制）」。
5. 专注、动作/附赠动作消耗、记录写入均在 `finalize` 内，顺序与旧路径一致。

### 5.5 玩家回合提交（P3）

`lib/turnCommitApply.ts` 在玩家攻击命中后执行 `detectReactions({kind:'attack'})`，写 `pendingReactions` 并回传 `collectedReactions` 给 DM 端；DM 端队列消费。

## 6. 关键决策

- 检测与消费分离：检测纯只读，消费只在用户确认后执行。
- 队列串行：同一时刻只展示一个机会，`reactionUsed` 拦截同回合重复反应。
- 机会快照落库：刷新/回滚后未决机会不丢。
- 效果延后：伤害与施法效果在反应队列清空后应用；施法在已有反应被行使时交由 DM 二次确认（反制语义）。
- 数据驱动：新增反应只改数据声明或注册检测器，不改弹窗与队列。

## 7. 验证

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run build
sh scripts/probes/run.sh
```

`probe-reaction.cjs` 覆盖：借机攻击规则、store 持久化、玩家提交窗口、P2 攻击目标反应、P3 `damage_taken` / `enter_reach` / `spell_cast` 与特性来源。
