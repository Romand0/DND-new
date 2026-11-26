# 进度：搜索（Search）动作

> 跨会话接力的唯一状态源。

## 目标
把「搜索」从 ALL_ACTIONS 占位变成可结算动作：察觉检定对抗躲藏者的隐匿总值，成功解除该 hidden 实例。

## 阶段状态
- [x] P0 规则与决策确认（SRD/PHB 原文 + 5 决策点）
- [x] P1 hidden 携带 stealthTotal（applyEffect metadata + 三处躲藏入口强制录入 + 特性转换代填）
- [x] P2 search op 类型 + `searchRules.resolveSearch` + `turnCommitApply` 分支 + 文案
- [x] P3 双端入口（CombatantInfoPanel/Battleground/CombatSession/MyTurnPanel/PlayerSpectate）
- [x] P4 探针（probe-search.cjs 20 断言全绿）
- [x] P5 构建验证（tsc + build 通过）
- [ ] P6 合并 main + 推送

当前：P6 待合并。

## 已决策
- 只做搜人（hidden 实例对抗），搜物留给 DM 检定请求
- DC 取 hide 时记录的 `stealthTotal`；平局仍隐蔽（`total > stealth` 才解除）
- 全图无距离限制
- 结果只回「发现/未发现」，不暴露差值，不写目标名字
- 搜索失败照扣 1 动作
- 用户可见躲藏入口强制录入隐匿总值；特性转换无掷骰环节，按被动隐匿代填并标注

## 下一步
1. 合并 feature/search-action → main 并推送
2. 人工验收：DM 双击棋子 → 搜索/躲藏弹窗、玩家回合面板「搜索」按钮、躲藏裁定请求带隐匿总值
3. 可选后续：搜物/搜线索（DM 检定请求自设 DC）、hidden 状态向 DM 面板显示隐匿值

## 验证方式
- 构建：`npx tsc -p tsconfig.app.json --noEmit && npm run build`
- 本功能探针：`NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-search.cjs`（20 断言）
- 基线：`sh scripts/probes/run.sh`

## 分支与提交
- 分支：`feature/search-action`（已合并则注明）
- 关键提交：feat: 搜索动作（察觉对抗 hidden 隐匿总值）
