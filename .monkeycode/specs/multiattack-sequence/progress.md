# 多重攻击序列（multiattack-sequence）

## 阶段状态
| 阶段 | 状态 |
|------|------|
| 方案选型（A 动作内攻击序列） | [x] 用户拍板 2026-11-23 |
| 数据层（multiattackProgress + store 助手 + resetActions 清理） | [x] |
| 攻击弹窗锁定（lockedAttackName + 步骤徽标） | [x] |
| 消耗重构（整序列 1 动作）+ 终点推进（miss/伤害结算） | [x] |
| 面板入口（多重攻击按钮 + 进度 chip + 结束序列） | [x] |
| 回溯清空（startPlaybackFromBeginning） | [x] |
| 探针 + 构建 + 合并推送 | [x] 已推送 main 2b3ef62（2026-11-23） |

## 已决策
- 方案 A：Multiattack = 「1 个 Attack 动作内按配方出 N 击」；动作在首击结算时消耗一次（actionConsumed 标记），后续击共享该动作
- 配方步骤解析（resolveMultiattackStep，纯函数）：精确名 → 锁定；**唯一**包含关系 → 锁定（如「匕首」vs「匕首（近战/远程）」）；歧义子串或失配（含「鞭攻击」vs「鞭击」这类无包含关系的近形名，49/329 步）→ 该步自选攻击，配方名仍展示交 DM 裁决
- 步骤间目标由 DM 显式选择（复用现有 openAttackFor 目标挑选），不自动猜目标开弹窗
- 回合开始 resetActions 清序列；从头回溯 startPlaybackFromBeginning 清空全部序列
- PC Extra Attack 同源但不在本轮：序列基建是通用的（queue 由配方展开），PC 侧待后续接职业特性推导
- 模拟/放映行为一致：模拟模式动作本不消耗，序列照常推进

## 下一步
- 人工验收：放映模式巨魔（咬+爪+爪）、失配配方（自选步）、结束序列、回合切换清 chip、回溯后无残留
- PC Extra Attack 接入（角色卡职业特性推导 queue）

## 验证命令
```bash
QUIET=1 node scripts/probes/probe-multiattack-sequence.cjs
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit && npm run build
```
