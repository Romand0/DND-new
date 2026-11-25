# NPC 特性接入战斗系统 — 进度

## 阶段状态

审计结论（种子 421 怪）：

| 特性 | 数据量 | 接入程度 | 备注 |
|------|--------|----------|------|
| attacks | 412 | 完整 | CombatAttackModal 全链路 |
| multiattack | 特质 204 / 结构化 199 | 完整 | 多重攻击序列引擎；剩 5 条语义不可机械翻译 |
| 伤害三抗 | 抗92/免165/易20 | 完整 | combatAffinities → CombatDamageModal |
| spellcasting | 63 | 完整 | CombatSpellModal + 每日次数 + 豁免 DC |
| magicResistance | 55 | 完整 | advantageRules detectTrait（豁免场景） |
| legendaryResistance | 24 | 完整 | SpellCheckStep / CombatSpellModal |
| senses | — | 完整 | 视野 P1-P3（明亮/微光/黑暗视觉） |
| proficientSaves | 119 | 完整 | saveBonus |
| size | — | 完整 | 重型武器劣势判定 |
| breathWeapon | 75 条 | 完整（45 条可自动结算） | 动作面板「吐息武器」→ aoe_save 范围豁免弹窗；无形状/纯效果型留手动 |
| regeneration | — | 部分 | 面板提醒，不自动回血 |
| conditionImmunities | 129 | **本次完成** | 四个挂载入口拦截 |
| skills | 255 | 部分 | NPC 多手动 |
| 其余特质文本 | 394 | 仅展示 | 骇人威仪/拟形/水陆两栖/集群战术/敏锐嗅觉等 |

缺口状态：

| 缺口 | 状态 | 位置 | 探针 |
|------|------|------|------|
| 条件免疫拦截 | 完成 | data/conditionImmunity.ts + 4 挂载入口 | probe-condition-immunity.cjs 26 |
| 多重攻击解析漏斗（特质 204 / 结构化 199） | 完成（剩 5 条非机械） | scripts/parse-monsters.mjs parseMultiattack | probe-seed-query.cjs 33 |
| 吐息武器豁免自动化 | 完成 | Combatant.breathWeapon + CombatantInfoPanel + CombatSession | probe-breath-weapon.cjs 14 |
| 再生回合开始自动回血 | 待办 | 回合推进 | — |

## 已决策

- 免疫拦截做在调用点（applyEffect 无 combatant 上下文，statusManager 不 import combatStore）
- 已接入口：StatusAttachPanel（手动）、attackRiders.applyStatusWithTodo（攻击附加）、featureChannelRunner（特性状态）、CombatSession.onFlowResolved（法术流程）
- 未拦截：自伤类状态（dodging/hidden/disengaging/incapacitated），5e 无对应免疫
- 条件名归一：受擒→擒抱、恐慌/惊恐→恐惧；种子允许别名写法，运行时归一再比对
- 数据缺陷即修：罪魔「毒素」→「中毒」、还魂鬼「惊恐」→「恐惧」、虎人/狼人「中形」→「中型」
- 多重攻击解析：去拉丁种名后匹配；泛化「N 次攻击」产出 {count, name:'攻击'}（引擎 resolveMultiattackStep 失配 → 每击任选武器）；含「形态」的文本只取通用击数，具名多形态配方不猜
- 语义不可机械翻译的 5 条不强凑配方（避免误导 DM）
- 吐息武器：不新增特性注册表，面板直出按钮 → 用模板字段合成 aoe_save 能力（dc/豁免/骰/半伤），复用 FeatureAoeSaveModal（descriptionOverride 传 shape 文本）
- 仅「有伤害骰 + 形状可解析」的 45 条出按钮；无形状 5 条、纯效果型 25 条留手动
- aoeShapes 线状正则兼容「60尺长5尺宽」与「长60尺宽5尺」两种图鉴语序

## 下一步

1. 再生：回合开始自动回血（写 HP + 提示）
2. 纯效果型吐息（睡眠/斥力/迟缓/麻痹等 25 条无伤害骰）仍手动：可扩展为 failed-save 挂状态
3. 多重攻击剩余 5 条留 DM：多头蛇（头数动态）、木乃伊/木乃伊领主/蕈人王（状态+单次攻击）、熊人（多形态不同武器）

## 验证命令

```bash
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit && npm run build
QUIET=1 node scripts/probes/probe-condition-immunity.cjs
QUIET=1 node scripts/probes/probe-multiattack-sequence.cjs
QUIET=1 node scripts/probes/probe-monster-attack-classify.cjs
```
