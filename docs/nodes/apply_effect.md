# apply_effect - 效果应用

## 功能概述

`apply_effect` 是法术流程中结算数值效果的节点：掷一次效果骰，对全部已选目标分别计算抗性/易伤/免疫，并给出抗性后的 HP 变化。编译器只做纯计算，不直接写库；HP 由战斗弹窗确认后回写。

## 当前配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `effectType` | select | 是 | `damage` | `damage` / `healing` / `status` / `check_modifier` |
| `value` | dice | 伤害/治疗时必填 | `8d6` | 效果骰表达式，如 `8d6`、`3d8+5` |
| `damageType` | select | 伤害时必填 | - | 标准伤害类型（火焰/寒冷/闪电/强酸/毒素/力场/黯蚀/光耀/心灵/雷鸣/穿刺/挥砍/钝击） |
| `damageComponents` | array | 否 | - | 多类型伤害分量，元素为 `{ type, value }`；填写后忽略 `value` 与 `damageType`，逐分量掷骰并分别结算抗性 |
| `halfDamageOnSave` | boolean | 否 | `false` | 读取最近一次豁免节点的结果；目标豁免成功时先把每个伤害分量减半，再结算抗性 |
| `damageSource` | select | 否 | `auto` | `auto`（沿用上下文，默认法术=魔法）/ `magical` / `nonmagical` |
| `affinityKind` | select | 状态时必填 | `resistance` | `resistance` / `immunity` / `vulnerability` |
| `damageTypes` | text | 否 | 空=全部 | 逗号分隔 DSL 伤害类型；留空表示全部类型 |
| `sourceKind` | select | 否 | 不限 | `weapon` / `spell` / `effect`；限定伤害来源 |
| `durationType` | select | 否 | `rounds` | `rounds`（按回合）/ `untilCasterTurn`（到施法者下一回合） |
| `durationRounds` | number | 否 | 空 | `>0` 时按回合计时自动消退；空或 0 表示手动解除 |
| `durationTurns` | number | 否 | `1` | 仅 `untilCasterTurn`：1=下一回合，2=下下回合 |
| `modifierMode` | select | 奖惩时必填 | `bonus` | `bonus`（奖励）/ `penalty`（惩罚） |
| `modifierDice` | dice | 否 | `1d4` | 每次触发检定额外投掷的奖惩骰 |
| `modifierFlat` | number | 否 | 空 | 与奖惩骰同时生效的固定加值 |
| `modifierScene` | select | 否 | `any` | 适用的检定类型（任意/攻击/近战/远程/投掷/法术攻击/属性/技能/豁免） |
| `modifierForced` | select | 否 | `true` | 强制自动计入 / 玩家可选；惩罚恒为强制 |
| `modifierUses` | number | 否 | `0` | `0`=状态型（随状态到期）；`>0`=计次消耗 |

字段按 `effectType` 条件显示：表单只渲染当前类型适用的字段，发布校验也只要求可见字段必填。历史配置中的英文伤害类型值（`fire`、`cold` 等）会在结算时自动归一化为标准中文类型。

`status` 与 `check_modifier` 不修改 HP，编译器只产出待落地记录（`statusId` + 实例级 `statusEffects`），由 `CombatSession.onFlowResolved` 统一写入状态库：`status` 落到通用 `damage_affinity`，`check_modifier` 按 `modifierUses` 落到次数型 `pendingCheckModifiers` 或状态型 `globalStatusManager`。

## 结算规则

1. 单分量时只掷一次效果骰，全部目标共用该结果；多分量时每个分量各掷一次，仍由全部目标共用。
2. 每个目标独立结算：
   - 免疫：伤害归零，优先级最高。
   - 抗性：`Math.floor(伤害 / 2)`。
   - 易伤：抗性结算后 `× 2`。
   - 同类型同时有抗性和易伤时两者都生效，结果标记为 `both`。
