# Agent 指引 — dnd-tool（DND 5e DM Toolkit）

> **TL;DR**：本项目是「龙与地下城 5e 规则」的桌面管理工具（DM 工作台 + 玩家端只读视图）。前端 Vite + React 19 + TypeScript + Tailwind v4 + React Router v7，后端 Cloudflare Pages Functions + D1 数据库，本地状态走 localStorage + 发布订阅 store，有网时与云 API 双向同步。

---

## 0. 快速导航：按任务定位

| 你要做什么 | 看哪里 | 不要动什么 |
|-----------|--------|-----------|
| 改页面路由 | `src/App.tsx` | 三个路由组（玩家端 / 公共资料库 / DM 端）的守卫层级别乱改 |
| 改某个页面 UI | `src/pages/<PageName>.tsx` | |
| 改可复用组件 | `src/components/<Name>.tsx` | 不要在 components 里写路由或 API 调用，通过 props 传入 |
| 改数据结构 / 类型 | `src/types/*.ts`（6 个独立文件，见下方） | 改类型后必须同步对应 store |
| 改前端状态（增删查改订阅） | `src/data/*Store.ts`（9 个 store，见下方） | 所有 store 统一模式：`load / save / notify / getAll / get / create / update / delete / subscribe` |
| 改装备生成 / 字段标准化 | `src/data/equipmentFactory.ts` 的 `extractBaseFields` | 工厂函数，改字段时所有使用方都会同步 |
| 改角色装备操作（增删、备战、穿戴） | `src/hooks/useEquipmentActions.ts` + `src/data/characterStore.ts` + `src/data/equipmentWear.ts` | 三者协作，不要只改其一 |
| 改备战槽 / 战斗层手持 | `src/data/characterStore.ts`（readyItem/unreadyItem 备战 API）+ `src/data/combatStore.ts`（setCombatantHand 家族，参战者手持） | 角色卡只有备战数据（readiedLeft/Right），战斗层手持在 combatant 上，随记录回溯、结算不涉及 |
| 改战斗逻辑（背包派生、AC、动作、弹药、装填） | `src/data/combatStore.ts` + `src/pages/CombatSession.tsx` | combatStore 是纯计算层，CombatSession 是交互层，分离要保持 |
| 改攻击检定弹窗（射程、弹药、装填检查） | `src/components/CombatAttackModal.tsx` | 可用性检查统一走 `getAttackStatus`，不要在按钮里硬加判断 |
| 改优劣势判定（检定 / 豁免 / 伤害展示） | `src/data/advantageRules.ts`（注册式引擎）+ `src/types/combat.ts` 的 `PendingAdvantageSource` | 不要在 `CombatAttackModal` / `CombatSpellModal` 里硬编码判定分支，新特性一律 `registerDetector` 或 `addPendingAdvantage`；手动覆盖优先级最高，优劣势互斥抵消 |
| 改手动优劣势菜单 UI | `src/components/AdvDisadvToggle.tsx` | 被 `CombatAttackModal` / `CombatSpellModal` 共用，改一个组件即同步两处 |
| 改回合待办（持续效果提醒） | `src/components/TurnTodoBoard.tsx` + `src/data/combatStore.ts` 的 `addTurnTodo / removeTurnTodo / toggleTurnTodo / resetTurnTodosForRound` | 待办数据内嵌在 CombatRecord，与 equipmentChanges 同层级；只在放映模式 + 已开始放映时显示 |
| 改沙盘交互（双指缩放、白圈、拾取） | `src/components/Battleground.tsx` | 触摸事件链（pointerdown→move→up→click）脆弱，改之前先通读一遍 |
| 改云 API 接口 | `functions/api/**/*.ts` + `src/lib/api.ts` | 改后端必须同步改前端 api 客户端；D1 操作在 SQL 里，别丢 WHERE |
| 改圆桌 / 通用检定（信箱轮询） | `src/pages/RoundTable.tsx`（DM）/ `src/pages/PlayerRoundTable.tsx`（玩家）/ `src/hooks/useRoundTableInbox.ts` / `src/lib/checkPipeline.ts` / `functions/api/table/*` | 消息不可变（仅 request 的 status/replyMessageId 可回填）；检定加值走 checkPipeline 复用 advantageRules/attackBonus；迁移 0013 需手动 apply |
| 改登录 / 权限 | `src/contexts/AuthContext.tsx` + `functions/_utils.ts` | AuthContext 里 user/isAdmin/isAuthenticated 是三大派生（isDM 仅是游戏身份），不要加冲突的局部判断 |
| 改样式 / 主题 | Tailwind class（内联）+ `public/css/main.css`（全局 token） | 不要手写 CSS 文件，尽量用 Tailwind；暗黑模式 class 后缀 `-dark` |
| 加新功能页面 | 建 `src/pages/Xxx.tsx` → 在 `src/App.tsx` 注册路由 → 在 `Layout` / `PlayerLayout` 对应菜单里加入口 | |
| 改数据库表结构 | `migrations/NNNN_name.sql`（新建迁移文件，不要改旧的）+ `functions/_utils.ts` 对应类型 | 迁移文件追加式，D1 手动 apply |
| 侦查 / 定位代码模块（先读文档再读源码） | `docs/generated/src/**`（按源码路径镜像的 .md 概述文档，见 §5.14） | 文档是路由表不是唯一事实源，关键判断仍以 `src/` 源码为准；改代码后需重新触发 docs workflow 更新文档 |

