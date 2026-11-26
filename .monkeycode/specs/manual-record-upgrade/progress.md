# 进度：manual-record-upgrade（战斗手动记录优化）

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
把手动记录从「引擎旁路」收敛为「引擎降级模式」：伤害类型/抗性、动作经济、结构化日志与自动攻击链共用同一套规则，避免免疫/抗性/再生被手动补录绕过。

## 阶段状态
- [x] P0-1 伤害类型贯通：来源（武器/法术/其他效果）+ 13 类伤害选择，抗性/易伤/免疫实时预览，再生否定条件可用（已合 main 3a2f3a5）
- [x] P0-1b 材质判定显式化：魔法/镀银/精金收进折叠「高级选项」，三态（自动/是/否）覆盖文本推断（本分支）
- [x] P0-2 命中判定接引擎：d20+加值、优劣势两颗骰、自然 1/20、重击标记（已合 main dd5c7cc）
- [x] P0-3 动作经济细化：动作/附赠/反应/自由四类消耗 + 多重攻击次数归一（本分支）；弹药/装填消耗暂缓（见决策）
- [x] P0-4 历史格写回定位 + 单条记录撤销（本分支）：手动记录按 DM 点选的历史格写回，撤销仅回退该条记录文本/日志
- [ ] P1 目标多选 AoE、检定/状态/移动/物品模板

当前：P0-4 已完成并待合并；P0 系列全部收口。

## 已决策
- 复用 `data/damageRules` 的 `resolveDamage`：手动伤害与自动攻击同一结算入口，弹窗预览与确认落账共用 `data/manualDamage.resolveManualDamage`
- 未声明伤害类型保持旧行为（原样通过 + 日志提示），默认值仍为空，避免老习惯被迫选类型
- 免疫/0 伤害不触发击倒：勾选「致命」仅在最终伤害 > 0 时生效
- 来源判定：武器按攻击方式文本自动推断魔法/镀银/精金，DM 可在折叠「高级选项」用三态（自动/是/否）显式覆盖；法术视为魔法，其他效果无来源标签
- 命中判定抽 `data/manualAttack.resolveManualAttackRoll`：与 CombatAttackModal 同语义（优/劣势任一骰自然20直接命中，优先于自然1与取高低；自然1必失）
- 重击只做标记：伤害由 DM 输入最终值，不自动翻倍；自然20 自动重击且不可取消，手动重击可勾选/取消
- 放弃方案：在 hook 内联抗性计算 —— 无法探针测试，且与 CombatDamageModal 双实现易漂移
- 放弃方案：沿用「攻击检定总值」输入 —— 无法识别自然 1/20，改为 d20+加值
- 动作经济接 store 现有 API：动作/附赠/反应分别调用 `consumeCombatantAction/BonusAction/Reaction`，自由不消耗；确认前用 `canUseAction/BonusAction/Reaction` 拦截已用尽资源
- 多重攻击只扣一次资源：次数经 `normalizeManualAttackCount` 归一到 1~10，日志标注「×N（N 击合计）」
- 弹药/装填消耗暂缓：手动记录没有武器实例引用，强行加弹药选择器会引入半套装备状态；等 P1 引入武器选择后再统一，当前由 DM 在装备面板手动扣减
- 写回格优先级：DM 点选的历史格（round 有效）> 当前回合；round<0（模拟模式主体选择器）或越界回退当前回合，抽 `lib/combatWriteCell.resolveRecordWriteCell` 纯函数
- 撤销范围只含记录本身（播放格 rounds/roundsDm 或模拟 operationLog 一条），不回退 HP 与装备变更，避免误伤已结算伤害；切换战斗记录时清空撤销栈

## 下一步
1. P1：武器选择（含弹药/装填自动消耗）、目标多选 AoE、检定/状态/移动/物品模板
2. P2：结构化日志 payload、常用模板

## 验证方式
- 本功能探针：`QUIET=1 node scripts/probes/probe-manual-damage.cjs`（31 断言）、`probe-manual-attack-roll.cjs`（19 断言）、`probe-manual-action-cost.cjs`（15 断言）、`probe-manual-write-cell.cjs`（13 断言）
- 基线回归：regeneration / condition-immunity / breath-weapon / seed-query
- 构建：`npm run build`

## 分支与提交
- 分支：`feature/manual-record-write-cell`（待合并）
- 关键提交：`feat(combat): 手动记录写回选中格 + 单条撤销`
