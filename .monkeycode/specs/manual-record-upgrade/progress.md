# 进度：manual-record-upgrade（战斗手动记录优化）

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
把手动记录从「引擎旁路」收敛为「引擎降级模式」：伤害类型/抗性、动作经济、结构化日志与自动攻击链共用同一套规则，避免免疫/抗性/再生被手动补录绕过。

## 阶段状态
- [x] P0-1 伤害类型贯通：来源（武器/法术/其他效果）+ 13 类伤害选择，抗性/易伤/免疫实时预览，再生否定条件可用（已合 main 3a2f3a5）
- [x] P0-1b 材质判定显式化：魔法/镀银/精金收进折叠「高级选项」，三态（自动/是/否）覆盖文本推断（本分支）
- [ ] P0-2 命中判定接引擎：d20+加值、优劣势、自然 1/20、重击
- [ ] P0-3 动作经济细化：动作类型、多重攻击次数、弹药/装填消耗
- [ ] P0-4 单条记录撤销 + 历史格写回定位（resolveWriteCell 串列问题）
- [ ] P1 目标多选 AoE、检定/状态/移动/物品模板

当前：P0-1b 已完成待合并。

## 已决策
- 复用 `data/damageRules` 的 `resolveDamage`：手动伤害与自动攻击同一结算入口，弹窗预览与确认落账共用 `data/manualDamage.resolveManualDamage`
- 未声明伤害类型保持旧行为（原样通过 + 日志提示），默认值仍为空，避免老习惯被迫选类型
- 免疫/0 伤害不触发击倒：勾选「致命」仅在最终伤害 > 0 时生效
- 来源判定：武器按攻击方式文本自动推断魔法/镀银/精金，DM 可在折叠「高级选项」用三态（自动/是/否）显式覆盖；法术视为魔法，其他效果无来源标签
- 放弃方案：在 hook 内联抗性计算 —— 无法探针测试，且与 CombatDamageModal 双实现易漂移

## 下一步
1. 合并本分支后开始 P0-2：`ManualRecordDialog` 命中区加 d20/加值/优劣势切换，复用 `lib/attackBonus` + `data/advantageRules` + `AdvDisadvToggle`
2. P0-4 顺手修 `hooks/combat/useRoundTurn.ts:258 resolveWriteCell` 忽略所选格的问题

## 验证方式
- 本功能探针：`QUIET=1 node scripts/probes/probe-manual-damage.cjs`（31 断言）
- 基线回归：regeneration / condition-immunity / breath-weapon / seed-query
- 构建：`npm run build`

## 分支与提交
- 分支：`feature/manual-record-weapon-traits`（待合并）
- 关键提交：`feat(combat): 手动记录武器材质高级选项`
