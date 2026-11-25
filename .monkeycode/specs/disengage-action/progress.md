# 撤离（Disengage）实施进度

## 阶段状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| P1 | 状态库 `disengaging` 定义（effects 空、permanent） | 完成 |
| P2 | 借机攻击抑制：`reactionRules.ts` leave_reach 检测器入口早退 | 完成 |
| P3 | 结算入口：`CombatSession.disengageFor`（DM 面板）+ 玩家端 `onDisengageClick` | 完成 |
| P4 | 特性转换：`resourceConvEngine.applyConvTarget('disengage')` 挂同状态 | 完成 |
| P5 | 探针：`probe-reaction.cjs` 18a-18h 数据级断言 | 完成 |
| P6 | 全量回归 + 构建 | 完成（ALL PROBES OK / tsc+build 通过） |
| P7 | 人工验收（UI 弹窗链、徽标、回合待办） | 待做 |

## 已决策

- 语义与回避（dodge）一致：至你的下回合开始（`untilNextTurn`、`turnCount: 1`）；模拟模式无回合上下文 → `manual` 策略，DM 手动解除
- 抑制点唯一：`reactionRules.ts` leave_reach 检测器入口（双调用点 `turnCommitApply.ts` / `CombatSession.tsx` 天然覆盖）；`enter_reach` 哨兵类检测器不受影响
- 纯标记状态：effects 为空，不复用 `dodging`（复用会错误附带回避增益）
- 特性转换挂同状态，不重复扣动作（资源消耗在转换上游）
- 躲藏（hide）保持占位，仅返回提示

## 下一步

1. 人工验收：DM 双击棋子 → 撤离 → 移动离开触及无借机弹窗；未撤离对照有弹窗；状态徽标与回合待办展示；灵巧动作转换路径
2. 网络恢复后推 main（本地领先 origin/main）

## 验证命令

```bash
npx tsc -p tsconfig.app.json --noEmit && npm run build
BASE_URL=http://localhost:5174 sh scripts/probes/run.sh
QUIET=1 NODE_PATH=$(npm root -g) node scripts/probes/probe-reaction.cjs
```

> 探针前必须冷重启 dev server（HMR 会让动态 import 拿到第二份模块实例，状态写入丢失）。
