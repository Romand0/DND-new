# 进度：skill-fullcycle-engine（技能全周期引擎）

> 唯一状态源。规划定稿于 2026-11-18（requirements.md + design.md，五决策闭环）。
> 文档：同目录 `requirements.md`（R1-R7）/ `design.md`（三层架构 + 8 渠道清单 + P1-P5）。

## 五决策（全部定稿）

1. **数据形态**：spec 硬编码入库（git 仓库静态文件 `src/data/featureSpecs/phb2014.json`），构建期校验门禁。云端 D1 配置表方案已废弃。
2. **开放效果分流**：引导神力拆 4 形态映射引擎（P5）；荒野变形 P5 硬编码候选；神圣干预另议；奥术回想/魔能掌控后置。裁定队列机制本轮不建。
3. **骰值归属**：玩家端掷随 op 提交，DM 入账直接采用（线下工具定位，与 attack d20 先例一致）。
4. **架构归属**：技能为核心，调用时将技能数据导入引擎。引擎 = `src/data/engines/` 无状态处理器（封闭集合），技能 spec = 开放集合（仓库数据）。
5. **manual 兜底**：REGISTRY → SPEC_DB → manual 三级解析，spec 渠道 engineAvailable=false 时行为与 manual 完全一致（P3 引擎登记后自动切换）。

## 阶段状态

| 阶段 | 状态 | 说明 |
|------|------|------|
| P0 规划 | [x] 完成 | 五决策定稿，文档 2 份合入 main（bc0cb68 / 89dc4f1 / 8878830） |
| P1 spec 数据层 | [x] 完成 | 分支 feature/fullcycle-p1，merge `536b911`，探针 75/75 |
| P2 数据提取器 | [x] 完成 | 分支 feature/fullcycle-p2，merge `0e85e99`+`7f9ca0e`，探针 83/83 |
| P3 引擎补齐一 | [x] 完成 | 分支 feature/fullcycle-p3，merge `a025cee`，探针 92/92 + 全量 ALL PROBES OK |
| P4 被动扩容 | [x] 完成 | 分支 feature/fullcycle-p4，merge `643d7e7`，probe-passive2 45/45 + 全量 ALL PROBES OK；口径修正见交付明细 |
| P5 收尾 | [ ] 未开始 | 专用硬编码批次 + 引导神力拆形态 + 荒野变形评估 + 反应数据面 |

## P1 交付明细（2026-11-18）

- `src/data/featureSpecs/phb2014.json`：初始 spec（回气 heal / 动作如潮+灵巧动作 resource_conv / 诗人激励同名共存占位）
- `src/data/featureSpecs.ts`：HealSpec/ResourceConvSpec 类型 + SPEC_DB 聚合
- `plugins/featureSpecSchema.mjs`（+d.mts）：校验器单一实现，vite buildStart 门禁（schema + 种子孤儿交叉检查，失败即 build 失败）+ 探针复用
- `src/data/featureCapabilities.ts`：FeatureChannel 增 heal/resource_conv；resolveFeatureCapability 三级解析（REGISTRY→SPEC_DB→manual）；ENGINE_READY_CHANNELS 集合（P3 登记 heal/resource_conv）
- `src/pages/CombatSession.tsx`：handleFeatureUse manual 分支拦截 engineAvailable===false
- 探针 14 段（14a-14k 共 11 断言）：解析链三级 + 校验器拒收 + 回气 UI（面板按钮/alert 手动结算/池扣）

## P2 交付明细（2026-11-18）

- `src/data/featureExtractCore.mjs`（+d.mts）：提取核心单一实现——heal 四形态判别（自动触发/休整期/池分配/资源消耗 → manual）+ 主动 heal 需动作成本语境；conv 野兽主体判别 manual；触发词窗口放宽（恢复.{0,20}点生命）；candidates 携带 highlight{text,start}
- `src/data/featureExtract.ts`：TS 包装 + validateSpecDraft 单项校验（UI 生成前门禁）
- `scripts/extract-features-batch.mjs`：批量提取（dry/--write/--json；produce/skip/suggest/manual/unmatched 五类报告）
- `src/components/FeatureExtractorModal.tsx`：候选渠道切换/描述 mark 高亮/低置信警示/draft JSON 编辑/schema 校验/复制条目
- `src/pages/CharacterDetail.tsx`：特性卡「引擎」入口（data-extract-feature）+ Modal 挂载
- 契约修正补交（8bad330）：resource_conv 两形态二选一（convert/grants），校验器+类型+json 同步
- 批量 dry 口径：317 条种子 → produce 1（无踪步）/ skip 9 / suggest 59 / manual 5（休憩曲/圣疗/上古斗士/特殊训练/战斗荒野变形，理由各异）/ unmatched 243
- 探针 15 段（15a-15g 共 8 断言）：专测卡（level=1 绕 experience 解锁过滤）→ UI 流程 → 批量 dry

