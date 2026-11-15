# 进度：active-skills-engine（主动技能引擎）

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
把「特性与特质」role=active 的条目接入战斗自动化结算：一个资源漏斗（featureUses）+ 一个能力路由器（featureCapabilities）+ 池公式引擎，复用 pendingCheckModifier / statusManager / advantageRules / reactionDefinitions 既有引擎，玩家端经信箱自助触发。

## 阶段状态
- [x] P0 方案：requirements.md + design.md 已入库（范围：A+B+C+D 自动化、休息恢复、玩家端自助）
- [x] P1 池引擎主线：类型扩展 / featurePool 公式 / featureUses 漏斗 / combatStore API / 结算并入 / 放映快照 / 池驱动面板 / 长休+短休重置 / 种子标注 / handleFeatureUse 路由
- [ ] P2 状态/反应/玩家端：C 类 status+advantage 接线 / D 类 reaction 种子声明 / 投影扩展 / MyCombatantPanel + 信箱 feature_use
- [ ] P3 收尾：damage/attack-rider 通道预留评审 / progress 回写 / docs/generated 更新

当前：P1 完成（分支 feature/active-skills-p1 已验证合并），待开始 P2。

## 已决策
- 范围（用户确认 2026-11-15）：A+B+C+D 自动化；E 超魔、F 裁定型维持现状提示。
- A+B 合并为同一池引擎：区别仅在池公式（fixed/classLevel/abilityMod/levelTiers）与 restKind。
- 战斗内消耗只写 CombatRecord.featureUses delta（与 spellSlotChanges 同构），角色卡 featurePools.used 仅在结算并入/休息重置时变更——放映回溯一致性优先。
- featureKey 口径统一 `feature:<特性名>`，与 reactionDefinitions 键一致。
- 玩家端触发走圆桌信箱 request(feature_use)，DM 确认后结算，消息不可变协议不变。
- 吐息武器/震慑拳的伤害自动结算推迟到 P3 评审（damage / attack-rider 通道），P1 先扣池+手动提示。
- 放弃方案：伤害结算复用 CombatSpellModal 伪法术条目——语义污染法术库，否决。
- P1 近似（已验证）：单次消耗 cost 缺省 1，等级缩放成本一律按 1 计（如灵机一斩变体消耗）。
- 池归属解析（featurePool.resolvePoolKey）：池主（poolFormula 自身名）> 显式 pool 引用 > system 容器名。
- 引导神力分职业公式：牧师 levelTiers 1:1/6:2/18:3，圣武士誓言 fixed 1/short（脚本按「名@职业」键覆盖）。
- 气 3 条 WARN 属已核实近似：拨挡飞弹/金刚魂为可选支线 1 气消耗（P1 按 free 不扣）、超凡入圣为获得 4 气（非消耗）。
- 灵活性（未入池）：魔力泉涌（术法点）、奥术回想、魔能掌控、原初意识（法术位路径）P1 维持 manual，P2/P3 评审是否入池。
- 结算并入 UI：SettlementDialog 加「特性资源」勾选区（整体并入该参战者全部池，与法术位区同粒度）。
- 玩家端复用 CombatantInfoPanel 时无 recordId → poolView 为空 → 池徽标不显示、按钮退化 manual 提示（P2 投影补）。

## 下一步
1. P2 开工：C 类状态切换（狂暴/鲁莽攻击）接 statusManager + advantageRules，featureCapabilities 注册 status/advantage 通道。
2. D 类反应种子声明：哨兵/直觉闪避等补 FeatureReaction 数据（annotation 脚本扩展 REACTIONS 映射）。
3. 玩家端投影：getFeaturePoolView 走云端卡投影（对齐 spellSlotsOverride 模式），MyCombatantPanel 加主动技能区。
4. 信箱 feature_use：request(feature_use) 协议 + PlayerActionReviewPanel 审批 + 确认后 DM 侧结算。
5. 补功能探针 probe-active-skills.cjs（池扣减/结算并入/短休恢复）。

## 验证方式
- 基线：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`，2026-11-15 P1 收尾时全绿）
- 种子标注：`node scripts/annotate-feature-resources.mjs`（22 显式 + 14 manual，ERROR 即退出）
- 构建：`npx tsc -p tsconfig.app.json --noEmit && npm run build`
- 本功能探针：`QUIET=1 node scripts/probes/probe-active-skills.cjs`（P2 补）

## 分支与提交
- 分支：`feature/active-skills-p1`（已验证合入 main）
- 关键提交：
  - `9bb5115` P0 方案三文档
  - `cd1a9a9` P1 核心：featurePool 公式引擎 + combat.ts 全链路字段 + featureUses 漏斗（清洗/消耗/视图）+ 结算并入 + 五处放映快照拷贝 + SettlementDialog 勾选区
  - `70db903` P1 接线：resetFeaturePools（长/短休）+ optionFeatures 五字段透传（含 reaction 丢失 bug 修复）+ CharacterDetail 池徽标/短休按钮/长休重置 + 面板池驱动按钮 + handleFeatureUse + 激励池守卫 + 种子标注脚本与数据
