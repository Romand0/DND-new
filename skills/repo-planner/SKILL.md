# Repo Planner — 仓库理解 + 方案规划技能

> 以最少 token 消耗让 AI 建立对仓库的结构化理解，并根据需求输出 code agent 可直接执行的方案。

---

## 核心原则

1. **分层递进** — 文件树(极低) → 约定文件(低) → 代表性文件(中) → 按需深入(高)。**每一层只在上一层信息不足时才进入下一层**
2. **结构推断优先** — 能从文件名/目录名/导出名推断的，不读文件内容
3. **模式采样** — 同类文件读 1 个代表推断整类约定，不逐个读
4. **输出即产物** — 每次分析产出持久化文档（Repo Profile / Plan），后续会话可直接复用
5. **按需深入** — 只为当前需求涉及的文件/模块付出深入阅读成本

---

## 消耗预算指南

| 仓库规模 | 文件数 | 索引目标消耗 | 规划额外消耗 | 策略 |
|----------|--------|-------------|-------------|------|
| 小型 | < 30 | ~2-3 次读文件 | ~1-2 次 | 几乎全读 |
| 中型 | 30-150 | ~5-8 次读文件 | ~3-5 次 | 采样 + 按需 |
| 大型 | 150-500 | ~8-12 次读文件 | ~5-8 次 | 严格分层 + 强采样 |
| 超大型 | 500+ | ~12-15 次读文件 | ~8-12 次 | 只索引需求相关区域 |

**消耗单位** = 1 次读文件操作。shell/grep/glob 不计入（成本极低）。

---

## 阶段一：仓库索引

### 目标

产出 `.repo/profile.md` — 仓库的结构化认知文档。后续所有规划基于此文档，避免重复探索。

### Step 1：结构扫描（1 次 glob，0 次读文件）

```bash
# 根目录概览
ls -la
# 完整文件树（排除依赖/构建产物/node_modules）
find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.next/*' -not -path '*/coverage/*' | sort
# 或
tree -I 'node_modules|.git|dist|build|.next|coverage' --dirsfirst
```

**提取**：
- 包管理器（package-lock.json → npm / pnpm-lock.yaml → pnpm / yarn.lock → yarn）
- 构建工具（vite.config / webpack.config / next.config / nuxt.config / angular.json）
- 项目类型（单包 / monorepo：有 workspaces 或 packages/）
- 部署目标（Dockerfile / wrangler.toml / vercel.json / netlify.toml / cloudflare 相关）
- 是否有架构文档（AGENTS.md / CLAUDE.md / .cursorrules / .cursor/rules / README.md）

### Step 2：约定提取（2-3 次读文件）

**按优先级读取**：

| 优先级 | 文件 | 获取信息 |
|--------|------|---------|
| P0 | 架构文档（AGENTS.md / CLAUDE.md / .cursorrules 等） | 项目规则、架构约定、禁止事项、工作流 |
| P1 | README.md | 项目定位、技术栈、开发命令 |
| P2 | package.json | 依赖（框架/路由/状态管理/ORM/测试）、scripts |
| P3 | tsconfig.json / vite.config / next.config | 路径别名、编译目标、插件 |

**关键**：如果 P0 存在 且内容充分（>100 行，含架构说明），Step 3 可大幅缩减 — 架构文档通常已描述大部分约定。

### Step 3：代码模式采样（3-5 次读文件）

从文件树中选择以下代表性文件，**每个只读前 50-100 行**（足够识别模式）：

| 类别 | 选择标准 | 提取信息 |
|------|---------|---------|
| 入口文件 | main.ts / app.tsx / index.ts | 应用初始化、路由注册、Provider 嵌套 |
| 路由/模块结构 | router.ts / app.config.ts / routes.ts | 路由分层、守卫、中间件 |
| 数据层代表 | 任意一个 store / model / service | 状态管理模式（Redux/Zustand/自定义/PRisma） |
| UI 层代表 | 任意一个页面/组件 | 组件风格（函数式/类）、样式方案（Tailwind/CSS Modules/styled）、命名约定 |
| API 层代表 | 任意一个 API handler / controller | 后端框架（Express/Next API/Cloudflare Functions）、认证模式 |

**采样原则**：
- 如果 Step 2 的架构文档已描述某层模式 → 跳过该层采样
- 如果某层只有 1-2 个文件 → 直接全读
- 同类文件超过 10 个 → 只读 1 个代表

### Step 4：清单统计（1 次 glob，0 次读文件）

```bash
# 按目录统计文件数和总行数
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1  # 总行数
find src -type d | while read d; do echo "$(find "$d" -maxdepth 1 -type f | wc -l) $d"; done | sort -rn
```

**提取**：
- 各目录文件数
- 大文件清单（>500 行，这些是复杂度热点）
- 文件类型分布（.ts / .tsx / .css / .test.ts / .spec.ts）

### Step 5：产出 Profile

写入 `.repo/profile.md`，格式见 [profile-template.md](./profile-template.md)。

**Profile 有效期管理**：
- 每次使用本技能做规划前，先检查 profile.md 是否存在
- 如果存在且用户没有大规模重构 → 直接复用，跳过阶段一
- 如果用户说「项目结构变了」或发现 profile 与实际不符 → 重新执行阶段一
- 增量更新：只重新索引变化的目录，更新 profile 对应章节

---

## 阶段二：需求规划

### 前置条件

- `.repo/profile.md` 存在且有效。如不存在，先执行阶段一
- 用户已描述需求（可以是模糊的自然语言）

