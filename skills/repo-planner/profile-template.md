# Repo Profile — <项目名>

> 最后更新：<YYYY-MM-DD> | 基于 commit：<short-hash>
> 索引消耗：<N> 次读文件操作

---

## 一、基本信息

| 项目 | 值 |
|------|-----|
| 定位 | <一句话描述项目是什么> |
| 包管理器 | npm / pnpm / yarn |
| 框架 | <React / Vue / Next.js / ...> |
| 语言 | TypeScript <版本> / JavaScript |
| 样式 | Tailwind / CSS Modules / styled-components / ... |
| 状态管理 | Redux / Zustand / 自定义 store / ... |
| 后端 | <Cloudflare Functions / Next API / Express / ...> |
| 数据库 | <D1 / PostgreSQL / MongoDB / 无 / ...> |
| 部署 | <Cloudflare Pages / Vercel / Docker / ...> |
| 开发命令 | `<npm run dev>` → 端口 <port> |
| 构建命令 | `<npm run build>` |
| 类型检查 | `<npx tsc --noEmit>` |
| 测试命令 | `<npm test>` / 无测试 |

## 二、目录结构

```
<project-root>/
├── src/
│   ├── <dir1>/          <说明> (<N> files)
│   ├── <dir2>/          <说明> (<N> files)
│   └── ...
├── <backend-dir>/       <说明> (<N> files)
├── <config-files>       <说明>
└── <docs>               <说明>
```

## 三、架构模式

### 整体架构
<1-2 段描述：单体/微服务、分层方式、数据流方向>

### 路由结构
```
<路由树，标注守卫/中间件/权限>
```

### 状态管理模式
<描述 store 的组织方式、订阅机制、持久化策略>

### API 层模式
<描述 API 组织方式、认证机制、请求/响应格式>

### 数据模型
<列出核心类型/接口，标注文件位置>

## 四、核心模块清单

| 模块 | 路径 | 职责 | 文件数 | 行数 | 复杂度 |
|------|------|------|--------|------|--------|
| <模块名> | <path> | <一句话职责> | <N> | <N> | 高/中/低 |

### 大文件（>500 行，复杂度热点）

| 文件 | 行数 | 职责 | 备注 |
|------|------|------|------|
| <path> | <N> | <职责> | <为什么这么大/是否计划拆分> |

## 五、关键约定

### 命名
- 文件：<PascalCase / camelCase / kebab-case>
- 组件：<PascalCase>
- 函数/变量：<camelCase>
- 常量：<UPPER_SNAKE_CASE>
- 类型/接口：<PascalCase>
- CSS：<Tailwind class / BEM / CSS Modules>

### 导入
- 路径别名：<@/ → src / 无别名 / ...>
- 导入风格：<绝对路径优先 / 相对路径 / 混合>

### 代码风格
- 组件：<函数式 + export default / 箭头函数 / ...>
- 状态：<const xxxStore = {} + export default / class / ...>
- 注释：<只写 why / JSDoc / 不写注释 / ...>

## 六、依赖关系图

```
<核心模块间的 import/调用关系，用 ASCII 箭头表示>
例：
  Pages → Components → Hooks → Store → API Client
                                          ↓
                                    Backend Functions → DB
```

## 七、验证与构建

| 步骤 | 命令 | 预期 | 耗时 |
|------|------|------|------|
| 类型检查 | `<cmd>` | 无输出 = 通过 | <N>s |
| 构建 | `<cmd>` | dist/ 产出 | <N>s |
| 测试 | `<cmd>` | all pass | <N>s |
| Lint | `<cmd>` | 无 error | <N>s |

## 八、项目特有规则

> 从 AGENTS.md / CLAUDE.md / .cursorrules 等提取的项目特有规则摘要。
> 如无此类文件，从代码模式中推断并标注「推断」。

- <规则 1：例如「所有装备消耗走 EquipmentChanges 三件套，不直接改 character.equipment」>
- <规则 2：例如「新 store 必须包含 8 件套：load/save/notify/getAll/get/create/update/delete/subscribe」>
- <规则 3：例如「API 认证双轨：JWT + DM Token」>
- ...

## 九、推断 vs 确认

> 标注 Profile 中哪些信息是从文档确认的，哪些是从代码推断的。
> 推断项在规划时可能需要额外验证。

| 信息 | 来源 | 可信度 |
|------|------|--------|
| 技术栈 | package.json | 确认 |
| 路由结构 | App.tsx | 确认 |
| 状态管理模式 | 架构文档 + store 文件 | 确认 |
| <某约定> | 从 1 个代表文件推断 | 推断 — 需验证其他文件是否一致 |
