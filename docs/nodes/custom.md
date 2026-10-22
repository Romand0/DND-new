# custom - 自定义节点

## 功能概述

开放扩展节点，直接对配置的代码字符串执行 `eval`。适合临时验证特殊机制，常规流程优先使用内置节点。

## 当前配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `code` | text | 否 | `''` | 自定义 JavaScript 代码 |

## 执行规则

1. `code` 为空：返回失败“自定义节点没有代码”。
2. 非空：在 `executeCustomNode` 作用域内直接 `eval(code)`。
3. 求值异常：返回失败并带错误信息。

## 输出

成功：

| 字段 | 说明 |
|------|------|
| `code` | 原始代码 |
| `result` | eval 返回值 |
| `message` | `自定义代码执行完成` |

失败：`output.error`。

## 安全提示

这是编译器保留的逃逸舱，拥有与前端运行时相同的权限。条件判断请使用 `condition_branch`（安全表达式求值器），不要在 custom 中拼接不可信输入。构建时 `flowCompiler.ts` 的 `eval` 会产生告警，属于已知情况。

## 相关实现

- 类型与 Schema：`src/types/flow.ts` 的 `NODE_CONFIG_SCHEMA.custom`
- 执行：`src/lib/flowCompiler.ts` 的 `executeCustomNode`
