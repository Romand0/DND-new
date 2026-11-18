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
| P3 引擎补齐一 | [ ] 未开始 | B3 heal + B7 resource_conv：engines/ 处理器 + 预览 + op + 入账 |
| P4 被动扩容 | [ ] 未开始 | A1-A7 规则表数据化 + 156 被动分批接入 + 接入徽标 |
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

## P3 开工顺序（heal + resource_conv 引擎）

1. `src/data/engines/` heal 处理器：HealSpec 投掷（dice+levelFactor / flat / temp）→ HP/temp HP 变更
2. resource_conv 处理器：convert（from 动作 → to 动作项选择）+ grants（extraAction）
3. featureCapabilities.ts 登记 ENGINE_READY_CHANNELS += heal/resource_conv（激活 spec_db 条目）
4. CombatSession/featureChannelRunner/turnCommitApply 接 heal/conv 分支（DM 入账 + 玩家 op）
5. 提取器圣疗 poolDrain 子型评估（P3 扩展）

## 验证方式

- 单探针：`BASE_URL=http://localhost:5174 NODE_PATH=$(npm root -g) node scripts/probes/probe-active-skills.cjs`（83 断言）
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
- suggest 59 条是 P3/P4 素材分类（save_advantage/damage_affinity/advantage/check_modifier/attack_rider/reaction/attack_extra 七类标注）
