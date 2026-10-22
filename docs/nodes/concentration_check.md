# concentration_check - 专注检定

## 功能概述

施法者进行体质检定对抗 DC 10，用于判断专注是否维持。当前实现只覆盖基础规则，伤害触发的 DC（10 与伤害半数取高）尚未接入。

## 当前配置项

当前 `NODE_CONFIG_SCHEMA.concentration_check` 为空数组，DC 固定为 10，属性固定为体质。

## 检定规则

- 属性：`constitution`。
- DC：固定 10。
- 属性值：PC 取角色卡 `abilities.constitution.score`，纯 NPC 取参战者 `constitution`，缺省 10。
- 调整值：`Math.floor((属性值 - 10) / 2)`。
- d20：通过 `FlowDiceSource` 请求 `purpose: 'concentration'`；手动值在 1-20 内则采用，否则自动掷。
- 成败：`d20 + 调整值 >= 10`。

## 输出

| 字段 | 说明 |
|------|------|
| `ability` | `constitution` |
| `dc` | 10 |
| `abilityScore` | 使用的属性值 |
| `abilityModifier` | 属性调整值 |
| `d20Roll` | d20 结果 |
| `total` | 检定总值 |
| `success` | 是否维持专注 |
| `message` | 完整检定描述 |

注意：节点 `status` 恒为 `success`（表示节点执行完成），专注成败只看 `output.success`。需要按专注成败分流时，应在后续 `condition_branch` 中读取该字段。

施法者不存在时返回 `failure` 和 `error: 施法者不存在`。

## 相关实现

- 类型与 Schema：`src/types/flow.ts` 的 `NODE_CONFIG_SCHEMA.concentration_check`
- 执行：`src/lib/flowCompiler.ts` 的 `executeConcentrationCheckNode`
