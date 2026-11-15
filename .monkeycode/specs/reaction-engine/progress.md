# 进度：reaction-engine（通用反应引擎）

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
把借机攻击扩展成通用反应机制：触发时机由数据声明（法术/特性/怪物），效果走既有流程；引擎只负责「什么时候可以反应、谁可以反应、消耗什么」。

## 阶段状态
- [x] P1 事件抽象 + `ReactionPrompt` 超集 + 定义注册表，借机攻击迁入（8538dd7，main b05bd61）
- [x] P2 攻击目标反应窗口（命中后、伤害前）+ 法术反应声明 `Spell.reaction` + 通用反应弹窗（a7fd672，main 5662dba）
- [x] P3 `damage_taken` / `spell_cast` 插桩 + 特性数据源 + 玩家提交窗口化（本分支待合并）

当前：P3 代码完成，typecheck/build 通过，`probe-reaction.cjs` 48 项全绿，等待合并推送。

## 已决策
- 事件面用 `ReactionTrigger` 判别联合（move / attack / damage / spell_cast），检测器走 `registerReactionDetector`，新增来源不改弹窗与队列
- `ReactionPrompt` 存快照字段（label / definitionName / cost），恢复队列时不依赖定义表后续变更
- 定义解析顺序：内置表优先，其次 `spell:<id>` 运行时从 `spellStore` 派生（`definitionFromSpell`）；代码零法术名、零效果逻辑
- 命中窗口在 `onConfirmHit` 内先 `detectReactions({kind:'attack'})`，有反应则 `pendingDamage` 延后，队列清空后由 effect 打开伤害弹窗
- 检测器纯只读（不判反应次数与法术位），可用性在弹窗二次校验，避免检测阶段丢信息
- 无 `characterId` 的参战者不扣法术位（影子卡/NPC 无法术位数据，试验场可测）
- 移动反应不阻塞移动落库（先落库再提示）；队列串行，同回合多次借机由 `reactionUsed` 拦截
- 放弃：在 `CombatAttackModal` 内直接判定反应 —— 计算层与交互层耦合，法术攻击与玩家提交路径无法复用
- 放弃：为每个法术写专用 handler —— 每加一个法术都要改代码，改用 `Spell.reaction` 数据声明
- 放弃：P2 顺带做 `spell_cast` —— 插桩点分散在流程施放/手动施放/卷轴三条路径，单独放 P3 保证 P2 可独立验证

## 下一步
1. 合并 `feature/reaction-engine-p3` 到 main 并推送
2. 后续接入更多数据来源（怪物动作 / 专长）时，只需扩展 `getOwnerReactionSources` 或注册检测器

## 验证方式
- 基线：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`）
- 本功能探针：`scripts/probes/probe-reaction.cjs`（48 项，含持久化、P2 攻击反应、P3 damage/enter_reach/spell_cast/特性来源）
- 构建：`npx tsc -p tsconfig.app.json --noEmit && npm run build`

## 分支与提交
- `feature/reaction-engine-p1`：8538dd7 → 合并 b05bd61
- `feature/reaction-engine-p2`：a7fd672 → 合并 5662dba
- P3 使用 `feature/reaction-engine-p3`（待合并）
