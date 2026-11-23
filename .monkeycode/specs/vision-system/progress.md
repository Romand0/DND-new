# Progress — 视野系统（vision-system）

## 阶段状态

- **规划完成**（2026-11-23）：requirements.md v1 + design.md v1 已定稿。P1 掩护 → P2 光线/感官结构化 → P3 躲藏隐身/决策点机制。
- 当前无代码改动。

## 已决策

1. **混合判定模式**：几何计算（paintedCells 视线遮挡、光照区域覆盖）产出提示，掩护等级等最终裁定由 DM 在攻击弹窗内完成；DM 覆盖优先级最高。
2. **分期顺序**：P1 掩护（最小闭环：标注 + AC/Dex 豁免修正 + 几何提示）→ P2 光线（光照画笔层 + getLightTier 感官降档 + NPC senses 解析）→ P3 隐身（hide 闭环 + hidden/invisible 状态 + 决策点机制）。
3. **决策点机制**：玩家回合中段提交裁定请求 → 复用圆桌信箱即时送达 → DM 回填 → 玩家恢复流程。与回合末批量审批并存，回合末汇总展示。
4. **掩护承载**：参战者级 coverTier 标注（DM 面板设置 + 弹窗单次覆盖），AC 修正在命中判定单点生效、Dex 豁免修正走 checkPipeline 加值明细。
5. **光照承载**：battleground 扩展 ambientLight + lightZones；感官结构化 Combatant.senses（PC deriveDarkvision 迁移 + NPC parseSenses 文本解析）。
6. **未可见语义**：hidden/invisible 为标记型状态实例；光照不足、隐身、躲藏三支未见来源统一由 unseen-* detector 消费；hidden 一攻揭晓，invisible 豁免。
7. **stealthDisadvantage 补全**：detectEquipment 加消费分支（数据链已通，实现缺失）。

## 下一步

1. P1 掩护实施：
   - types/combat.ts Combatant.coverTier + statusLibrary 无需状态（掩护为数据标注）
   - visionRules.ts 新建：isLosBlocked / suggestCoverTier（Bresenham）
   - advantageRules 注册 cover-save（Dex 豁免加值）+ cover-ac-note
   - CombatAttackModal 掩护标注行 + AC 修正 + total 阻断 + 几何提示区
   - CombatantInfoPanel 掩护设置项
   - 探针：数据级断言（LOS 用例 + cover-save 加值明细）
2. P2/P3 待 P1 验收后细化。

## 验证命令

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run build
sh scripts/probes/run.sh
```

## 关键上下文

- AdvantageContext 已含 attackerPos/targetPos/distanceCells（CombatAttackModal.tsx:478-501）；SpellCheckStep 缺三字段待补传
- paintedCells 为 "col,row" 墙体语义（types/battleground.ts:129-130），遮挡几何的唯一数据源
- NPC senses 纯文本（NpcTemplate.senses），381 处条目，正则解析降级手动录入
- PC darkvision 派生链现成：deriveDarkvision（passiveCombatRules.ts:207-223）→ useInitiative.ts:95
- 圆桌信箱现成：request 不可变仅 status/replyMessageId 可回填；checkPipeline skill_check stealth 已通
- 决策点等待标记：record.pendingDecisions（load 兜底），回合末审批展示摘要
