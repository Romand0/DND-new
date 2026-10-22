# cast_start - 施法开始

## 功能概述

流程入口节点。校验流程绑定的法术、解析施法者身份，并执行成分、射程、施法时间三项前置检查。检查结果写入 `checkReport`，不消耗法术位或动作资源。

## 前置条件

- `context.spellId` 必须存在，否则返回 `流程未绑定法术`。
- 法术必须能在 `spellStore` 中查到。
- 施法者必须可解析：`combatants` 映射存在时按参战者解析（PC 经 `characterId` 查角色卡，纯 NPC 使用最小桩）；无映射时 `casterId` 直接作为角色卡 ID。

## 当前配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `autoChecks.components` | boolean | 否 | `true` | 是否执行成分检查 |
| `autoChecks.range` | boolean | 否 | `true` | 是否执行射程检查 |
| `autoChecks.time` | boolean | 否 | `true` | 是否执行施法时间检查 |
| `autoChecks.componentsDetail` | text | 否 | `''` | 只读回填字段，不渲染控件 |
| `autoChecks.rangeDetail` | text | 否 | `''` | 只读回填字段，不渲染控件 |
| `autoChecks.timeDetail` | text | 否 | `''` | 只读回填字段，不渲染控件 |
| `overrideComponents` | text | 否 | `''` | Schema 中存在，当前运行时未使用 |
| `overrideRange` | number | 否 | `null` | 覆盖法术射程（尺） |
| `overrideTime` | select | 否 | `null` | 覆盖施法时间，如 `1 action`、`1 bonus action` |

`autoChecks` 的三项开关只影响检查报告文本的生成；成分/射程/时间三项检查本身都会参与 `overall` 汇总。

## 检查规则

### 成分

- 言语（V）：`caster.canSpeak === false` 时缺失。
- 姿势（S）：`deriveCanGesticulate(caster, activeConditions)` 推导；若 `caster.canGesticulate === false` 则强制不可用。
- 材料（M）：当前恒视为已准备。
- `overrideComponents` 当前不参与判定。

### 射程

- 要求射程 = `overrideRange`，否则从法术 `range` 文本提取数字，无法提取时按 30 尺。
- 施法者与至少一个目标都有沙盘坐标时，按切比雪夫距离 `max(|Δcol|, |Δrow|) × 5` 计算最近目标距离。
- 任一方缺少坐标时跳过校验：`inRange = true`、`assumed = true`，报告中注明“无位置数据，跳过校验”。

### 施法时间

- 要求时间 = `overrideTime`，否则使用法术 `castingTime`，再否则 `1 action`。
- `isCastingTimeAvailable` 当前恒返回 `true`，动作/法术位消耗尚未接入此节点。

## 输出

成功：

| 字段 | 说明 |
|------|------|
| `spellId` | 流程绑定的法术 ID |
| `checkReport` | `components` / `range` / `time` / `overall` / `autoChecks` |
| `spellSlotReserved` | 恒为 `true`（占位标记，未实际扣资源） |
| `message` | “前置检查通过，可以继续施法” |

失败：

| 字段 | 说明 |
|------|------|
| `checkReport` | 检查报告 |
| `error` | 失败原因（法术缺失或前置检查失败） |

`checkReport.overall` 取值：三项全通过为 `pass`，部分通过为 `partial`，全失败为 `fail`。仅 `fail` 会阻断流程。

## 相关实现

- 类型与 Schema：`src/types/flow.ts` 的 `CastStartConfig`、`NODE_CONFIG_SCHEMA.cast_start`
- 执行：`src/lib/flowCompiler.ts` 的 `executeCastStartNode`、`executePreCastChecks`、`checkComponents`、`checkRange`、`checkTime`
- 姿势判定：`src/data/somaticCheck.ts`