## P3 交付明细（2026-11-18，merge a025cee）

- `src/data/engines/healEngine.ts`：rollHealAmount（dice 正则 + levelFactor/levelAttr + flat；HP 型 / temp 型）
- `src/data/engines/resourceConvEngine.ts`：applyConvTarget（dash=+speed 移动力 / disengage+hide=声明 note）+ CONV_TARGET_LABELS
- `src/data/featureChannelRunner.ts`：heal 分支（返回计划，hp→handleApplyHealing / temp→addTempHp）+ resource_conv 分支（grants→grantAction 上限 3，convert→applyConvTarget，convertTarget 缺省 to[0]）
- `src/data/featureCapabilities.ts`：ENGINE_READY_CHANNELS += heal/resource_conv（SPEC_DB 条目激活，探针 14b/14c 断言随更新）
- `src/data/combatStore.ts`：grantAction（上限 3）+ addTempHp（5e 取高者）；**load() 白名单补 bonusActions（combatant 级）+ resourceConsumption（record 级）**——reload 后字段丢失且保存后永久抹掉的两个数据完整性 bug
- `src/types/realtime.ts`：op 扩展 healAmount/convertTarget；`src/lib/turnCommitApply.ts`：deps.applyHealing + heal 通道结算
- `src/pages/CombatSession.tsx`：handleFeatureUse heal 掷骰 + conv 多目标弹窗分支 + confirmConvTargetUse；`src/components/combat/FeatureConvTargetModal.tsx`（新建，对齐 checkModifier 模式：取消不扣资源）
- `src/pages/PlayerSpectate.tsx`：heal 玩家掷骰随 op 提交 + convTargetPick
- `src/data/featureSpecs/phb2014.json`：补「无踪步」entry（conv bonus→hide 单目标，manual/0.95——P1 提取疏漏，runner 直调暴露）
- 探针 16 段（16a-16i）：16c/16d/16e/16f 由 UI 面板交互改为数据级直调 executeFeatureChannel（等价断言：池扣 + 槽扣 + note + dash/grants 落库），原因见下「已知限制」；16g-16i 玩家 op 入账（applyTurnCommit 直调）

## 已知限制与经验（P3 收尾决策 B）

- **16 段 UI 面板交互探针不可靠**：reload 后 dblclick 打开参战者面板的交互链在沙盘 token/grid 水合时序上偶发失效（tokenDom=0 甚至 grid=null，现象漂移）。16c-16f 的面板→按钮 UI 断言改为 runner 数据级直调；FeatureConvTargetModal 的弹窗打开/选定 UI 断言暂缺，靠手动验证。
- **dev server 腐化规律**：长时间运行 + 大量 HMR（尤其 merge 改写多文件后）进入腐化态——探针大面积无关 FAIL 或 update 日志丢失、参战者未落库。带 `--force` 冷重启（绕过 node_modules/.vite 磁盘缓存）即恢复。探针异常时先重启 dev server 再排查。
- 提取器幂等 skip：条目入库后批量 dry 从 produce 转 skip（15g 断言随之更新为 produce 0 / skip 10）。
- 严格模式扣槽前提：探针构造的记录必须 `resourceConsumption: true`（load 白名单修复后该开关才在 reload 后存活）。

## P4 交付明细（2026-11-19，merge 643d7e7）

