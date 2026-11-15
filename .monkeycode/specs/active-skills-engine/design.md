# 设计：active-skills-engine（主动技能引擎）

Feature Name: active-skills-engine
Updated: 2026-11-15

## 1. 目标与总原则

把「特性与特质」中 `role = 'active'` 的条目接入战斗自动化结算。四类覆盖：

| 类别 | 资源模型 | 代表 | 自动化方式 |
|------|---------|------|-----------|
| A 骰池/点池 | 池随等级，短/长休恢复 | 气、卓越骰、诗人激励 | 池引擎 + checkModifier 通道 |
| B 每次休息次数 | 固定次数 | 回气、动作如潮、引导神力、神圣干预 | 池引擎（fixed/levelTiers 公式） |
| C 状态切换 | 无消耗，进入持续状态 | 狂暴、鲁莽攻击 | statusManager + advantageRules |
| D 反应触发 | 反应次数 | 拨挡飞弹、直觉闪避 | 纯数据标注（reaction 声明） |

**经济性判断**：A+B 是同一个池引擎（公式不同）；C 复用 statusManager/pendingAdvantageSources；D 零引擎代码。新增物只有：`featureUses` 漏斗、`featurePools` 卡片字段、`featureCapabilities` 路由器、按钮接线和种子标注。

## 2. 分层架构

```
种子层   OptionTrait（role=active + activation/resource/pool 公式/reaction 标注）
   │  annotate 脚本扩展，100% 覆盖校验
   ▼
角色卡   Feature（透传 activation/resource/reaction）
         featurePools: Record<featureKey, { used: number }>      ← 卡片持久层
   │  useCombatBroadcast.projectActiveFeatures 扩展
   ▼
战斗投影  activeFeatures: { name, description, activation, resource, poolLeft, poolMax, disabled }
   │
   ▼
触发层   CombatantInfoPanel / MyCombatantPanel 主动技能按钮
         └ featureRouter（data/featureCapabilities.ts）
             ├ cost:  动作扣减（consumeAction/bonusActions）+ 池扣减（featureUses delta）
             ├ channel 路由：
             │   ├ checkModifier → combatStore.addPendingCheckModifier（激励骰既有链路）
             │   ├ advantage    → combatStore.addPendingAdvantage + advantageRules 注册
             │   ├ status       → statusManager 挂载 + combatStore.addTurnTodo 提醒
             │   ├ reaction     → ReactionPromptModal（既有流程，仅数据）
             │   └ manual       → 维持现状提示文案
             └ 玩家端：MyCombatantPanel → 信箱 request(feature_use) → DM 确认后走同一路由
   ▼
记账层   CombatRecord.featureUses: Record<combatantId, Record<featureKey, number>>
         └ derived: usedInCombat = Σ delta；available = poolMax - cardUsed - usedInCombat
   ▼
结算层   applyBattleSettlement 新增「特性资源」并入段（勾选式，与 spellSlots 并入同构）
恢复层   CharacterDetail 长休重置 → resetFeaturePools(id, 'long')；短休恢复按钮 → 'short'
```

## 3. 数据模型

### 3.1 种子/角色卡字段扩展（types/character.ts + characterOption.ts）

```ts
/** 施法形态 */
export type FeatureActivation = 'action' | 'bonus' | 'reaction' | 'free';
/** 资源模型：pool=池消耗；toggle=状态切换（无池）；manual=手动裁定 */
export type FeatureResourceKind = 'pool' | 'toggle' | 'manual';
/** 池量公式 */
export interface FeaturePoolFormula {
  type: 'fixed' | 'classLevel' | 'abilityMod' | 'levelTiers';
  value?: number;            // fixed
  ability?: AbilityKey;      // abilityMod
  tiers?: { min: number; value: number }[]; // levelTiers：取 min ≤ level 的最大档
  restKind: 'short' | 'long'; // 恢复时机；长休恢复全部
}
```

- `OptionTrait` / `Feature` 各增：`activation?: FeatureActivation`、`resource?: FeatureResourceKind`、`poolFormula?: FeaturePoolFormula`。显式值优先，缺省时按钮按 manual 兜底（与 deriveFeatureRole 显式优先原则一致）。
- `Character` 增：`featurePools?: Record<string, { used: number }>`，key = 特性名（`feature:<名>` 与反应定义键同口径，同角色同名特性唯一）。
- 池量计算纯函数放 `data/featurePool.ts`：`getPoolMax(character, formula)`（读 level/classLevel 与 abilities，levelTiers 分档）。

