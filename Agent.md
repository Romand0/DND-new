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
├── components/          23 个可复用组件（无路由、无 store CRUD API 直写）
│   ├── Layout.tsx / PlayerLayout.tsx   两套导航壳（DM/玩家）
│   ├── Navbar.tsx       顶栏（variant = 'dm' | 'player'）
│   ├── ProtectedRoute.tsx   路由守卫（登录 / DM 检查）
│   │
│   ├── Battle**核心三件套**：
│   │   ├── CombatAttackModal.tsx    攻击检定（射程/弹药/装填检查 → 命中/未命中 → 弹药扣减）
│   │   ├── CombatDamageModal.tsx    伤害结算（暴击/抗性 → HP 扣减）
│   │   ├── CombatSpellModal.tsx     法术施放（施法时间判定 → 动作消耗）
│   │   ├── CombatantInfoPanel.tsx   参战者详情（动作面板 / 手部状态 / 变更信息编辑）
│   │   └── Battleground.tsx         🌟 沙盘（双指缩放锚点 / 白圈拖拽锁定 / 距离拾取）
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
  │    · 装填武器：未装填需另一只手空/持弹药 + 弹药>0
  │    · 射程（切比雪夫距离 vs normalRange/maxRange）
  ├─ 玩家填 d20 结果 → 命中判定
  └─ handleConfirmResult()
       ├─ 弹药消耗信息：ammoChildId + ammoName
       └─ 装填武器射击后置 loaded=false
  ↓（onConfirmHit / onAttackMiss 回调到 CombatSession）
CombatSession
  ├─ consumeCombatantAction()：扣 1 动作（simulation 模式扣到 0 立即回 1）
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

> 最后：**不要随意探索根目录**。任务涉及哪个功能模块就按上方速查表直接跳对应文件，其他文件（特别是 `.github/`、`data/players/*.json`、`migrations/`、`views/`）不要碰，除非任务明确要求。
