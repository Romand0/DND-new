# 实时战斗房间（Durable Object + WebSocket）

实时层骨架，承载战斗场景的亚秒级同步。当前为 **spike 阶段**：协议、连接管理、广播、增量持久化、Hibernation 均已就绪，战斗业务消息待正式设计后接入。

## 架构定位

```
D1（持久层）        角色卡 / 战斗归档 / 圆桌信箱 —— 权威真相，低频读写
DO + WS（实时层）   本目录：战斗房间广播 + 增量补发 —— 战斗进行中，亚秒级
本地 store          现有 9 个 store 不动，DM 单机离线兜底
```

## 目录

```
realtime/
├── wrangler.toml         DO binding + SQLite class 迁移（v1）
├── tsconfig.json         独立类型检查（Workers 类型，不并入主项目 tsc）
└── src/
    ├── index.ts          Worker 入口（认证/路由）+ CombatRoomDO
    ├── jwt.ts            JWT 验签（与 functions/_utils.ts 同算法，改一处要同步另一处）
    └── spikePage.ts      自测页（/spike），连通性与 Hibernation 验证
```

前端对应：`src/lib/combatRoomClient.ts`（WS 客户端 + 重连退避）、`src/types/realtime.ts`（协议镜像）。

## 部署前置（需要账户操作）

1. **API Token**：Cloudflare Dashboard → My Profile → API Tokens，权限 `Workers Scripts:Edit`，存为仓库 Secret `CLOUDFLARE_API_TOKEN`；Account ID 存 `CLOUDFLARE_ACCOUNT_ID`
2. **JWT_SECRET**：`cd realtime && wrangler secret put JWT_SECRET`（与 Pages 项目同一个值）
3. **前端指向 Worker**：Pages 项目 → Settings → Variables and Secrets → 添加变量 `VITE_REALTIME_URL`，值为 Worker 地址（如 `https://dnd-realtime.<account>.workers.dev`）；Vite 变量是**构建时注入**，添加/修改后必须重新部署 Pages 才生效。生产站点没有 `/realtime` 代理（vite 代理仅本地 dev 生效），缺这个变量时客户端会连到站点自身 404
4. push 到 `realtime/**` 触发 `.github/workflows/deploy-realtime.yml` 自动部署

## 本地开发

```bash
# 终端 1：实时 Worker（默认 8787）
cd realtime
npx wrangler dev --var ALLOW_DEV_TOKEN:1

# 终端 2：前端（vite 已配置 /realtime 代理，含 ws:true）
npm run dev
```

本地可用 `token=dev&role=dm` 旁路认证（仅 `ALLOW_DEV_TOKEN=1` 时生效）。

## Spike 验证清单

部署后访问 `https://<worker>.workers.dev/spike`：

1. 连接成功，收到 `welcome`（含房间与成员列表）
2. 两个标签页同房间：一侧 echo 广播，另一侧收到
3. `combat.delta` 仅 dm 可写；player 发送返回 `error`
4. 闲置 70 秒以上再 ping，仍收到 `pong`（Hibernation 唤醒验证）
5. `snapshot.request` 返回最近增量（seq 递增、超出 200 条淘汰）

## 协议 v0

客户端 → 房间：`ping` / `echo` / `snapshot.request` / `combat.delta`（仅 dm）
房间 → 客户端：`welcome` / `members` / `pong` / `echo` / `combat.delta` / `snapshot` / `error`

正式战斗协议（HP/状态/回合/先攻/沙盘五类增量）待设计文档确定后扩展，本骨架的 `combat.delta.payload` 为透传结构。

## 成本要点

- 计费按**收到的上行消息**计数，广播（DO → 客户端）不计
- Hibernation：无消息时自动休眠，不占活跃时长
- 单团组日常量级约数千请求/天，免费额度 100k/天余量 50 倍以上
