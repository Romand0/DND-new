# Requirements Document — 法术流程流水线（不全书搜索 × 流程生成器协同）

Feature Name: spell-flow-pipeline
Updated: 2026-10-18

## Introduction

打通现有两个 agent skill——「不全书搜索」与「流程生成器」——形成一条专为法术服务的流水线：以法术名为入口，自动完成「搜法术原文 → 转化描述性文本为 DSL（节点图）→ 产出控制台可用的 FlowDefinition JSON」。流水线优先复用现有 9 种节点与 6 种触发边；当法术机制超出既有节点表达能力时，按既有扩展契约开发新节点类型，保持图模型可演进。

## Glossary

- **不全书搜索 skill**：`skills/不全书搜索/SKILL.md` 定义的 agent 工作流，双通道（UTF-8/GBK）检索本地 DND5e_chm 仓库，输出法术概要或原文。
- **流程生成器 skill**：`skills/流程生成器/SKILL.md` 定义的 agent 工作流，将描述性文本转为机制规格、节点图与 FlowDefinition JSON，经五道自审门后交接人工入库。
- **法术原文包**：流水线阶段 1 的产物——按流程生成器 §1.1 抽取清单组织的结构化中间产物（含原文引用、书源、升环施法）。
- **超纲机制**：原文中的机制原子无法由现有 9 种 FlowNodeType + 6 种 EdgeTrigger 表达（如区域持续地形、强制位移）。
- **spellId 绑定**：FlowDefinition 通过 `spellId` 关联法术库条目；`cast_start` 运行时读取法术库元数据。
- **FlowConsole**：`src/components/FlowConsole.tsx`，人工执行创建/更新/删除三模式的入库控制台。

## Requirements

### Requirement 1 — 单入口流水线

**User Story:** 作为 DM，我想要以一个法术名作为唯一输入启动全流程，以便无需手动在两个 skill 之间搬运中间结果。

#### Acceptance Criteria

1. WHEN 用户对 agent 给出法术名并表达「生成该法术的流程/DSL」，agent SHALL 依序执行流水线的全部阶段（搜索 → 规格 → 建模 → 属性 → 自审 → 交接），中间阶段不得要求用户重复输入已获得的产物。
2. IF 用户同时提供了原文文本（已自行粘贴），agent SHALL 跳过搜索阶段，直接从机制规格阶段开始。
3. IF 用户请求的是修改已入库流程而非新建，agent SHALL 转入流程生成器的修改模式，WHILE 修改模式下涉及数值核对时 SHALL 调用不全书搜索复核原文。

### Requirement 2 — 原文获取与法术库查重

**User Story:** 作为 DM，我希望流水线自动拿到权威原文并确认法术是否已在法术库中，以便生成的流程能正确绑定 spellId。

#### Acceptance Criteria

1. WHEN 流水线进入搜索阶段，agent SHALL 按不全书搜索 skill 的双通道流程定位原文，并强制使用**原文模式**输出（数据将用于录入）。
2. IF 同一条目命中多个书源（如 2014 与 2024 PHB 译法不同），agent SHALL 并列展示并请求用户裁决，默认以《玩家手册》为准。
3. WHEN 原文获取完成，agent SHALL 查询 spellStore（本地 + 云端法术库）确认同名法术是否已存在，并在法术原文包中记录 spellId 或标记「未入库」。
4. IF 法术未入库，agent SHALL 阻断流水线于绑定确认点：中间产物（法术原文包、机制规格表）保留，并 SHALL 提示用户通过 DataManagement 的「从 5E 不全书导入_法术」或手动录入补齐法术库。
5. WHILE 法术仍未入库，agent SHALL NOT 产出最终 FlowDefinition；用户确认法术已入库后 SHALL 从机制规格阶段恢复流水线（已产出的中间产物直接复用）。

### Requirement 3 — 机制规格与建模（复用既有节点/边）

