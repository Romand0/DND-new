# 进度：flow-ai-generation

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
用 Cloudflare Workers AI 在站点内承担「法术 FlowScript 生成」：DM 输入法术文本 → 模型产出脚本树 JSON → 服务端校验/重试 → 草稿进人工审核，替代当前 Agent 驱动生成 + 手动粘贴的工作流，达成降本增效。

## 阶段状态
- [x] P0 技术评估：可行性 / 架构兼容性 / 成本三维结论已出（见下方已决策）
- [x] P1 prompt 资产层：`src/lib/flowPrompt.ts`（`buildSystemPrompt` / `buildUserPrompt`，节点目录同源 NODE_TYPE_REGISTRY + NODE_CONFIG_SCHEMA）
- [x] P1 实验工具：`scripts/flow-ai-experiment.mjs`（5 用例 → REST API → validateScript → 错误回灌重试 ≤2 → Neurons 估算）+ `scripts/run-flow-ai-experiment.sh`
- [ ] P2 实验执行：需用户提供 CF_ACCOUNT_ID / CF_API_TOKEN（Workers AI: Edit）后跑 `./scripts/run-flow-ai-experiment.sh`，人工核对 5 用例的形态语义（脚本会打印每例 expect 提示）
- [ ] P3 生成端点：`functions/api/flows/generate.ts`（admin JWT → AI binding → 校验重试环 → 返回草稿，不落库）
- [ ] P4 前端入口：FlowEditor「AI 生成」按钮 → 草稿走现有 import 管线人工确认

当前：P1 已完成且已合入 main，等待 P2 实验执行。

## 已决策
- **模型默认 qwen3-30b-a3b-fp8**：$0.051/$0.335 per M tokens，单次 ≈50 Neurons，免费额度 10k/天约 200 次；质量不足再切 llama-3.3-70b（≈311 Neurons/次）。
- **prompt 与校验器同源**：节点目录与 config 字段从代码常量程序化生成，代码迭代语义后 prompt 自动跟；语义规则（形态三态/硬性规则）以常量维护并需人工同步 SKILL.md + `docs/patterns/agents-patterns.md`。实证：`apply_effect` 实际有 7 种 effectType（多出 advantage/zone/forced_move），SKILL.md §3.1 只记 4 种，手抄配方会漂移——同源层自动取到了最新枚举。
- **输出目标为 script-only JSON**：编译桥 `ensureCompiledGraph` 自动补 nodes/edges/positions，模型无需生成图结构。
- **生成结果不自动发布**：端点只回传草稿，落库走现有 import 管线 + 人工确认（延续方案生成器「不自行发布」原则）。
- **默认值渲染策略**：prompt 只展示 boolean/object 类默认值；text/select/dice 类默认值会诱导模型抄模板（如 condition 抄成 target.currentHp <= 100），不展示。
- 放弃方案：纯 prompt 手维护全文 —— 与代码语义必然漂移；JSON schema response_format 强约束 —— Workers AI 部分模型 best-effort，仍须服务端校验重试兜底。

## 下一步
1. 用户提供 CF 凭据后执行 P2：`export CF_ACCOUNT_ID=... CF_API_TOKEN=...; ./scripts/run-flow-ai-experiment.sh`，逐例按 expect 核形态语义，记录 PASS 率与 Neurons 实测。
2. P2 通过后实现 P3：新建 `functions/api/flows/generate.ts`（参照 `functions/api/flows/index.ts` 的 authenticateRequest + readJsonBody 模式）；校验器复用需处理 `@` 别名（改相对导入或用 esbuild --alias 打包）。
3. P3 后接 P4 前端入口。
4. 顺带修文档漂移：`skills/流程生成器/SKILL.md` §3.1 的 effectType 表格补 advantage/zone/forced_move。

## 验证方式
- 类型检查：`npx tsc -p tsconfig.app.json --noEmit`
- 构建：`npm run build`
- 实验：`./scripts/run-flow-ai-experiment.sh`（需 CF 凭据，输出写到 /tmp/opencode/flow-ai-results.json）
- 基线：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`）

## 分支与提交
- 分支：`feature/flow-ai-prompt`（已合并 main 并删除）
- 关键提交：`4096834` merge: FlowScript AI prompt 资产层 + Workers AI 实验脚本
