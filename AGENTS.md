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
| 改角色装备操作（增删、手持、穿戴） | `src/hooks/useEquipmentActions.ts` + `src/data/characterStore.ts` + `src/data/equipmentWear.ts` | 三者协作，不要只改其一 |
| 改战斗逻辑（背包派生、AC、动作、弹药、装填） | `src/data/combatStore.ts` + `src/pages/CombatSession.tsx` | combatStore 是纯计算层，CombatSession 是交互层，分离要保持 |
| 改攻击检定弹窗（射程、弹药、装填检查） | `src/components/CombatAttackModal.tsx` | 可用性检查统一走 `getAttackStatus`，不要在按钮里硬加判断 |
| 改回合待办（持续效果提醒） | `src/components/TurnTodoBoard.tsx` + `src/data/combatStore.ts` 的 `addTurnTodo / removeTurnTodo / toggleTurnTodo / resetTurnTodosForRound` | 待办数据内嵌在 CombatRecord，与 equipmentChanges 同层级；只在放映模式 + 已开始放映时显示 |
| 改沙盘交互（双指缩放、白圈、拾取） | `src/components/Battleground.tsx` | 触摸事件链（pointerdown→move→up→click）脆弱，改之前先通读一遍 |
| 改云 API 接口 | `functions/api/**/*.ts` + `src/lib/api.ts` | 改后端必须同步改前端 api 客户端；D1 操作在 SQL 里，别丢 WHERE |
| 改登录 / 权限 | `src/contexts/AuthContext.tsx` + `functions/_utils.ts` | AuthContext 里 user/isDM/isAuthenticated 是三大派生，不要加冲突的局部判断 |
| 改样式 / 主题 | Tailwind class（内联）+ `public/css/main.css`（全局 token） | 不要手写 CSS 文件，尽量用 Tailwind；暗黑模式 class 后缀 `-dark` |
| 加新功能页面 | 建 `src/pages/Xxx.tsx` → 在 `src/App.tsx` 注册路由 → 在 `Layout` / `PlayerLayout` 对应菜单里加入口 | |
| 改数据库表结构 | `migrations/NNNN_name.sql`（新建迁移文件，不要改旧的）+ `functions/_utils.ts` 对应类型 | 迁移文件追加式，D1 手动 apply |

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
├─────────────────────────────────────────────────────────────┤
│  后端（Cloudflare Pages Functions + D1 SQL 数据库）         │
│  functions/api/*：auth(登录注册) / admin(账号管理) /        │
│    characters / equipments / spells / import / upload       │
│  functions/_utils.ts：JWT、DM Token、密码哈希、SQL 连接    │
│  认证双轨：JWT（普通账户） + DM Token（站点超级管理员）    │
├─────────────────────────────────────────────────────────────┤
│  数据种子 / 静态资源                                        │
│  data/players/*.json：预置角色卡（可被覆盖）                │
│  src/data/equipments.json、spells.json：预置装备库/法术库  │
│  migrations/*.sql：D1 建表迁移（0001~0003）                │
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
├── [公开] /login · /register                         无需登录
├── [独立] /characters/:id/inventory                   需要登录（单独壳）
├── [玩家端] /player/*                                 ProtectedRoute + PlayerLayout（精简导航）
│     ├── /player/home                  PlayerHome     角色卡入口列表
│     ├── /player/:playerId             PlayerView     角色卡只读视图（playerId = 角色 ID）
│     ├── /player/:playerId/inventory   PlayerInventory 角色背包只读
│     ├── /player/combat                Placeholder
│     ├── /player/inventory             InventoryPage  物资库
│     ├── /player/spells                SpellList      法术库
│     ├── /player/spells/:id            SpellDetail
│     └── /player/account               UserProfile    个人账号设置
├── [公共资料库] /equipment · /spells · /combat        ProtectedRoute + Layout（两端共用）
│     ├── /equipment, /equipment/:id     EquipmentList / Detail
│     ├── /spells, /spells/:id           SpellList / Detail
│     ├── /combat                        CombatList     战斗记录列表
│     └── /combat/:sessionId             CombatSession  战斗追踪主页面
└── [DM 端] /*                                         ProtectedRoute(requireDM) + RoleShell → Layout
      ├── /                              Home           DM 工作台概览
      ├── /characters[/:id]              CharacterList / Detail   角色卡 CRUD
      ├── /inventory                     InventoryPage  物资库（含宝藏入口卡片）
      │     └── /inventory/treasures[/new|/:id/edit|/:id/distribute]  宝藏三页
      ├── /inventory/trade               TradePage      交易
      ├── /settings                      Settings       嵌套壳，重定向到 /settings/admin
      │     ├── admin                     AdminAuth      DM Token 输入验证
      │     ├── accounts                  AdminAccounts  账户一览表格
      │     ├── migration                 MigrationBackup 迁移备份
      │     └── data                      DataManagement 数据管理（导入导出）
      ├── /notes                         NotesPage
      ├── /clock                         GameClockPage  游戏时钟
      ├── /calendar                      CalendarPage   日历
      ├── /dice                          DicePage       骰子
      └── /account                       UserProfile    个人账号设置
```

> **守卫规则**：
> - `ProtectedRoute` 无参数 → 仅需登录（JWT 或 DM Token）
> - `ProtectedRoute requireDM` → 需 `user.role === 'dm'`（玩家角色会被 RoleShell 分流）
> - `AdminAccounts` / `MigrationBackup` / `DataManagement` → 还需通过 DM Token 验证（localStorage `dm_token_verified === 'true'`）

### 2.2 目录速查（`src/`）

```
src/
├── App.tsx              路由总入口（唯一）
├── main.tsx             ReactDOM.createRoot
├── index.css            Tailwind 入口 + 全局覆盖
├──
├── types/               6 个独立类型文件（一个领域一个）
│   ├── character.ts     Character · Attack · Equipment · HandSlot · Currency · Ability 等
│   ├── combat.ts        CombatRecord · Combatant · RoundAction · EquipmentChanges
│   │                    CombatActionType · NpcAttack · isOneActionCast()
│   ├── battleground.ts  ItemToken · Battleground · CombatantTokenPos
│   ├── equipment.ts     EquipmentItem（装备库模板，不同于角色装备）
│   ├── spell.ts         Spell（法术库）
│   └── treasure.ts      Treasure · TreasureItem · TreasureCurrency · DistributionRecord
│
├── data/                9 个 store + 4 个独立工具（纯 TS，无 React）
│   ├── equipmentStore.ts     装备库模板（localStorage + API 同步）
│   ├── spellStore.ts         法术库模板
│   ├── characterStore.ts     角色卡 CRUD + 手持/穿戴 + 攻击加值 + isWeaponUsable
│   ├── combatStore.ts        战斗记录 + 背包派生 + 动作消耗 + AC 计算
│   ├── npcTemplateStore.ts   NPC 模板
│   ├── battlegroundStore.ts  沙盘状态 + tokens
│   ├── treasureStore.ts      宝藏 + 分配记录
│   ├── calendarStore.ts      日历
│   ├── gameTimeStore.ts      游戏时间
│   │
│   ├── equipmentFactory.ts   🌟 extractBaseFields()：字段标准化工厂
│   ├── equipmentWear.ts      🌟 recalculateArmorClass()：穿戴后 AC 重算
│   ├── editorState.ts        编辑草稿（页间恢复）
│   ├── diceService.ts        骰子投掷
│   ├── attackBonus.ts        攻击加值/熟练/属性加成计算
│   ├── equipments.json / spells.json   预置种子数据
│   └── calendarData.ts       月份/星期常量
│
├── components/          24 个可复用组件（无路由、无 store CRUD API 直写）
│   ├── Layout.tsx / PlayerLayout.tsx   两套导航壳（DM/玩家）
│   ├── Navbar.tsx       顶栏（variant = 'dm' | 'player')
│   ├── ProtectedRoute.tsx   路由守卫（登录 / DM 检查）
│   │
│   ├── Battle**核心三件套**：
│   │   ├── CombatAttackModal.tsx    攻击检定（射程/弹药/装填检查 → 命中/未命中 → 弹药扣减）
│   │   ├── CombatDamageModal.tsx    伤害结算（暴击/抗性 → HP 扣减）
│   │   ├── CombatSpellModal.tsx     法术施放（施法时间判定 → 动作消耗）
│   │   ├── CombatantInfoPanel.tsx   参战者详情（动作面板 / 手部状态 / 变更信息编辑）
│   │   ├── Battleground.tsx         🌟 沙盘（双指缩放锚点 / 白圈拖拽锁定 / 距离拾取）
│   │   └── TurnTodoBoard.tsx        回合待办看板（持续效果跨回合提醒，仅放映模式显示）
│   │
│   ├── 编辑器三件套：
│   │   ├── EquipmentEditor.tsx    装备模板编辑（连 equipmentFactory）
│   │   ├── SpellEditor.tsx        法术模板编辑
│   │   └── AttackEditor.tsx       ⭐ parseWeaponData()：装备→攻击属性解析
│   │
│   ├── CharacterEquipmentCard.tsx   角色背包单卡
│   ├── EquipmentPicker.tsx          从装备库选一件
│   ├── SpellPicker.tsx              从法术库选一件
│   ├── NpcCreator.tsx               NPC 参战创建器
│   ├── TradeModal.tsx               交易弹窗
│   ├── SyncButton.tsx               一键同步云 API
│   ├── GameClock.tsx                游戏时钟显示组件
│   └── ErrorBoundary.tsx            React 错误边界
│
├── hooks/
│   └── useEquipmentActions.ts   🌟 角色装备操作聚合 hook（增/改/删/手持/穿戴，连 characterStore + api）
│
├── lib/
│   ├── api.ts              🌟 所有云 API 的前端客户端（双轨认证头）
│   └── attackBonus.ts      攻击加值计算（character.ts 能力的独立函数化）
│
├── contexts/
│   ├── AuthContext.tsx     User / token / isAuthenticated / isDM / login / logout / updateUser
│   └── ThemeContext.tsx    暗黑模式（目前只做了结构，未完全打通 class）
│
└── pages/             39 个页面（见上方路由图）—— 页面 = 组合 components + 调用 data/* store CRUD
```

---

## 3. 后端架构图（Cloudflare Pages Functions + D1）

```
functions/
├── _utils.ts           🌟 认证 & SQL 工具（所有 API 共用）
│   ├── getDb()                     D1 连接（DB binding）
│   ├── verifyDmToken(header)       仅 DM Token 校验
│   ├── authenticateRequest(req)    JWT 优先，DM Token 兜底
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
    ├── admin/users/                管理员端点（仅 DM Token）
    │   ├── GET    index.ts            LEFT JOIN sessions 查在线
    │   ├── PATCH  [id].ts             改 role（player/dm）
    │   ├── DELETE [id].ts
    │   └── POST   [id]/password.ts    重置密码
    │
    ├── characters/                 角色卡 CRUD（JWT 或 DM Token）
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

**认证双轨**（`functions/_utils.ts` `authenticateRequest`）：前端 `src/lib/api.ts` 对应两套 header：
- `authHeaders()`：JWT 在 `Authorization: Bearer <>`，没有时回退 DM Token 在 `X-DM-Token`
- `adminAuthHeaders()`：只带 `X-DM-Token`，仅用于账号管理等超级管理员端点

**数据库迁移**：`migrations/0001_init.sql`（characters/equipments/spells 三张表）→ `0002_sessions.sql`（sessions 表，判定在线）→ `0003_avatar.sql`（users.avatar 列）。迁移是追加式，不要修改已有的迁移文件。

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
│        + quantity · packSize · unit · heldLeft/Right 引用  │
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
角色手持武器 [character.heldLeft/Right]
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

## 5. 设计模式与可复用技巧（**做新功能前先看这个**）

### 5.1 工厂函数：`equipmentFactory.extractBaseFields`（`data/equipmentFactory.ts`）

**为什么用**：装备字段从不同来源进来（编辑器 formData、装备库模板、战斗快照、import 表格）字段名/默认值乱，统一走 `extractBaseFields` 得到 `Omit<EquipmentItem, 'id' | 'isCustom'>` 标准对象，新增字段只改这一个地方所有使用方同步。

**应用场景**：`useEquipmentActions.handleAddEquipmentFromLibrary`、`useEquipmentActions.handleSaveEquipment`、`TreasureDistribute` 分配装备、战斗拾取快照标准化。

### 5.2 自定义 Hook：`useEquipmentActions(charId, refresh)`（`hooks/useEquipmentActions.ts`）

**为什么用**：装备操作（加/改/删/从装备库加/同步装备库/手持/穿戴/卸下）涉及 characterStore CRUD + 云端 api 双向同步 + AC 重算 + UI 刷新，重复代码 100+ 行，打包成 hook 在 `CharacterDetail` / `CharacterInventory` / `PlayerInventory` 三处复用。

**做新的聚合操作时**（比如角色批量转移装备）：优先加进 `useEquipmentActions` 暴露新 callback，不要在页面里直接写 characterStore + api。

### 5.3 变更漏斗（Change Funnel）：`EquipmentChanges` + `computeChildQtyMap`

**为什么用**：战斗是一个"临时副本"——战斗中的装备变更不能污染角色源背包，也不能每次变更都 clone 一整个装备数组。三件套 `added / removedChildIds / quantityDeltas` 是纯增量记录，统一进入 `computeChildQtyMap` 按 `childId` 抵消，得到 `{ srcQty, combatQty }`，O(N) 时间，无副作用。

**规则**：
- **新增物品**（拾取、宝藏战斗内分配）：push 到 `added`，`childId` 尽量复用源；源没有时生成 `combat-${Date.now()}-${rand}`
- **整件移除**（最后一发射完、投掷武器）：push childId 到 `removedChildIds`（优先级最高，`computeChildQtyMap` 第 4 步覆盖一切 delta）
- **数量加减**（每发弹药 -1、部分拾取 +N）：写 `quantityDeltas[childId] = delta`（同 id 会在后续被合并，取累计）

### 5.4 双轨认证：`src/lib/api.ts` + `functions/_utils.ts`

**为什么用**：普通用户走 JWT（7 天），DM 走站点 Token（独立于账户体系）。玩家端访问 /player/* 只用 JWT，DM 端管理（账户一览/迁移/数据管理）只用 DM Token，其余端点（角色/装备 CRUD）两者都接受（"有 JWT 用 JWT，没 JWT 但有 DM Token 也放行"）。

**做新端点时**：
- 敏感管理员端点（改角色/删账号）：仅 `verifyDmToken`
- 普通业务：`authenticateRequest`（双轨兜底）
- 一定别把 DM Token 放在 URL 参数里，必须走 header `X-DM-Token`

### 5.5 拖拽锚点保持：Battleground 双指缩放

**公式**（`components/Battleground.tsx` `handlePointerMove` 双指分支）：
```
newTranslate = startTranslate + (startScale - newScale) × startMid + (curMid - startMid)
```
- `(startScale - newScale) × startMid`：把按下时的双指中点维持在屏幕原位（标准锚点保持——对 `translate → scale` 变换顺序的反向补偿）
- `(curMid - startMid)`：双指整体平移跟随

**做新的 pinch-zoom 类交互时**：直接复用这套公式，不要重推。

### 5.6 长按落空 → 回退 click：Battleground `dragLockMissed`

**为什么用**：移动端点击棋子极易超过 350ms 长按阈值 → 触发 dragLock → `ts.moved=true` → click 被吞。解法：`handlePointerUp` 的 dragLock 分支里，如果松手时**没 hover 到任何目标**（既没角色也没物品），记为 dragLockMissed 并 `ts.moved=false`，让后续原生 click 正常进入 `handleCellClick` 选中棋子。

**做新的长按→白圈类交互时**：一定要加这个回退机制，否则 click 会被长按误触发系统性吞掉。

### 5.7 武器属性解析：`AttackEditor.parseWeaponData(equipment: Equipment)`

**为什么用**：D&D 武器属性是复合文本（如「投掷(20/60)」「弹药(100/400)」「多用(M)1d10」），解析成结构化 `Attack.properties / normalRange / maxRange / twoHandedDamage`。同一份解析在「新增武器自动生成 Attack 条目」和「NPC 武器录入」两处复用。

**新增武器属性时**（比如「双持」「反冲」）：先加进 `WEAPON_PROPERTIES` 数组（`AttackEditor.tsx` L14-17），再扩展 `parseWeaponData`。

### 5.8 回合待办（TurnTodo）：`combatStore` + `TurnTodoBoard.tsx`

**为什么用**：D&D 战斗里大量持续效果（中毒、祝福、专注法术、再生、昏迷豁免……）需要跨多个回合提醒 DM「轮到这个参战者时要处理什么」。靠 DM 脑记极易漏，记在便签上又脱离战斗上下文。把待办项挂在 `CombatRecord` 上、按回合重置已执行状态，能保证每回合开始时自动恢复「未完成」清单，DM 勾掉一项才算处理过。

**存储模式**：待办数据内嵌在 `CombatRecord` 里（与 `equipmentChanges` 同层级），是「战斗临时数据」而非角色源数据——战斗结束随 CombatRecord 一起保留/丢弃，不污染角色卡。这跟 §5.3 变更漏斗是同一种「战斗副本」思想：临时状态挂在 CombatRecord 上，不写回源。

**核心接口**（`data/combatStore.ts`）：
- `addTurnTodo(recordId, todo)`：新增一条待办（自动生成 id，`executed=false`）
- `removeTurnTodo(recordId, todoId)`：删除一条
- `toggleTurnTodo(recordId, todoId)`：切换 `executed` 状态
- `resetTurnTodosForRound(recordId, round)`：进入新回合时把所有待办 `executed` 重置为 false（DM 每回合重新处理一遍持续效果）
- `cleanupDeathSaveTodos(recordId)`：扫描所有 `type==='death_save'` 待办，按终止条件（HP>0 / isDead / 成功≥3）移除已结束的死亡豁免。在 HP 变更 / 死亡豁免结算后调用
- `applyDeathSaveResult(recordId, todoId, roll)`：把 d20 结果落到 combatant（更新 `deathSaveFailures / deathSaveSuccesses / HP / isUnconscious / isDead`），标记 todo `executed=true`，并在复活/死亡/稳定时自动移除 todo。返回更新后的 combatant 与 outcome（`crit_fail | fail | success | revive`）

**组件**：`components/TurnTodoBoard.tsx` 渲染看板 UI，调用上述接口读写 combatStore，本身不持有路由也不直连 API，符合「组件只通过 props / store 订阅」的约定。死亡豁免类型有独立弹窗（`DeathSaveDialog` 子组件，含 d20 手动输入 + 一键掷骰按钮 + 失败/成功进度回显）。

**触发条件**：仅在「放映模式（projection）」+「已开始放映」时显示。备战/编辑态下不展示，避免 DM 在编排参战者时被待办干扰。

**做新的「跨回合持续效果」类功能时**（比如新增专注法术、再生体质）：优先走这套 TurnTodo 机制，把效果注册成一条待办并设定每回合重置，不要在 CombatSession 里另起一套独立的 effect 追踪数组。

### 5.9 状态驱动待办自动生命周期：`death_save` 模式

**为什么用**：死亡豁免（D&D 5e 标准规则）是「状态触发型」待办——PC HP 归零进入昏迷的瞬间就应该开始提醒，HP 恢复或死亡时自动结束。靠 DM 手动 add/remove 待办极易漏。把触发条件编码到 `handleApplyDamage` 里：检测到 `target.isPc && newHp<=0 && status==='unconscious'` 时自动 `addTurnTodo`，HP 变化后调 `cleanupDeathSaveTodos` 让待办随状态结束。

**终止条件编码在 store 而非 todo 字段**：用户需求里写「终止条件：HP>0」是**业务规则**，不是 todo 数据结构里的 `endRound`。`TurnTodo.endRound=-1`（无限期）+ `cleanupDeathSaveTodos` 的状态扫描一起实现「状态终止」。这样 `resetTurnTodosForRound` 的回合重置逻辑不会误清状态型待办，待办只在 `cleanup` 显式判定终止时移除。

**昏迷 PC 仍要推进回合**：`findNextValidTurn` 默认跳过 `昏迷` 单元格（昏迷角色不能行动），但带未执行 `death_save` 待办的昏迷 PC 例外——D&D 5e 规定昏迷角色在自己回合开始时做死亡豁免。所以 `findNextValidTurn` 增加例外分支：`昏迷` 单元格若对应 combatant 有 active death_save todo（`!executed && startRound<=round && endRound=-1||>=round`），仍返回该回合。掷骰后 `executed=true`，本回合后续扫描自然跳过；下一回合 `resetTurnTodosForRound` 重置为 false，PC 回合再次推进。

**做新的状态触发型待办时**（比如「中毒每回合扣血」「断魂术每回合检定」）：复用这套模式——在 HP / 状态变更点（`handleApplyDamage` 或类似入口）调 `addTurnTodo` + `cleanupXxxTodos`，让待办与角色状态绑定，而不是让 DM 手动管理生命周期。

### 5.10 受控输入 hook：`useNumberInput` / `useTextInput`（`hooks/useInput.ts`）

**为什么用**：原生 number input 最常见的写法是 `onChange={e => setX(parseInt(e.target.value) || 0)}`，这会导致用户清空输入框时立刻被填回 0，无法删除全部数字重新输入（典型痛点：把 100 改成 50 必须先删成 "10" 再改 "5"，不能清空再输 "50"）。把"输入态字符串"和"业务态数值"分离后，onChange 只更新字符串、不立即兜底，onBlur 时才按 fallback 补全占位——这就是用户期望的「光标闪烁时可清空，光标消失时按需补全」。

**核心 API**：
```ts
const r = useNumberInput(initialValue, { fallback?: number; allowEmpty?: boolean; parse?: (s) => number });
// r.text   —— input 的 value（输入态字符串，可能为空或 "-"）
// r.value  —— 业务数值（输入无效时为上一个有效值；allowEmpty=true 时可能 undefined）
// r.onChange(s) —— 接 e.target.value，不兜底
// r.onBlur()    —— 失焦时按 fallback 补全 + 规范化显示
// r.setExternal(n) —— 父组件外部重置（如选中不同 record 时）
// r.reset() —— 重置到 initialValue

const t = useTextInput(initialValue, { fallback?: string; trimOnBlur?: boolean });
// 同构 API：onChange 不 trim 不补全，onBlur 时按需 trim 和补 fallback
```

**与 §5.1 equipmentFactory 同属"统一入口消除重复"思路**：所有数字/文本输入都走这两个 hook，兜底值由 options 显式声明，不在每个 onChange 里散写 `|| N`。改造前项目里有 21+ 处 `parseInt(e.target.value) || N` 散落在 8+ 个文件，兜底值 0 / 1 / 2 / -1 / 10 随场景各异；改造后调用方写 `useNumberInput(0, { fallback: -1 })`，意图一目了然。

**典型用法**（参考 `TurnTodoBoard.tsx`）：
```tsx
const formStartRoundInput = useNumberInput(0);
const formEndRoundInput = useNumberInput(-1);
// ...
<input
  type="number"
  value={formStartRoundInput.text}
  onChange={e => formStartRoundInput.onChange(e.target.value)}
  onBlur={formStartRoundInput.onBlur}
/>
// 提交时取 formStartRoundInput.value（已是 onBlur 规范化后的业务值）
```

**做新表单 / 新弹窗输入框时**：优先用这两个 hook，不要在 onChange 里直接 `parseInt(...) || N`。如果字段是可选的（如 TreasureEdit 的 normalRange/maxRange），用 `allowEmpty: true` 让 value 类型变为 `number | undefined`。

### 5.11 放映模式回溯：`startPlayback` 从非最新回合开始 ≡ 回溯

**为什么用**：DM 在放映过程中可能想"如果这一回合换一种打法会怎样"——从先攻表格中间某格重新开始放映。如果只重置沙盘而不还原战斗数据（HP/状态/装备变更/回合记录），之前放映的结果会残留，导致状态不一致。所以从非最新回合开始放映必须等同于回溯：完整还原到初始快照 + 清空选中格之后的所有记录。

**`startPlayback` 流程**（`pages/CombatSession.tsx`）：
1. 从 `rollbackSnapshotRef.current.initial`（进入放映模式时拍的快照）还原 combatants / rounds / 装备变更
2. 若有 `selectedCell`：清空选中格之后的所有回合记录（保留「被突袭/昏迷/死亡」占位）
3. 还原沙盘到初始快照
4. `cleanupDeathSaveTodos`（HP 恢复后可能不再昏迷，待办自动移除）
5. `resetTurnTodosForRound`（重置起始回合的待办执行状态 + 装填武器攻击标记）
6. 用 `roundsOverride` 将还原后的 rounds 传入 `findNextValidTurn`，避免读到旧快照

**从最新回合开始放映时**：选中格之后无数据可清空，行为等同 no-op，与原来一致。

### 5.12 `currentTurn` 纯 `combatantId` 设计（消除 `combatantIdx` 缓存偏移）

**为什么用**：`currentTurn` 原来缓存了 `combatantIdx`（参战者在数组中的下标），但先攻值编辑或平局重排后数组顺序变化，缓存的 `combatantIdx` 就会偏移，导致回合标记跳到错误的列。改为只保留 `{ round, combatantId }`，在需要下标时通过 `findIndex` 实时计算，排序/删除后自动适应。

**影响范围**（`pages/CombatSession.tsx`）：
- `currentTurn` 类型：`{ round: number; combatantId: string }`（无 `combatantIdx`）
- `findNextValidTurn` 返回类型：`{ round: number; combatantId: string }`（无 `combatantIdx`）
- `advanceTurn`：`const currentIdx = record.combatants.findIndex(c => c.id === currentTurn.combatantId)`
- `resolveWriteCell` 返回类型：`{ round: number; combatantId: string }`（无 `combatantIdx`）
- UI 中比较"当前回合之前的格子"：用 `findIndex` 实时计算，不读 `currentTurn.combatantIdx`
- `rewindModal` 和 `applyRollback` 仍保留 `combatantIdx`（在点击时通过 `findIndex` 实时计算传入，不缓存）

---

## 6. 命名与编码约定

| 项目 | 约定 |
|------|------|
| 文件命名 | 大驼峰：页面 `PageName.tsx`、组件 `ComponentName.tsx`；小驼峰：store `xxxStore.ts`、类型 `xxx.ts` |
| 组件 | 函数式 + `export default`；props 用 `interface Props { ... }`，不要解构在函数参数 |
| store | `const xxxStore = { ... }` + `export default xxxStore`；不要 class |
| 类型 / 接口 | 领域聚合在 `types/` 的 6 个文件里，**不要**在组件里写接口再导出到全局 |
| ID | 用 `crypto.randomUUID()`；临时 ID（编辑中未保存）用 `\`temp-\${Date.now()}\``；战斗拾取 childId 用 `\`combat-\${picker.id}-\${Date.now()}-\${rand6}\`` |
| 装备引用一致律 | 判定 / 查找永远用 `eq.childId \|\| eq.id`，不要只判断其中一个；手持/穿戴槽 `slot.equipmentId` 总是匹配 childId |
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
- 需要管理员权限的用 `adminAuthHeaders()`（仅 DM Token）

---

## 8. 验证步骤（做完改后必须做）

```bash
# 1. 类型检查（最快，零副作用）
npx tsc --noEmit

# 2. 构建（类型 + 打包，验证路由/组件导入是否全通）
npm run build

# 3. 预览（可选，需要 build 已完成）
npm run preview
```

> `npm run dev` 时页面刷新不出来？90% 是路由守卫（ProtectedRoute / requireDM）判断错了，先看 `AuthContext` 的 isDM 是不是 false、localStorage `auth_token` 在不在。

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

#### 9.3.1 push 行为规则（用户没明确说就按默认）

| 场景 | 行为 |
|------|------|
| main 上 `tsc + build` 都通过 | ✅ **默认自动执行** `git push origin main`，不询问、不等用户确认 |
| 功能分支 build 失败 | ❌ 不合并到 main，报错误摘要等用户处理 |
| main 合并后 build 失败 | ❌ 不 push，报错误摘要等用户处理 |
| 用户之前/当前对话说过「不要立即编辑 main」或「这次不要 push」 | ⚠️ 停在「本地 main 合并完成 + build 通过」的状态，不 push |
| 用户明确说「推送到 main」 | 同上（本来就默认做），直接执行 |

### 9.4 例外情形（仅在以下情况可以直接在 main 上操作）

- 用户明确说「不要建分支，直接改 main」或「立即编辑 main」
- 纯文档类修改（如只改 AGENTS.md / README.md，不涉及代码）
- 紧急修复线上问题且用户已确认

即使在 main 上直接操作，也必须遵守 §9.1「改动前先同步远程」和 §9.3「提交前编译通过」。

---

> 最后：**不要随意探索根目录**。任务涉及哪个功能模块就按上方速查表直接跳对应文件，其他文件（特别是 `.github/`、`data/players/*.json`、`migrations/`、`views/`）不要碰，除非任务明确要求。

---

## 10. 文档维护责任（**重要**）

> 本文件（`AGENTS.md`）是项目架构的**单一事实来源**。当你的修改触及下列任一情况时，**必须同步更新本文件**，否则下一个 agent 会被错误信息误导，造成连锁踩坑。

### 10.1 必须同步更新的触发条件

| 触发条件 | 需要更新的章节 |
|---------|--------------|
| 新增 / 删除 / 重命名页面 | §0 速查表 + §2.1 路由分层图 |
| 新增 / 删除 / 重命名 store | §0 速查表 + §1 技术栈总览 + §2.2 目录速查 |
| 新增 / 删除 / 重命名类型文件 | §0 速查表 + §2.2 目录速查 |
| 新增 / 删除 / 重命名组件 | §0 速查表 + §2.2 目录速查 |
| 新增云 API 端点（functions/api/**） | §0 速查表 + §3 后端架构图 |
| 新增数据库迁移文件（migrations/NNNN_*.sql） | §3 后端架构图末尾的迁移说明 |
| 引入新的设计模式 / 可复用技巧 | §5 设计模式与可复用技巧（新增小节） |
| 修改命名 / 编码约定 | §6 命名与编码约定 |
| 修改 store 骨架模式 | §4.2 Store 统一模式 |
| 修改认证机制（JWT / DM Token / 新增认证方式） | §5.4 双轨认证 + §3 后端架构图 |
| 修改战斗背包派生逻辑（EquipmentChanges 三件套） | §4.1 装备三层身份 + §5.3 变更漏斗 |
| 修改沙盘交互核心逻辑（缩放 / 白圈 / 拾取） | §5.5 双指缩放 + §5.6 长按落空 + §7 踩坑清单 |
| 修改 Git 工作流规范（分支策略 / 提交规则 / 合并流程） | §9 Git 工作流规范 |
| 修改长任务流程规范（Spec 阶段 / 静默模式 / 并行策略 / 错误处理） | §11 长任务降额工作流 |

### 10.2 不需要更新的情况

- 修 bug（行为对齐已有设计，不改架构）
- 调整 UI 样式（Tailwind class 微调）
- 单个页面内部逻辑调整（不涉及其他模块协作）
- 数据内容修改（如新增预置角色卡 JSON、新增装备条目）

### 10.3 更新原则

1. **就近更新**：只改对应章节，不要重写整篇
2. **保持架构图同步**：§2.2 目录速查里的文件计数（如 "9 个 store"、"24 个组件"、"39 个页面"）必须与实际一致——新增/删除后立即改数字
3. **新增模式必须写 why**：§5 每个小节的"为什么用"是核心价值，不要只写"怎么用"
4. **踩坑清单追加式**：§7 发现新的高危坑点就追加，不删旧的（除非旧坑已通过重构彻底消除）
5. **不要把临时性 hack 写进文档**：只记录**有意为之的设计决策**；临时绕过方案应写在代码注释里并标注 TODO

### 10.4 验证更新正确性

更新 `AGENTS.md` 后，至少做一次自查：
- 新增的文件路径在 `src/` 或 `functions/` 下真实存在（用 Glob 验证）
- 文件计数与实际目录一致
- 路由图里的路径与 `src/App.tsx` 实际注册的路由一致
- 没有出现"已被删除的文件"还留在架构图里

---

## 11. 长任务降额工作流（**完整功能搭建 / 跨 5+ 文件任务默认启用，用户未明确禁止则自动生效**）

> **为什么用**：长任务（完整功能）的运算额度大头不是写代码，而是反复读上下文、多轮澄清、分步汇报、错误回溯。本流程通过「先 Spec 再实现、独立模块并行、静默模式只在关键节点汇报、Fail Fast 不硬撑」四板斧，通常可将总消耗降至原额度的 40%~60%。

### 11.1 触发条件（满足任一即启用）

自动识别，**无需用户每次手动说明**：
- 用户指令开头含 **`[长任务]`** 前缀
- 任务描述明显为「完整功能搭建」（含「搭建/实现功能/新增模块/完整功能」等关键词）
- 预估涉及文件数 ≥ 5 个或跨 3 个以上模块（类型 + store + 页面 + API 等）
- 用户明确说「走长任务流程」

满足以上任一条，Agent **必须**按本节流程执行，不得跳过；用户明确说「别用长任务流程，直接写」时才禁用。

### 11.2 阶段一：Spec 阶段（**只写文档不写代码，用户确认后才进入实现**）

> **为什么分开**：避免「写了一半发现方案错了，推翻重来」的大段返工——这是长任务头号浪费。Spec 阶段只读架构和类型文件，上下文量约为实现阶段的 1/3；且把澄清沟通从 10 轮压成 1 轮。

**输出 3 个文件**到 `.monkeycode/specs/<feature-slug>/`（`<feature-slug>` 用短横线小写，如 `npc-template-mgmt`）：

```
.monkeycode/specs/<feature-slug>/
├── requirements.md   功能需求拆解
├── design.md         技术方案
└── tasks.md          分步任务清单
```

#### 11.2.1 requirements.md 标准模板

```markdown
# <功能名称> 需求拆解

## 用户故事（Who + What + Why）
- 作为 <角色>，我想要 <操作>，以便 <价值>

## 输入输出
| 场景 | 输入 | 输出 |
|------|------|------|
| 场景1 | ... | ... |

## 边界条件 & 验收标准
- ✅ 正常流程：<完成时行为>
- ⚠️ 异常流程：<错误时提示/回退>
- ❌ 不在本期范围：<明确排除的功能>
```

#### 11.2.2 design.md 标准模板

```markdown
# <功能名称> 技术方案

## 涉及文件清单（按 AGENTS.md §0 速查表定位）
| 变更类型 | 文件路径 | 说明 |
|---------|---------|------|
| 新增类型 | src/types/xxx.ts | <字段说明> |
| 新增 store | src/data/xxxStore.ts | <统一 8 件套骨架> |
| 新增组件 | src/components/Xxx.tsx | <职责+props> |
| 新增页面 | src/pages/Xxx.tsx | <路由路径> |
| 新增 API | functions/api/xxx/yyy.ts | <方法+权限> |
| 修改路由 | src/App.tsx | <新增路由项> |
| 修改菜单 | src/components/Layout.tsx | <菜单位置> |

## 新增数据结构
```ts
// 关键类型定义预览（不写全实现，只画骨架）
interface Xxx { id: string; ... }
```

## 调用链路图
入口按钮 → 页面 Xxx.tsx → store CRUD / lib/api.ts → functions/api/xxx/yyy.ts → D1

## 权限 & 认证
- 路由守卫：ProtectedRoute / requireDM？
- API 认证：authHeaders() 还是 adminAuthHeaders()？

## 预读文件清单（实现阶段一次性读入，避免重复读）
- 范本：src/data/characterStore.ts（作为 store 统一骨架参考）
- 类型：src/types/character.ts / src/types/combat.ts
- API 范本：functions/api/characters/index.ts
- 页面范本：src/pages/EquipmentList.tsx
```

#### 11.2.3 tasks.md 标准模板

```markdown
# <功能名称> 分步任务清单

## 任务分组 & 依赖关系（标注可并行组）
- **组 A（无依赖，可并行）**：类型定义 + store 骨架
  - [ ] A1：新建 src/types/xxx.ts，定义 Xxx 接口
  - [ ] A2：新建 src/data/xxxStore.ts，按 §4.2 统一 8 件套

- **组 B（无依赖，可与 A 并行）**：云 API 端点
  - [ ] B1：新建 functions/api/xxx/index.ts（GET list + POST create）
  - [ ] B2：新建 functions/api/xxx/[id].ts（GET detail + PUT update + DELETE）
  - [ ] B3：在 src/lib/api.ts 同步加 xxxList / xxxCreate / xxxUpdate / xxxDelete 泛型函数

- **组 C（依赖 A 完成）**：UI 组件
  - [ ] C1：新建 src/components/XxxEditor.tsx
  - [ ] C2：新建 src/pages/XxxList.tsx + src/pages/XxxDetail.tsx

- **组 D（依赖 A+B+C 全部完成）**：集成 & 收尾
  - [ ] D1：在 src/App.tsx 注册路由（按 §2.1 路由分层，选择正确的守卫组）
  - [ ] D2：在 src/components/Layout.tsx 或 PlayerLayout.tsx 对应菜单加入口
  - [ ] D3：完整验证 npx tsc --noEmit && npm run build
```

**Spec 三文件输出完毕后必须停下，等待用户明确确认后才能进入实现阶段**，禁止直接开始写代码。

### 11.3 阶段二：实现阶段（用户确认 Spec 后执行）

#### 11.3.1 预读优化（避免重复读文件）

- 实现开头**一次性**把 `design.md §预读文件清单` 里所有文件批量读入上下文
- store 文件只读**范本**（characterStore.ts）作为骨架参考，其余 8 个 store 不要全文重读
- 类型文件只在开头读一次，后续步骤直接复用已有上下文，不重复调用 Read

#### 11.3.2 分组并行执行（用 general_purpose_task 跑独立模块）

- tasks.md 中标注「无依赖、可并行」的组（如组 A 和组 B），调用 `general_purpose_task` **并行执行**
- 子 Agent 执行过程不进主对话历史，最后只返回结果摘要，主对话上下文显著缩短
- **判断并行安全标准**：两组文件之间没有 import 互相引用；有依赖的组必须严格按顺序串行

#### 11.3.3 静默模式（只在关键节点汇报，中间步骤不解释）

- 每完成 tasks.md 中**一大组**（3-5 个关联文件），只输出一行：
  ```
  ✅ 完成：组<A/B/C/D> <简短说明>（文件：src/types/xxx.ts, src/data/xxxStore.ts ...）
  ```
- **禁止**：单文件级别的详细变更说明、每行代码的 educational insight、下一步计划的铺垫文字
- **只在以下 3 种情况停下主动询问用户**（其余一律静默继续）：
  1. Spec 设计在实现时发现逻辑冲突，需要调整 requirements/design
  2. 需要新增依赖（修改 package.json，加新的 npm 包）
  3. 涉及破坏性改动（修改已有类型导致旧数据不兼容、删除已对外 API、改变路由守卫行为）

#### 11.3.4 Fail Fast（同一错误只改一次，不硬撑）

- 同一类错误（type error / build error / 逻辑错误）自己**最多改 1 次**
- 改 1 次仍未通过，直接停下，按格式输出：
  ```
  ❌ 卡壳：<错误摘要，一句话>
  已尝试：<做了什么修正>
  需要你确认：
    ① <选项A：推荐方案，一句话说明后果>
    ② <选项B：替代方案>
    ③ <选项C：回退 Spec 某条设计>
  ```
- 禁止自行尝试第 3 次、第 4 次...（每次尝试都是纯烧额度）

#### 11.3.5 分组验证节奏（避免每文件 build 一次）

- 每大组完成后：只跑 `npx tsc --noEmit`（类型检查零副作用、快、输出短），**不 build**
- 所有组全部完成后：统一只跑 **1 次** `npm run build`（完整构建）
- 不要每个文件 / 每个小组都 build 一次（vite 打包日志很长，重复 build 会堆大量无意义上下文）

### 11.4 阶段三：收尾（全部任务完成后）

只输出 1 份简短摘要：
```
✅ <功能名称> 实现完成

变更文件（共 N 个）：
- 新增：src/types/xxx.ts、src/data/xxxStore.ts、...
- 修改：src/App.tsx、src/components/Layout.tsx、...

验证结果：
- npx tsc --noEmit：✅ 通过
- npm run build：✅ 通过（耗时 Xs）

建议下一步：<1-2 句，如「可 npm run dev 本地验证 CRUD 流程」>
```

禁止附冗长的每行代码解读。代码已在文件里，需要时直接点文件链接查看。
