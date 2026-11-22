# 自审报告 —— <流程名称>

> Agent 完成后逐项打勾。任何一项失败都不得进入人工评审。机器校验只是下限，语义与规则由人类审定。

## 门 A：结构合法

- [ ] `id` 是非空字符串，且前缀与 `category` 一致
- [ ] `name` 是非空字符串
- [ ] `description` 是非空字符串（空串会导致控制台发布失败）
- [ ] `category` 属于 `spell` / `class_features` / `custom`
- [ ] `script` 是对象：`hat.kind === 'hat'` 且帽子块为 `cast_start`
- [ ] 每个 `body` 块含 `kind` / `nodeType` / `id` / `label`
- [ ] 块 ID 全局唯一（含分支体内的块）
- [ ] C 形块 `nodeType` 仅限 `saving_throw` / `attack_roll` / `condition_branch`，且 `onTrue` / `onFalse` 字段存在
- [ ] 无回流/循环结构（编译时按死代码丢弃）
- [ ] 未使用 `apply_damage` 等非法类型

## 门 B：语义忠实

- [ ] 规格表每项机制在脚本中都有对应块
- [ ] 脚本中没有规格表之外的多余机制
- [ ] 目标范围与 `select_target.mode` / `maxCount` 一致
- [ ] 判定路径正确（法术攻击 vs 属性豁免）
- [ ] 骰子、伤害类型、半伤、持续、专注逐项对照
- [ ] 升环/阈值用 `scaled_effect` 分档表达；分支仅用于判定/状态分流

## 门 C：配置完整

- [ ] `cast_start.config.autoChecks` 存在
- [ ] `saving_throw.dc` 是数字字符串（或留空 = 施法者法术 DC）
- [ ] `select_target.maxCount` 是数字
- [ ] `apply_effect` 的 `effectType` / `value` 正确
- [ ] 未使用 `docs/nodes` 旧键名（`targetType` / `saveDC` 等）
- [ ] 块 ID 使用 `snake_case` 且表意

## 门 D：运行现实核对

- [ ] 每个块已对照 `src/lib/flowCompiler.ts` 标注运行支撑
- [ ] 已列出依赖未实现运行语义的机制
- [ ] 已在报告中写出「脚本已表达，运行未实现」项

| 块 | 运行行为 | 风险 | 是否依赖未实现语义 |
|----|----------|------|--------------------|
|------|----------|------|--------------------|
| | | | |

## 门 E：人工预演（人类执行）

- [ ] 控制台粘贴 JSON 并执行成功
- [ ] 或在编辑器导入、自动修复通过、预览正常
- [ ] 运行结果与规格一致

## 待确认项

| 编号 | 问题 | 首选 | 备选 | 决定 |
|------|------|------|------|------|
| Q1 | | | | |

## 结论

- 复杂度定级：简单 / 中 / 复杂
- 自审结果：通过 / 不通过
- 阻塞项：
- 送审产物：机制规格表、FlowDefinition JSON、本报告
- 待人工操作：在控制台选择 ___ 模式，粘贴上述 JSON，确认 ___ 后执行
