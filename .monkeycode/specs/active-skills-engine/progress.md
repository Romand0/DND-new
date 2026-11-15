# 进度：active-skills-engine（主动技能引擎）

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
把「特性与特质」role=active 的条目接入战斗自动化结算：一个资源漏斗（featureUses）+ 一个能力路由器（featureCapabilities）+ 池公式引擎，复用 pendingCheckModifier / statusManager / advantageRules / reactionDefinitions 既有引擎，玩家端经信箱自助触发。

## 阶段状态
- [x] P0 方案：requirements.md + design.md 已入库（范围：A+B+C+D 自动化、休息恢复、玩家端自助）
- [ ] P1 池引擎主线：类型扩展 / featurePool 公式 / featureUses 漏斗 / combatStore API / CombatantInfoPanel 接线 / 结算并入 / 长休重置 / 种子标注 A+B
- [ ] P2 状态/反应/玩家端：C 类 status+advantage 接线 / D 类 reaction 种子声明 / 投影扩展 / MyCombatantPanel + 信箱 feature_use
- [ ] P3 收尾：damage/attack-rider 通道预留评审 / progress 回写 / docs/generated 更新

当前：P0 完成，待开始 P1。

## 已决策
- 范围（用户确认 2026-11-15）：A+B+C+D 自动化；E 超魔、F 裁定型维持现状提示。
- A+B 合并为同一池引擎：区别仅在池公式（fixed/classLevel/abilityMod/levelTiers）与 restKind。
- 战斗内消耗只写 CombatRecord.featureUses delta（与 spellSlotChanges 同构），角色卡 featurePools.used 仅在结算并入/休息重置时变更——放映回溯一致性优先。
- featureKey 口径统一 `feature:<特性名>`，与 reactionDefinitions 键一致。
- 玩家端触发走圆桌信箱 request(feature_use)，DM 确认后结算，消息不可变协议不变。
- 吐息武器/震慑拳的伤害自动结算推迟到 P3 评审（damage / attack-rider 通道），P1 先扣池+手动提示。
- 放弃方案：伤害结算复用 CombatSpellModal 伪法术条目——语义污染法术库，否决。

## 下一步
1. P1 开工：扩展 src/types/character.ts（FeatureActivation/FeatureResourceKind/FeaturePoolFormula/featurePools）与 src/types/characterOption.ts（同名字段透传）。
2. 新建 src/data/featurePool.ts：getPoolMax 纯函数（fixed/classLevel/abilityMod/levelTiers + restKind）。
3. src/types/combat.ts 加 featureUses；usePlayback.ts:90、useRoundTurn.ts:309 快照点加拷贝。
4. combatStore 加 getFeaturePoolView / consumeFeatureUse / resetFeatureUses / applyFeaturePoolSettlement。
5. 种子标注脚本扩展（A+B 约 48 条映射 + activation），100% 覆盖退出约束保留。

## 验证方式
- 基线：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`）
- 本功能探针：`QUIET=1 node scripts/probes/probe-active-skills.cjs`（P1 完成时补）
- 构建：`npx tsc -p tsconfig.app.json --noEmit && npm run build`

## 分支与提交
- 分支：`feature/active-skills-engine`（进行中）
- 关键提交：待补
