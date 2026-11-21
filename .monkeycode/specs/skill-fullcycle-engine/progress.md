# 进度：skill-fullcycle-engine（技能全周期引擎）

> 唯一状态源。规划定稿于 2026-11-18（requirements.md + design.md，五决策闭环）。
> 文档：同目录 `requirements.md`（R1-R7）/ `design.md`（三层架构 + 8 渠道清单 + P1-P5）/ `ui-design.md`（弹窗家族总表 + 交互惯例 + P5 UI 前瞻）。

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
| P4b chip 收编 | [x] 完成 | 分支 feature/feature-info-dialog，merge `52fe3a9`，探针全绿（probe-passive2 45 + active-skills 93）；见交付明细 |
| P4c heal 线下骰 | [x] 完成 | 分支 feature/heal-open-dice，merge `43a2d25`，probe-active-skills 95/95 + 全量 ALL PROBES OK；见交付明细 |
| P4d aoe 线下骰 | [x] 完成 | 分支 feature/aoe-open-dice，merge `6100e59`，probe-active-skills 96/96 + 全量 ALL PROBES OK；全渠道零暗骰收尾 |
| P5-1 技能特殊文本 | [x] 完成 | 分支 feat/skill-event-text；build 通过；探针 1-13 段过（含 11g/11h），14 段 UI 崩溃遗留待查；见交付明细 |
| P5-2 专用硬编码批次 | [x] 完成 | 分支 feat/container-preselect，merge `d1bc6ec`：混元体 heal 直结 / 容器预选（引导神力/暗影技艺）/ 渗透劲延迟引爆；probe-active-skills 117/117 + p2 99/99 + 全量 ALL PROBES OK；见交付明细 |
| P5 反应数据面 | [x] 第 1 期交付 | 分支 feat/reaction-data：种子 8 条标注 / 提取器渠道 / DamageAbsorbModal 直连 / 挂起修复（`cffb1d9`）；probe-reaction 59/59 + 全量 ALL PROBES OK；见交付明细 |
| P5 收尾 | [ ] 进行中 | 剩余：荒野变形评估 / 极效潜行 ctx.skillKey / 守御灵光光环抗性 / 体系池 system:卓越骰 / 空灵体 / 反应第 2-4 期 |

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

## P4b 交付明细（2026-11-19，merge 52fe3a9，chip 收编）

- 用户指令：特性卡上开发工具类 chip（引擎按钮/role chip/被动三态徽标）收编为「…」圆形按钮 + 信息对话框
- `src/pages/CharacterDetail.tsx`：renderFeatureCard 卡头删三块，改 `data-feature-info` 「…」按钮；新增信息对话框（作用方式四按钮切换=原 roleMenuId 菜单 / 被动三态徽标+note=原卡上徽标 / 提取器入口=原引擎按钮）；删 roleMenuId 死 state
- `data-extract-feature` 属性随迁对话框按钮；probe-active-skills 15a 改两步点击（…→对话框→提取器），断言 92→93
- probe-passive2 UI-d/e/f 改逐卡开对话框断言三态；**踩坑**：对话框按 feature.id 查找，探针建卡 features 无 id 时 setInfoFeatureId(undefined) 恒命中首条徽标全 engine——修复=探针建卡补固定 id（真实 UI 建卡路径均补 id）
- 验证：双 tsc + build + probe-passive2 45/45 + probe-active-skills 93/93 + 全量 run.sh（main 上）；main 最终 `8d15227`（集成远程 P0 脚本树 45a4287）

## P4c 交付明细（2026-11-19，merge 43a2d25，heal 线下骰口径）

