# 武器分类特殊规则 — 进度

## 阶段状态

| 缺口 | 状态 | 位置 | 探针 |
|------|------|------|------|
| 远程武器最大射程段劣势 | 完成 | advantageRules.ts detectPositional | probe-ranged-max-tier.cjs 9 |
| 重型武器小体型劣势 | 完成 | advantageRules.ts detectHeavyWeapon | probe-heavy-weapon-size.cjs 9 |
| 轻型武器/双武器战斗 | 完成 | lib/twoWeaponFighting.ts + CombatAttackModal + CombatSession | probe-two-weapon-fighting.cjs 32 |
| 特殊武器（网：束缚/力量豁免） | 待定 | — | — |

已落实基线（非本次改动）：弹药扣减、装填三条件、双手互斥、两用伤害切换、投掷落地、射程四档、灵巧取高、触及、熟练加值。

## 已决策

- 射程最大段劣势与投掷同构推自动劣势（5e 常规外最大内）
- 重型劣势体型来源挂 AdvantageContext.attackerSize（PC 读 character.size，NPC 读图鉴模板 size），不做 Combatant.size 字段贯通，缺省不误报
- 双武器战斗并入攻击弹窗：副手条目动态合成（Attack.offhand 临时标记，不入角色卡），名「副手攻击（武器名）」，手持校验按内层武器名放宽
- 副手伤害规则：不加正属性调整、负值照加；「双武器战斗」战斗风格加调整值
- 双持客专长：放宽为非双手单手近战武器（isOneHandedMeleeWeapon）
- 副手攻击消耗附赠动作（consumeCombatantBonusAction），不扣动作、不推进多重攻击序列；附赠动作耗尽时不出副手条目
- 反应模式（reactionMode）不提供副手条目

## 下一步

- 特殊武器（网）评估：按投入产出决定落地（力量豁免 + 束缚状态）或留 DM 手动记录
- 网络恢复后 `git push origin main`（本地领先 origin/main 多个提交：PC 额外攻击、射程劣势、重型劣势、双武器战斗）

## 验证命令

```bash
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit && npm run build
QUIET=1 node scripts/probes/probe-two-weapon-fighting.cjs
QUIET=1 node scripts/probes/probe-multiattack-sequence.cjs
QUIET=1 node scripts/probes/probe-pc-extra-attack.cjs
QUIET=1 node scripts/probes/probe-ranged-max-tier.cjs
QUIET=1 node scripts/probes/probe-heavy-weapon-size.cjs
```
