# 优劣势接口完善 — 设计文档

> 配套 [requirements.md](./requirements.md) 与 [tasks.md](./tasks.md)。本文档定义类型骨架、调用链路、预读文件清单。

## 一、涉及文件清单（按 §一 速查表定位）

| 文件 | 操作 | 职责 | §一 速查表归类 |
|------|------|------|--------------|
| `src/data/advantageRules.ts` | 新增 | 纯计算优劣势引擎 + 注册式检测器 + pending 标记扫描 | 新设计模式 |
| `src/components/AdvDisadvToggle.tsx` | 新增 | 手动覆盖公共组件（替换两弹窗重复实现） | 改可复用组件 |
| `src/types/combat.ts` | 修改 | `Combatant` 新增 `pendingAdvantageSources?: PendingAdvantageSource[]` 字段；导出 `PendingAdvantageSource` / `CheckScene` / `AdvantageReason` 等接口（避免新建类型文件，归入 combat 领域） | 改数据结构/类型 |
| `src/components/CombatAttackModal.tsx` | 修改 | 删除硬编码 `getAttackAdvantageDisadvantage`/`computeRollMode`/`getRollModeReasons`，改调 `advantageRules`；替换手动菜单为 `AdvDisadvToggle`；`handleConfirmRoll` 后调 `combatStore.consumePendingAdvantage` | 改可复用组件 |
| `src/components/CombatSpellModal.tsx` | 修改 | 接入 `advantageRules`（法术攻击 scene='spell_attack' + 豁免 scene='saving_throw'）；替换手动菜单为 `AdvDisadvToggle`；确认后消费 pending | 改可复用组件 |
| `src/components/CombatDamageModal.tsx` | 修改 | `disadvantage` prop 扩展为 `rollMode` + `reasons`，展示优劣势来源 | 改可复用组件 |
| `src/data/combatStore.ts` | 修改 | 新增 `addPendingAdvantage`/`consumePendingAdvantage`/`clearExpiredAdvantage`/`getPendingAdvantages` 方法；`load()` combatant normalize 时兜底 `pendingAdvantageSources` 字段 | 改前端状态 |

**新增 store 数量**：0（store 总数仍为 9）
**新增类型文件数量**：0（类型并入 combat.ts，避免文件膨胀）
**新增组件数量**：1（AdvDisadvToggle）
**新增模块数量**：1（advantageRules.ts 纯计算模块）

## 二、类型骨架预览

### 2.1 `src/types/combat.ts` 新增类型

```ts
/** 检定场景类型 —— 引擎据此选择适用的检测器 */
export type CheckScene =
  | 'attack_melee'      // 近战攻击检定
  | 'attack_ranged'     // 远程攻击检定（含投掷远程模式）
  | 'attack_thrown'     // 投掷武器投掷模式（介于近战远程之间）
  | 'spell_attack'      // 法术攻击检定（法术命中判定）
  | 'saving_throw'      // 豁免检定（目标方）
  | 'skill_check'       // 技能检定（预留，本次不实现弹窗）
  | 'damage';           // 伤害结算（仅展示用，不参与检定判定）

/** 优劣势来源类型标签（用于 UI 颜色区分 + 日志分类） */
export type AdvantageSourceKind =
  | 'equipment'    // 装备相关（不熟练护甲、stealthDisadvantage）
  | 'positional'   // 位置相关（5 尺远程、射程段）
  | 'pending'      // 待消费标记（协助动作、法术效果等一次性来源）
  | 'action'       // 动作相关（dodge/hide 等，本次仅预留）
  | 'condition'    // 状态相关（中毒/束缚等，本次仅预留）
  | 'manual';      // DM 手动覆盖

/** 优劣势原因条目 */
export interface AdvantageReason {
  /** 来源类型 */
  kind: AdvantageSourceKind;
  /** 具体来源描述（如"不熟练的护甲"、"协助（来自 队友A）"） */
  label: string;
  /** 关联的 pendingSourceId（如来自待消费标记） */
  pendingSourceId?: string;
}

/** 优劣势检测结果 */
export interface AdvantageResult {
  advantage: AdvantageReason[];
  disadvantage: AdvantageReason[];
}

/** 手动模式 */
export type ManualMode = 'none' | 'advantage' | 'disadvantage';

/** 待消费的优劣势标记（发起者赋予他人的一次性优劣势来源） */
export interface PendingAdvantageSource {
  /** 唯一实例 ID（crypto.randomUUID()） */
  id: string;
  /** 施加者 combatantId（可为空，表示环境/法术效果） */
  fromId?: string;
  /** 施加者名称（用于 UI 展示，避免 fromId 失效后丢失信息） */
  fromName?: string;
  /** 适用场景：'any' = 所有检定场景；或指定具体 scene */
  scene: CheckScene | 'any';
  /** 优势或劣势 */
  mode: 'advantage' | 'disadvantage';
  /** 原因说明（如"协助"、"祝福术"、"妖火"） */
  reason: string;
  /** 来源分类（用于 AdvantageReason.kind 映射） */
  kind: AdvantageSourceKind;
  /** 目标限制：仅对特定目标生效（如协助动作指定攻击 C 时）；不限制则对所有目标生效 */
  targetId?: string;
  /** 是否已消费（检定确认后置 true） */
  consumed: boolean;
  /** 创建回合（用于过期判定） */
  createdRound: number;
  /** 过期回合（含）；-1 = 永久直到消费 */
  expireRound: number;
}

// Combatant 新增字段
export interface Combatant {
  // ... 现有字段保持不变 ...
  /** 待消费的优劣势标记列表（发起者赋予此参战者的一次性优劣势来源，如协助/法术效果） */
  pendingAdvantageSources?: PendingAdvantageSource[];
}
```