### 3.2 战斗漏斗（types/combat.ts）

```ts
interface CombatRecord {
  /** 特性资源消耗漏斗：combatantId → featureKey → 消耗数 delta（正数） */
  featureUses?: Record<string, Record<string, number>>;
}
```

快照/回溯：与 spellSlotChanges 完全同构——`usePlayback` / `useRoundTurn` 的深拷贝点（usePlayback.ts:90、useRoundTurn.ts:309）各加一行拷贝；放映模式扣到 0 的处理复用 consumeAction 的 simulation 语义。

### 3.3 combatStore 新 API（data/combatStore.ts）

| API | 语义 |
|-----|------|
| `getFeaturePoolView(recordId, combatantId, character)` | 返回 `{ featureKey, name, activation, poolMax, usedCard, usedCombat, available }[]`（只读派生） |
| `consumeFeatureUse(recordId, combatantId, featureKey)` | available ≤ 0 拒绝；否则 delta+1 并 save/notify |
| `resetFeatureUses(recordId, combatantId?, featureKey?)` | 回溯/手动重置 delta |
| `applyFeaturePoolSettlement(...)` | 结算并入：卡片 used = clamp(usedCard + delta, 0, poolMax)，写 pushCharacterLog（source: 'battle'，与 slot_change 同款） |

### 3.4 能力路由器（新文件 data/featureCapabilities.ts）

```ts
export interface FeatureCapability {
  featureKey: string;                       // feature:<名>
  channel: 'checkModifier' | 'advantage' | 'status' | 'reaction' | 'manual';
  /** checkModifier 参数（激励样板）：uses = poolMax、dice、scene、expireRound */
  modifier?: { dice?: string; scene: CheckModifierScene; expireOnOwnerTurn?: boolean };
  /** status 参数：状态库键 / 持续（rounds 或 untilOwnerTurnEnd）+ TurnTodo 文案 */
  status?: { statusKey: string; duration: { type: 'rounds' | 'untilOwnerTurnEnd'; value?: number } };
  /** advantage 参数：方向与场景（复用 PendingAdvantageSource） */
  advantage?: { mode: 'advantage' | 'disadvantage'; scene: string; expiresRound: 'self' | 'next' };
}
```

- P1 落地注册条目（约 10 条，全部有既有引擎可走）：诗人激励（checkModifier）、引导神力·维持生命等（manual 起步，逐条升级）、狂暴（status：力量检定/豁免优势 + 伤害加值备注 + TurnTodo）、鲁莽攻击（advantage 双向）、拨挡飞弹/直觉闪避/轻身坠（reaction）。
- 未注册条目按 `resource=manual` 兜底 → 维持现有 alert 文案。

### 3.5 种子标注（scripts/annotate-option-roles.mjs 扩展或新脚本）

- A+B 类映射（约 48 条）：气（classLevel）、卓越骰（levelTiers 4/5/6）、激励（abilityMod charisma, long）、引导神力全家（fixed 1, short）、回气/动作如潮（fixed 1；动作如潮 tiers L17=2）、神圣干预、吐息武器（fixed 1, short）等。
- activation：狂暴/回气/激励=bonus；吐息武器=action；拨挡飞弹/直觉闪避=reaction；引导神力=action。
- D 类 reaction 声明写入 `reaction: { trigger, resolution, prompt }`（FeatureReaction 同口径）。
- 脚本延续 100% 覆盖退出约束；标注结果随种子 JSON 入库。

## 4. UI 接线

### 4.1 DM 端（CombatantInfoPanel.tsx:1361 主动技能区）

- 按钮渲染改由 `getFeaturePoolView` 驱动：显示池余量徽标（如「气 3/5」）、activation 角标。
- 点击 → `featureRouter.execute(...)`：扣动作 → 扣池 → 走 channel；沿用现有 sealed/死亡/昏迷禁用逻辑。
- 激励骰按钮并入路由器（替换 hasBardicFeature 特判，openBardicFor 变为 checkModifier 通道的内部实现）。

