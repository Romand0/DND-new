# 进度：active-skills-engine（主动技能引擎）

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
把「特性与特质」role=active 的条目接入战斗自动化结算：一个资源漏斗（featureUses）+ 一个能力路由器（featureCapabilities）+ 池公式引擎，复用 pendingCheckModifier / statusManager / advantageRules / reactionDefinitions 既有引擎，玩家端经实时回合包自助触发。

## 阶段状态
- [x] P0 方案：requirements.md + design.md 已入库（范围：A+B+C+D 自动化、休息恢复、玩家端自助）
- [x] P1 池引擎主线：类型扩展 / featurePool 公式 / featureUses 漏斗 / combatStore API / 结算并入 / 放映快照 / 池驱动面板 / 长休+短休重置 / 种子标注 / handleFeatureUse 路由
- [x] P2 状态/反应/玩家端：C 类 status+advantage 通道（featureChannelRunner）/ D 类 reaction 种子声明 / 池量实时投影 / MyCombatantPanel 按钮化 + 玩家回合包 feature-use / 探针 7 段 38 断言
- [x] P3 收尾：attack_rider 命中触发通道（至圣斩/震慑拳 DM 端自动化 + 玩家端声明）/ 灵活性入池（魔力泉涌）/ 探针第 8 段（8 断言，全量 5 探针 ALL PROBES OK）/ docs/generated 更新 / progress 终版回写
- [x] P4 残留三任务（feature/active-skills-followups）：①checkModifier 独立弹窗（激励骰并入路由器，删诗人特判）/ ②玩家 attack_rider 协议（方案 B：riders 随 attack op 提交、DM 入账统一扣）/ ③吐息武器 aoe_save 通道（AoE 几何引擎 + 玩家朝向选择 + 全自动结算）/ 探针 9-11 段（15 断言，59/59，全量 5 探针 ALL PROBES OK）

当前：P4 完成并已合入 main，功能整体收尾。