### Step 1：需求分析

**分类**：

| 类型 | 特征 | 规划深度 |
|------|------|---------|
| Bug 修复 | 明确错误现象 | 轻量：定位 + 修复方案 |
| 小功能 | 改 1-2 个文件，无新模块 | 轻量：改动点 + 代码片段 |
| 中等功能 | 改 3-5 个文件，可能新增组件/hook | 标准：完整 Plan 格式 |
| 大功能 | 跨多层（类型+数据+UI+API），新增模块 | 完整：Spec 三文件（requirements + design + tasks） |

**需求澄清**（只在必要时提问，能推断的不问）：
- 边界条件不明确 → 列出假设，让用户确认
- 多种实现路径 → 给出推荐 + 备选，让用户选
- 完全明确 → 直接出方案

### Step 2：影响面定位

1. **关键词搜索**：用 grep 搜索需求涉及的关键词（组件名/函数名/类型名/路由路径），快速定位相关文件
2. **Profile 映射**：根据 profile.md 的模块清单和依赖关系图，确定涉及的模块
3. **调用链追踪**：从入口到数据层追踪完整调用链
   - 前端：UI 组件 → Hook → Store/API Client → 后端端点
   - 后端：Route Handler → Service → Database
4. **列出所有受影响文件**

**复杂度评估**：
- **简单**（改 1-2 个文件，无架构影响）→ 直接出改动方案
- **中等**（改 3-5 个文件，数据流清晰）→ 标准 Plan
- **复杂**（跨多层 / 新模块 / 有多种实现路径）→ 完整 Spec

### Step 3：编写执行计划

根据复杂度选择输出格式，写入 `.repo/plans/<feature-slug>.md`。

格式见 [plan-template.md](./plan-template.md)。

### Step 4：自检清单

输出计划前，逐项检查：

- [ ] **每个变更文件都有**：变更类型、具体改动描述、关键代码片段或函数签名
- [ ] **调用链完整**：从入口到数据层，标注每一步的函数名和参数
- [ ] **依赖关系明确**：哪些步骤可并行，哪些必须串行，无环
- [ ] **验证步骤可执行**：包含具体命令和预期结果
- [ ] **无模糊指令**：禁止「适当处理」「按需修改」等模糊表述，每步都要具体到代码
- [ ] **code agent 零探索**：agent 拿到计划后不需要再读任何文件来理解「该改什么」
- [ ] **风险点已标注**：可能的坑、向后兼容问题、需要用户确认的决策点已显式标出

---

## 输出格式规范

### 轻量方案（简单改动）

直接输出，不需要写文件：

```
## 分析

<问题定位，1-3 句话>

## 方案

### 文件：<file_path>
- 位置：第 X 行 / <函数名>
- 改动：<具体描述>
- 改前：<代码片段>
- 改后：<代码片段>

## 验证
- <命令> → <预期结果>
```

### 标准 Plan（中等功能）

写入 `.repo/plans/<feature-slug>.md`，格式见 plan-template.md。

### 完整 Spec（大功能）

写入 `.repo/specs/<feature-slug>/`，包含三个文件：

```
requirements.md  — 用户故事 + 输入输出 + 验收标准 + 排除范围
design.md        — 涉及文件清单 + 数据结构 + 调用链路 + 权限认证 + 预读文件清单
tasks.md         — 分组任务清单 + 依赖关系 + 并行标注
```

---

## 特殊场景处理

### 场景：仓库有完善的架构文档（AGENTS.md / CLAUDE.md）

**策略**：架构文档是最高效的信息源。
- Step 1（结构扫描）仍执行，但只用于验证文档与实际一致
- Step 2 读架构文档后，Step 3 采样可缩减到 1-2 次（只验证文档未覆盖的部分）
- Profile 中大量内容可直接从架构文档提取，标注来源

### 场景：仓库无任何文档

**策略**：增加 Step 3 采样量。
- 从文件命名推断模块职责（如 `userStore.ts` → 用户状态管理）
- 从 import 关系推断依赖图
- 从测试文件推断行为契约
- Profile 中标注「推断」vs「确认」，规划时标注需要验证的假设

### 场景：Monorepo

**策略**：先确定需求涉及哪个 package，只索引该 package。
- 根 package.json 的 workspaces 字段确定包列表
- 每个包独立视为一个「小仓库」
- 包间依赖从 import 语句和 package.json dependencies 推断

### 场景：用户只需要快速回答（不做规划）

**策略**：跳过 Plan 输出，只使用 Profile 回答。
- 例：「这个项目用什么数据库？」→ Profile 的技术栈章节已有答案
- 例：「先攻逻辑在哪个文件？」→ Profile 的模块清单可定位

---

## 反模式（禁止）

- ❌ **全量读取** — 逐个读所有文件。永远用 glob + grep + 采样
- ❌ **跳过 Profile** — 每次规划都重新探索仓库。Profile 就是为了复用
- ❌ **模糊方案** — 「修改相关代码」「适当处理」。每步必须具体到文件和代码
- ❌ **假设不验证** — 推断的约定不标注。推断 vs 确认必须区分
- ❌ **过度规划** — 改 1 个文件却写 3 页 Spec。复杂度匹配方案深度
- ❌ **忽略已有文档** — 仓库有 AGENTS.md 还从头推断。先读文档，文档是第一信息源
- ❌ **规划不含代码** — 只写「修改 XXX 函数」不写改成什么样。关键改动必须附代码片段
