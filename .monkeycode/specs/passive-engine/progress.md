# 进度：passive-engine（PC 被动战斗规则引擎）

> 唯一状态源。七类口径冻结于 2026-11-15，出处 `src/data/passiveCombatRules.ts` 分节注释（原注释编号 1–6、类3 重复，实际七类）。

## 七类口径（冻结）

| # | 类别 | 派生入口 | 接线点 |
|---|------|----------|--------|
| 1 | 豁免优劣势（含灵光） | `detectPassiveFeatureRules` | advantageRules `passive-feature` 检测器 |
| 2 | 伤害抗性/免疫 | `deriveCharacterAffinities` | combatant.damageAffinities 入战快照 |
| 3 | 无甲防御 AC | `resolveUnarmoredAc` / `computeCombatantAc` | 角色卡 AC + 战斗层 AC |
| 4 | 速度修正 | `deriveSpeedModifier` | combatant.speedModifier |
| 5 | 被动检定三件套 | `derivePassiveChecks` | combatant.passiveChecks |
| 6 | 黑暗视觉 | `deriveDarkvision` | combatant.darkvision |
| 7 | 先攻优劣势 | `deriveInitiativeAdvantage` | InitiativeRollDialog 提示 |

## 验收状态

- [x] 验收探针 `scripts/probes/probe-passive2.cjs` 改造为断言式（七类单元派生 19 项 + UI 冒烟 3 项）
- [x] 验收执行（2026-11-15）：probe-passive2 22/22 全绿（七类 19 项 + UI 冒烟 3 项）；按用户指示跳过 build（代码合法性已验证）

## 已知缺口（整改项，不计入本次「引擎已接通」验收）

1. 半身人种子条目名「勇气」，规则表 trait 为「勇敢」→ 恐慌豁免优势永不触发
2. 类1/2/3/4 的条目匹配无等级门槛（类5/6/7 用 `hasActiveTrait` 有门槛）→ 低级角色携带高级职业特性会提前生效
3. 种子数据无 `Feature.reaction` / `Spell.reaction` 声明（反应引擎数据面为空）

## 验证方式

- 单探针：`BASE_URL=http://localhost:5174 NODE_PATH=$(npm root -g) node scripts/probes/probe-passive2.cjs`
- 全量：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`）