- **架构口径（用户定稿）**：①「硬编码」语义 = 种子静态条目直接携带引擎接收面格式化数据（骰值格式/渠道/资源），调用时直接灌入——SPEC_DB 即此形态；②全周期自动化含数值填入：玩家唯一保留动作 = 线下掷骰 + 按提示填结果，其余（格式提示/灌引擎/资源账务/HP 落账/记录）全自动；③**引擎零暗骰**——P3 的 rollDice 暗骰是偏离，heal 对齐攻击/施法填值惯例（CombatDamageModal「输入各骰结果」/CombatAttackModal 手填 d20）；④技能数据入库由 Agent 全责，SPEC_DB 新条目直接手写（TS 类型约束格式），数据提取器降级为「外部规则书导入辅助」，人工合并工序取消
- `src/data/engines/healEngine.ts`：rollHealAmount → planHealAmount(spec, level, rolledDice?) 纯计算，移除 rollDice；dice 缺省时跳过骰式项并在 detail 标注「1d10 未填(跳过)」（不虚构线下骰值）
- `src/data/featureChannelRunner.ts`：FeatureChannelOptions.rolledDice 透传
- `src/lib/turnCommitApply.ts`：op 缺 healAmount 兜底由 DM 重掷改为固定+等级落账；决策③「玩家端掷骰」语义修正为「玩家端骰值环节填入的线下骰结果」
- `src/components/combat/HealRollModal.tsx`（新建）：掷骰提示 + 输入框 + 明细预览 + 范围校验（NdM 合计 ∈ [n, n*m]）；确认时扣资源（取消不损失，对齐 conv/checkModifier 模式）
- CombatSession 2.7 弹窗拦截（heal+dice → setHealRollPick；无 dice 直接执行）+ confirmHealRoll 确认回调；PlayerSpectate 填值后打包 op（healAmount=合计，传输语义不变）
- 探针：16a-0（弹窗出现）/16g-2（op 缺值兜底=固定+等级 5）新增，14j/16a 改填值流（填 7→12），95/95 + 全量 ALL PROBES OK

## P4d 交付明细（2026-11-19，merge 6100e59，aoe 线下骰收尾）

- **全渠道暗骰盘点**（用户问「其他引擎呢」触发）：checkModifier（检定弹窗 modifierRolledValues 手填）/ attack_rider（伤害弹窗 rider 骰输入）/ 法术效果骰（effectDiceValues 槽位）/ attack d20 / 伤害弹窗 / resource_conv / grants / status / advantage / reaction 全部合规；唯一残留 = aoe_save 双暗骰（turnCommitApply rollAoeDamage + 逐目标 rollDice(20)）；flow 脚本树 P0 尚未接入伤害执行（apply_effect 落地走 FlowRunStep→法术链），接入时按同口径
- turnCommitApply aoe 段：op.aoeDamage（玩家线下掷的伤害骰合计，全目标共用一次掷骰）+ op.aoeSaveRolls（DM 采集的逐目标豁免 d20）；缺省零虚构——伤害未填 → 0 伤害 + 记录行标注「伤害骰未填，请手动结算」，某目标豁免未填 → 该目标跳过 + 标注
- TurnCommitOp 扩展 aoeDamage / aoeSaveRolls
- PlayerSpectate：朝向确认 → DiceInputModal（新通用线下骰填值弹窗，后续 flow 脚本树可复用）→ op 带 aoeDamage
- FeatureAoeSaveModal（DM 端）：预填暗骰改空默认，confirm 强制校验（伤害 0 / 豁免空 → alert 阻断）；掷骰按钮保留（显式便捷动作）
- 探针：11e 改带值断言（伤害 8 + 豁免 5 → 失败全额 8）+ 11f 缺省兜底新增；96/96 + 全量 ALL PROBES OK；main `6100e59`

## P5-1 交付明细（2026-11-19，技能结算特殊文本双写）

- **CombatEvent.kind 扩展 `skill`**（types/combat.ts）：feature-use 入账时 pushCombatEvent，text = `《技能名》→ ${featureNote ?? '发动'}`，与先攻表 summarizeOp 同源同标记语言（ui-design.md §5.2 落地）
- **标记语言统一**：healEngine planHealAmount detail 标记化（`1d10(线下骰)=【7】`/`固定【5】`/`战士等级×1=【5】`）；turnCommitApply heal/aoe featureNote 标记化（`恢复【12】点生命`/`【8】点`/`成功`→`豁免通过`）；summarizeOp feature-use 行 `「」`→`《》`；PlayerSpectate 7 处 roundText + DM 端四处记录（confirmCheckModifier/通用 handler/confirmConvTargetUse/confirmHealRoll 重构为结算后两行）+ FeatureAoeSaveModal message 全部《》+【】
- **DM 端补 skill 事件**：checkModifier/通用 heal/conv/confirmHealRoll/resolveAoeSave 均补 pushCombatEvent(kind 'skill')——DM 直接操作与玩家异步提交两端事件流对齐；alert 剥离标记符号（detail 与日志共用源）
- **RoundNarrativeBoard 接 renderLogText**：修复 attack/cast 事件标记裸显的潜在问题，为 skill 事件就绪
- 探针：11g（skill 事件带值断言《吐息武器》+【8】点+失败）+ 11h（bare 包缺省兜底事件）+ 16l（DM UI heal 事件 + 先攻表/操作日志标记行）新增，96→99 断言
- **探针崩溃已修（2026-11-20）**：根因是模拟模式战斗日志把沙盘顶出默认 720 视口，`mouse.dblclick` 点空（grid 仍在 DOM，y≈689）；HealRollModal 原 z-50 被 InfoPanel 同层挡住确认按钮。修复：14/16 段改点「参战者」芯片开面板；HealRollModal/DiceInputModal 提到 z-[60] 对齐同家族；16l 模拟模式同时认 operationLog；load() 白名单补 combatEvents（reload 丢事件独立 bug）。probe-active-skills 99/99

