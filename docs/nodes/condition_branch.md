# condition_branch - 条件分支

## 功能概述

对配置的条件表达式求值，输出布尔结果，配合 `on_true` / `on_false` 边分流。表达式由 `src/lib/flowExpression.ts` 的安全求值器执行，不使用 `eval`。

## 当前配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `condition` | template | 是 | `target.currentHp <= 100` | 条件表达式 |

## 求值作用域

| 变量 | 内容 |
|------|------|
| `state` | `context.stateSnapshot`（只读） |
| `results` | 已执行节点输出，按节点 ID 索引 |
| `spell` | 当前法术对象 |
| `caster` | 施法者角色卡，取不到时用参战者 |
| `targets` | 目标 ID 数组 |
| `prev` | 最近一次节点的输出（`results.results` 兼容别名） |

## 输出

| 字段 | 说明 |
|------|------|
| `condition` | 原始条件表达式 |
| `result` | 布尔求值结果 |
| `message` | `条件分支: <表达式> = <结果>` |

求值异常时状态为 `failure`，输出 `error: 条件表达式错误: ...`。

## 边触发

- `on_true`：`output.result === true`
- `on_false`：`output.result === false`

## 相关实现

- 类型与 Schema：`src/types/flow.ts` 的 `NODE_CONFIG_SCHEMA.condition_branch`
- 执行：`src/lib/flowCompiler.ts` 的 `executeConditionBranchNode`
- 表达式求值：`src/lib/flowExpression.ts`