### 2.2 `src/data/advantageRules.ts` 类型骨架

```ts
import type {
  Combatant, Attack, NpcAttack,
  CheckScene, AdvantageReason, AdvantageResult, ManualMode, PendingAdvantageSource,
} from '@/types/combat';
import type { Character } from '@/types/character';

/** 优劣势上下文（所有检定场景共用） */
export interface AdvantageContext {
  scene: CheckScene;
  /** 当前回合数（用于 pending 过期判定） */
  currentRound?: number;
  /** 发起者（攻击者/施法者/检定者） */
  attacker?: Combatant | null;
  /** 目标（被攻击者/豁免者） */
  target?: Combatant | null;
  /** PC 发起者的角色卡（用于护甲熟练度等） */
  attackerCharacter?: Character | null;
  /** PC 目标的角色卡（预留，如隐匿检定装备判定） */
  targetCharacter?: Character | null;
  /** 攻击/法术对象（用于射程段判定） */
  attack?: Attack | NpcAttack | null;
  /** 投掷武器使用模式 */
  usageMode?: 'melee' | 'thrown';
  /** 发起者沙盘坐标 */
  attackerPos?: { col: number; row: number } | null;
  /** 目标沙盘坐标 */
  targetPos?: { col: number; row: number } | null;
  /** 距离（格数，切比雪夫距离） */
  distanceCells?: number;
  /** 豁免属性（仅 saving_throw 场景用） */
  saveAbility?: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
}

/** 检测器函数签名：接收上下文，返回优劣势原因（纯函数，无副作用） */
export type AdvantageDetector = (ctx: AdvantageContext) => AdvantageResult;

/**
 * 注册优劣势检测器（日后扩展用）
 * - 新检测器追加到内置列表末尾，按注册顺序执行
 * - 同一 name 重复注册会覆盖旧的（便于热替换/测试）
 * 例：日后接入 condition 系统
 *   registerDetector('condition', (ctx) => {
 *     const adv: AdvantageReason[] = [];
 *     if (hasCondition(ctx.attacker, 'poisoned')) adv.push({ kind: 'condition', label: '中毒' });
 *     return { advantage: [], disadvantage: adv };
 *   });
 */
export function registerDetector(name: string, fn: AdvantageDetector): void;

/** 注销检测器（测试/调试用） */
export function unregisterDetector(name: string): void;

/** 列出所有已注册检测器名（调试用） */
export function listDetectors(): string[];

/**
 * 核心检测函数：执行所有已注册检测器，合并结果
 * - 纯函数，无副作用，不消费 pending 标记
 * - pending 标记的"已消费"状态由调用方在检定确认后显式更新
 */
export function detectAdvantage(ctx: AdvantageContext): AdvantageResult;

/**
 * 合并手动覆盖与自动检测，返回最终模式
 * 规则：手动优先 > 自动检测；优劣势互斥抵消（D&D 5e）
 */
export function resolveRollMode(
  manual: ManualMode,
  auto: AdvantageResult,
): { mode: 'none' | 'advantage' | 'disadvantage'; reasons: AdvantageReason[] };

/**
 * 扫描 pending 标记，返回本次检定命中的待消费标记 ID 列表
 * - 引擎检测时调用此函数读取（只读），不修改 consumed 状态
 * - 调用方（弹窗）在检定确认后用返回的 ID 列表调 combatStore.consumePendingAdvantage
 */
export function getMatchedPendingSourceIds(
  ctx: AdvantageContext,
  auto: AdvantageResult,
): string[];
```

