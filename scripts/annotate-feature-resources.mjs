// 主动技能资源标注脚本（active-skills-engine P1）
// 写目标：public/seed/玩家手册2014/角色选项/{种族,职业,背景}.json 的 traits
// 标注四类：POOL_OWNERS（池主+公式）/ POOL_MEMBERS（成员+显式池引用）/ TOGGLES（状态切换）
//          其余 role='active' 条目默认 manual + activation 文本派生
// 退出约束：1) 显式映射覆盖校验（成员池主必须存在） 2) 成员 cost 与文本「消耗N点气」比对
//          3) 全部 role='active' 条目 100% 获得标注（显式或默认），漏标即 exit 1
import fs from 'node:fs';

const DIR = 'public/seed/玩家手册2014/角色选项/';
const FILES = ['种族.json', '职业.json', '背景.json'];

// 池主显式映射（公式与恢复时机按 PHB2014 文本核实；restKind short = 短休恢复，long = 长休恢复）
const POOL_OWNERS = {
  吐息武器: { activation: 'action', formula: { type: 'fixed', value: 1, restKind: 'short' } },
  诗人激励: { activation: 'bonus', formula: { type: 'abilityMod', ability: 'charisma', floor: 1, restKind: 'long' } },
  引导神力: { activation: 'free', formula: { type: 'levelTiers', tiers: [{ min: 1, value: 1 }, { min: 6, value: 2 }, { min: 18, value: 3 }], restKind: 'short' } },
  神圣干预: { activation: 'action', formula: { type: 'fixed', value: 1, restKind: 'long' } },
  荒野变形: { activation: 'action', formula: { type: 'fixed', value: 2, restKind: 'short' } },
  回气: { activation: 'bonus', formula: { type: 'fixed', value: 1, restKind: 'short' } },
  动作如潮: { activation: 'free', formula: { type: 'levelTiers', tiers: [{ min: 1, value: 1 }, { min: 17, value: 2 }], restKind: 'short' } },
  卓越战技: { activation: 'free', formula: { type: 'levelTiers', tiers: [{ min: 3, value: 4 }, { min: 7, value: 5 }, { min: 15, value: 6 }], restKind: 'short' } },
  气: { activation: 'free', formula: { type: 'classLevel', multiplier: 1, restKind: 'short' } },
  圣疗: { activation: 'action', formula: { type: 'classLevel', multiplier: 5, restKind: 'long' } },
  神圣感知: { activation: 'action', formula: { type: 'abilityMod', ability: 'charisma', plus: 1, restKind: 'long' } },
  净化之触: { activation: 'action', formula: { type: 'abilityMod', ability: 'charisma', floor: 1, restKind: 'long' } },
  混元体: { activation: 'action', formula: { type: 'fixed', value: 1, restKind: 'long' } },
  // 职业级覆盖：圣武士誓言引导神力次数表与牧师不同（PHB2014 圣武士固定 1 次/短休），按「名@职业」优先匹配
  '引导神力@圣武士': { activation: 'free', formula: { type: 'fixed', value: 1, restKind: 'short' } },
};

// 池成员显式映射（武僧宗派成员无 system 链接，显式 pool 引用气；cost 与文本核对）
const POOL_MEMBERS = {
  震慑拳: { activation: 'free', pool: '气', cost: 1 },
  空灵体: { activation: 'action', pool: '气', cost: 4 },
  渗透劲: { activation: 'free', pool: '气', cost: 3 },
  暗影技艺: { activation: 'action', pool: '气', cost: 2 },
};

// 状态切换（无池消耗，效果走状态引擎）
const TOGGLES = {
  狂暴: { activation: 'bonus' },
  鲁莽攻击: { activation: 'free' },
};

// D 类反应声明（FeatureReaction 同口径：trigger/resolution/scope/prompt；slotLevel 缺省不耗环）。
// 只声明「何时能反应、用哪种解决方式」，具体效果由 DM 按既有流程结算。
// trigger 枚举：move_leave_reach/enter_reach/attack_targeted/ally_attacked/damage_taken/spell_cast
// resolution 枚举：attack/spell/status/damage_modifier/movement
// 注意：damage_taken 触发面在战斗伤害结算前插桩（P3 窗口），声明先行不阻断。
const REACTIONS = {
  直觉闪避: { trigger: 'attack_targeted', scope: 'self', resolution: 'damage_modifier', prompt: '攻击命中你时，可用反应使此次伤害减半（消耗反应）' },
  拨挡飞弹: { trigger: 'attack_targeted', scope: 'self', resolution: 'damage_modifier', prompt: '被远程武器攻击命中时，可用反应减伤 1d10＋敏捷调整值＋武僧职业等级（减至 0 可耗 1 气接住飞弹反击）' },
  轻身坠: { trigger: 'damage_taken', scope: 'self', resolution: 'damage_modifier', prompt: '承受坠地伤害时，可用反应减少 5×武僧职业等级的伤害' },
};

const REACTION_TRIGGERS = new Set(['move_leave_reach', 'enter_reach', 'attack_targeted', 'ally_attacked', 'damage_taken', 'spell_cast']);
const REACTION_RESOLUTIONS = new Set(['attack', 'spell', 'status', 'damage_modifier', 'movement']);

