# attack_roll - 法术攻击

## 功能概述

施法者进行法术攻击检定，逐目标对抗 AC 并给出命中结果。自然 20 必中，自然 1 必失。

## 当前配置项

当前 `NODE_CONFIG_SCHEMA.attack_roll` 为空数组，节点没有可编辑配置。攻击加值、AC 全部由运行时推导。

## 攻击加值

- PC 施法者：`characterStore.getSpellAttackBonus(character)`，取不到时按 0。
- 纯 NPC 参战者：`熟练加值 + 精神三维（智/感/魅）最大调整值`。
- 施法者无法解析时返回失败“施法者不存在”。

## 目标 AC

按优先级取值：

1. 参战者 `ac`（数字）。
2. 角色卡 `armorClass`（数字）。
3. 估算值 15。

## 投骰与命中

- 通过 `FlowDiceSource` 请求 `purpose: 'attack'` 的 d20；手动值在 1-20 内则采用，否则自动掷。
- 自然 20 必中，自然 1 必失，其余按 `d20 + 攻击加值 >= AC`。

## 输出

| 字段 | 说明 |
|------|------|
| `results` | 逐目标结果数组 |
| `message` | 命中数汇总 |

`results[]` 字段：`targetId`、`targetName`、`attackBonus`、`d20Roll`、`attackTotal`、`targetAC`、`isNatural20`、`isNatural1`、`hit`；目标不存在时带 `error`。

节点状态：全部命中为 `success`，全部未命中或无有效目标为 `failure`，混合为 `partial`。

## 相关实现

- 类型与 Schema：`src/types/flow.ts` 的 `NODE_CONFIG_SCHEMA.attack_roll`
- 执行：`src/lib/flowCompiler.ts` 的 `executeAttackRollNode`