### 2.3 内置检测器清单（advantageRules.ts 内置，可被 unregister 移除）

| 检测器 name | 适用 scene | 来源 kind | 说明 |
|------------|-----------|----------|------|
| `equipment` | attack_melee / attack_ranged / attack_thrown / spell_attack | equipment | 不熟练护甲 → 劣势（迁移自现有逻辑） |
| `positional` | attack_ranged / attack_thrown | positional | 5 尺远程攻击 → 劣势；投掷最大射程段 → 劣势（迁移自现有逻辑） |
| `pending` | 所有 scene | pending | 扫描 attacker.pendingAdvantageSources，按 scene/targetId/过期/已消费 过滤 |

> **预留接入点**（本次不实现，仅注释说明注册方式）：
> - `action`：dodge（被攻击者回避 → 攻击劣势）、hide（隐匿检定）
> - `condition`：中毒/束缚/倒地/隐形等状态（待 condition 系统建立后注册）
> - `environment`：光照/遮蔽（待光照系统建立后注册）

## 三、调用链路

### 3.1 攻击检定流程（重构后）

```
CombatAttackModal.tsx
  ├─ 构造 AdvantageContext
  │   scene = usageMode==='thrown' ? 'attack_thrown'
  │         : treatAsRanged ? 'attack_ranged' : 'attack_melee'
  │   attacker/target/attackerCharacter/attack/pos/distance/currentRound
  ├─ const auto = detectAdvantage(ctx)              ← 调引擎（执行所有检测器）
  ├─ const { mode, reasons } = resolveRollMode(manualMode, auto)
  ├─ const pendingIds = getMatchedPendingSourceIds(ctx, auto)  ← 待消费标记 ID
  ├─ <AdvDisadvToggle manualMode={manualMode} onChange={setManualMode} mode={mode} reasons={reasons} />
  ├─ 摇骰：mode 决定 1 个/2 个 d20
  └─ handleConfirmRoll 确认后：
     ├─ combatStore.consumePendingAdvantage(record.id, attacker.id, pendingIds)  ← 消费标记
     └─ 打开 CombatDamageModal，传入 rollMode + reasons（展示来源）
```

### 3.2 法术检定流程（重构后）

```
CombatSpellModal.tsx
  ├─ 法术攻击检定（spell.attackType === 'attack'）：
  │   scene = 'spell_attack'
  │   detectAdvantage → resolveRollMode → AdvDisadvToggle
  │   确认后消费 pending
  ├─ 豁免检定（spell.saveType）：
  │   scene = 'saving_throw'
  │   detectAdvantage（当前无内置 saving_throw 检测器，返回空；预留 condition 接入点）
  │   resolveRollMode → AdvDisadvToggle
  │   确认后消费 pending
  └─ 伤害结算：传入 rollMode + reasons 给 CombatDamageModal
```

### 3.3 待消费标记施加流程（预留，本次不实现 UI）

```
日后实现 help 动作 / 法术效果时：
  combatStore.addPendingAdvantage(recordId, targetCombatantId, {
    fromId: helperId,
    fromName: '队友A',
    scene: 'attack_melee',   // 或 'any'
    mode: 'advantage',
    reason: '协助',
    kind: 'action',
    targetId: enemyId,       // 可选，限定目标
    createdRound: 5,
    expireRound: 5,          // 本回合内有效
  })
  → 写入 targetCombatant.pendingAdvantageSources
  → 下次该参战者检定时引擎自动扫描命中
```

### 3.4 引擎检测顺序（detectAdvantage 内部）