## P5 开工顺序（收尾，待启动）

1. 专用硬编码批次评估：空灵体（四气多效应）/ 混元体（伤害类型切换）/ 渗透劲·暗影技艺（命中 debuff）/ 灵魂力量——逐个立项或标记 mechanic
2. 引导神力拆 4 形态映射引擎（决策 2；**容器形态角色卡预选**——2026-11-19 用户拍板：四选一在特性信息对话框完成并固化到 feature 静态数据，战斗载入零现选，见 ui-design.md §3）
3. 荒野变形评估（硬编码候选，决策 2）
4. 反应数据面：种子 reaction 渠道条目填充（suggest 19 条素材）
5. P4 遗留评估：极效潜行（需 AdvantageContext.skillKey 扩展）/ 守御灵光（光环抗性动态结算）
6. 已有通道 spec 化机会评估（B2 advantage / B1 checkModifier 白名单扩展，suggest 素材 advantage 19 / check_modifier 10）
7. 收尾回写 + 五决策遗留确认

## 验证方式

- 单探针：`BASE_URL=http://localhost:5174 NODE_PATH=$(npm root -g) node scripts/probes/probe-active-skills.cjs`（99 断言，含 11e/11f aoe、11g/11h skill 事件、14j/16a heal 填骰流、16l 双写）
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
- 特殊资源双线索（2026-11-19）：技能线索型池挂特性自身（已实现 featurePools 漏斗）；体系线索型共享池 `system:<名>` + spec `poolRef` 引用（卓越骰先例，待建）；技能结算文本统一 logRichText 标记语言——详见同目录 `ui-design.md` §5/§6
- 容器技能预选（2026-11-19 用户拍板）：引导神力/暗影技艺等容器四选一在**角色卡预选**（特性「…」信息对话框内），固化到 feature 静态数据随战斗载入；战斗层按已选形态路由渠道，未预选不可用——战斗中不做角色构建决策，对齐「玩家异步提交前一切数值静态可得」核心目标

## P5-2 交付明细（2026-11-20，专用硬编码批次）

- **热身混元体**（`ed16513`）：phb2014.json 混元体条目 `{channel:'heal', spec:{type:'hp', levelFactor:3, levelAttr:'武僧等级'}}`；探针 14o resolve 断言 + 14p/14q/14r UI 无弹窗直结（池扣）→ 103/103
- **容器预选**（`cb53655`）：
  - `types/character.ts` Feature + `chosenForm?: string`；`featureCapabilities.ts` FeatureChannel + `'container'` + `FeatureCapability.container{forms[],unchosenHint}` + casterChaMod；注册引导神力（生命 heal 5×圣武士等级 / 毁灭 manual / 不灭信念 reaction / 光辉 aoe_save 2d10 光耀 DEX 减半 DC 8+prof+魅调）与暗影技艺（全 manual）
  - 容器路由 = capability 重定向：handleFeatureUse 入口替换 capability 为子形态，后续分支全复用；池/动作按容器扣
  - CharacterDetail 信息对话框四选一（toggle 取消，`data-feature-form`）；CombatantInfoPanel 容器徽标 `data-container-form`
  - 探针 14s-14w → 110/110
- **渗透劲延迟引爆**（`4765915` + `da298b4`）：
  - statusLibrary `quivering_palm`（permanent 无 effects）；attackRiders AttackRiderSpec + `embed{statusId,detonate{ability,dc,damageDice,damageType}}`；注册渗透劲 cost 3 气 DC 8+prof+WIS 10d10 暗蚀；applyAttackRiders 埋劲分支（declareEnd 旧标记保唯一性 + metadata attackerId/attackerName）
  - `QuiveringPalmModal`（z-[60]）：豁免 d20 手填——失败=HP 归 0（走 handleApplyDamage）/ 成功=填伤害总量 / 无害终止=零消耗仅解除；确认时扣 1 动作 + 解除全部标记实例
  - 引爆入口复用渗透劲按钮：带标记（metadata.attackerId===自己）→ 弹窗，无标记 → 命中触发声明 alert
  - 探针 14x-14z → 117/117
