# NPC 特性接入战斗系统 — 进度

## 阶段状态

审计结论（种子 421 怪）：

| 特性 | 数据量 | 接入程度 | 备注 |
|------|--------|----------|------|
| attacks | 412 | 完整 | CombatAttackModal 全链路 |
| multiattack | 特质 210 / 结构化 193 | 完整（解析漏斗有损） | 多重攻击序列引擎 |
| 伤害三抗 | 抗92/免165/易20 | 完整 | combatAffinities → CombatDamageModal |
| spellcasting | 63 | 完整 | CombatSpellModal + 每日次数 + 豁免 DC |
| magicResistance | 55 | 完整 | advantageRules detectTrait（豁免场景） |
| legendaryResistance | 24 | 完整 | SpellCheckStep / CombatSpellModal |
| senses | — | 完整 | 视野 P1-P3（明亮/微光/黑暗视觉） |
| proficientSaves | 119 | 完整 | saveBonus |
| size | — | 完整 | 重型武器劣势判定 |
| breathWeapon | 55 | 部分 | 映射为攻击条目+note，豁免手动 |
| regeneration | — | 部分 | 面板提醒，不自动回血 |
| conditionImmunities | 129 | **本次完成** | 四个挂载入口拦截 |
| skills | 255 | 部分 | NPC 多手动 |
| 其余特质文本 | 394 | 仅展示 | 骇人威仪/拟形/水陆两栖/集群战术/敏锐嗅觉等 |

缺口状态：

| 缺口 | 状态 | 位置 | 探针 |
|------|------|------|------|
| 条件免疫拦截 | 完成 | data/conditionImmunity.ts + 4 挂载入口 | probe-condition-immunity.cjs 26 |
| 多重攻击解析漏斗（210 vs 193，~17 措辞变体） | 待办 | 种子解析 | — |
| 吐息武器豁免自动化 | 待办 | 接 aoeSaveEngine | — |
| 再生回合开始自动回血 | 待办 | 回合推进 | — |

## 已决策

- 免疫拦截做在调用点（applyEffect 无 combatant 上下文，statusManager 不 import combatStore）
- 已接入口：StatusAttachPanel（手动）、attackRiders.applyStatusWithTodo（攻击附加）、featureChannelRunner（特性状态）、CombatSession.onFlowResolved（法术流程）
- 未拦截：自伤类状态（dodging/hidden/disengaging/incapacitated），5e 无对应免疫
- 条件名归一：受擒→擒抱、恐慌/惊恐→恐惧；种子允许别名写法，运行时归一再比对
- 数据缺陷即修：罪魔「毒素」→「中毒」、还魂鬼「惊恐」→「恐惧」、虎人/狼人「中形」→「中型」

## 下一步

1. 多重攻击解析漏斗：统计 210 特质里 17 条未结构化的措辞变体，扩解析规则
2. 吐息武器：以 aoeSaveEngine 驱动豁免 + 半伤
3. 再生：回合开始自动回血（写 HP + 提示）

## 验证命令

```bash
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit && npm run build
QUIET=1 node scripts/probes/probe-condition-immunity.cjs
QUIET=1 node scripts/probes/probe-multiattack-sequence.cjs
QUIET=1 node scripts/probes/probe-monster-attack-classify.cjs
```
