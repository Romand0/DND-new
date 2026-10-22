# select_target - 目标指定

## 功能概述

校验 `context.targets` 中已选目标的数量与模式是否合法。目标选择本身由战斗弹窗或沙盘完成，本节点只做规则检查，不会弹出选择界面。

## 当前配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `mode` | select | 是 | `single` | `self` / `single` / `multi` / `area` |
| `maxCount` | number | 是 | `1` | 允许的最大目标数 |

## 检查规则

1. `context.targets` 为空：返回失败“未选择目标”。
2. `mode === 'single'` 且目标数大于 1：返回失败“单体目标模式下只能选择一个目标”。
3. 任意模式下目标数大于 `maxCount`：返回失败“最多只能选择 N 个目标”。
4. `self` 与 `area` 当前没有额外语义，仅按 `maxCount` 做上限校验。

## 输出

成功：

| 字段 | 说明 |
|------|------|
| `mode` | 当前模式 |
| `selectedTargets` | 目标 ID 数组 |
| `message` | 已选择 N 个目标 |

失败：`output.error` 为具体原因。

## 相关实现

- 类型与 Schema：`src/types/flow.ts` 的 `NODE_CONFIG_SCHEMA.select_target`
- 执行：`src/lib/flowCompiler.ts` 的 `executeSelectTargetNode`
