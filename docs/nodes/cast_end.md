# cast_end - 施法结束

## 功能概述

流程收尾节点，返回固定完成消息。当前没有资源清理、冷却更新或事件触发逻辑。

## 当前配置项

当前 `NODE_CONFIG_SCHEMA.cast_end` 为空数组。

## 输出

| 字段 | 说明 |
|------|------|
| `message` | `法术施放完成，资源已清理` |

节点状态恒为 `success`。

## 说明

`message` 中的“资源已清理”是占位文案。法术位、动作、材料等资源的实际扣减由战斗弹窗/宿主页面负责，本节点不修改任何状态。

## 相关实现

- 类型与 Schema：`src/types/flow.ts` 的 `NODE_CONFIG_SCHEMA.cast_end`
- 执行：`src/lib/flowCompiler.ts` 的 `executeCastEndNode`