---

## 1. 技术栈总览

```
┌─────────────────────────────────────────────────────────────┐
│  前端（Vite SPA，纯静态打包到 dist/）                        │
│  React 19 + TypeScript 6 + Tailwind CSS v4                 │
│  react-router-dom v7（BrowserRouter，三路由组）              │
│  lucide-react 图标库                                        │
├─────────────────────────────────────────────────────────────┤
│  本地状态层（localStorage + 发布订阅）                       │
│  9 个 *Store.ts：装备库 / 法术库 / 角色卡 / 战斗记录 /      │
│  NPC模板 / 沙盘 / 宝藏 / 日历 / 游戏时间                    │
│  独立模块：equipmentFactory（字段标准化）                    │
│           equipmentWear（穿戴逻辑 + AC 重算）               │
│           editorState（编辑态恢复）                         │
│           diceService（骰子投掷）                           │
│           attackBonus（攻击加值计算）                       │
│  Hooks 子域（React，按功能独立封装）：                      │
│    hooks/combat/*  9 个战斗聚合 hook：                      │
│      useCombatInventories / useActions / useThrownDrop      │
│      useSurprise / useInitiative / useDamageAndHp          │
│      useRoundTurn / useManualRecord / usePlayback           │
│    聚合 Hook：useEquipmentActions（装备增改删备战穿戴）     │
├─────────────────────────────────────────────────────────────┤
│  后端（Cloudflare Pages Functions + D1 SQL 数据库）         │
│  functions/api/*：auth(登录注册) / admin(账号管理) /        │
│    characters / equipments / spells / import / upload       │
│  functions/_utils.ts：JWT、is_admin、密码哈希、SQL 连接    │
│  权限模型：账号 is_admin（站点权限）+ role（游戏身份）      │
├─────────────────────────────────────────────────────────────┤
│  数据种子 / 静态资源                                        │
│  data/players/*.json：预置角色卡（可被覆盖）                │
│  src/data/equipments.json、spells.json：预置装备库/法术库  │
│  migrations/*.sql：D1 建表迁移（0001~0009）                │
│  public/images/*：静态图片                                  │
└─────────────────────────────────────────────────────────────┘
```

**包管理**：`npm`（仓库里是 `package-lock.json`，不要用 pnpm / yarn，依赖会对不上）。

**开发 / 构建 / 预览**：
```bash
npm run dev       # 启动 Vite 开发服务器（默认 5173）
npm run build     # tsc -b 类型检查 + vite build 产出 dist/
npm run preview   # 预览打包后的产物
```

**类型检查**（纯类型，不构建）：`npx tsc --noEmit`。

---

## 2. 前端架构图

### 2.1 路由分层（`src/App.tsx`，四层嵌套）

