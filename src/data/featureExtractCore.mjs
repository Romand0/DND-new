// 特性描述提取核心（feature-fullcycle P2）。单一实现，两处消费：
//  - FeatureExtractorModal（UI 单项：命中高亮 + 表单预填 + 低置信标记）
//  - scripts/extract-features-batch.mjs（批量跑种子 → phb2014.json + 逐条报告）
// 口径：正则针对 PHB2014 种子中文文本（全角＋×混排）；置信度低于 0.6 或结构不可表达
//       的候选标记 manual=true，禁止静默填默认值（决策 5：提取器无静默默认）。
// 渠道白名单随 P3/P4 引擎扩展逐步扩充；白名单外候选只给「建议渠道」标注供后续阶段立项。

const ABILITY_ZH = {
  力量: 'strength', 敏捷: 'dexterity', 体质: 'constitution', 智力: 'intelligence', 感知: 'wisdom', 魅力: 'charisma',
};

const CONV_TARGET_ZH = [
  { re: /撤离|Disengage/i, value: 'disengage' },
  { re: /疾走|Dash/i, value: 'dash' },
  { re: /躲藏|Hide/i, value: 'hide' },
];

const CHANNEL_HINTS = {
  // 渠道预推荐触发词（白名单内 → guess；白名单外 → suggest）
  heal: /恢复生命值|恢复.{0,20}点生命|临时生命/,
  resource_conv: /额外的动作|附赠动作可用以执行|附赠动作来执行|代替执行一次动作|代替你的动作/,
};

// 白名单外建议渠道（P3/P4 素材分类，仅报告标注）
const SUGGEST_CHANNEL = [
  { re: /对抗.*的豁免时具有优势|豁免时具有优势/, channel: 'save_advantage', stage: 'P4 被动扩容' },
  { re: /伤害的抗性|伤害免疫|抵抗.*伤害/, channel: 'damage_affinity', stage: 'P4 被动扩容' },
  { re: /检定.*优势|攻击.*优势|具有优势/, channel: 'advantage', stage: 'P3 白名单扩展' },
  { re: /加到.*检定|骰.*并加到|激励骰|卓越骰/, channel: 'check_modifier', stage: 'P3 白名单扩展' },
  { re: /当你命中时|命中目标时/, channel: 'attack_rider', stage: 'P3 白名单扩展' },
  { re: /反应|当你被|当你可见/, channel: 'reaction', stage: 'P5 反应数据面' },
  { re: /每回合.*只能|进行一次攻击|额外攻击/, channel: 'attack_extra', stage: 'P3 白名单扩展' },
];

function mkHit(field, text, label) {
  return { field, text, label };
}

/** clause 定位：原文 match 拿 index（UI 高亮 mark 用） */
function locate(text, re) {
  const m = text.match(re);
  return m ? { text: m[0].trim(), start: m.index } : null;
}

/** 恢复量子句截取：从首个触发词起 40 字窗口（限骰式/系数扫描范围，避免误配无关骰式） */
function healClause(text) {
  const m = text.match(/[^。；]{0,18}(?:恢复生命值|恢复.{0,20}点生命|获得.{0,12}点?临时生命)[^。；]{0,40}/);
  return m ? m[0] : null;
}

/** heal 渠道候选提取 */
function extractHeal(name, text) {
  const hl = locate(text, /[^。；]{0,18}(?:恢复生命值|恢复.{0,20}点生命|获得.{0,12}点?临时生命)[^。；]{0,40}/);
  const clause = healClause(text);
  if (clause == null) return null;
  const isTemp = /临时生命/.test(clause);
  const hits = [mkHit('trigger', clause.trim().slice(0, 24), isTemp ? '临时生命恢复' : '生命值恢复')];
  // 形态判别（先于数值提取）：heal 渠道只收「玩家主动发动」的战斗内恢复
  //  a) 回合开始自动触发（上古斗士型）→ 持续效果通道，heal 主动发动语义不匹配
  if (/回合开始时.{0,8}(恢复|获得)/.test(text)) {
    return { highlight: hl, channel: 'heal', spec: {}, hits, confidence: 0.3, manual: true, manualReason: '自动触发型恢复（回合开始），heal 主动发动渠道不匹配；建议持续效果/TurnTodo 通道' };
  }
  //  b) 休整期恢复（短休/长休语境 + 生命骰机制，无动作成本）→ 非战斗内
  const restOnly = /短休|长休/.test(clause) && !/用.{0,6}动作|以一个动作|触碰/.test(clause);
  if (restOnly) {
    return { highlight: hl, channel: 'heal', spec: {}, hits, confidence: 0.3, manual: true, manualReason: '休整期恢复加成（依赖生命骰/休息流程），非战斗内主动 heal；需人工确认' };
  }
  const spec = { type: isTemp ? 'temp' : 'hp' };
  // 骰式（1d10 等）
  const dice = clause.match(/(\d+d\d+)/);
  if (dice) {
    spec.dice = dice[1];
    hits.push(mkHit('dice', dice[1], '恢复骰'));
  }
  // 等级系数：「你的战士职业等级」→ levelAttr 战士等级 factor 1
  const lvl = clause.match(/你的([\u4e00-\u9fa5]{1,4}?)(?:职业)?等级/);
  if (lvl) {
    spec.levelAttr = `${lvl[1]}等级`;
    spec.levelFactor = 1;
    hits.push(mkHit('levelFactor', lvl[0], '等级系数'));
  }
  // 固定值：「恢复X点生命」（纯数字型）
  const flat = clause.match(/恢复(\d+)点生命/);
  if (flat && dice == null) {
    spec.flat = parseInt(flat[1], 10);
    hits.push(mkHit('flat', flat[0], '固定恢复'));
  }
  // 池分配型（圣疗）：「等级×N」总量池语义，固定数值 spec 不可表达 → 人工
  if (/等级\s*[×x✕]\s*\d+/.test(clause) || /能量池/.test(clause)) {
    return { highlight: hl, channel: 'heal', spec, hits, confidence: 0.3, manual: true, manualReason: '池分配型治疗（总量 = 等级×N 池内自选），heal 固定数值 spec 不可表达；建议 P3 扩展 poolDrain 子型或人工改配' };
  }
  // 资源消耗型（战斗荒野变形）：「消耗一个法术位…每环阶 1d8」，治疗量随环阶缩放，HealSpec 缺环阶系数 → 人工
  if (/消耗.{0,6}法术位|法术位.{0,12}恢复/.test(clause)) {
    return { highlight: hl, channel: 'heal', spec, hits, confidence: 0.3, manual: true, manualReason: '资源消耗型治疗（消耗法术位，治疗量随环阶缩放），HealSpec 缺环阶系数；建议 P3 扩展 slotCost 子型或人工改配' };
  }
  const hasValue = spec.dice != null || spec.flat != null || spec.levelFactor != null;
  if (!hasValue) {
    return { highlight: hl, channel: 'heal', spec, hits, confidence: 0.4, manual: true, manualReason: '命中恢复触发词但无数值成分（骰式/固定/系数全缺），需人工补录' };
  }
  // 主动 heal 判别：恢复子句需含动作成本语境（用X动作/以一个动作），否则降置信人工
  if (!/用.{0,6}动作|以一个动作|触碰/.test(clause)) {
    return { highlight: hl, channel: 'heal', spec, hits, confidence: 0.5, manual: true, manualReason: '命中恢复与数值但缺动作成本语境，疑似非主动发动；需人工确认' };
  }
  return { highlight: hl, channel: 'heal', spec, hits, confidence: 0.9, manual: false, manualReason: null };
}

