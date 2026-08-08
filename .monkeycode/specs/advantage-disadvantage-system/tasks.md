# 优劣势接口完善 — 任务清单

> 任务分四组：A(类型+store)/B(引擎)/C(UI 改造)/D(集成收尾+文档)
> **可并行组**：A 完成后 B 与 C1 可并行；C2-C4 依赖 A+B 接口签名；D 串行收尾。

---

## 组 A：类型 + combatStore 方法（串行，1 个 agent，做基准）

> 产物：`combat.ts` 新增类型 + `Combatant` 字段扩展 + `combatStore` pending 方法。这是 B/C 组的约定输入。

| 任务 | 文件 | 说明 | 依赖 |
|------|------|------|------|
| A1 | `src/types/combat.ts` | 新增类型：`CheckScene`（7 种场景）、`AdvantageSourceKind`（6 种来源）、`AdvantageReason`、`AdvantageResult`、`ManualMode`、`PendingAdvantageSource`（详见 design.md §2.1）。`Combatant` 接口新增 `pendingAdvantageSources?: PendingAdvantageSource[]` 字段 | 无 |
| A2 | `src/data/combatStore.ts` | 新增方法（参考 8 件套骨架 + turnTodo CRUD 范本）：<br>- `addPendingAdvantage(recordId, combatantId, source: Omit<PendingAdvantageSource,'id'|'consumed'>)`：生成 id + consumed=false，写入 combatant.pendingAdvantageSources，save()<br>- `consumePendingAdvantage(recordId, combatantId, sourceIds: string[])`：批量置 consumed=true，save()<br>- `clearExpiredAdvantage(recordId, combatantId, currentRound)`：移除 expireRound < currentRound 且 expireRound !== -1 的标记，save()<br>- `getPendingAdvantages(combatant)`：返回未消费的标记列表（只读）<br>`load()` combatant normalize 时兜底 `pendingAdvantageSources: Array.isArray(c.pendingAdvantageSources) ? c.pendingAdvantageSources : []` | A1 |

**预计文件**：2 修改

**A 组验证**：`npx tsc --noEmit`

---

## 组 B：优劣势引擎（依赖 A，可与 C1 并行）

> 产物：纯计算模块，无 React/store 依赖。这是 C2-C4 的核心依赖。

| 任务 | 文件 | 说明 | 依赖 |
|------|------|------|------|
| B1 | `src/data/advantageRules.ts` | 新建：核心引擎 + 注册机制 + 内置 3 个检测器<br>- `AdvantageContext` / `AdvantageDetector` 类型（详见 design.md §2.2）<br>- `detectors: Map<string, AdvantageDetector>` 内部注册表<br>- `registerDetector(name, fn)` / `unregisterDetector(name)` / `listDetectors()` 注册 API<br>- `detectAdvantage(ctx)`：按注册顺序执行所有检测器，合并结果<br>- 内置检测器 1 `equipment`：迁移不熟练护甲劣势（读 ctx.attackerCharacter.wornArmorId + proficiencies）<br>- 内置检测器 2 `positional`：迁移 5 尺远程 + 投掷最大射程段劣势（读 ctx.scene/distanceCells/attack/usageMode + getRangeTier 逻辑）<br>- 内置检测器 3 `pending`：扫描 ctx.attacker.pendingAdvantageSources，按 scene/targetId/过期/已消费 过滤，返回 AdvantageReason（kind='pending'）<br>- 注释预留 action/condition/environment 接入点示例 | A1 |
| B2 | `src/data/advantageRules.ts` | 同文件追加：<br>- `resolveRollMode(manual, auto)`：手动优先 > 自动检测，优劣势互斥抵消（迁移自 CombatAttackModal.computeRollMode）<br>- `getMatchedPendingSourceIds(ctx, auto)`：从 auto 结果中提取 kind='pending' 的 pendingSourceId 列表，供调用方消费 | B1 |

**预计文件**：1 新增

**B 组验证**：`npx tsc --noEmit`

**注意**：`equipment` 和 `positional` 检测器需复用现有 `CombatAttackModal` 的辅助函数（`isThrownWeapon`/`isRangedWeapon`/`getRangeTier`）。这些函数当前在组件内，B1 需将其一并迁移到 `advantageRules.ts` 或新建 `weaponUtils.ts`（优先迁移到 advantageRules.ts 内部，避免新文件）。

---

## 组 C：UI 改造（部分可并行）

### C1：AdvDisadvToggle 公共组件（可与 B 并行，仅依赖 A 类型）

| 任务 | 文件 | 说明 | 依赖 |
|------|------|------|------|
| C1 | `src/components/AdvDisadvToggle.tsx` | 新建：抽取 `CombatAttackModal` 行 855-906 和 `CombatSpellModal` 行 678-712 的手动覆盖菜单<br>Props: `{ manualMode: ManualMode; onChange: (m: ManualMode) => void; mode: 'none'\|'advantage'\|'disadvantage'; reasons: AdvantageReason[] }`<br>UI：右上角 `MoreHorizontal` 按钮弹出菜单（无/优势/劣势三选项），下方展示自动检测的原因列表（按 kind 区分颜色：equipment=灰、positional=黄、pending=蓝、action/condition=预留、manual=紫）<br>导出 `export default function AdvDisadvToggle(props)` | A1 |

### C2-C4：弹窗改造（依赖 B 完成）