```
BrowserRouter
├── [公开] /login · /register                        无需登录
├── [独立] /characters/:id/inventory                 需登录（单独壳）
├── [玩家端] /player/*                               ProtectedRoute + PlayerLayout（精简导航）
│     home / :playerId / :playerId/inventory / combat / inventory / spells[/:id] / account
├── [公共资料库] /equipment · /spells · /combat       ProtectedRoute + Layout（两端共用）
└── [DM 端] /*                                       ProtectedRoute(requireAdmin) → RoleShell → Layout
      / · /characters[/:id] · /inventory[/treasures|/trade] · /settings/{admin,accounts,migration,data}
      /notes · /clock · /calendar · /dice · /account
```

> **守卫规则**：
> - `ProtectedRoute` 无参数 → 仅需登录（账号 JWT）
> - `requireAdmin` → 需 `user.isAdmin === true`（非管理员被 RoleShell 分流到玩家端）
> - 站点权限只认 `users.is_admin`；`role`（dm/player）仅是游戏身份，不授予站点权限
> - DM Token 仅作服务端应急通道（`authenticateRequest` 兜底），前端无入口

### 2.2 目录速查（`src/`）

- `types/`：character · combat · battleground · equipment · spell · treasure（一个领域一个文件）
- `data/`：9 个 store（equipment/spell/character/combat/npcTemplate/battleground/treasure/calendar/gameTime）+ 独立工具（equipmentFactory / equipmentWear / advantageRules / reactionDefinitions / reactionRules / attackBonus / diceService / editorState）+ 种子 json
- `components/`：Layout / PlayerLayout / Navbar / ProtectedRoute · `combat/` 8 件（先攻/突袭/回滚/手动记录/放映条/参战者表/先攻表）· 核心弹窗（CombatAttackModal / CombatDamageModal / CombatSpellModal / CombatantInfoPanel / Battleground / AdvDisadvToggle / TurnTodoBoard / ReactionPromptModal）· 编辑器三件套 · 其余（CharacterEquipmentCard / EquipmentPicker / SpellPicker / NpcCreator / TradeModal / SyncButton / GameClock / ErrorBoundary）
- `hooks/`：useEquipmentActions · combat/ 9 个 · useInput
- `lib/`：api.ts · attackBonus.ts · turnCommitApply.ts · checkPipeline.ts
- `contexts/`：AuthContext · ThemeContext
- `pages/`：39 个（对应上方路由）
- 组件/函数级细目查 `docs/generated/src/**`（按源码路径镜像）

## 3. 后端架构图（Cloudflare Pages Functions + D1）

```
functions/
├── _utils.ts           认证 & SQL 工具（所有 API 共用）
│   ├── getDb()                     D1 连接（DB binding）
│   ├── verifyDmToken(header)       DM Token 校验（应急通道）
│   ├── authenticateRequest(req)    JWT → 查库校验 role/is_admin，DM Token 应急兜底
│   ├── signJwt(userId, role)       7 天 JWT 生成
│   ├── hashPassword(pw)            SHA-256 + salt 32 字节
│   └── verifyPassword(pw, hash)    比对
│
└── api/
    ├── auth/                       普通账户端点（JWT 认证）
    │   ├── POST   login.ts            （写 sessions 表）
    │   ├── POST   register.ts
    │   ├── POST   logout.ts
    │   ├── POST   change-password.ts
    │   ├── GET    me.ts               获取当前用户
    │   ├── PATCH  me.ts               更新用户名/头像
    │   └── GET    verify.ts           校验 session
    │
    ├── admin/users/                管理员端点（需 is_admin）
    │   ├── GET    index.ts            LEFT JOIN sessions 查在线
    │   ├── PATCH  [id].ts             改 role（player/dm）
    │   ├── DELETE [id].ts
    │   └── POST   [id]/password.ts    重置密码
    │
    ├── characters/                 角色卡 CRUD（JWT + is_admin 写权限）
    │   ├── GET    index.ts
    │   ├── POST   index.ts
    │   ├── GET    [id].ts
    │   ├── PUT    [id].ts
    │   └── DELETE [id].ts
    │
    ├── equipments/                 装备库 CRUD
    │   ├── GET    index.ts
    │   ├── POST   index.ts
    │   ├── GET    [id].ts
    │   ├── PUT    [id].ts
    │   └── DELETE [id].ts
    │
    ├── spells/                     法术库 CRUD + 表格导入
    │   ├── GET    index.ts
    │   ├── POST   index.ts
    │   ├── GET    [id].ts
    │   ├── PUT    [id].ts
    │   ├── DELETE [id].ts
    │   └── GET    table.ts            从 cheerio 爬外部表格（cheerio）
    │
    ├── import/                     批量导入
    │   ├── POST   equipments.ts
    │   └── POST   spells.ts
    │
    └── upload/
        └── POST   avatar.ts           R2 上传头像（压缩后 ≤256px）
```

