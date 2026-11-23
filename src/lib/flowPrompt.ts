// FlowScript AI 生成器的 prompt 资产层。
// 设计原则：prompt 与校验器同源——节点目录与配置字段从 NODE_TYPE_REGISTRY /
// NODE_CONFIG_SCHEMA 程序化生成，代码新增节点或字段后 prompt 自动跟上；
// 仅语义规则（形态三态、硬性规则）以常量维护，与 SKILL.md 配方保持人工同步。

import type { ConfigFieldSchema, FlowNodeType } from '../types/flow';
import { NODE_CONFIG_SCHEMA, NODE_TYPE_REGISTRY } from '../types/flow';

/** 法术生成输入：描述原文尽量用玩家书原文或已提炼的机制文本 */
export interface SpellPromptInput {
  name: string;
  /** 环位描述，如「3 环」「戏法」 */
  level?: string;
  /** 法术机制描述（施法时间/射程/成分/判定/结果） */
  text: string;
}

const FIELD_TYPE_LABEL: Record<ConfigFieldSchema['type'], string> = {
  select: 'select',
  number: 'number',
  text: 'string',
  dice: '骰式如 8d6',
  template: 'string',
  boolean: 'boolean',
  object: 'object',
  array: 'object[]',
  spellPicker: 'string',
};

function renderField(field: ConfigFieldSchema, depth: number): string {
  if (field.hidden) return '';
  const indent = '  '.repeat(depth);
  const typeText = FIELD_TYPE_LABEL[field.type] ?? field.type;
  const opts = field.type === 'select' && field.options?.length
    ? `: ${field.options.map(o => o.value).join('|')}`
    : '';
  const parts: string[] = [];
  if (field.required) parts.push('必填');
  if (field.allowEmpty) parts.push('可留空');
  const reqText = parts.length ? `（${parts.join('、')}）` : '';
  let line = `${indent}- ${field.key}${reqText}，${typeText}${opts}`;
  const notes: string[] = [field.label];
  if (field.description) notes.push(field.description);
  if (field.allowEmpty && field.placeholder) notes.push(field.placeholder);
  if (field.visibleWhen?.key != null) {
    const cond = field.visibleWhen;
    const op = cond.equals !== undefined ? `=${JSON.stringify(cond.equals)}`
      : cond.in ? `∈${JSON.stringify(cond.in)}`
      : cond.truthy ? '为真' : '';
    if (op) notes.push(`仅当 ${cond.key}${op} 时填写`);
  }
  // 默认值只对布尔/对象类展示——文本/select/骰式字段的默认值会诱导模型
  // 抄模板而非从法术文本推导（如 condition 抄成 target.currentHp <= 100）
  if (field.defaultValue !== undefined && field.defaultValue !== null
    && (field.type === 'boolean' || field.type === 'object')) {
    notes.push(`默认 ${JSON.stringify(field.defaultValue)}`);
  }
  line += `（${notes.join('；')}）`;
  const childLines = field.children
    ?.map(c => renderField(c, depth + 1))
    .filter(Boolean)
    .join('\n');
  return childLines ? `${line}\n${childLines}` : line;
}

/** 节点配置文档：无字段类型标注「可省略」，让模型少产垃圾键 */
function renderNodeConfig(nodeType: FlowNodeType): string {
  const fields = NODE_CONFIG_SCHEMA[nodeType] ?? [];
  if (!fields.length) return `${nodeType}: 无配置字段，config 可省略。`;
  const lines = fields.map(f => renderField(f, 0)).filter(Boolean);
  return `${nodeType}:\n${lines.join('\n')}`;
}

function buildNodeCatalog(): string {
  const registryLines = NODE_TYPE_REGISTRY.map(n => `- ${n.type}（${n.label}）：${n.description}`);
  const configLines = NODE_TYPE_REGISTRY.map(n => renderNodeConfig(n.type));
  return [
    '== 节点目录（nodeType 可选值与语义）==',
    registryLines.join('\n'),
    '',
    '== 各节点 config 字段 ==',
    configLines.join('\n'),
  ].join('\n');
}

const SEMANTIC_RULES = `== 块形态语义分层（核心规则，不可照搬 if/else 逻辑树）==
- 检定块（saving_throw / attack_roll）默认堆叠：检定结果是沿链传递的信号，由下游效果节点自行消化。
- apply_effect 的 halfDamageOnSave: true 表示「豁免成功时伤害减半」在效果节点内消化——半伤场景用它，不拆分支。
- scaled_effect 恒为堆叠：等级/环位分档是块内取值逻辑（tiers 分档表或 baseLevel/baseDice/perLevelDice 公式），禁止用分支链拆档位。
- condition_branch 是唯一的控制分流原语，恒为 if 块且必须带 condition 字段。
- custom 节点禁用（运行时 eval，仅限人工维护）。`;

