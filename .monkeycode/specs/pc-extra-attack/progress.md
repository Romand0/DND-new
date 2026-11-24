# PC 额外攻击（pc-extra-attack）

## 阶段状态
| 阶段 | 状态 |
|------|------|
| 推导层 derivePcAttacksPerAction（features 主路径 + class/level 兜底） | [x] |
| store 放宽（startMultiattack 去配方校验，校验移怪物入口） | [x] |
| CombatSession 双入口 PC 自动开序列（openAttackFor / onRequestAttack） | [x] |
| 文案区分（额外攻击 vs 多重攻击；弹窗提示按锁定与否） | [x] |
| 探针（24 推导 + 22 序列回归）+ 构建 + 合并推送 | [x] |

## 已决策
- 队列哨兵：PC 额外攻击 queue 存空串 → multiattackStepLabelOf / 面板 chip / 弹窗提示按空名走「额外攻击」文案且不锁攻击（5e 每击可换武器）
- 推导实时读卡（同 computeCombatantAc 模式）：老战斗记录/快速建表/试验场人偶三路径全覆盖，无需改投影
- features 主路径匹配「额外攻击/Extra Attack/渴刃/Thirsting Blade」+ level 生效判定；战士 11→3、20→4 档位递进用 char.level 判定（features 只决定有无）
- 兜底规则只覆盖五职业（战/野/圣/游/僧 5 级双击）；子职业特例（勇武诗人/剑咏法师/渴刃）依赖 features 数据，老卡缺失时留 DM 把握
- 双武器战斗（附赠动作第二击）不在本特性范围

## 下一步
- 人工验收：放映模式 5 级战士两击共享 1 动作、第二击换武器、结束序列、回合切换清 chip、3 级战士仍单击
- attack_extra spec 通道登记（featureCapabilities ENGINE_READY_CHANNELS + SPEC_DB 白名单），让角色卡特性编辑器可显式声明

## 验证命令
```bash
QUIET=1 node scripts/probes/probe-pc-extra-attack.cjs
QUIET=1 node scripts/probes/probe-multiattack-sequence.cjs
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit && npm run build
```
