# 进度：story-management（剧情全周期管理：DM 笔记 + 战役经济账本）

> 唯一状态源。需求与设计于 2026-11-27 定稿（双域定位 + 三决策闭环）。
> 文档：`requirements.md`（R1-R15 + Out of Scope）/ `design.md`（双域架构 + 账本聚合 + 投影 + 10 条正确性属性）。
> 上位规划：`docs/roadmap/v0.9.md` V9-2（P0 重点）。

## 已定稿决策

1. **双域同骨架**：剧情笔记域（DM 私有）+ 战役经济账本域，共用「剧情线 → 章节 → 场景」骨架，场景是账本挂载点
2. **剧情文本只服务 DM**：导入、组合、引用、私记与 DM 阅读视图；玩家端零叙事文本，讲述由 DM 现场完成
3. **玩家端两类内容**：与自己角色相关的经济事件 + DM 投送的道具型文本（信件/地图/告示）
4. **账本汇总引用**：源记录（`character_logs` / `table_messages` / 宝藏 / `character_change_requests`）为权威，索引只存引用与归类，读取时聚合
5. **五类事件**：`check` 检定、`item` 物资、`treasure` 宝藏、`spell` 施法、`growth` 成长
6. **存储**：笔记树复用 `campaign_artifacts(kind='story')`；索引/道具/已读走 migration 0017
7. **权限**：DM 写笔记、索引与道具；玩家读自己角色的经济事件与目标道具；笔记对玩家投影为空

## 阶段状态

| 阶段 | 状态 | 说明 |
|------|------|------|
| P0 需求 + 设计 | [x] 完成 | 双域定位与账本口径定稿（2026-11-27） |
| P1 笔记域数据层 | [x] 完成 | 类型 + `_shared.ts`（归一化/校验/投影/成员校验）+ `/api/story` 读写删 + `storyApi` + `storyStore`；`probe-story-notes` 27/27 全绿（2026-11-27） |
| P2 账本域 | [x] 完成 | migration 0017 + `/api/story/ledger`（索引 CRUD、五类源批量聚合、玩家按绑定角色过滤、失效引用）+ 宝藏分配补写 `source='treasure'` 日志；`probe-story-ledger` 16/16 全绿（2026-11-27）。0017 待线上手动 apply |
| P3 DM 工作台 | [x] 代码完成 | `/story` 路由：剧情线/章节/场景编辑（独立草稿 + 保存/还原）、文本导入切场景、片段组合与装备/法术/怪物引用、私记、阅读视图；右侧账本时间线 + 候选挂载/解除；`probe-story-import` 17/17（2026-11-27）。UI 交互待人工验收 |
| P4 道具与玩家端 | [x] 代码完成 | `/api/story/handout`（创建/零已读撤回）、`/api/story/handouts`（目标隔离）、`/api/story/handout-read`（已读单调/收藏）；DM 场景右侧「道具投送」面板；`/player/story` 道具箱 + 自己角色的经济事件/当前钱币；`probe-story-handout` 21/21（2026-11-28）。0017 待线上手动 apply，API 权限与 UI 交互待人工验收 |
| P5 结算与回顾 | [x] 代码完成 | 场景 status→done 时按账本 summary 生成 `settlementSummary`（异步回填不覆盖其它编辑）；`/api/story/timeline` 聚合全团索引 + 场景元数据（玩家按绑定角色）；`StoryReviewPanel` 四维筛选 + Markdown 按场景分组导出；`probe-story-review` 10/10（2026-11-28）。UI 交互待人工验收 |

## P1/P2 实施要点

- 纯函数优先：`validateArc`、`projectForViewer`、`assembleLedger` 放 `_shared.ts`，无 IO，探针直接 import
- 乐观锁：PUT 带 `baseUpdatedAt`，服务端比对 `updated_at`，冲突返回 409
- 玩家投影：保留结构、清空文本与计划数据，便于前端类型稳定
- 账本聚合：按 `source_kind` 分组批量 `IN (...)` 查询，缺失源记录标 `invalid`；玩家请求先按绑定角色过滤索引
- 挂载策略：DM 手动挑选为主，场景 `active` 时提供本场次最近记录推荐；系统不自动写索引
- 默认值：`status='planned'`、`time.order=0`、数组字段空数组
- 缓存键：`scopedKey('dnd-story')`；保存失败保留草稿并提示重试

## 验证命令

```bash
# 类型检查
npx tsc -p tsconfig.app.json --noEmit

# 构建
npm run build

# 探针（需先冷重启 dev server）
NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-story-notes.cjs
NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-story-ledger.cjs
NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-story-handout.cjs
NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-story-review.cjs
```

## P3/P4 实施要点

- 道具可见性在服务端裁剪：玩家仅拿到 `targetUserIds` 为空或含自己、且未撤回的道具；DM 拿到全部（含已撤回）
- 撤回语义为软撤回：先校验零已读，再清空阅读状态并写 `recalled_at`；玩家侧立即不可见，DM 保留审计视图
- 阅读状态单调：重复标记已读不改首次 `read_at`；收藏与已读独立，可取消收藏
- DM 入口在 `/story` 右侧面板，投送时绑定当前选中场景；`/player/story` 独立读取道具箱与绑定角色日志

## P5 实施要点

- 结算摘要只在场景从非 done 切到 done 时生成，格式复用账本 `buildSettlementSummary`；读取账本为异步，摘要回填按场景 id 合并进当前草稿，避免覆盖等待期间编辑；不修改计划目标与计划奖励
- 时间线端点复用 `buildLedgerEntries` 聚合，仅追加场景/章节/剧情线标题、场次、游戏日期与排序元数据；缺失元数据回退「未知场景/章节/剧情线」
- 回顾筛选四维叠加（场次 / 游戏日期区间 / 角色 / 类别），Markdown 按场景分组导出；无记录导出占位行

## 下一步

1. 线上 apply 0017 后跑 API 权限探针（玩家读不到笔记、只读自己角色的账本、时间线仅绑定角色、道具仅目标、candidates 仅 DM）
2. 人工验收：DM 投送 → 玩家道具箱打开/收藏 → 零已读撤回 → 撤回后消失；场景完成摘要 → 回顾筛选 → Markdown 导出
3. 按需推进 V9-2 后续分期或转入 V9-5 战斗遗留项