**认证与权限**（`functions/_utils.ts` `authenticateRequest`）：
- JWT 在 `Authorization: Bearer <>`；验签后再查库读取 `role` / `is_admin`，保证授予或撤销管理员后立即生效
- 写端点统一判断 `auth.isAdmin`；`role`（dm/player）只作为游戏身份返回给前端
- DM Token 仅在 JWT 无效时作为服务端应急后门（`isAdmin: true`），前端无输入入口
- `src/lib/api.ts` 的 `authHeaders()` 与 `adminAuthHeaders()` 都走账号 JWT

**数据库迁移**：`0001_init.sql`（characters/equipments/spells）→ `0002_sessions.sql`（sessions）→ `0003_avatar.sql`（users.avatar）→ … → `0008_npc_templates.sql`（图鉴）→ `0009_site_admin.sql`（users.is_admin，站点管理员独立于游戏身份）。迁移是追加式，不要修改已有的迁移文件；未执行 0009 时后端会回退旧字段并按 `role=dm` 兼容管理员。

---

## 4. 关键数据模型与状态流

### 4.1 装备的三层身份（**极易混淆，务必搞清**）

```
┌─────────────────────────────────────────────────────────────┐
│  第 1 层：EquipmentItem（装备库模板）                        │
│  文件：types/equipment.ts + data/equipmentStore.ts          │
│  字段：id · category · subtype · damageDice · price · ...   │
│  特征：没有 quantity（模板级，不是实例）                     │
│  来源：equipments.json 种子 / import 导入 / 编辑器新建     │
├─────────────────────────────────────────────────────────────┤
│  第 2 层：Equipment（角色背包实例）                          │
│  文件：types/character.ts Equipment 接口                    │
│  字段：id（模板 ID）+ childId（**背包实例唯一 ID**）        │
│        + quantity · packSize · unit（备战槽 readiedLeft/Right 引用 childId）│
│  特征：每个实例有独一无二的 childId = 角色背包主键          │
│  来源：从装备库加入（useEquipmentActions）/ 宝藏分配       │
│        / 战斗中拾取 / 交易                                 │
├─────────────────────────────────────────────────────────────┤
│  第 3 层：EquipmentChanges（战斗变更漏斗，**不修改源**）     │
│  文件：types/combat.ts EquipmentChanges                     │
│  字段 3 件套：added[] · removedChildIds[] · quantityDeltas  │
│  派生：combatStore.computeChildQtyMap() 抵消三者得出         │
│        srcQty（源） vs combatQty（战斗中当前）              │
│  特征：战斗结束后可整体丢弃，角色背包不受影响；              │
│        弹药/投掷武器消耗走此路径                             │
└─────────────────────────────────────────────────────────────┘
```

**任何装备消耗类操作**（射击扣弹药、投掷武器掉落、拾取加回）都必须：
1. **只读** `character.equipment` 作为源
2. **只改** `CombatRecord.equipmentChanges[combatantId]` 的三件套
3. **只读** `combatStore.deriveCombatInventory()` 得到战斗中真实背包
4. 不要直接改 `character.equipment` 的 quantity

### 4.2 Store 统一模式（9 个 store 都遵循）

```ts
// 骨架：
let listeners: (() => void)[] = [];
function notify() { listeners.forEach(l => l()); }

function load(): T[]      { /* localStorage + JSON.parse + 容错字段兜底 */ }
function save(list: T[])  { /* localStorage.setItem + notify() */ }

const xxxStore = {
  getAll(): T[]                   { return load().sort(...) },
  get(id): T | null               { return load().find(...) ?? null },
  create(...): T                  { /* UUID + 默认值 + save(append) */ },
  update(id, partial): void       { /* 找 index → 合并 → save */ },
  delete(id): void                { /* filter → save */ },
  subscribe(listener: () => void) { /* 追加，返回 unsubscribe */ },
  // + 业务专属函数（如 combatStore.consumeAction / treasureStore.recordDistribution）
};
export default xxxStore;
```

