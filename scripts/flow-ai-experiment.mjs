// FlowScript AI 生成实验：调用 Workers AI REST API，验证模型对块形态语义规则的遵循度。
// 不依赖 binding，用 API Token 即可跑通（降本：实验期零基建投入）。
//
// 运行（先打包 TS 依赖再执行，见 run-flow-ai-experiment.sh）：
//   环境变量 CF_ACCOUNT_ID / CF_API_TOKEN 必填；CF_MODEL 可选，默认 @cf/qwen/qwen3-30b-a3b-fp8
//
// 断言分层：结构合法性由 validateScript 机器判定；语义忠实度（形态选择是否合理）
// 由人工按各 case 的 expect 提示核对（AGENTS.md §8.2——UI/语义链不做自动断言）。

import { buildSystemPrompt, buildUserPrompt } from '../src/lib/flowPrompt';
import { validateScript } from '../src/utils/flow-editor/validation';

const MODEL = process.env.CF_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8';
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';
const API_TOKEN = process.env.CF_API_TOKEN || '';
const MAX_ATTEMPTS = 3;

// 每 M token 的 Neurons 单价（官方定价页 2026-11；未知模型不估算）
const NEURON_TABLE = {
  '@cf/qwen/qwen3-30b-a3b-fp8': { in: 4625, out: 30475 },
  '@cf/zai-org/glm-4.7-flash': { in: 5500, out: 36400 },
  '@cf/openai/gpt-oss-20b': { in: 18182, out: 27273 },
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { in: 26668, out: 204805 },
};

// 实验用例：expect 字段供人工核对语义（不做自动断言）
const CASES = [
  {
    name: '火球术',
    level: '3 环',
    text: '1 动作，150 尺，V、S、M。你指定范围内一点，所有在该点 20 尺半径球体内的生物需进行敏捷豁免。豁免失败者受 8d6 火焰伤害，成功者伤害减半。升环：使用 4 环或更高环位施放时，每高于 3 环一环伤害多 1d6。',
    expect: '堆叠：select_target → saving_throw(dex) → apply_effect(8d6 fire, halfDamageOnSave:true) → cast_end；禁拆半伤分支',
  },
  {
    name: '魅惑人类',
    level: '1 环',
    text: '1 动作，30 尺，V、S。指定一个可见人形生物，进行感知豁免。豁免失败则被魅惑 1 分钟（untilCasterTurn 型按回合计）。被魅惑期间视施法者为友善，受到施法者或其同伴伤害后立即解除并豁免自动成功。',
    expect: 'detour 或 ifelse：失败路径 apply_effect(status, affinityKind 由机制决定, durationType)；成功路径无特殊效果（detour 则 onFalse 恒空）',
  },
  {
    name: '魔法飞弹',
    level: '1 环',
    text: '1 动作，120 尺，V、S。创造三枚光矢自动命中你可见的目标，每枚造成 1d4+1 力量伤害。使用 2 环或更高环位施放时，每高于 1 环一环多一枚光矢。自动命中，无需攻击检定。',
    expect: '堆叠：select_target → scaled_effect（公式模式：baseLevel 1 + baseDice 3d4+3 + perLevelDice 1d4+1，effectType damage, damageType force）→ cast_end；全程无检定块',
  },
  {
    name: '恶言相加',
    level: '戏法',
    text: '1 动作，60 尺，V。指定一个可见生物进行感知豁免，失败受心灵伤害且下次攻击检定带劣势（1 回合内）。伤害随施法者等级提升：1 级 1d4，5 级 2d4，11 级 3d4，17 级 4d4。豁免成功无任何效果。',
    expect: 'detour（成功无效果）：onTrue = [scaled_effect(caster_level 公式 1d4 起步) + apply_effect(check_modifier, modifierMode penalty, modifierScene attack)]；onFalse 恒空',
  },
  {
    name: '疗伤术',
    level: '2 环',
    text: '1 动作，触及，V、S。你触及的生物恢复 2d8 点生命值。施法属性修正值由 DM 决定是否附加到治疗量。',
    expect: '纯堆叠：select_target(self/single 触及) → apply_effect(healing 2d8) → cast_end；无任何分支',
  },
];