| 任务 | 文件 | 说明 | 依赖 |
|------|------|------|------|
| C2 | `src/components/CombatAttackModal.tsx` | 修改：<br>- 删除 `getAttackAdvantageDisadvantage`(369-405) / `computeRollMode`(408-416) / `getRollModeReasons`(419-424)<br>- 删除 `isThrownWeapon`/`isRangedWeapon`/`getRangeTier`（已迁移到 B1）<br>- `pickDefaultUsageMode` 改调 `advantageRules.detectAdvantage` + `resolveRollMode`<br>- 构造 `AdvantageContext`（scene 根据 usageMode/treatAsRanged 选择 attack_melee/attack_ranged/attack_thrown）<br>- 替换行 855-906 手动菜单为 `<AdvDisadvToggle>`<br>- `handleConfirmRoll` 确认后调 `combatStore.consumePendingAdvantage(record.id, attacker.id, pendingIds)`<br>- 摇骰逻辑保持不变（mode 决定 1/2 个 d20）<br>- 打开 CombatDamageModal 时传入 rollMode + reasons | B1, B2, C1 |
| C3 | `src/components/CombatSpellModal.tsx` | 修改：<br>- 法术攻击检定（spell.attackType === 'attack'）：scene='spell_attack'，调 detectAdvantage + resolveRollMode<br>- 豁免检定（spell.saveType）：scene='saving_throw'，调 detectAdvantage（当前无内置 saving_throw 检测器，返回空，预留接入点）<br>- 替换行 678-712 手动菜单为 `<AdvDisadvToggle>`<br>- 确认后调 consumePendingAdvantage<br>- 伤害结算传入 rollMode + reasons | B1, B2, C1 |
| C4 | `src/components/CombatDamageModal.tsx` | 修改：`disadvantage?: boolean` prop 扩展为 `rollMode?: 'none'\|'advantage'\|'disadvantage'` + `reasons?: AdvantageReason[]`（保留 disadvantage 向后兼容，若传了 rollMode 则优先用）<br>UI：展示优劣势标签 + 来源列表（最小可用版，只显示 label） | A1 |

**预计文件**：1 新增 + 3 修改 = 4 文件

**C 组验证**：`npx tsc --noEmit`

---

## 组 D：集成收尾 + 文档（串行，依赖 A+B+C 全部完成）

| 任务 | 文件 | 说明 | 依赖 |
|------|------|------|------|
| D1 | `src/hooks/combat/useRoundTurn.ts` | 修改（最小集成）：`advanceTurn` 进入新回合时，对当前回合参战者调 `combatStore.clearExpiredAdvantage(record.id, combatantId, currentRound)` 清理过期 pending 标记。若集成点复杂（如 currentRound 获取困难）可降级为留 TODO 注释，不强制 | A2 |
| D2 | 全项目 | 跑 `npx tsc --noEmit` + `npm run build` 双重验证，零错误才算通过 | A, B, C, D1 |
| D3 | `/workspace/AGENTS.md` | 按 design.md §7 更新：<br>- §0 速查表：新增 advantageRules.ts 模块、AdvDisadvToggle.tsx 组件<br>- §2.2 目录速查：新增 advantageRules.ts / AdvDisadvToggle.tsx<br>- §5 设计模式：新增 §5.7 注册式优劣势引擎（说明 why + registerDetector 示例）<br>- §7 踩坑清单：追加"优劣势判定必须走 advantageRules.detectAdvantage，禁止在弹窗内硬编码；新增优劣势来源用 registerDetector 注册" | D2 |
| D4 | git | `git checkout -b feature/advantage-disadvantage-system` → 分组提交（A/B/C/D 各一个 commit，conventional commits 格式）→ build 通过后 merge --no-ff 到 main → push origin main（按 §8.3 默认自动 push） | D2, D3 |

**预计文件**：1 修改 + 1 文档 = 2 文件

---

## 并行策略总结

```
阶段 1（串行）：A1 → A2（类型 + store 方法）
    ↓
阶段 2（并行）：
    ├─ agent X：B1 → B2（advantageRules 引擎，迁移现有逻辑 + 注册机制）
    └─ agent Y：C1（AdvDisadvToggle 公共组件）
    ↓
阶段 3（可并行，3 个弹窗互不 import）：
    ├─ C2（CombatAttackModal 改造）
    ├─ C3（CombatSpellModal 改造）
    └─ C4（CombatDamageModal 扩展）
    ↓
阶段 4（串行）：D1 → D2 → D3 → D4（收尾 + 文档 + git）
```

## 预计总文件数

- 新增：2（advantageRules.ts / AdvDisadvToggle.tsx）
- 修改：5（combat.ts / combatStore.ts / CombatAttackModal.tsx / CombatSpellModal.tsx / CombatDamageModal.tsx）
- 集成：1（useRoundTurn.ts，可能最小改动或仅注释）
- 文档：1（AGENTS.md）
- **合计**：9 文件（符合长任务 ≥5 文件触发条件）

## Fail Fast 规则

- 同一类型错误（tsc/build）最多改 1 次
- 若 `advantageRules` 接口在 C2/C3 改造时发现签名不匹配，**优先调整 C2/C3 的调用方式**，不回改 B 的接口（保持引擎纯净）
- 若 `weaponUtils` 函数迁移导致 `CombatAttackModal` 其他地方引用断裂，把断裂处的引用改为从 `advantageRules` 导入

## 静默模式规则

- 每完成一大组（A/B/C/D）只发一行：`✅ 完成：组X <简短说明>（文件：...）`
- 只在 3 种情况问用户：Spec 冲突 / 新依赖 / 破坏性改动
- 不逐文件解释代码，不铺垫下一步