- **探针卫生**：probe-dbg.cjs 转正改名 `probe-skill-engine-p2.cjs`（此前带调试 exit(3) 从未跑完 16 段）；16l 断言口径修正——live 模式 heal 行落 operationLog（rounds cell 双写属放映口径）；16 段 setup 清 combatEvents 防跨运行污染；p2 补 setViewportSize(1280×900)（默认 720 高致双击点视口外）
- 新知识回写 `.monkeycode/MEMORY.md`：statusManager 纯内存 reload 丢实例 / 探针默认 viewport 陷阱 / dev server 腐化（改 json 触发重优化→模块图分裂）

## P5 反应数据面·第 1 期交付明细（2026-11-20，分支 feat/reaction-data）

- **种子标注**（`5510373`）：职业.json 8 条 reaction 声明（报偿 damage_taken/attack/self、投射守御 damage_modifier/ally、守御闪光 attack_targeted manual、风暴狂怒/幻影化形/直觉魅惑/法术窃贼/雾遁 manual 弹窗）+ 战神祝福 prompt 无 trigger（第 2 期 any_attack 意图）+ 遁术降 passive；种族.json 零 diff（出神排除）
- **提取器**（`4a84e86`）：REACTION_FALSE_POSITIVE 排除表（出神/遁术/散打技巧→attack_rider 待办）+ collectTraits 透传 reaction + 已标注 skip
- **damage_modifier 直连**（`a76501b`）：DamageAbsorbModal（testid damage-absorb-modal/input/confirm，吸收 0..amount 手填，放弃保留反应）+ CombatSession 反应队列 damage_modifier 分支（absorbedDamage 累计 → applyDamageNow finalDamage 扣减 → 记录行「反应吸收N」→ 专注 DC 跟随）
- **探针 17 段**（`126911a`）：probe-reaction.cjs 17a-g + 17k PASS（56/59）——种子 fetch 断言 / 数据级 detect + resolve / UI 链守御闪光 prompt → 伤害弹窗 → 报偿 attack 弹窗路由 ✓
- **探针踩坑记录**（复用价值）：
  - characterId 必须真实 id（add() 返回对象含陈旧 id）；characterStore level 过滤 f.level <= level（报偿 14 需卡 level≥14）
  - 换参战者保 panel 选中 id 存活（新增参战者排尾，potentialTarget= 第一个非本人活体）；棋子双击用 mouse.dblclick 坐标（locator dblclick 受 actionability 拖死）
  - NpcAttack 形状 = damage 字段（damageDice 是 CharacterAttack 字段——之前所有链止步弹窗未暴露）；试验场反应检测取全库 → probe: 法术 17 段前必须清
  - 弹窗层叠用文本过滤定位（`.last()` z-50 会命中错误层）
- **遗留（17h/17i/17j，3 断言）**：已修复（`cffb1d9`）——根因是 CombatDamageModal.handleConfirm 无条件 onClose 关掉了挂起中的伤害弹窗（damageModal null → 直连分支失守）；修复 = onApplyDamage 返回挂起信号 boolean，handleConfirm 按信号跳过 onClose；直连分支条件同步去掉 !reactionWindowDone 子条件（语义是防重复入队，与弹窗开闭无关）；probe-reaction **59/59** 全绿
- **关键探针知识**：d20 填 20 = nat20 重击（伤害骰翻倍：1d6+2 → 填 3 得 8 伤）；15g 提取器口径断言在 probe-active-skills 与 p2 各有一份（skip 11→22 已同步）
- **第 2-4 期**（design.md 附录）：attack_modifier 家族（守御闪光劣势/幻影化形强制 miss/战神祝福 +10 + trigger any_attack）→ target_save 家族（风暴狂怒/法术窃贼/斗转星移 + trigger status_applied）→ 特殊触发（无情复仇/复仇之魂/灵机一斩 + trigger opportunity_hit/foe_attacked/any_attacked + 雾遁复合）
- 通用约束：零暗骰手填 / 确认扣资源放弃零损失 / damage_taken 窗口仅攻击链（effect 伤害走通用提示）
