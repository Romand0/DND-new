---
alwaysApply: true
description: dnd-tool（DND 5e DM Toolkit）核心架构约束与踩坑清单。所有涉及路由/页面/类型/store/战斗背包派生/沙盘触摸/装备操作/云API/数据库迁移的任务必须完整遵守。任何修改触及 AGENTS.md §9.1 触发条件的（新增删页面/store/类型/组件/云API/迁移/设计模式/命名约定），必须同步更新 AGENTS.md。
---

# dnd-tool 项目核心规则（Agent 强制约束）

> **生效范围**：本规则始终对当前项目的 AI 对话生效。`/workspace/AGENTS.md` 是更完整的架构文档，本文件是其**可执行硬约束的精简提取版**——两者冲突时以 AGENTS.md 为准。执行任何修改前先通读本文件 + AGENTS.md §0 速查表。

---

## 一、任务定位速查表（**改哪件事就只看哪份文件，不要乱碰其他**）

| 你要做什么 | 正确的改法 | 严禁 |
|-----------|------------|------|
| 改页面路由 | `src/App.tsx`（四层嵌套） | 随意改动三路由组（玩家端/公共资料库/DM端）的守卫层级 |
| 改页面 UI | `src/pages/<PageName>.tsx` | 在页面里直接写路由或 store CRUD 之外的重复逻辑，优先抽 hook/component |
| 改可复用组件 | `src/components/<Name>.tsx` | 组件里写路由/直连 store CRUD API，一律通过 props 传入 |
| 改数据结构 / 类型 | `src/types/*.ts`（6 个独立领域文件） | 改完类型不同步对应 store |
| 改前端状态（增删查改订阅） | `src/data/*Store.ts`（9 个 store，统一骨架见第二节） | 新建 store 不按统一 8 件套骨架，缺 notify 或 load 兜底 |
| 改装备生成/字段标准化 | `src/data/equipmentFactory.ts` 的 `extractBaseFields` | 在多处各自定义字段默认值，新增字段只改一处 |
| 改角色装备操作（增删/手持/穿戴） | 三者一起改：`hooks/useEquipmentActions.ts` + `data/characterStore.ts` + `data/equipmentWear.ts` | 只改其中一个导致 AC 不重算或云不同步 |
| 改战斗逻辑（背包派生/AC/动作/弹药/装填） | 纯计算 `data/combatStore.ts` + 交互 `pages/CombatSession.tsx`，严格分层 | 混写导致战斗状态污染 |
| 改攻击检定弹窗（射程/弹药/装填） | `components/CombatAttackModal.tsx` 的 `getAttackStatus` | 按钮里硬加可用性判断，绕过统一检查 |
| 改沙盘触摸交互（双指缩放/白圈/拾取） | `components/Battleground.tsx` 通读 handlePointerDown/Move/Up 全链条 | 单独改动 translate 或 scale，破坏锚点保持公式 |
| 改云 API 接口 | 后端 `functions/api/**/*.ts` + 前端 `src/lib/api.ts` 同步改 | 改了后端不同步客户端 |
| 改登录/权限 | `contexts/AuthContext.tsx` + `functions/_utils.ts` | 在页面加与 `isDM/isAuthenticated` 冲突的局部判断 |
| 加新功能页面 | 建页面 → App.tsx 注册路由 → Layout/PlayerLayout 菜单加入口 | 遗漏任何一步导致 404 或导航找不到 |
| 改数据库表结构 | `migrations/NNNN_name.sql` 新建追加文件 + `functions/_utils.ts` 类型 | 修改已有的迁移文件 |

---

## 二、9 个 store 统一骨架（新建/修改必须严格遵守）

```ts
// 8 件套缺一不可
let listeners: (() => void)[] = [];
function notify() { listeners.forEach(l => l()); }
function load(): T[] { // 1. localStorage 读 + JSON.parse + 字段兜底 }
function save(list: T[]) { localStorage.setItem + notify(); } // 2. 必须 notify

const xxxStore = {
  getAll(): T[],                    // 3. 读 + 默认排序
  get(id): T | null,                // 4. 按 id 查
  create(...): T,                   // 5. UUID + 默认值 + save(append)
  update(id, partial): void,        // 6. 找 index → 合并 → save
  delete(id): void,                 // 7. filter → save
  subscribe(listener): () => void,  // 8. 追加 listener，返回 unsubscribe
  // + 业务专属函数（如 combatStore.consumeAction）
};
export default xxxStore;
```

> `load()` 字段必须有兜底，如 `name: r.name ?? '未命名'`，防止老数据打开报 undefined；`save()` 必须调用 `notify()`，否则页面不刷新。

---

## 三、装备三层身份 + 变更漏斗（**最容易踩坑，做战斗/装备相关任务前先背熟**）

### 三层身份，不可混淆
1. **EquipmentItem**（装备库模板，`types/equipment.ts`）：无 quantity，实例化时才生成背包项
2. **Equipment**（角色背包实例，`types/character.ts`）：`id`（模板 ID）+ **`childId`（背包主键，唯一）** + quantity/packSize/heldLeft/Right
3. **EquipmentChanges**（战斗变更漏斗，`types/combat.ts`）：三件套 `added[]` / `removedChildIds[]` / `quantityDeltas`，不修改源背包

