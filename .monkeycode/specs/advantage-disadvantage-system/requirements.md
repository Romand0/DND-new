# 优劣势接口完善 — 需求文档

## 背景

当前优劣势系统存在显著缺口（详见调研报告）：
- 优劣势判定逻辑**硬编码在 `CombatAttackModal.tsx` 单一组件内**（行 369-405），无法被法术/豁免/技能检定复用
- 仅有 3 个劣势来源（不熟练护甲、5 尺远程攻击、投掷最大射程段），**0 个优势来源**
- **完全没有 condition / status 系统**，也无任何可扩展的接入点
- `CombatSpellModal.tsx` 只有手动覆盖菜单，**无自动检测**
- `CombatAttackModal.tsx` 与 `CombatSpellModal.tsx` 的手动覆盖菜单重复实现

用户诉求（原文）："接下来很多包括动作和状态的机制都会影响参战者的检定优劣势，既有发起者赋予自己的，也有发起者赋予他人的，我希望优劣势接口能够尽可能完善以适配各种可能的场景。"

经澄清：
- **状态系统不是本次重点** —— 不建 conditionStore / condition.ts，本次只做接口
- **动作机制仅做接口预留** —— 不落地 dodge/help/hide 等任何动作
- **本次不做状态结算 UI** —— condition_check 待办结算留后续
- **核心目标**：在攻击/伤害/法术命中/法术豁免等场景做**完善的优劣势接口**，使日后的各种优劣势特性能**编码化地接入系统**

## 目标

构建一个**纯计算、注册式、跨场景复用**的优劣势引擎，配套"待消费标记"机制支持发起者赋予他人的优劣势，使：
1. 攻击检定 / 法术攻击检定 / 法术豁免检定 / 伤害展示 都能基于统一接口判定优劣势
2. 现有 3 个劣势逻辑迁移到引擎，行为不变
3. 日后新增优劣势来源（状态/动作/装备/法术效果等）时，只需**注册一个检测器函数**或**添加一条 pending 标记**，无需修改引擎核心或各弹窗组件
4. 保留 DM 手动覆盖能力，行为与现有 `CombatAttackModal` 一致（手动优先 > 自动检测，优劣势互斥抵消）

## 用户故事

| ID | 作为… | 我希望… | 以便… |
|----|------|--------|------|
| US1 | DM | 攻击弹窗能根据双方状态自动判定优势/劣势 | 不必每次手动勾选 |
| US2 | DM | 法术攻击和法术豁免检定也能享受同样的自动优劣势 | 一致体验 |
| US3 | DM | 能手动指定某次检定为优势/劣势并叠加自动检测 | 处理规则未覆盖的特殊情况 |
| US4 | 后续开发 agent | 能通过统一接口给新的检定场景接入优劣势引擎 | 不必重新写一遍判定逻辑 |
| US5 | 后续开发 agent | 能注册新的优劣势来源检测器（如"中毒状态""回避动作"） | 日后接入 condition/action 系统时不改引擎核心 |
| US6 | DM | 发起者能"赋予他人"一次性优劣势（如协助动作给盟友下次攻击优势） | 支持 help 类机制（动作本身不落地，仅留标记接口） |
| US7 | DM | 待消费的优劣势标记在检定命中后自动消费、回合结束自动过期 | 不残留无效标记 |
| US8 | DM | 伤害弹窗能展示本次命中的优劣势来源 | 复盘检定过程 |

## 输入输出与边界

### 输入

- 现有 `CombatAttackModal.tsx` 的 3 个劣势检测逻辑（保留并迁移到引擎）
- 现有 `CombatAttackModal.tsx` / `CombatSpellModal.tsx` 的手动覆盖菜单（抽取公共组件）
- 现有 `CombatDamageModal.tsx` 的 `disadvantage` prop（扩展为 reasons 列表）
- 现有 `Character.proficiencies` / `wornArmorId` 字段（不熟练护甲劣势来源）
- 现有 `Combatant` 接口（新增 pendingAdvantageSources 字段）

### 输出

新文件：
- `src/data/advantageRules.ts` — 纯计算优劣势引擎 + 注册式检测器 + pending 标记扫描
- `src/components/AdvDisadvToggle.tsx` — 手动覆盖公共组件（替换两弹窗重复实现）

