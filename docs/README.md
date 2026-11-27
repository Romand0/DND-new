# 文档索引

本目录是人类可读的长期文档；自动生成的代码概述、功能规格与交接记录各有独立位置。新增文档前先按下方「放置规则」选目录。

## 目录结构

| 目录 | 内容 | 维护方式 |
|------|------|---------|
| `docs/changelog.md` | 内测版本沿革（每个内测版本的交付范围与顺延项） | 版本收束时更新 |
| `docs/patterns/` | 设计模式索引（`agents-patterns.md`，AGENTS.md §5 正文） | 新跨模块模式落地时追加 |
| `docs/guides/` | 操作与架构指南：战斗模块导航、提交指引、流程 DSL 编译器 | 随实现同步 |
| `docs/design/` | 规则与机制设计稿（如抗性机制全生命周期） | 设计定稿后归档 |
| `docs/roadmap/` | 跨版本路线图（如圆桌枢纽） | 规划变更时更新 |
| `docs/nodes/` | 流程 DSL 节点说明（每节点一篇） | 新增节点类型时同步 |
| `docs/archive/` | 已完结的拆解规划、根因修复报告（保留决策档案，不再更新） | 只读 |
| `docs/generated/` | 按 `src/` 路径镜像的代码概述，由 GitHub Actions 生成 | 不手改 |

其他文档位置：

- `AGENTS.md`：工程约定与任务导航（开工先读）
- `.monkeycode/specs/<feature>/`：功能规格（requirements / design / progress），功能开发唯一状态源
- `.monkeycode/MEMORY.md`：行为指令与运维知识（只记「怎么做」）

## 放置规则

- 长期有效、需要反复查阅 → `docs/` 对应子目录，文件名用小写 kebab-case（如 `combat-navigation.md`），标题用中文
- 单次功能的调研与实施计划 → `.monkeycode/specs/<feature>/`，功能完结后不迁入 `docs/`
- 已完结的规划/报告 → `docs/archive/`，只追加不改写
- 代码概述 → 交给 `docs-generate` workflow，不手写

## 常用入口

- 新人上手：`docs/changelog.md` → `AGENTS.md` → `docs/guides/combat-navigation.md`
- 改战斗逻辑：`AGENTS.md` §4 → `docs/patterns/agents-patterns.md` → `docs/guides/combat-navigation.md`
- 加设计模式：`docs/patterns/agents-patterns.md` 追加编号条目，并在 `AGENTS.md` §5 表格登记
