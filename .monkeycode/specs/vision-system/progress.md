# Progress — 视野系统（vision-system）

## 阶段状态

- **P1 掩护完成**（2026-11-23，`61ec87f` 推送）：23 断言探针全绿，run.sh 29/29。
- **P2 光线/感官**：未开工（环境档位骨架已落 visionRules.getAmbientLightTier）。
- **P3 隐身/决策点**：未开工。

## P1 已交付（掩护）

- 数据层：`Combatant.coverTier`（types/combat.ts 导出 CoverTier）；`visionRules.ts` 纯函数层（isLosBlocked paintedCells Bresenham / suggestCoverHint / getCoverBonus / getCoverSaveBonus Dex 限定 / getAmbientLightTier P2 骨架）；`computeCombatantAc` 掩护加值并入（PC/NPC 双路径，NPC 分支原提前 return 已补掩护；`coverOverride` 第 4 参供弹窗单次覆盖）
- UI：CombatAttackModal 掩护覆盖下拉（跟随标注/覆盖为无/半身/3q/total）+ total 阻断 getAttackStatus（「目标处于全身掩护，无法直接瞄准」）+ 视线遮挡几何提示（CombatSession 两处调用传 paintedCells）；SpellCheckStep Dex 豁免自动填入并入掩护修正 + 提示行 + 法术攻击 AC 场景 total 阻断；CombatantInfoPanel 状态页掩护等级卡片（DM 专属）
- 探针：probe-vision-p1.cjs 23 断言（LOS 7 用例 / 提示 2 / 加值矩阵 6 / AC 双路径 5 / 环境档位 2）

## P1 设计修正（实现期决策）

- **掩护修正走确定性数据读取**：detector 通道只产优劣势（AdvantageResult），AC/豁免加值类不适用——cover-ac-note/cover-save 检测器方案作废，改弹窗/豁免结算点直读 coverTier。detector 留给 P2/P3 自动优劣势（light/unseen）。
- **几何只提示不裁定**：isLosBlocked 单线判定无法区分半身/3q（裁定量），suggestCoverHint 输出单级「存在遮挡」提示；total 阻断也由 DM 标注驱动。
- **NPC 路径修正**：computeCombatantAc NPC 提前 return 分支必须同步加掩护加值（探针 19/21 失败定位）。
- **探针踩坑复现**：改源码后不冷重启 dev server 会大面积假 FAIL（HMR 腐化，states/todos 落账断言全空）——冷重启后 29/29 全绿，与 AGENTS.md 8.1 经验一致。

## 下一步

1. P2 光线/感官实施：
   - battleground 扩展 ambientLight + lightZones（load 兜底）+ Battleground 光照画笔图层（复用 paintedCells 画笔交互链）
   - getLightTierAt 完整实现：区域覆盖 > 环境默认 → 感官降档（darkvision/blindsight/truesight 尺数）
   - parseSenses NPC 文本解析器 + Combatant.senses 结构化（PC deriveDarkvision 迁移兼容）
   - light-visibility / dim-perception detector 注册（模块尾部）
   - SpellCheckStep 补传 attackerPos/targetPos/distanceCells（侦查 E3 缺口）
2. P3 待 P2 验收后细化。

## 验证命令

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run build
sh scripts/probes/run.sh   # 29/29（含 probe-vision-p1 23 断言）
```

## 关键上下文

- AdvantageContext 已含 attackerPos/targetPos/distanceCells（CombatAttackModal.tsx:478-501）；SpellCheckStep 缺三字段待补传（P2 前置）
- paintedCells 为 "col,row" 墙体语义（types/battleground.ts:129-130），遮挡几何唯一数据源；CombatSession 从 battlegroundStore.get(record.id) 读取传弹窗
- NPC senses 纯文本（NpcTemplate.senses），381 处条目，正则解析降级手动录入（P2）
- PC darkvision 派生链现成：deriveDarkvision（passiveCombatRules.ts:207-223）→ useInitiative.ts:95（P2 迁入 senses.darkvision）
- 圆桌信箱现成：request 不可变仅 status/replyMessageId 可回填；checkPipeline skill_check stealth 已通（P3）
- 决策点等待标记：record.pendingDecisions（load 兜底），回合末审批展示摘要（P3）
- computeCombatantAc 第 4 参 coverOverride 语义：undefined=读参战者标注 / null=覆盖为无 / 值=临时等级；ProvingDashboard 同函数自动带上掩护