```
detectAdvantage(ctx):
  result = { advantage: [], disadvantage: [] }
  for detector in registeredDetectors:    // 按注册顺序
    r = detector(ctx)                      // 纯函数调用
    result.advantage.push(...r.advantage)
    result.disadvantage.push(...r.disadvantage)
  return result

内置检测器执行顺序：
  1. equipment   → 装备劣势（不熟练护甲）
  2. positional  → 位置劣势（5 尺远程、投掷最大射程）
  3. pending     → 待消费标记（按 scene/targetId/过期/已消费 过滤）
  日后注册的检测器追加在末尾
```

### 3.5 pending 标记匹配规则（getMatchedPendingSourceIds）

```
for source in attacker.pendingAdvantageSources:
  if source.consumed: skip
  if currentRound > source.expireRound && source.expireRound !== -1: skip
  if source.scene !== 'any' && source.scene !== ctx.scene: skip
  if source.targetId && ctx.target && source.targetId !== ctx.target.id: skip
  if source.mode === 'advantage': 加入 advantage 命中列表
  else: 加入 disadvantage 命中列表
返回所有命中 source 的 id 列表
```

## 四、权限认证

本次任务**不涉及云 API**（pending 标记仅本地 localStorage，与 combatStore 同生命周期），无需修改 `functions/_utils.ts` 或 `src/lib/api.ts`。

## 五、预读文件清单（实现阶段一次读入）

> 实现阶段开头按此清单一次性 Read，避免重复读取堆积上下文。

| 文件 | 用途 | 必读段落 |
|------|------|---------|
| `src/components/CombatAttackModal.tsx` | 迁移现有 3 个劣势逻辑、手动菜单、摇骰确认逻辑 | 行 1-100（props/state）、150-170（AMMO_MAP，仅参考不改）、340-540（优劣势+摇骰+确认）、840-910（手动菜单 UI） |
| `src/components/CombatSpellModal.tsx` | 接入 advantageRules、替换手动菜单 | 行 1-50、160-280（state + rollMode）、310-400（豁免检定）、670-720（手动菜单 UI） |
| `src/components/CombatDamageModal.tsx` | 扩展 disadvantage prop | 行 1-30、80-100、190-205 |
| `src/types/combat.ts` | 新增 PendingAdvantageSource 等类型 + Combatant 字段 | 全文（已读，224 行） |
| `src/types/character.ts` | 读取 proficiencies/wornArmorId/Equipment 字段 | 行 148-210 |
| `src/data/combatStore.ts` | 参考骨架 + 新增 pending 方法 | 行 1-60（骨架）、357-460（load/save/normalize）、695-745（turnTodo CRUD 范本） |
| `src/data/characterStore.ts` | 参考 8 件套骨架范本（仅参考，不修改） | 行 1-80 |

## 六、设计模式复用（§四 对照）

| 模式 | 本次应用 |
|------|---------|
| 工厂函数 `extractBaseFields` | 不涉及 |
| 聚合 Hook `useEquipmentActions` | 不涉及 |
| 变更漏斗 `EquipmentChanges` | **类比应用**：pendingAdvantageSources 同样是战斗期间临时属性，挂 `Combatant` 而非角色卡，与 `equipmentChanges` 同构原则 |
| 双轨认证 | 不涉及（无云 API） |
| 双指缩放锚点 | 不涉及 |
| 长按落空回退 | 不涉及 |
| 武器属性解析 | 不涉及 |
| **新设计模式：注册式优劣势引擎** | `advantageRules.ts` 纯函数模块 + `registerDetector` 注册接口。**为什么用**：优劣势判定是只读计算，纯函数便于跨场景复用（攻击/法术/豁免/技能）；注册式使日后接入 condition/action 系统时不改引擎核心，符合开闭原则，避免逻辑散落在各弹窗组件内导致行为不一致 |

## 七、AGENTS.md 同步责任

完成后需更新 AGENTS.md 以下章节：
- §0 速查表：新增 advantageRules.ts 模块、AdvDisadvToggle.tsx 组件
- §2.2 目录速查：新增 advantageRules.ts / AdvDisadvToggle.tsx
- §5 设计模式：新增 §5.7 注册式优劣势引擎（说明 why + 注册示例）
- §7 踩坑清单：追加"优劣势判定必须走 advantageRules.detectAdvantage，禁止在弹窗内硬编码；新增优劣势来源用 registerDetector 注册"
