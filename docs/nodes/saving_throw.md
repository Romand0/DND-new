# saving_throw - 豁免检定

## 功能概述

让每个已选目标进行指定属性的豁免检定，按 `d20 + 豁免加值 >= DC` 判定成败。多目标结果汇总为 `success` / `partial` / `failure`。

## 当前配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `ability` | select | 是 | `dexterity` | `strength` / `dexterity` / `constitution` / `intelligence` / `wisdom` / `charisma` |
| `dc` | template | 是 | `${caster.spellSaveDc}` | 留空时按施法者法术豁免 DC；显式数字按固定 DC |

### DC 解析

- `dc` 去空白后为空字符串：PC 施法者取 `characterStore.getSpellSaveDC`；无角色卡的 NPC 施法者按 `8 + 熟练加值 + 精神三维最大调整值` 启发式计算。
- `dc` 非空：按 `parseInt` 解析为固定 DC；无法解析时回落 10。
- 当前运行时不会对 `${caster.spellSaveDc}` 这类模板字符串做变量替换，因此默认模板值会走“解析失败回落 10”分支。需要动态 DC 时建议留空。

## 豁免加值

- PC（有角色卡）：`characterStore.getSaveBonus(character, ability)`，失败时回落属性调整值。
- 纯 NPC 参战者：属性调整值 + 若 `proficientSaves` 包含该属性则加熟练加值。

## 投骰

- 通过 `FlowDiceSource` 请求 `purpose: 'save'` 的 d20；手动值在 1-20 内则采用，否则自动 `rollDie(20)`。
- 每个目标独立投骰。

## 输出

| 字段 | 说明 |
|------|------|
| `results` | 逐目标结果数组 |
| `dc` | 本次使用的 DC |
| `ability` | 豁免属性 |
| `message` | 成功数汇总 |

`results[]` 字段：`targetId`、`targetName`、`ability`、`abilityScore`、`saveBonus`、`dc`、`d20Roll`、`total`、`success`；目标不存在时带 `error`。

节点状态：全部成功为 `success`，全部失败或无有效目标为 `failure`，混合为 `partial`。

## 与效果节点的配合

- 后续 `apply_effect` / `scaled_effect` 配置 `halfDamageOnSave` 时，本节点结果用于逐目标判断：豁免成功则伤害分量减半后再结算抗性。
- 未配置半伤时，流程确认阶段会跳过豁免成功目标的效果应用（摘要显示“无效”）。

## 相关实现

- 类型与 Schema：`src/types/flow.ts` 的 `SavingThrowConfig`、`NODE_CONFIG_SCHEMA.saving_throw`
- 执行：`src/lib/flowCompiler.ts` 的 `executeSavingThrowNode`、`npcSaveBonus`