// activation 文本派生（manual 兜底用）：附赠动作 → bonus > 反应 → reaction > 动作 → action > free
function deriveActivation(text) {
  if (/附赠动作/.test(text)) return 'bonus';
  if (/反应/.test(text)) return 'reaction';
  if (/一个动作|用动作|用你的动作|使用动作/.test(text)) return 'action';
  return 'free';
}

const errors = [];
const warnings = [];

// 先收集全部条目（main + subclass），供成员池主存在性校验；单次读取，写回同一份对象
const fileData = new Map();
const allTraits = [];
for (const file of FILES) {
  const path = DIR + file;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  fileData.set(file, data);
  for (const opt of data) {
    for (const t of opt.traits || []) allTraits.push({ file, opt, t, scope: opt.name });
    for (const sc of opt.subclasses || []) {
      for (const t of sc.traits || []) allTraits.push({ file, opt, t, scope: `${opt.name}·${sc.name}` });
    }
  }
}
const allNames = new Set(allTraits.map(({ t }) => t.name));
const ownerNames = new Set(Object.keys(POOL_OWNERS));

// 分类统计
let explicitCount = 0;
let manualCount = 0;
let activeCount = 0;
let reactionCount = 0;

for (const { file, opt, t, scope } of allTraits) {
  const isActive = t.role === 'active';
  const className = scope.split('·')[0];
  const owner = POOL_OWNERS[`${t.name}@${className}`] || POOL_OWNERS[t.name];
  const member = POOL_MEMBERS[t.name];
  const toggle = TOGGLES[t.name];
  const isExplicit = isActive || owner || member || toggle;

  // 100% 覆盖约束的参与集：role='active' 或进入任一显式映射
  if (isExplicit) activeCount++;
  else continue;

  // 反应声明：独立于资源分类的附加标注（映射条目无论落在哪个桶都补 reaction 字段）
  const rx = REACTIONS[t.name];
  if (rx) {
    if (!REACTION_TRIGGERS.has(rx.trigger)) {
      errors.push(`[${scope}] 反应声明「${t.name}」trigger 非法：${rx.trigger}`);
      continue;
    }
    if (rx.resolution && !REACTION_RESOLUTIONS.has(rx.resolution)) {
      errors.push(`[${scope}] 反应声明「${t.name}」resolution 非法：${rx.resolution}`);
      continue;
    }
    if (t.activation && t.activation !== 'reaction') {
      warnings.push(`[${scope}] 反应声明「${t.name}」activation=${t.activation}（反应类特性通常为 reaction）`);
    }
    t.reaction = { trigger: rx.trigger, resolution: rx.resolution, scope: rx.scope, prompt: rx.prompt };
    reactionCount++;
  }

  if (owner) {
    // 池主：校验恢复时机文本证据（短休或长休的条目文本必有「休息/短休/长休」字样，卓越战技等漏写条目仅警告）
    const restEvidence = /短休|长休|休息/.test(t.text);
    if (!restEvidence) warnings.push(`[${scope}] 池主「${t.name}」文本无休息恢复证据，restKind=${owner.formula.restKind} 请人工复核`);
    t.role = 'active';
    t.activation = owner.activation;
    t.resource = 'pool';
    t.poolFormula = owner.formula;
    explicitCount++;
  } else if (member) {
    // 成员：池主必须存在 + cost 与文本「消耗N点X」比对
    if (!allNames.has(member.pool) || !ownerNames.has(member.pool)) {
      errors.push(`[${scope}] 成员「${t.name}」引用的池主「${member.pool}」不存在`);
      continue;
    }
    const m = t.text.match(/消耗(\d+)点/);
    if (m && parseInt(m[1], 10) !== member.cost) {
      errors.push(`[${scope}] 成员「${t.name}」cost=${member.cost} 与文本消耗${m[1]}点不一致`);
      continue;
    }
    if (!m) warnings.push(`[${scope}] 成员「${t.name}」文本未匹配到「消耗N点」句式，cost=${member.cost} 按映射表保留`);
    t.role = 'active';
    t.activation = member.activation;
    t.resource = 'pool';
    t.pool = member.pool;
    t.cost = member.cost;
    explicitCount++;
  } else if (toggle) {
    t.role = 'active';
    t.activation = toggle.activation;
    t.resource = 'toggle';
    explicitCount++;
  } else {
    // 默认 manual：activation 从文本派生
    t.activation = deriveActivation(t.text);
    t.resource = 'manual';
    manualCount++;
  }
}

// 池成员全部清点（防映射表遗漏新的气成员）
for (const { t, scope } of allTraits) {
  if (t.name === '气') continue;
  if (/\d+点气/.test(t.text) && !POOL_MEMBERS[t.name] && !POOL_OWNERS[t.name]) {
    warnings.push(`[${scope}] 「${t.name}」文本含「N点气」消耗但未在 POOL_MEMBERS 映射中`);
  }
}

if (errors.length > 0) {
  console.error('标注失败：');
  for (const e of errors) console.error('  ERROR: ' + e);
  process.exit(1);
}

// 校验通过后写回（写回的就是参与分类的同一份数据）
for (const file of FILES) {
  const path = DIR + file;
  fs.writeFileSync(path, JSON.stringify(fileData.get(file), null, 2) + '\n');
}

console.log(`标注完成：显式 ${explicitCount}（池主/成员/切换）+ 默认 manual ${manualCount}，共 ${activeCount} 条；反应声明 ${reactionCount} 条`);
for (const w of warnings) console.log('  WARN: ' + w);