## 已决策
- 范围（用户确认 2026-11-15）：A+B+C+D 自动化；E 超魔、F 裁定型维持现状提示。
- A+B 合并为同一池引擎：区别仅在池公式（fixed/classLevel/abilityMod/levelTiers）与 restKind。
- 战斗内消耗只写 CombatRecord.featureUses delta（与 spellSlotChanges 同构），角色卡 featurePools.used 仅在结算并入/休息重置时变更——放映回溯一致性优先。
- featureKey 口径统一 `feature:<特性名>`，与 reactionDefinitions 键一致。
- P2 决策：玩家端 feature_use 走实时 WebSocket player.action 链（TurnCommitOp kind 'feature-use' → PlayerActionReviewPanel 审批 → applyTurnCommit 落库），偏离 design.md 原信箱 HTTP 方案——MyCombatantPanel 位于 PlayerSpectate 实时观战链路，回合包机制与 cast/note 同构。
- P2 决策：DM 与玩家两端通道执行共用 featureChannelRunner（executeFeatureChannel），status 通道 applyEffect+addTurnTodo，advantage 通道写 pending（self 挂自己、incoming 挂全部敌方，均锚定 expireOnCombatantId=施用者，下回合开始清除）。
- P2 决策：狂暴优势走状态实例 instanceEffects（strength check/saving_throw），伤害加值/抗性走 TurnTodo 提醒 DM 手动结算（damage 通道 P3 评审）；ability 过滤依赖 ctx.saveAbility 仅豁免场景生效，能力检定场景不过滤（已核实近似，探针 2f 断言力量检定命中）。
- P2 决策：reaction 特性（如直觉闪避）带 role=active 种子标注 → 仍在主动技能投影中显示（activation reaction 徽标），反应提示以 detectReactions 事件管线为准；无 role 的反应专长（哨兵）走 passive 派生不进投影，纯事件触发。
- P2 决策：玩家端重复提交防抖（pendingOps 同名 feature-use 拒绝）+ 回合归属校验（仅当前回合行动者可提交）。
- 吐息武器/震慑拳的伤害自动结算推迟到 P3 评审（damage / attack-rider 通道），先扣池+手动提示。
- 放弃方案：伤害结算复用 CombatSpellModal 伪法术条目——语义污染法术库，否决。
- P1 近似（已验证）：单次消耗 cost 缺省 1，等级缩放成本一律按 1 计（如灵机一斩变体消耗）。
- 池归属解析（featurePool.resolvePoolKey）：池主（poolFormula 自身名）> 显式 pool 引用 > system 容器名。
- 引导神力分职业公式：牧师 levelTiers 1:1/6:2/18:3，圣武士誓言 fixed 1/short（脚本按「名@职业」键覆盖）。
- 气 3 条 WARN 属已核实近似：拨挡飞弹/金刚魂为可选支线 1 气消耗（按 free 不扣）、超凡入圣为获得 4 气（非消耗）。
- 结算并入 UI：SettlementDialog 加「特性资源」勾选区（整体并入该参战者全部池，与法术位区同粒度）。
- P3 决策：attack_rider = DM 端 CombatDamageModal 自动化（NPC/DM 攻击）；玩家端仅声明 op（不带 poolKey，命中时由 DM 结算）——玩家攻击 op 提交时伤害已定，协议扩展推迟。
- P3 决策：勾选声明不扣资源，资源在 DM 确认伤害时由 applyAttackRiders 扣（5e「当你命中时」语义）；rider 骰与武器骰合并输入、重击一起翻倍；rider 伤害（光耀）独立 DamageResolution 分量走抗性；武器无类型走 createUntypedResolution 绕抗性（matchesEntry 对带 types 列表的条目遇 undefined type 不匹配）。
- P3 决策：震慑拳 CON save DC 8+prof+wisMod（proficiencyBonus 缺失时按等级推导 L1-4→2 每 4 级 +1；注意 characterStore.add 归一化默认填 2），失败 → stunned durationRounds 2 + TurnTodo endRound=start+2；目标死亡跳过挂载但资源照扣。
- P3 决策：吐息武器维持 manual（AoE 多目标无引擎支撑）；魔力泉涌入池（classLevel×1/长休）；超凡入圣维持 manual（L20 获得方向负消耗不做）。灵活性条目入池后术士池语义并入 featurePools 体系。
- P3 决策：探针角色需显式给 proficiencyBonus（add 归一化默认 2，L5 武僧 DC 断言依赖真实熟练值）。
- P4 决策（用户拍板 2026-11-17）：玩家 attack_rider 采用方案 B——riders 随 attack op 提交、DM 入账时 applyAttackRiders 统一扣资源（防双扣），伤害弹窗勾选选项由 attackRiders.getAttackRidersForPlayer 投影构建（池读 poolLeft/poolMax、法术位读投影 max-used）。
- P4 决策（用户拍板）：吐息武器玩家端朝向复用 AoETargetStep 方向选择 UI（op 携带 direction），DM 入账 planAoeSave/applyAoeSave 全自动结算；DM 端走 FeatureAoeSaveModal 两段式（拾取→逐目标豁免+伤害类型 6 类可切换/骰面可重掷）。
- P4 决策：资源扣减时机统一「弹窗确认时扣」（checkModifier/aoe_save 通道 resolve 时扣池+动作，取消不扣）；rider 仍按「命中入账时扣」。
- P4 决策：aoeSaveEngine plan/apply 分离——apply 接受显式骰值（探针可覆写确定性），commit 路径自动骰故探针 11e 仅结构性断言（锥内掉血+锥外无损+池扣+记录行）；伤害落地 resolveDamage sourceKind 'effect'；checkModifier/激励骰并入 featureCapabilities（bardicDieSides d6-d12 函数化），CombatantInfoPanel/Battleground 诗人特判全删。
- P4 决策：aoe 明细行前缀由 summarizeOp 统一补「特性名」，turnCommitApply 只写明细本体；attack 分支消费 featureNote 使 rider 明细落记录行（至圣斩/震慑拳入账行可见）。
- 种子标注口径（P2 核实）：职业.json traits 容器 35 条带 activation/resource，features 容器旧快照无标注；deriveFeatureRole 关键词兜底会漏「鲁莽攻击」类无关键词名——种子带显式 role=active 时以显式值为准。