/** resource_conv 渠道候选提取（convert / grants 两形态） */
function extractConv(name, text) {
  // grants 型：「执行一个额外的动作」（动作如潮）
  if (/执行一个额外的动作/.test(text)) {
    const hl = locate(text, /[^。；]{0,18}执行一个额外的动作[^。；]{0,10}/);
    const hits = [mkHit('grants', text.match(/[^。；]{0,18}执行一个额外的动作[^。；]{0,10}/)?.[0]?.trim() ?? '执行一个额外的动作', '额外动作')];
    return { highlight: hl, channel: 'resource_conv', spec: { grants: [{ extraAction: true }] }, hits, confidence: 0.9, manual: false, manualReason: null };
  }
  // convert 型：「附赠动作可用以执行…其中之一」（灵巧动作）
  const convClause = text.match(/[^。；]{0,20}附赠动作[^。；]{0,50}/);
  if (convClause == null) return null;
  const clause = convClause[0];
  const hl = { text: clause.trim(), start: convClause.index };
  const hits = [mkHit('trigger', clause.trim().slice(0, 30), '附赠动作转换')];
  // 转换主体是第三方（野兽伴侣指令等）→ 自身动作项转换语义不匹配
  if (/命令.{0,8}野兽|让.{0,8}野兽|该野兽/.test(clause)) {
    return { highlight: hl, channel: 'resource_conv', spec: {}, hits, confidence: 0.4, manual: true, manualReason: '转换主体是第三方（野兽伴侣指令），非自身动作项；需人工确认' };
  }
  const to = [];
  for (const t of CONV_TARGET_ZH) {
    if (t.re.test(clause)) to.push(t.value);
  }
  if (to.length === 0) return null;
  for (const t of CONV_TARGET_ZH) {
    const m = clause.match(t.re);
    if (m) hits.push(mkHit('to', m[0], `转换目标 ${t.value}`));
  }
  const fromBonus = /附赠动作/.test(clause);
  return {
    highlight: hl,
    channel: 'resource_conv',
    spec: { convert: { from: fromBonus ? 'bonus' : 'action', to } },
    hits, confidence: 0.9, manual: false, manualReason: null,
  };
}

/**
 * 提取入口：特性名 + 描述文本 → 渠道预推荐 + 候选草案清单。
 * candidates 至多一条白名单内草案（heal / resource_conv 互斥触发）；suggest 供报告分类。
 */
export function extractFeature(name, text) {
  const src = typeof text === 'string' ? text : '';
  const candidates = [];
  const heal = extractHeal(name, src);
  if (heal) candidates.push(heal);
  const conv = extractConv(name, src);
  if (conv) candidates.push(conv);
  // 渠道预推荐：优先白名单内草案，其次白名单外建议
  let guess = null;
  if (candidates.length > 0) {
    const best = candidates.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    guess = { channel: best.channel, reason: `描述命中 ${best.channel} 触发词` };
  } else {
    for (const s of SUGGEST_CHANNEL) {
      if (s.re.test(src)) {
        guess = { channel: s.channel, reason: `白名单外：建议渠道 ${s.channel}（${s.stage}）` };
        break;
      }
    }
  }
  return { name, textLength: src.length, guess, candidates };
}

/** 批量口径：已注册名清单（真相源 = featureCapabilities.ts REGISTRY，此处同步维护） */
export const REGISTRY_NAMES = ['诗人激励', '吐息武器', '狂暴', '鲁莽攻击', '至圣斩', '震慑拳'];

/** spec 渠道白名单（与 featureSpecSchema.mjs SPEC_CHANNELS 同步） */
export const SPEC_CHANNEL_SET = new Set(['heal', 'resource_conv']);
