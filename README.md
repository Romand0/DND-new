# DND 在线（dnd-tool）

面向 D&D 5e 的桌面跑团工具：DM 工作台 + 玩家只读视图。装备库 / 法术库 / 角色卡三库联动，战斗会话支持先攻、突袭、多重攻击、放映回溯与沙盘移动；被动与主动技能引擎、通用反应引擎、视野与躲藏判定均已落地。

## 技术栈

- 前端：Vite + React 19 + TypeScript + Tailwind CSS v4 + React Router v7
- 状态：localStorage + 发布订阅 store，有网时与云端双向同步
- 后端：Cloudflare Pages Functions + D1（`functions/`、`migrations/`）
- 实时：Durable Objects 战斗房间（`realtime/`，独立部署）

## 本地开发

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run build          # 种子校验 + tsc -b + vite build
npm run preview        # 预览构建产物
npm run validate-seed  # 校验种子数据结构
npm run seed -- monster --cr 1/2 --fields name,ac,maxHp --compact
```

前端默认 5173 端口；后端与实时服务需要 Cloudflare 环境（D1 迁移见 `migrations/`，追加式，不修改历史文件）。

## 目录速览

| 路径 | 说明 |
|------|------|
| `src/pages/` | 页面（DM 端 / 玩家端 / 公共资料库三组路由） |
| `src/components/` | 可复用组件与战斗弹窗家族 |
| `src/data/` | 本地 store、规则引擎与种子 JSON |
| `src/hooks/combat/` | 战斗会话聚合 hook |
| `src/types/` | 领域类型 |
| `functions/api/` | 云端 API（认证、角色卡、装备、法术、圆桌等） |
| `realtime/` | 战斗房间 Durable Object Worker |
| `scripts/probes/` | E2E 探针（数据级断言） |
| `docs/` | 人类可读文档（索引见 `docs/README.md`） |
| `.monkeycode/specs/` | 功能规格与进度（开发唯一状态源） |

## 文档

- 工程约定与任务导航：[AGENTS.md](AGENTS.md)
- 文档索引：[docs/README.md](docs/README.md)
- 版本沿革：[docs/changelog.md](docs/changelog.md)
- 设计模式：[docs/patterns/agents-patterns.md](docs/patterns/agents-patterns.md)
- 战斗模块导航：[docs/guides/combat-navigation.md](docs/guides/combat-navigation.md)

## 内测说明

项目处于内测阶段，版本号沿用 `内测 v0.x` 序列。数据结构与接口可能继续调整，升级依赖追加式迁移与数据管理页备份；跨版本破坏性变更由 DM 在数据管理页承担备份职责。