> 查找/判定永远用 `eq.childId || eq.id`，不要只判断其中一个；手持穿戴槽 `slot.equipmentId` 总是匹配 childId。

### 战斗中任何装备消耗 → **只改 EquipmentChanges 三件套，绝不碰 character.equipment**
1. 只读 `character.equipment` 作源
2. 任何变化（射击扣弹药、投掷武器掉落、拾取加回）都只写入 `CombatRecord.equipmentChanges[combatantId]` 的三件套
3. 统一读 `combatStore.deriveCombatInventory()` 得出战斗中真实背包

### EquipmentChanges 三件套用法
- 新增物品（拾取/战斗内宝藏分配）：push 到 `added`，childId 尽量复用源；源没有用 `combat-${Date.now()}-${rand6}`
- 整件移除（最后一发射完、投掷武器）：push childId 到 `removedChildIds`（优先级最高，覆盖一切 delta）
- 数量加减：写 `quantityDeltas[childId] = delta`

---

## 四、设计模式复用（做新功能前先看这里，不要重复造轮子）

1. **工厂函数** `equipmentFactory.extractBaseFields`：所有装备字段从不同来源归一化的唯一入口，新增字段只改这一处
2. **聚合 Hook** `useEquipmentActions(charId, refresh)`：装备增改删/从装备库加/手持穿戴卸下的统一操作集合，做新的装备聚合操作加进这里，不要在页面里直写 characterStore + api
3. **变更漏斗** `EquipmentChanges` + `computeChildQtyMap`：战斗是"临时副本"，绝不污染源背包；用三件套增量抵消得出当前背包
4. **双轨认证** `src/lib/api.ts` + `functions/_utils.ts`：
   - 普通端点（角色/装备 CRUD）：`authHeaders()` → JWT 优先，DM Token 兜底（`authenticateRequest`）
   - 敏感管理员端点（改角色/删账号）：`adminAuthHeaders()` → 仅 DM Token（`verifyDmToken`）
   - Token 永远走 header，绝不出现在 URL 参数
5. **双指缩放锚点公式**（Battleground）：`newTranslate = startTranslate + (startScale - newScale) × startMid + (curMid - startMid)`，平移 + 缩放联动不要分开改
6. **长按落空回退**（Battleground `dragLockMissed`）：长按超时但松手时没 hover 到任何棋子/物品，`ts.moved=false` 让原生 click 正常选中棋子
7. **武器属性解析** `AttackEditor.parseWeaponData(equipment)`：复合文本（投掷/弹药/多用）解析成结构化 Attack.properties / 射程 / 双手伤害；新增武器属性先加 `WEAPON_PROPERTIES`，再扩展解析

---

## 五、命名 & 编码约定（强制一致）

| 项目 | 约定 |
|------|------|
| 文件名 | 页面/组件大驼峰（`PageName.tsx` / `ComponentName.tsx`）；store/类型小驼峰（`xxxStore.ts` / `xxx.ts`） |
| 组件 | 函数式 + `export default`；props 用 `interface Props { ... }`，不要函数参数解构 |
| store | `const xxxStore = { ... }` + `export default`；不要 class |
| 类型/接口 | 领域聚合在 `types/` 6 个文件，绝不从组件里导出接口到全局 |
| ID | 用 `crypto.randomUUID()`；临时未保存 ID `temp-${Date.now()}`；战斗拾取 childId `combat-${picker.id}-${Date.now()}-${rand6}` |
| 装备引用一致性 | 查找/判定永远 `eq.childId \|\| eq.id`；手持穿戴槽匹配 childId |
| 距离 | 沙盘一律**切比雪夫距离** max(Δcol, Δrow)，对应 D&D 5 尺/格 |
| CSS | 只用 Tailwind class；暗黑前缀 `dark:xxx-dark-yyy`，亮色前缀 `light:xxx-light-yyy`；禁止新建除 `index.css` 入口 + `public/css/main.css` 外的 .css |
| 导入 | 绝对路径 `@/xxx/yyy` 优先，禁止 `../../data/` |
| 注释 | 只写非显而易见的 why（算法推导/互斥规则/兼容性 hack），不写 what；禁止 emoji |

---

## 六、高危踩坑清单（任务命中下列场景时必须先通读对应 AGENTS.md §7）

### 战斗背包相关
- ✅ **永远走 EquipmentChanges 三件套** → `applyEquipmentChange` → `combatStore.update`
- ❌ 直接改 `character.equipment[i].quantity`
- ❌ 直接改 combatant.actions/hp/status 之外的任何字段（装备状态存在 combatRecord，不在 combatant 身上）

### 沙盘触摸事件链
- 通读 `handlePointerDown / Move / Up` 整链条再动
- `pointers.size === 2` 分支同时改 translate + scale，不要单独动其一
- `latestTranslate ref`：setTranslate 异步，pointerup 闭包里读 ref，不读 state
- 多实体格棋子 div **不 stopPropagation**（让外层 setPointerCapture）