## 下一步
功能已收尾，无待办。遗留近似与后续方向（供后续特性会话参考）：
1. AoE 引擎已落地（aoeSaveEngine + AoETargetStep 特性模式 + FeatureAoeSaveModal），新范围类特性只需 featureCapabilities 注册 aoe_save。
2. 玩家端 riders 协议已落地（attack op riders 字段），新命中触发特性只需 attackRiders.getAttackRidersForPlayer 投影 + applyAttackRiders 结算。
3. E 超魔、F 裁定型维持现状提示（范围外，已归档）。

## 验证方式
- 基线：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`，2026-11-17 P4 收尾时 5 探针全绿；探针依赖全局 playwright + NODE_PATH=$(npm root -g)）
- 种子标注：`node scripts/annotate-feature-resources.mjs`（23 显式 + 13 manual + 3 reaction，ERROR 即退出）
- 构建：`npx tsc -p tsconfig.app.json --noEmit && npm run build`
- 本功能探针：`QUIET=1 node scripts/probes/probe-active-skills.cjs`（11 段 59 断言）

## 分支与提交
- 分支：`feature/active-skills-p3`（已验证合入 main 并推送）；P4 用 `feature/active-skills-followups`
- 关键提交：
  - `9bb5115` P0 方案三文档
  - `cd1a9a9` P1 核心：featurePool 公式引擎 + combat.ts 全链路字段 + featureUses 漏斗（清洗/消耗/视图）+ 结算并入 + 五处放映快照拷贝 + SettlementDialog 勾选区
  - `70db903` P1 接线：resetFeaturePools（长/短休）+ optionFeatures 五字段透传（含 reaction 丢失 bug 修复）+ CharacterDetail 池徽标/短休按钮/长休重置 + 面板池驱动按钮 + handleFeatureUse + 激励池守卫 + 种子标注脚本与数据
  - P2 三连提交（feature/active-skills-p2）：通道层（featureCapabilities status/advantage 注册 + featureChannelRunner + reactionRules ally_attacked + 种子 REACTIONS）/ 玩家回合包（realtime feature-use op + turnCommitApply + MyCombatantPanel 按钮化 + PlayerSpectate 打包 + 投影）/ 探针（7 段 38 断言）
  - P3 三连提交（feature/active-skills-p3）：attack_rider 通道（featureCapabilities attack_rider+AttackRiderSpec + attackRiders.ts + CombatDamageModal 勾选区 + CombatSession 接线 + turnCommitApply 声明跳池 + 震慑拳 DC 等级推导）/ 玩家端声明 op（PlayerSpectate）/ 魔力泉涌入池 + 探针第 8 段（annotate-feature-resources POOL_OWNERS + 种子重生成 + probe-active-skills 8 段 44 断言）
  - P4 四连提交（feature/active-skills-followups）：`a1c709c` checkModifier 独立弹窗（FeatureCheckModifierSpec + FeatureChannelOptions.targetId + realtime op targetId + 诗人特判全删）/ `601b529` 玩家 attack_rider 方案 B（attack op riders + getAttackRidersForPlayer + turnCommitApply 入账扣）/ `0470652` 吐息武器 aoe_save（aoeSaveEngine + FeatureAoeSaveModal + AoETargetStep 特性模式 + PlayerSpectate 朝向 op + turnCommitApply 自动结算）/ `a8cd1b7` 记录行修复（attack 分支消费 featureNote + aoe 去重前缀 + 探针 11e）
  - docs/generated：attackRiders / featureCapabilities / featureChannelRunner 新建 + CombatDamageModal / CombatSession 更新