**User Story:** 作为 DM，我希望流水线产出的节点图优先使用现有 9 种节点与 6 种触发边，以便与编辑器、编译器、校验器完全兼容。

#### Acceptance Criteria

1. WHEN 进入建模阶段，agent SHALL 按流程生成器 §1.1 抽取清单产出机制规格表，缺失数值记入待确认，禁止臆造。
2. WHEN 机制可由现有节点表达，agent SHALL 按 §2.3 拓扑配方编排节点与边，并按 §3.1 填写配置。
3. IF 出现超纲机制，agent SHALL 首选 `custom` 节点占位并在自审报告中注明；WHILE 超纲机制被判定为可泛化的通用原子（多本法术复用）时 SHALL 启动节点扩展旁路（见 Requirement 5）。
4. 流水线产出的 FlowDefinition SHALL 通过流程生成器门 A（结构合法）校验：含 `cast_start`、无自环/平行边/孤立节点、ID 前缀与 category 一致、description 非空。

### Requirement 4 — 自审与人机交接

**User Story:** 作为 DM，我希望流水线在入库前完成机器自审并把运行现实风险标明，以便我只需做语义裁决与控制台操作。

#### Acceptance Criteria

1. WHEN 建模与配置完成，agent SHALL 执行流程生成器门 A–D 自审并产出自审报告（含门 D 运行支撑标注表）。
2. agent SHALL 按流程生成器 §6.3 四段固定格式交接：机制规格表、FlowDefinition JSON、自审报告、待人工操作。
3. agent 在任何情况下 SHALL NOT 自行调用 flowStore 写接口或 FlowConsole 入库；入库动作由人工完成。
4. IF 门 D 检出「图已表达，运行未实现」的节点，自审报告 SHALL 逐项标注并交由人工决定是否入库。

### Requirement 5 — 节点类型扩展旁路

**User Story:** 作为 DM，当法术机制确实需要新的机制原子时，我希望流水线能规范地扩展节点类型，而不是硬塞进不匹配的节点。

#### Acceptance Criteria

1. WHEN 超纲机制被确认为可泛化原子，agent SHALL 先产出节点类型契约（模板 `templates/new-node-type-contract.md`：字段、校验、输出、不变量、失败模式），等待人工批准。
2. IF 人工批准契约，agent SHALL 按流程生成器 §4.2 改动清单实施：`src/types/flow.ts`（FlowNodeType + NODE_TYPE_REGISTRY + NODE_CONFIG_SCHEMA）→ `src/lib/flowCompiler.ts`（executeNode case）→ 图标映射 → 双校验器 → `docs/nodes/<type>.md`。
3. WHEN 扩展实施完成，agent SHALL 以 `npx tsc --noEmit` 与 `npm run build` 通过为验收条件，并在编辑器中验证「可拖出、可配置、可保存、可发布」。
4. 扩展节点 SHALL 遵循兼容性原则：新版本只增键不改键，已发布流程语义保持稳定。
5. WHILE 未获人工批准，agent SHALL 使用 `custom` 占位并记录需求，SHALL NOT 擅自改动类型层代码。

### Requirement 6 — 交叉引用与文档一致性

**User Story:** 作为维护者，我希望三个 skill 文档互相引用且各司其职，以便后续维护不产生重复漂移。

#### Acceptance Criteria

1. 协同 skill SHALL 只承载编排逻辑（阶段流转、阶段间数据契约、异常分支），机制细节 SHALL 引用流程生成器对应章节，检索细节 SHALL 引用不全书搜索对应章节。
2. WHEN 流程生成器的节点目录、配置 schema 或扩展清单发生变更，协同 skill 的引用 SHALL 保持按章节号引用（弱耦合），无需同步改写。
3. 不全书搜索 SKILL.md 与流程生成器 SKILL.md SHALL 各增加一处指向协同 skill 的入口提示（何时该切换到流水线）。