### 4.2 玩家端

- 投影扩展（useCombatBroadcast.projectActiveFeatures + realtime.ts `RosterActiveFeature`）：加 `activation / resource / poolMax / poolLeft / disabled` 字段。
- MyCombatantPanel 主动技能区同款按钮；点击 → `useRoundTableInbox` 发送 `feature_use` request（payload: combatantId + featureKey）→ DM 端信箱确认后执行同一路由（复用 request→replyMessageId 既有协议，消息不可变约束不变）。

### 4.3 恢复入口

- CharacterDetail 长休重置处理器（CharacterDetail.tsx:2694）追加 `resetFeaturePools(id, 'long')`。
- 池卡片（特性与特质主动技能区）增「短休恢复」小按钮：仅 restKind='short' 且 used>0 时可用。

## 5. 正确性属性

1. 战斗内任何路径只写 `featureUses` delta；角色卡 `featurePools` 仅在结算并入与休息重置时变更。
2. `available = poolMax - usedCard - Σdelta` 恒 ≥ 0；consumeFeatureUse 在 available ≤ 0 时拒绝。
3. 回溯后 derived 余量 === 该历史回合结束时的真实余量（快照含 featureUses）。
4. featureKey 全链路（种子→卡片→漏斗→路由器→信箱）使用同一 `feature:<名>` 口径。
5. 手动结算兜底永远可达：路由器查无注册条目时按 manual 提示，按钮永远有响应。

## 6. 错误处理

| 场景 | 处理 |
|------|------|
| 角色卡缺 featurePools 字段（老数据） | 读端按 `{}` 兜底，可用 = 满池（load 兜底约定） |
| 池公式引用的职业缺失/等级异常 | getPoolMax 返回 0，按钮禁用并 title 提示 |
| 种子未标注 activation/resource | 按 manual 兜底，脚本警告但不阻断 |
| 玩家请求时技能已被 DM 结算 | 信箱回复 reject（池不足/状态无效），玩家端回退按钮态 |
| 重复点击 | consumeFeatureUse 幂等性由 available 校验兜底；按钮点击后立即置 pending 态 |

## 7. 实施阶段

- **P1 池引擎主线**：类型扩展 → 池公式纯函数 + featurePools → featureUses 漏斗 + 快照回溯拷贝 → combatStore API → CombatantInfoPanel 接线（激励并入路由器）→ 结算并入 + 长休重置 → 种子标注（A+B）。验证：tsc -b + build + 激励/引导神力手动探针。
- **P2 状态/反应/玩家端**：featureCapabilities 注册 C/D 类 → statusManager/advantageRules 接线 → 种子 reaction 声明 → 投影扩展 + MyCombatantPanel + 信箱 feature_use。
- **P3 收尾**：damage/attack-rider 通道预留接口评审 → progress.md 回写 → docs/generated 更新触发。

## 8. 测试策略

- 类型门禁：`npx tsc -p tsconfig.app.json --noEmit` + `npm run build`。
- 手动探针（scripts/probes/，QUIET=1）：新建含武僧/战斗大师/吟游诗人的试验场角色 → 入战 → 消耗气/卓越骰/激励 → 校验投影余量 → 回溯校验 → 结算并入校验 → 长休重置校验。
- E2E 既有基线：`sh scripts/probes/run.sh` 期望 ALL PROBES OK。

## 9. 引用

- 激励骰样板链路：src/pages/CombatSession.tsx:1007（openBardicFor）、src/data/combatStore.ts:1755（addPendingCheckModifier）
- 法术位漏斗样板：src/types/combat.ts:398、src/data/combatStore.ts:993-1014、结算并入 src/data/combatStore.ts:1273-1305
- 快照回溯拷贝点：src/hooks/combat/usePlayback.ts:90、src/hooks/combat/useRoundTurn.ts:309
- 反应引擎（D 类复用）：.monkeycode/specs/reaction-engine/design.md、src/data/reactionDefinitions.ts
- 主动技能展示现状：src/components/CombatantInfoPanel.tsx:1361、src/hooks/combat/useCombatBroadcast.ts:67
- 长休重置入口：src/pages/CharacterDetail.tsx:2694
- 种子标注脚本：scripts/annotate-option-roles.mjs
