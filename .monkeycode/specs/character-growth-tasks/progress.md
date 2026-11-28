# 进度：character-growth-tasks

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标

把角色职业成长路径转换为自动化成长任务：有效等级提升时逐级生成任务，玩家填写升级选择，DM 审核 diff 后白名单落卡，并写入角色日志与剧情账本 growth 事件。

## 阶段状态

- [x] P0 需求与设计：`requirements.md` + `design.md` 初稿，三项决策已确认（2026-11-28）
- [x] P1 等级派生改造 + 纯函数成长路径 + 角色详情路径预览（2026-11-28）
- [ ] P2 任务持久化 + 自动生成 + 玩家填写与提交
- [ ] P3 DM 审核 + 白名单落卡 + 日志与剧情账本联动
- [ ] P4 手工任务 + 别名归一化 + 数据缺失 + API 权限探针与验收

当前：P0 + P1 已完成，全量探针 `ALL PROBES OK`；待进入 P2。

## 已决策

- 触发方式：自动生成。经验值变化导致有效等级提升时直接生成成长任务，DM 保留取消与手工任务入口。
- 多级连升：逐级生成。每个目标等级一个独立任务，按等级升序处理。
- 等级权威源：经验推导。`getLevelFromExp(experience)` 为唯一事实源，`character.level` 作为派生缓存同步；成长路径、任务触发与审核校验统一读取有效等级。
- 落卡方式：专用成长任务表 + 白名单落卡接口；通用变更请求继续服务非结构化整卡修改。
- 自动触发点：本地角色保存、`PUT /api/characters/[id]`、`POST /api/change-requests/[id]/approve` 三处共用幂等生成。
- 放弃方案：用整卡快照提交成长任务 —— 玩家可构造任意字段，权限与校验成本高。

## 下一步

1. P2：新增 `migrations/0019_growth_tasks.sql`、`src/data/growthTaskStore.ts`、`functions/api/growth-tasks/**`，实现有效等级提升时幂等逐级生成任务。
2. 玩家端任务卡与结构化选择提交，DM 审核页接入 `diffCharacter` 展示字段级差异。
3. 落卡接口白名单化，并联动 `character_logs` 与剧情账本 growth 事件。
4. 补 growth API 权限探针；线上 D1 手动 apply `0017` / `0018` / `0019`。

## 验证方式

- 基线：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`）
- 本功能探针：`scripts/probes/probe-growth-path.cjs`
- 构建：`npx tsc -p tsconfig.app.json --noEmit && npm run build`

## 分支与提交

- 分支：`feature/character-growth-tasks`
- 关键提交：`feat: 角色成长路径派生与等级由经验推导（P0+P1）`