页面层用法：`useEffect` 内 `xxxStore.subscribe(() => setLocal(xxxStore.get(id)))`，订阅 + 读初始值。

### 4.3 攻击 → 伤害完整链路

```
参战者战斗层手持 [combatant.heldLeft/Right]（进战时从角色卡备战槽自动初始化）
  ↓（CombatSession 点击"攻击"按钮）
CombatAttackModal 打开
  ├─ getAttackStatus() 可用性检查
  │    · 必须手持 → 弹药武器在 combatInventory 找弹药（AMMO_MAP）
  │    · 双手武器（含双手+装填并存）：双手优先于装填，另一手必须为同一把武器
  │    · 装填武器：已装填→只要一手持有即可击发；未装填→另一手满足三条件之一（空/对应弹药/武器自身）+ 弹药>0
  │    · 放映模式：装填武器每回合只能攻击一次（loadingAttackedThisRound），优先级高于额外动作
  │    · 射程（切比雪夫距离 vs normalRange/maxRange）
  ├─ 玩家填 d20 结果 → 命中判定
  └─ handleConfirmResult()
       ├─ 弹药消耗信息：ammoChildId + ammoName
       └─ 装填武器射击后置 loaded=false
  ↓（onConfirmHit / onAttackMiss 回调到 CombatSession）
CombatSession
  ├─ consumeCombatantAction()：扣 1 动作（simulation 模式扣到 0 立即回 1）
  ├─ 装填武器攻击（命中/未命中）→ markLoadingAttacked()：放映模式标记本回合已用过装填武器
  ├─ 弹药扣减（命中 / 未命中都扣）：
  │    · quantityDeltas[ammoChildId] -= 1
  │    · 最后一发 → removedChildIds 整件移除
  ├─ 命中 → 切 CombatDamageModal（伤害结算 → HP）
  └─ 投掷武器：消耗后 → executeThrownDrop() 生成 ItemToken 到沙盘落地
```

---

## 5. 设计模式索引（实现细节见 `docs/agents-patterns.md`）

| 模式 | 何时用 | 位置 |
|------|--------|------|
| 5.1 装备字段标准化 `extractBaseFields` | 新增/改动装备字段 | `data/equipmentFactory.ts` |
| 5.2 聚合 Hook `useEquipmentActions` | 角色装备增改删/备战/穿戴 | `hooks/useEquipmentActions.ts` |
| 5.3 变更漏斗 `EquipmentChanges` | 战斗内装备消耗/拾取 | `data/combatStore.ts` |
| 5.4 双轨认证 + 权限 | 新云端端点 | `functions/_utils.ts` · `lib/api.ts` |
| 5.5 拖拽锚点保持 | 沙盘双指缩放类交互 | `components/Battleground.tsx` |
| 5.6 长按落空回退 click | 长按→白圈类交互 | `components/Battleground.tsx` |
| 5.7 武器属性解析 | 武器复合文本→结构化 | `components/AttackEditor.tsx` |
| 5.8 回合待办 TurnTodo | 跨回合持续效果提醒 | `data/combatStore.ts` · `components/TurnTodoBoard.tsx` |
| 5.9 状态驱动待办生命周期 | 状态触发型待办（死亡豁免） | `data/combatStore.ts` · `CombatSession.tsx` |
| 5.10 受控输入 Hook | 新表单/弹窗数字与文本输入 | `hooks/useInput.ts` |
| 5.11 放映回溯 `startPlayback` | 放映模式回滚/重开 | `pages/CombatSession.tsx` |
| 5.12 `currentTurn` 纯 id 设计 | 回合标记/先攻重排 | `pages/CombatSession.tsx` |
| 5.13 注册式优劣势引擎 | 新优劣势来源/检定场景 | `data/advantageRules.ts` |
| 5.14 文档路由 | 跨模块侦查 | `docs/generated/src/**` |