### 加新 store / 新页面 / 新云 API
- 新 store：8 件套缺一不可，load 字段兜底，save 必须 notify
- 新页面：页面 → App.tsx 路由注册 → Layout/PlayerLayout 菜单加入口（三步缺一不可）
- 新云 API：`functions/api/xxx/yyy.ts` 顶部 `import { authenticateRequest, getDb, ... } from '../_utils'`，前端 `src/lib/api.ts` 同步加泛型函数 `export async function xxx<T = any>(): Promise<T>`；敏感端点用 `adminAuthHeaders()`

---

## 七、修改后验证步骤（每次修改完都要按顺序跑）

```bash
# 1. 类型检查（零副作用，最快）
npx tsc --noEmit

# 2. 构建（类型+打包，验证路由/组件导入全通）
npm run build
```

> 开发服务器刷新不出页面 90% 是路由守卫错了：先查 `AuthContext` 的 isDM 是否 false、localStorage `auth_token` 在不在。

---

## 八、Git 工作流硬约束（**每次任务执行前先读本节，违反以下任何一条即视为流程错误**）

> 与 AGENTS.md §9 完全一致，这里是强制精简版。用户明确要求「不要立即编辑 main」时，**禁止**在 main 分支直接提交或推送。

### 8.1 编辑代码前：必须同步远程最新状态（三选一，按顺序）

- 情况 A（本地干净，无未提交改动）：`git fetch --all --prune` → 比较 `HEAD` 与 `origin/main` → 落后就 `git rebase origin/main`
- 情况 B（有未提交改动）：`git stash` → 情况 A → `git stash pop`
- 情况 C（用户已明确说"不用拉，直接改"）：可跳过，但必须确认用户意图

### 8.2 改动过程中：禁止直接在 main 分支提交（**默认强制**）

- ✅ **正确流程**：从 main 建 `feature/xxx` 或 `fix/xxx` 分支 → 在分支上提交改动
- ✅ **正确提交**：`git add <具体文件>`（每个 commit 一个原子变更，conventional commits 格式）
- ❌ **严禁**：`git add .` 不加区分地暂存所有改动
- ❌ **严禁**：直接在 main 分支上 `git commit`（例外见 §8.4）

### 8.3 推送 main 前：必须先编译通过

```
功能分支提交 → npx tsc --noEmit && npm run build  ✅通过
    ↓
切回 main → git pull origin main → merge --no-ff 分支
    ↓
main 上再次 npx tsc --noEmit && npm run build  ✅通过
    ↓
git push origin main
```

- ❌ **严禁**：跳过 build 直接 push 到 main
- ❌ **严禁**：功能分支 build 失败仍合并到 main

### 8.4 可以直接在 main 上操作的**唯一三种例外**

1. 用户明确说「不要建分支，直接改 main」或「立即编辑 main」（**用户原文必须出现这类措辞**）
2. 纯文档类修改：只改 AGENTS.md / README.md 等 `.md` 文件，不碰 `.ts/.tsx/.sql/.json` 等代码文件
3. 紧急线上修复且用户已明确确认

**即使是例外场景，§8.1（编辑前同步远程）和 §8.3（推送前编译通过）两条仍然强制生效。**

---

## 九、AGENTS.md 同步责任（§10.1：满足任一触发条件必须同步更新 AGENTS.md）

以下任何一项改动完成后，必须就近更新 AGENTS.md 对应章节，**不要整篇重写，只改对应部分**：

| 触发条件 | 需要更新的章节 |
|---------|--------------|
| 新增/删除/重命名页面 | §0 速查表 + §2.1 路由分层图（含文件计数同步） |
| 新增/删除/重命名 store | §0 速查表 + §1 技术栈总览 + §2.2 目录速查 |
| 新增/删除/重命名类型文件 | §0 速查表 + §2.2 目录速查 |
| 新增/删除/重命名组件 | §0 速查表 + §2.2 目录速查 |
| 新增云 API 端点 | §0 速查表 + §3 后端架构图 |
| 新增数据库迁移文件 | §3 后端架构图末尾迁移说明 |
| 引入新设计模式 | §5 设计模式（必须写清**为什么用**，不只写怎么用） |
| 修改命名/编码约定 | §6 命名与编码约定 |
| 修改 store 骨架模式 | §4.2 Store 统一模式 |
| 修改认证机制 | §5.4 双轨认证 + §3 后端架构图 |
| 修改战斗背包派生逻辑 | §4.1 装备三层身份 + §5.3 变更漏斗 |
| 修改沙盘交互核心逻辑 | §5.5 双指缩放 + §5.6 长按落空 + §7 踩坑清单 |
| 修改 Git 工作流规范 | §9 Git 工作流规范 |

> **原则**：只加不减。§7 踩坑清单采用追加式，除非重构彻底消除旧坑。临时性 hack 写代码注释加 TODO，不写进文档。
