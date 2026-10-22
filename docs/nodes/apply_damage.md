# apply_damage - 伤害应用（历史设计稿）

## 状态

`apply_damage` 不在当前 `FlowNodeType` 中，`NODE_TYPE_REGISTRY` 与 `NODE_CONFIG_SCHEMA` 均未注册，编译器 `executeNode` 也不会执行该类型。本文仅记录历史设计，供旧流程迁移参考。

## 历史设计

早期方案把“伤害计算、AC 检查、伤害类型与抗性”放在独立节点中，配置包含：

| 字段 | 说明 |
|------|------|
| `damage` | 伤害值或表达式 |
| `damageType` | 伤害类型 |
| `attackRoll` | 攻击检定结果 |
| `targetAC` | 目标 AC |
| `critical` | 是否暴击 |
| `autoHit` / `autoMiss` | 强制命中/未命中 |

## 当前替代方案

- 命中判定：`attack_roll` 或 `saving_throw`。
- 伤害/治疗结算：`apply_effect`（固定骰式）或 `scaled_effect`（按等级/环位取档）。
- 抗性/易伤/免疫：由 `src/data/damageRules.ts` 的 `resolveDamage` 统一处理，伤害节点输出 `finalValue`、`resisted`、`immune`、`vulnerable`、`affinityBreakdown`。
- 暴击：在战斗弹窗侧按“只翻倍伤害骰、不翻倍固定加值”处理，再进入抗性结算。

## 迁移建议

1. 旧流程中的 `apply_damage` 节点改为 `apply_effect`。
2. 把 `damage` 映射到 `value`，`damageType` 保留（英文旧值会自动归一化为中文标准类型）。
3. 命中/豁免判定保留为独立前置节点，通过边连接效果节点。
4. 需要按等级缩放时改用 `scaled_effect`，不要再用条件分支链模拟。

## 相关实现

- 当前节点枚举：`src/types/flow.ts` 的 `FlowNodeType`
- 抗性结算：`src/data/damageRules.ts`
- 效果节点：`src/lib/flowCompiler.ts` 的 `executeApplyEffectNode`、`executeScaledEffectNode`