新模式的通用判据：逻辑跨 3 处以上复用、或涉及「临时副本/状态生命周期」时，先在此表登记再实现。

## 6. 命名与编码约定

| 项目 | 约定 |
|------|------|
| 文件命名 | 大驼峰：页面 `PageName.tsx`、组件 `ComponentName.tsx`；小驼峰：store `xxxStore.ts`、类型 `xxx.ts` |
| 组件 | 函数式 + `export default`；props 用 `interface Props { ... }`，不要解构在函数参数 |
| store | `const xxxStore = { ... }` + `export default xxxStore`；不要 class |
| 类型 / 接口 | 领域聚合在 `types/` 的 6 个文件里，**不要**在组件里写接口再导出到全局 |
| ID | 用 `crypto.randomUUID()`；临时 ID（编辑中未保存）用 `\`temp-\${Date.now()}\``；战斗拾取 childId 用 `\`combat-\${picker.id}-\${Date.now()}-\${rand6}\`` |
| 装备引用一致律 | 判定 / 查找永远用 `eq.childId \|\| eq.id`，不要只判断其中一个；备战槽 `readiedLeft/Right` 与手持槽 `slot.equipmentId` 总是匹配 childId |
| 距离 | 沙盘一律 **切比雪夫距离** max(Δcol, Δrow)，对应 D&D 标准 5 尺/格；移动范围 BFS 不做斜向修正 |
| CSS | Tailwind class；暗黑/亮色前缀：`dark:text-x-dark-y` / `light:text-x-light-y`；不要新建 `.css` 文件（除 `index.css` 入口 + `public/css/main.css` 全局） |
| 注释 | 只写**非显而易见的 why**（算法推导、互斥规则、兼容性 hack），不写 what；禁止用 emoji |
| 导入 | 绝对路径 `@/xxx/yyy` 优先（vite.config.ts 里 `@ → src` 已配置），不要写 `../../data/` |

---

## 7. 常见任务踩坑清单

### 修改战斗背包相关
- ✅ **永远走 `EquipmentChanges` 三件套** → `applyEquipmentChange` → `combatStore.update(record.id, { equipmentChanges: {...} })`
- ❌ 不要直接改 `character.equipment[i].quantity`
- ❌ 不要直接改 `combatant` 的任何东西（除 actions / hp / status）：装备状态存在 combatRecord 里，不在 combatant 身上

### 回合推进与 currentTurn
- ✅ `currentTurn` 只有 `{ round, combatantId }`，需要下标时用 `findIndex` 实时计算
- ❌ 不要往 `currentTurn` 里加 `combatantIdx` 缓存——先攻编辑/平局重排后数组顺序变，缓存下标会偏移导致回合标记跳列
- ✅ 放映模式从非最新回合开始放映 ≡ 回溯（`startPlayback` 会还原初始快照 + 清空选中格之后的记录）
- ✅ `findNextValidTurn` 返回类型也只有 `{ round, combatantId }`，调用方不要 `.combatantIdx`
- ✅ initiative 输入需 `isNaN` 校验（`handleInitiativeSave`），非法值 `alert('请输入有效的先攻数值')` 而非静默丢弃

### 改沙盘触摸事件
- 通读 `handlePointerDown / Move / Up` 整链条再动
- `pointers.size === 2` 分支里同时改了 `translate` 和 `scale`，不要单独动其中一个
- `latestTranslate ref`：`setTranslate` 异步，`pointerup` 闭包里读 ref，不要读 state
- 多实体格 hasMultiple 时：`handleCellClick` 与棋子的 `onPointerDown` 不冲突，**棋子 div 不 `stopPropagation`**（目的是让外层 setPointerCapture）

### 加新的 store
- 必须包含 8 件套：`listeners / notify / load / save / getAll / get / create / update / delete / subscribe`
- `load()` 里必须写字段兜底（防止老数据打开报 undefined：`name: r.name ?? '未命名'`）
- `save()` 里必须 `notify()`，否则页面不刷新

