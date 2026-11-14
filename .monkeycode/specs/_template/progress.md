# 进度：<feature-name>

> 跨会话接力的唯一状态源。每段会话收尾时更新本文件，会话历史不作为交接依据。

## 目标
一句话说明这个功能要解决什么问题。

## 阶段状态
- [ ] P1 <阶段名>：<产出物>
- [ ] P2 <阶段名>：<产出物>
- [ ] P3 <阶段名>：<产出物>

当前：P<N> 进行中 / 已完成待合并 / 已合并待推送。

## 已决策
- <决策>：<理由>
- 放弃方案：<方案> —— <否决理由>

## 下一步
1. <可直接执行的动作，含文件路径>

## 验证方式
- 基线：`sh scripts/probes/run.sh`（期望末行 `ALL PROBES OK`）
- 本功能探针：`scripts/probes/probe-<name>.cjs`
- 构建：`npx tsc -p tsconfig.app.json --noEmit && npm run build`

## 分支与提交
- 分支：`feature/<name>`（已合并则注明）
- 关键提交：<hash> <一句话>