- **口径修正**：正式统计（`scripts/passive-roster.mjs` + `p4-passive-roster.json`）实测种子 294 名 → passive 142（requirements 人工口径 156/112 偏高）。逐名判定后 **A1-A7 可表达的仅约 25 名**（含已接入 20），其余 ~117 名为机制型（反射闪避/偷袭/额外攻击/双回合等，引擎语义外）/条件选择型（宿敌/图腾精魄）。P4 语义落地为「可表达条目接入 + 全量徽标三态」。
- `src/data/passiveRules.ts`（新建数据层）：七张表平移（A1 三表/A2/A3/A4/A5/A6/A7）+ A4/A7 从硬编码 if 改表驱动（SpeedModRule/InitiativeAdvRule）+ `PASSIVE_ENGINE_TRAITS` 自动汇总（A6 正则条目名显式列出）+ `PASSIVE_TRAIT_META`（显式 setting 标注，未标注默认 mechanic）+ `resolvePassiveTraitMeta`
- `src/data/passiveCombatRules.ts`：表迁出，只留派生逻辑；函数签名不变（7 处接线点零改动）
- **新条目 3 条**：法术抗性（A1 spell 表，术士 L14 对法术豁免优势）/ 大地行者（A1 植物效应 spellMatch）/ 思维之盾（A2 心灵抗性，读心免疫进 note）
- `src/pages/CharacterDetail.tsx`：被动徽标三态 chip（data-passive-badge：engine=已接入引擎 / mechanic=机制·DM裁定 / setting=设定型）
- `scripts/passive-roster.mjs`：正式口径统计工具（role 分类 + 渠道猜测 + 已接入标记，--stdout）
- 探针 probe-passive2 38→45 断言：1d/1e/1f（法术抗性双命中/大地行者正负例）+ 2c（心灵抗性）+ UI-d/e/f（徽标三态 DOM）
- 未收条目记录：极效潜行（需 ctx.skillKey 扩展，条件判定引擎拿不到）、守御灵光（光环抗性需动态结算，入战快照语义不匹配）、反射闪避/金刚魂/偷袭等（伤害减半/重骰/伤害 rider 机制，属未来专用处理器）

## P5 开工顺序（收尾，待启动）

1. 专用硬编码批次评估：空灵体（四气多效应）/ 混元体（伤害类型切换）/ 渗透劲·暗影技艺（命中 debuff）/ 灵魂力量——逐个立项或标记 mechanic
2. 引导神力拆 4 形态映射引擎（决策 2）
3. 荒野变形评估（硬编码候选，决策 2）
4. 反应数据面：种子 reaction 渠道条目填充（suggest 19 条素材）
5. P4 遗留评估：极效潜行（需 AdvantageContext.skillKey 扩展）/ 守御灵光（光环抗性动态结算）
6. 已有通道 spec 化机会评估（B2 advantage / B1 checkModifier 白名单扩展，suggest 素材 advantage 19 / check_modifier 10）
7. 收尾回写 + 五决策遗留确认

## 验证方式

- 单探针：`BASE_URL=http://localhost:5174 NODE_PATH=$(npm root -g) node scripts/probes/probe-active-skills.cjs`（92 断言）
- 被动探针：`node scripts/probes/probe-passive2.cjs`（45 断言：七类单元 + 门槛别名 + 种子反应 + UI 冒烟 + 徽标三态）
- 被动名单统计：`node scripts/passive-roster.mjs [--stdout]`（正式口径清单 p4-passive-roster.json）
- 批量提取：`node scripts/extract-features-batch.mjs`（dry 报告；--write 写 spec 文件）
- 全量：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`）
- 构建：`npm run build`（tsc -b + vite build，含 spec 校验门禁）
- 类型：`node_modules/.bin/tsc -p tsconfig.app.json --noEmit`（勿用 npx tsc，node 侧用 tsconfig.node.json）

## 已决策（实现口径）

- spec 渠道白名单 P1 = heal/resource_conv；reaction 等其余渠道 spec 化在 P5 评估
- spec 文件键 = 种子特性名（孤儿构建失败）；`_note` 字段仅注释用（校验器忽略未知字段？——当前校验器只查已知字段，多余字段不报错）
- REGISTRY 覆盖 SPEC_DB 的同名条目（代码注册表优先，探针 14a 锁定）
- 诗人激励 spec 文件占位条目（confidence 0.1）是回归哨兵，切勿接入引擎
- P2 提取无静默默认：置信度 <0.6 / 结构不可表达（池分配/环阶缩放/自动触发/休整期/野兽主体）一律 manual，理由落报告；produce 仅剩白名单+高置信+非 manual+键不存在
- suggest 59 条是 P4/P5 素材分类（save_advantage/damage_affinity/advantage/check_modifier/attack_rider/reaction/attack_extra 七类标注）
- P3 遗留到 P4/P5：圣疗 poolDrain 子型评估延后；conv disengage/hide 机制未建（声明 note 交 DM 裁定）