const FORM_RULES = `== 分支形态三态 ==
| 形态 | 写法 | 用途 |
| 堆叠 step | {"kind":"step",...} | 默认；结果信号沿链传递，下游消化 |
| 单分支 detour | {"kind":"if",...,"form":"detour","onTrue":[...],"onFalse":[]} | 满足才有特殊效果、未满足正常向下（大路+小路拐回大路），最常见 |
| 双分支 ifelse | {"kind":"if",...,"onTrue":[...],"onFalse":[...]}（无 form 字段） | 两个结果都要走不同效果链 |

- if 块可用检定类型（saving_throw/attack_roll：onTrue=通过/命中体、onFalse=未通过/未命中体，无需 condition）或 condition_branch（必须带 condition 表达式，如 "target.hp <= 20"）。
- detour 编译语义与「双分支且否则体为空」一致：满足体走完汇合回主链，未满足直接向下。`;

const HARD_RULES = `== 硬性规则（违反即校验失败）==
- script.hat 恰好一个帽子块（cast_start），body 内不得出现 cast_start；末尾放 cast_end 收尾。
- 块 id 全局唯一且 snake_case 表意（save_dex、damage_fire、scaled_dmg）。
- 每个块一个机制原子；优先堆叠，仅真实分流才用 if 块。
- 分支体允许空数组，但 onTrue/onFalse 字段必须存在；form:"detour" 时 onFalse 恒为 []。
- 检定块的 if 形态不带 condition；condition_branch 必须带简单比较表达式。
- 循环/回流无法表达；on_partial 无对应分支——半伤用 halfDamageOnSave。
- 各字段取值（含 effectType 全部可选值）以节点目录为准；伤害与治疗的 value 用骰式（8d6、3d8+5），无骰式的效果类型按目录说明省略 value。
- 持续/专注法术在堆叠尾部加 concentration_check 堆叠块。
- 输出中省略不相关字段；非必填且无值时直接省略键。`;

const OUTPUT_FORMAT = `== 输出格式 ==
仅输出一个 JSON 对象：无 markdown 代码围栏、无解释文字。结构：
{"hat":{"kind":"hat","id":"cast_start","label":"开始施法","config":{"autoChecks":{"components":true,"range":true,"time":true}}},"body":[<块数组，数组顺序即执行顺序>]}`;

const FEW_SHOT = `== 示例 1：火球术（线性直伤+敏捷豁免——堆叠信号传递，半伤留在效果节点）==
{"hat":{"kind":"hat","id":"cast_start","label":"开始施法","config":{"autoChecks":{"components":true,"range":true,"time":true}}},"body":[{"kind":"step","nodeType":"select_target","id":"select_target","label":"选择目标","config":{"mode":"single","maxCount":1}},{"kind":"step","nodeType":"saving_throw","id":"save_dex","label":"敏捷豁免","config":{"ability":"dexterity","dc":""}},{"kind":"step","nodeType":"apply_effect","id":"damage_fire","label":"火焰伤害","config":{"effectType":"damage","value":"8d6","damageType":"fire","halfDamageOnSave":true}},{"kind":"step","nodeType":"cast_end","id":"cast_end","label":"施法结束"}]}

== 示例 2：濒空加伤（单分支 detour——满足走小路汇合回主链）==
body 片段：{"kind":"if","nodeType":"condition_branch","id":"low_hp_bonus","label":"濒空加伤","form":"detour","condition":"target.hp <= 20","onTrue":[{"kind":"step","nodeType":"apply_effect","id":"bonus_damage","label":"额外伤害","config":{"effectType":"damage","value":"2d6","damageType":"necrotic"}}],"onFalse":[]}`;

/** 系统提示词：节点目录与配置字段同源于代码常量，语义规则为人工配方 */
export function buildSystemPrompt(): string {
  return [
    '你是 D&D 5e 战斗流程积木语言的法术流程生成器。任务：阅读法术描述，产出可直接通过结构校验的脚本树 JSON（FlowScript）。',
    '',
    OUTPUT_FORMAT,
    '',
    SEMANTIC_RULES,
    '',
    FORM_RULES,
    '',
    HARD_RULES,
    '',
    buildNodeCatalog(),
    '',
    FEW_SHOT,
  ].join('\n');
}

/** 用户提示词：单条法术 → 生成请求 */
export function buildUserPrompt(spell: SpellPromptInput): string {
  const lines = [
    `请为以下法术生成脚本树 JSON。`,
    '',
    `法术名：${spell.name}`,
  ];
  if (spell.level) lines.push(`环位：${spell.level}`);
  lines.push('描述：', spell.text);
  return lines.join('\n');
}