### 加新的云 API 端点
- 新建 `functions/api/xxx/yyy.ts`（HTTP 方法默认 POST，GET 无需 body）
- 顶部 `import { authenticateRequest, getDb, ... } from '../_utils'`
- 前端 `src/lib/api.ts` 加对应函数，用 `apiFetch(path, { method, headers: authHeaders(), body: JSON.stringify(...) })`
- 返回类型加泛型：`export async function xxx<T = any>(): Promise<T>`
- 需要管理员权限的用 `adminAuthHeaders()`（账号 JWT，服务端校验 is_admin）

---

## 8. 验证步骤（做完改后必须做）

```bash
# 1. 类型检查（根 tsconfig 是 solution-style，npx tsc --noEmit 会空跑假通过）
npx tsc -p tsconfig.app.json --noEmit

# 2. 构建（真门禁：tsc -b + vite build；改了共享类型用 tsc -b --force 绕增量缓存）
npm run build

# 3. 预览（可选，需要 build 已完成）
npm run preview
```

> `npm run dev` 时页面刷新不出来？90% 是路由守卫（ProtectedRoute / requireAdmin）判断错了，先看 `AuthContext` 的 isAdmin 是不是 false、localStorage `auth_token` 在不在。

### 8.1 上下文卫生（控制 token 消耗）

- 侦查多文件先读 `docs/generated/src/**` 概述；需要源码细节时 `grep -n` 定位 + 精确行段，避免整文件分段通读
- 跨 3 个以上文件的纯调查交给 explore 子代理，主上下文只留结论
- E2E 探针用 `QUIET=1 node scripts/probes/xxx.cjs`，只输出 FAIL 与汇总；新选择器先在最小 debug 脚本验证再跑全量
- 一个功能一个会话（v1 → 方案 → P1 → P2 塞同一会话会让后段每轮都在重发前段全部工具输出）

---

## 9. Git 工作流规范（**每次改动必须遵守，除非用户明确要求不要**）

> **核心原则**：所有改动必须先在功能分支上提交并验证通过，再合并入 main；任何编辑前必须先同步远程最新状态，避免冲突覆盖他人提交。

### 9.1 改动前：同步远程最新状态

每次开始修改代码前，必须先拉取远程最新版本并与本地分支比对：

```bash
# 1. 抓取远程所有分支最新状态
git fetch --all --prune

# 2. 查看当前分支与 origin/main 的差异（确认有无落后）
git --no-pager log --oneline HEAD..origin/main   # 远程领先的提交
git --no-pager log --oneline origin/main..HEAD   # 本地领先的提交

# 3. 如果当前分支落后于 origin/main，先变基或合并最新（优先 rebase 保持线性）
git rebase origin/main
```

> 若存在未提交的本地改动，先 `git stash` 暂存 → 拉取 → `git stash pop` 恢复，再继续修改。

### 9.2 改动中：在功能分支上提交

**默认禁止直接在 main 分支上编辑和提交**，必须使用功能分支工作流：

```bash
# 1. 从最新 main 创建功能分支（命名：feature/xxx 或 fix/xxx）
git checkout -b feature/your-feature-name main

# 2. 完成代码改动后，分逻辑提交（每个 commit 是一个独立原子变更）
git add <具体文件>          # 严禁 git add .，除非明确知道所有改动都相关
git commit -m "feat: 描述本次提交的具体变更内容"   # 用 conventional commits 格式

# 3. 反复迭代修改：提交 → 验证（见 §8）→ 再提交
```

### 9.3 改动后：编译通过 → **默认自动 push main（无需用户提醒）** → 合入完成

功能分支上的改动**必须先通过编译验证**，才能合并入 main 并推送；**只要 main 上 build 通过，就立即 push origin/main，不等待用户指令**：

```bash
# 1. 在功能分支上跑完整验证（见 §8）
npx tsc --noEmit && npm run build

# 2. 验证通过后，切回 main 并同步最新
git checkout main
git pull origin main

# 3. 合并功能分支（使用 --no-ff 保留合并提交，便于回溯）
git merge --no-ff feature/your-feature-name

# 4. 再次在 main 上构建验证（合并后可能有冲突后新引入的问题）
npx tsc --noEmit && npm run build   ✅通过 → 立即执行下一步，不等用户说「push」

# 5. 验证通过后推送到远程 main（默认自动执行，用户不说话就推）
git push origin main

# 6. 清理已合并的功能分支（可选但推荐）
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name   # 如果推送过远程分支
```