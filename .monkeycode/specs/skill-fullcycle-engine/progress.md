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
| P2 数据提取器 | [ ] 未开始 | 正则集 + 批量脚本（主路径）+ UI 单项（产出 JSON 文本） |
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

## 验证方式

- 单探针：`BASE_URL=http://localhost:5174 NODE_PATH=$(npm root -g) node scripts/probes/probe-active-skills.cjs`（75 断言）
- 全量：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`）
- 构建：`npm run build`（tsc -b + vite build，含 spec 校验门禁）
- 类型：`node_modules/.bin/tsc -p tsconfig.app.json --noEmit`（勿用 npx tsc，node 侧用 tsconfig.node.json）

## 已决策（实现口径）

- spec 渠道白名单 P1 = heal/resource_conv；reaction 等其余渠道 spec 化在 P5 评估
- spec 文件键 = 种子特性名（孤儿构建失败）；`_note` 字段仅注释用（校验器忽略未知字段？——当前校验器只查已知字段，多余字段不报错）
- REGISTRY 覆盖 SPEC_DB 的同名条目（代码注册表优先，探针 14a 锁定）
- 诗人激励 spec 文件占位条目（confidence 0.1）是回归哨兵，切勿接入引擎

## 下一步（P2 开工顺序）

1. `src/data/featureExtract.ts`：正则集（骰式/DC/恢复/临时HP/伤害类型/范围/属性/池/门槛）+ 置信度规则
2. `scripts/extract-features-batch.mjs`：批量跑种子（36 显式 + 被动 156 名分类清单）→ 写 phb2014.json + 逐条报告
3. `src/components/FeatureExtractorModal.tsx`：UI 单项流程（选渠道→提取高亮→确认→产出 JSON 文本）
4. 探针 15 段：提取器流程断言