3. 未配置 `damageType` 时不应用抗性，并在结果 `notes` 中提示。
4. 治疗不参与抗性结算，HP 不超过 `maxHp`；伤害先由临时生命值吸收，剩余部分再扣当前 HP，HP 不低于 0。
5. `halfDamageOnSave` 开启时，每个目标先查最近一次豁免结果：豁免成功则每个伤害分量 `Math.floor(分量 / 2)`，再进入抗性/易伤/免疫结算。
6. 多类型分量逐分量匹配抗性，最后求和；同一分量同时命中抗性与易伤时两者都生效。

## 输出

节点根输出：

| 字段 | 说明 |
|------|------|
| `effectType` | 效果类型 |
| `value` | 原始骰式 |
| `damageType` | 归一化后的伤害类型 |
| `dice` | 单分量骰式明细；多分量时为 `null` |
| `diceList` | 多分量骰式明细数组（`type` / `expression` / 各骰结果） |
| `damageComponents` | 多分量配置摘要（`type` / `expression` / `base`） |
| `halfDamageOnSave` | 是否启用豁免半伤 |
| `results` | 逐目标结算结果数组 |
| `totalFinal` | 全部目标最终数值之和 |
| `anyResisted` / `anyImmune` / `anyVulnerable` | 是否存在对应抗性命中 |

`results[]` 单目标字段：

| 字段 | 说明 |
|------|------|
| `targetId` / `targetName` | 目标身份 |
| `effectType` | `damage` / `healing` |
| `effectValue` | 抗性前原始值（启用豁免半伤时已减半） |
| `finalValue` | 抗性结算后最终值（HP 扣减依据） |
| `damageType` | 单类型时为标准类型，多类型时为 `null` |
| `damageComponents` | 逐分量 `type` / `expression` / `base` / `final` / `affinity` |
| `halved` | 本目标是否因豁免成功而减半 |
| `oldHp` / `newHp` | 结算前后 HP（`newHp` 已考虑临时生命值吸收） |
| `tempHpBefore` / `tempAbsorbed` / `tempHpAfter` | 结算前临时 HP、被吸收量、吸收后剩余临时 HP |
| `effectApplied` | 是否实际应用 |
| `isCombatant` | 目标是参战者还是角色卡 |
| `resisted` / `immune` / `vulnerable` | 本目标是否命中对应亲和 |
| `notes` | 无法结构化但需要提醒 DM 的注释（如“带石肤术”） |
| `affinitySummary` | `none` / `resistance` / `vulnerability` / `both` / `immunity` |
| `affinityBreakdown` | 每个伤害分量的 `type/base/final/affinity` |

## scaled_effect

`scaled_effect` 先按角色等级或法术环位选出骰式档位，再复用同一套抗性结算逻辑。

| 字段 | 说明 |
|------|------|
| `scaleBy` | `caster_level` / `spell_level` |
| `tiers` | 分档表，元素为 `{ level, value }` |
| `effectType` | `damage` / `healing` |
| `damageType` | 标准伤害类型 |
| `damageSource` | 同 `apply_effect` |
| `halfDamageOnSave` | 同 `apply_effect` |

分档命中规则：过滤非法行后按 `level` 降序排序，取第一个 `缩放值 >= level` 的档位；全部不满足时取最低档。`caster_level` 读角色卡 `level`（纯 NPC 按 0），`spell_level` 读当前法术 `level`（无法术按 0）。

输出额外包含 `scaleBy`、`scaleValue`、`scaleSource`、`matchedTier`、`tiers`，其余字段与 `apply_effect` 一致。

## 相关实现

- 类型：`src/types/damage.ts`
- 解析与结算：`src/data/damageRules.ts`
- 编译器：`src/lib/flowCompiler.ts` 的 `executeApplyEffectNode` / `executeScaledEffectNode` / `applyValueToTargets` / `resolveNodeDamageSource`
- 参战者快照读取：`src/data/combatAffinities.ts`
