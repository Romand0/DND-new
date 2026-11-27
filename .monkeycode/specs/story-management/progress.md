# 进度：story-management（剧情全周期管理）

> 唯一状态源。需求与设计于 2026-11-27 定稿（五轴 + 三决策闭环）。
> 文档：`requirements.md`（R1-R11 + Out of Scope）/ `design.md`（架构 + 数据模型 + 投影 + 正确性属性）。
> 上位规划：`docs/roadmap/v0.9.md` V9-2（P0 重点）。

## 已定稿决策

1. **单元粒度**：场景（StoryScene）为「一段剧情」，三级结构 = 剧情线 → 章节 → 场景
2. **奖励双轨**：`plannedReward` 纯数据；`actualReward` 只存 `treasureId` + 结算时间，分配明细以宝藏模块为权威
3. **时间三字段**：`gameDate/gameMinute`、`sessionNo`、`order` 独立并存，前两者可空，`order` 必填
4. **团队两层**：长期团队 = 团组绑定角色；场景只存当场在场名单与缺席名单；奖励归属看长期团队，可见性看 `revealedTo`
5. **存储**：剧情树复用 `campaign_artifacts`（`kind='story'`，一弧一行）；投送/已读/回应单表（migration 0017）
6. **保密**：服务端 `projectForViewer` 裁剪，玩家响应不含未揭晓内容、计划奖励、未指派目标
7. **模块边界**：只管理内容与投送信息流；讲述、扮演、语音由 DM 现场完成，模块不生成叙事
8. **场景与投送分离**：场景是内容源，投送是不可变呈现快照；编辑场景不影响已投送卡片
9. **快速卡片**：剧本外内容走快速路径，仅标题必填，可立即投送、事后归档
10. **投送表**：`story_deliveries` / `story_delivery_reads` / `story_replies`（migration 0017），支持定向、已读回执与撤回

## 阶段状态

| 阶段 | 状态 | 说明 |
|------|------|------|
| P0 需求 + 设计 | [x] 完成 | `requirements.md` + `design.md` 定稿（2026-11-27） |
| P1 数据层 + API + 投影 + 投送 | [ ] 未开工 | 类型 → `_shared.ts`（投影/校验/投送快照）→ `index.ts` + `deliver.ts`（GET/PUT/DELETE/投送/回执/回应）→ migration 0017 → `storyApi` + `storyStore` → `probe-story.cjs` |
| P2 DM 工作台 + 导入 + 快速卡片 | [ ] 未开工 | `/c/:campaignId/story`：弧列表 / 章节大纲 / 场景编辑器；文本导入（`storyImport.ts`）；快速卡片弹窗 + 即时投送 |
| P3 玩家视图 + 投送卡片 | [ ] 未开工 | `/player/story`：已投送卡片、已读回执、按揭晓范围与知识层级展示、回应表单 |
| P4 联动 | [ ] 未开工 | 目标派发圆桌任务 / 战斗记录跳转 / 游戏时间同步 / 揭晓触发通知（V9-4） |
| P5 回顾与导出 | [ ] 未开工 | 剧情时间线视图 / 章节归档 / Markdown 导出 |

## P1 实施要点

- 纯函数优先：`projectForViewer(arc, viewer)` 与 `validateArc(arc, ctx)` 放 `_shared.ts`，无 IO，探针可直接 import
- 乐观锁：PUT 带 `baseUpdatedAt`，服务端比对 `updated_at`，不一致返回 409
- 校验清单：场景 `chapterId` 归属、`order` 章节内唯一、`dependsOn` 同弧、`roster.characterIds` 属团组、`combatRecordId` 存在
- 读默认值：`status='planned'`、`time.order=0`、数组字段空数组（老数据/半成品数据容错）
- 前端缓存键：`scopedKey('dnd-story')` 与 `scopedKey('dnd-story-deliveries')`，保存失败保留草稿并提示重试
- 投送快照：投送时从场景/线索拷贝标题、正文、图片与线索内容，生成后只读
- 撤回条件：`story_delivery_reads` 中该 `delivery_id` 无任何记录

## 验证命令

```bash
# 类型检查
npx tsc -p tsconfig.app.json --noEmit

# 构建
npm run build

# 探针（需先冷重启 dev server）
NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-story.cjs
```

## 下一步

1. 评审 `design.md` 的投影与投送规则（`knowledgeLevel` 降级、`actualReward` 可见条件、撤回边界）
2. 开 P1 分支：类型 + `_shared.ts` + API + migration 0017 + store + 探针
3. P1 探针全绿后进入 P2 DM 工作台与快速卡片