function extractJson(text) {
  const stripped = text.replace(/```(?:json)?/g, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

function estimateNeurons(model, usage) {
  const rate = NEURON_TABLE[model];
  if (!rate || !usage) return null;
  const inM = (usage.prompt_tokens || 0) / 1e6;
  const outM = (usage.completion_tokens || 0) / 1e6;
  return Math.round(inM * rate.in + outM * rate.out);
}

async function callAi(messages) {
  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: 2048 }),
    }
  );
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  if (!data.success) throw new Error(`API error: ${JSON.stringify(data.errors).slice(0, 300)}`);
  const result = data.result || {};
  const text = result.response ?? result.choices?.[0]?.message?.content ?? '';
  return { text, usage: result.usage };
}

async function runCase(syst, c) {
  const messages = [
    { role: 'system', content: syst },
    { role: 'user', content: buildUserPrompt(c) },
  ];
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
  let lastErrors = [];
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    let res;
    try {
      res = await callAi(messages);
    } catch (e) {
      return { case: c.name, ok: false, reason: `调用失败: ${e.message}`, attempts, totalUsage };
    }
    totalUsage.prompt_tokens += res.usage?.prompt_tokens || 0;
    totalUsage.completion_tokens += res.usage?.completion_tokens || 0;

    const parsed = extractJson(res.text);
    if (!parsed) {
      lastErrors = [{ type: 'parse', message: '输出无法解析为 JSON 对象' }];
      messages.push({ role: 'assistant', content: res.text });
      messages.push({ role: 'user', content: '你的输出无法解析为 JSON。请重新只输出一个 JSON 对象，无代码围栏与解释文字。' });
      continue;
    }
    const errors = validateScript(parsed);
    if (errors.length) {
      lastErrors = errors;
      messages.push({ role: 'assistant', content: res.text });
      messages.push({
        role: 'user',
        content: `校验失败，共 ${errors.length} 处：\n${errors.map(e => `- [${e.type}${e.id ? ' ' + e.id : ''}] ${e.message}`).join('\n')}\n请修正后重新输出完整 JSON。`,
      });
      continue;
    }
    return { case: c.name, ok: true, script: parsed, attempts, totalUsage };
  }
  return { case: c.name, ok: false, reason: `${MAX_ATTEMPTS} 次尝试后仍校验失败`, lastErrors, attempts, totalUsage };
}

function blockStats(script) {
  let steps = 0, ifs = 0, detours = 0;
  const walk = (blocks) => {
    for (const b of blocks || []) {
      if (b.kind === 'if') {
        ifs += 1;
        if (b.form === 'detour') detours += 1;
        walk(b.onTrue);
        walk(b.onFalse);
      } else steps += 1;
    }
  };
  walk(script.body);
  return { steps, ifs, detours };
}

async function main() {
  if (!ACCOUNT_ID || !API_TOKEN) {
    console.error('缺少 CF_ACCOUNT_ID / CF_API_TOKEN 环境变量。');
    console.error('export CF_ACCOUNT_ID=... CF_API_TOKEN=... 后重跑（Token 需 Workers AI Edit 权限）。');
    process.exit(1);
  }
  const only = process.argv.find(a => !a.startsWith('--') && a !== process.argv[1]);
  const cases = only ? CASES.filter(c => c.name.includes(only)) : CASES;
  if (!cases.length) {
    console.error(`无匹配用例: ${only}（可选: ${CASES.map(c => c.name).join(' / ')}）`);
    process.exit(1);
  }

  const syst = buildSystemPrompt();
  console.log(`模型: ${MODEL} | system prompt: ${syst.length} 字符 ≈ ${Math.round(syst.length / 3.5)} tokens | 用例: ${cases.map(c => c.name).join('、')}\n`);

  const results = [];
  for (const c of cases) {
    process.stdout.write(`── ${c.name} … `);
    const r = await runCase(syst, c);
    const neurons = estimateNeurons(MODEL, r.totalUsage);
    const tag = r.ok ? 'PASS' : 'FAIL';
    console.log(`${tag}（尝试 ${r.attempts} 次, ~${neurons ?? '?'} Neurons）`);
    if (r.ok) {
      const stats = blockStats(r.script);
      console.log(`   结构: step×${stats.steps} if×${stats.ifs}(detour×${stats.detours}) | 人工核对: ${c.expect}`);
      console.log(`   ${JSON.stringify(r.script)}`);
    } else {
      console.log(`   原因: ${r.reason}`);
      if (r.lastErrors?.length) {
        console.log(`   校验错误: ${r.lastErrors.map(e => `[${e.type}${e.id ? ' ' + e.id : ''}] ${e.message}`).join('; ')}`);
      }
    }
    console.log('');
    results.push({ ...r, expect: c.expect, neurons: neurons ?? null });
    await new Promise(res => setTimeout(res, 1500));
  }

  const pass = results.filter(r => r.ok).length;
  const totalNeurons = results.reduce((s, r) => s + (r.neurons || 0), 0);
  console.log(`汇总: ${pass}/${results.length} PASS, 累计 ~${totalNeurons} Neurons（免费额度 10000/天）`);
  const fs = await import('node:fs');
  fs.mkdirSync('/tmp/opencode', { recursive: true });
  fs.writeFileSync('/tmp/opencode/flow-ai-results.json', JSON.stringify({ model: MODEL, results }, null, 2));
  console.log('明细已写 /tmp/opencode/flow-ai-results.json');
}

main();