修改文件：
- `src/types/combat.ts` — `Combatant` 新增 `pendingAdvantageSources?: PendingAdvantageSource[]` 字段
- `src/components/CombatAttackModal.tsx` — 删除硬编码判定，改调 `advantageRules`；替换手动菜单为 `AdvDisadvToggle`
- `src/components/CombatSpellModal.tsx` — 接入 `advantageRules`（法术攻击 + 豁免场景）；替换手动菜单为 `AdvDisadvToggle`
- `src/components/CombatDamageModal.tsx` — `disadvantage` prop 扩展为 `rollMode` + `reasons`，展示优劣势来源
- `src/data/combatStore.ts` — 新增 `addPendingAdvantage` / `consumePendingAdvantage` / `clearExpiredAdvantage` 方法；`load()` 字段兜底

### 验收标准

✅ 正常（必须满足）：
- `npx tsc --noEmit` 零错误
- `npm run build` 零错误
- 攻击弹窗原有的 3 个劣势来源（不熟练护甲/5 尺远程/投掷最大射程段）行为完全不变
- 法术弹窗的法术攻击检定能复用引擎（除武器专属规则外）
- 法术弹窗的豁免检定能接入引擎（预留 dex_save 类规则接入点，当前无内置规则返回空）
- `AdvDisadvToggle` 公共组件在两弹窗中行为一致（手动优先 > 自动检测，优劣势互斥抵消）
- 伤害弹窗能展示优劣势来源（rollMode + reasons）
- 引擎支持 `registerDetector(name, fn)` 注册新检测器，日后接入 condition/action 时不改引擎
- `combatStore.addPendingAdvantage` 能添加待消费标记，`consumePendingAdvantage` 能标记已消费
- 引擎扫描 pending 标记时能按 scene/targetId/过期/已消费 过滤，命中后自动消费

⚠️ 异常（可降级）：
- pending 标记的过期清理可由 `useRoundTurn` 在回合推进时调用 `clearExpiredAdvantage`，若集成点复杂可降级为"仅消费不清理"，留 TODO
- `CombatDamageModal` 的 reasons 展示可最小可用（只显示来源 label 列表），不做颜色区分

❌ 排除（不做）：
- **不建 condition 系统**（无 condition.ts / conditionStore.ts / Combatant.conditions 字段）
- **不落地任何动作机制**（dodge/help/hide 等仅留引擎接入点，不实现效果）
- **不做 condition_check 状态结算 UI**（TurnTodoBoard 占位弹窗保持不变）
- **不实现技能检定弹窗**（仅预留 CheckScene.skill_check 场景枚举）
- **不实现光照/遮蔽系统**
- **不修改云 API / 数据库迁移**（pending 标记仅本地 localStorage，与 combatStore 同生命周期）
- **不改变现有死亡豁免机制**
- **不引入新的第三方依赖**

## 关键决策点

### 决策 1：引擎采用注册式而非硬编码

**选择**：`advantageRules.ts` 内置检测器列表 + `registerDetector(name, fn)` 注册接口。
理由：用户要求"编码化接入"，日后接入 condition/action 系统时只需注册新检测器，不改引擎核心，符合开闭原则。

### 决策 2："发起者赋予他人"用待消费标记

**选择**：`Combatant.pendingAdvantageSources` 字段 + 引擎扫描消费。
理由：协助动作等是"一次性、可指定目标、可过期"的优劣势来源，用待消费标记比 condition 系统更贴合语义，且不依赖状态系统。

### 决策 3：引擎是纯函数模块

**选择**：`advantageRules.ts` 无 React 依赖、无 store 依赖。
理由：优劣势判定是只读计算，纯函数便于跨场景复用和单元测试。pending 标记的"消费"副作用由调用方（弹窗）在检定完成后显式调用 `combatStore.consumePendingAdvantage`。

### 决策 4：手动覆盖优先级保持不变

**选择**：手动优先 > 自动检测，优劣势互斥抵消（与现有 `CombatAttackModal` 一致）。
理由：不引入破坏性变更。

### 决策 5：pending 标记的消费时机

**选择**：检定**摇骰确认后**（`handleConfirmRoll`）消费匹配的 pending 标记，而非检测时立即消费。
理由：避免用户取消检定导致标记丢失；消费动作由弹窗显式调用，引擎只读不写。
