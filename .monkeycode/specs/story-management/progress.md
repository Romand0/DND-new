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
| P1 笔记域数据层 | [ ] 未开工 | `src/types/story.ts` → `/api/story`（GET/PUT/DELETE）+ `_shared.ts` 校验/投影 → `storyApi` + `storyStore` → `probe-story-notes.cjs` |
| P2 账本域 | [ ] 未开工 | migration 0017 → `/api/story/ledger`（索引 CRUD + 五类源聚合）→ 角色过滤与失效引用 → `probe-story-ledger.cjs` |
| P3 DM 工作台 | [ ] 未开工 | `/c/:campaignId/story`：弧/章/场景编辑、文本导入（`storyImport.ts`）、片段组合与实体引用、私记、DM 阅读视图；账本挂载与时间线 |
| P4 道具与玩家端 | [ ] 未开工 | 道具 CRUD/投送/已读/收藏 → `/player/story` 道具箱 + 玩家自己的经济事件视图 |
| P5 结算与回顾 | [ ] 未开工 | 场景完成生成结算摘要、按场次/时间/角色筛选、Markdown 导出 |

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
```

## 下一步

1. 评审账本口径：五类事件各自的展示字段与汇总规则（物资件数、钱币合计、经验合计、法术位环级）
2. 开 P1 分支：类型 + `_shared.ts` + `/api/story` + store + 笔记探针
3. P1 全绿后进入 P2：migration 0017 + 账本聚合端点
