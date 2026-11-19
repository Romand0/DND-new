// P4 被动名单正式口径统计：种子 traits → role 分类 → A1-A7 渠道猜测 → 已接入标记
// 产出 .monkeycode/specs/skill-fullcycle-engine/p4-passive-roster.json（逐名清单，接入防漏）。
// role 正则副本自 src/data/featureRole.ts（deriveFeatureRole），种子 role 显式值优先。
// 渠道猜测正则 = featureExtractCore.mjs SUGGEST_CHANNEL + P4 专属补充（无甲AC/速度/黑暗视觉/先攻/被动检定）。
// 用法：node scripts/passive-roster.mjs [--stdout]
import fs from "fs";
import path from "path";

const SEED_DIR = path.resolve(process.cwd(), 'public', 'seed', '玩家手册2014', '角色选项');
const OUT = path.resolve(process.cwd(), '.monkeycode', 'specs', 'skill-fullcycle-engine', 'p4-passive-roster.json');

const PROFILE_ROLE_NAME_RE = /年龄|阵营|体型|速度|语言/;
const STAT_ROLE_NAME_RE = /属性值|属性加成|熟练|专精|装备|护甲|武器|工具/;
const STAT_ROLE_DESC_RE = /熟练|专精|装备|护甲|武器|工具/;
const PROFILE_ROLE_DESC_RE = /通用语/;
const ACTIVE_ROLE_NAME_RE = /激励|战技|卓越骰|骰池|充能|每回合|每日|次数|决定|动作|附赠动作|反应/;
const ACTIVE_DESC_RE = /附赠动作|反应|一个动作|用你的动作|额外动作/;

function deriveRole(name, text, explicit) {
  if (explicit) return explicit;
  const desc = text || '';
  if (PROFILE_ROLE_NAME_RE.test(name)) return 'profile';
  if (ACTIVE_ROLE_NAME_RE.test(name)) return 'active';
  if (STAT_ROLE_NAME_RE.test(name) || STAT_ROLE_DESC_RE.test(desc)) return 'stat';
  if (PROFILE_ROLE_DESC_RE.test(desc)) return 'profile';
  if (ACTIVE_DESC_RE.test(desc)) return 'active';
  return 'passive';
}

const CHANNEL_GUESS = [
  { re: /对抗.*的豁免时具有优势|豁免时具有优势/, channel: 'save_advantage' },
  { re: /伤害的抗性|伤害免疫|抵抗.*伤害|免疫.*伤害/, channel: 'damage_affinity' },
  { re: /无甲防御|护甲等级.*等于|AC\s*=?\s*10\s*\+/, channel: 'unarmored_ac' },
  { re: /速度增加|速度提升|移动速度|\+10尺|\+15尺|\+20尺|尺\.?$|额外.*尺/, channel: 'speed_mod' },
  { re: /黑暗视觉/, channel: 'darkvision' },
  { re: /先攻/, channel: 'initiative_adv' },
  { re: /被动.*感知|被动.*调查|被动.*洞察|被动检定/, channel: 'passive_check' },
  { re: /检定.*优势|攻击.*优势|具有优势/, channel: 'advantage' },
  { re: /加到.*检定|骰.*并加到|激励骰|卓越骰/, channel: 'check_modifier' },
  { re: /当你命中时|命中目标时/, channel: 'attack_rider' },
  { re: /反应|当你被|当你可见/, channel: 'reaction' },
  { re: /每回合.*只能|进行一次攻击|额外攻击/, channel: 'attack_extra' },
];

// passiveCombatRules.ts 已接入 20 名（P4 前基线）
const COVERED = new Set(['矮人体魄','勇气','勇敢','妖精血统','侏儒狡黠','险境感知','魔法抗性','守护灵光','勇气灵光','炎狱抗性','伤害抗性','百病不侵','自然之护','无甲防御','龙族体魄','快速移动','无甲移动','观察者','增强黑暗视觉','黑暗视觉','野性直觉']);

const files = ['种族.json', '职业.json', '背景.json'];
const byName = new Map();
for (const f of files) {
  const list = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), 'utf8'));
  const walk = (options, src) => {
    for (const o of options) {
      const traitArrs = [o.traits, o.features, o.entry?.feature, ...(o.subclasses || []).flatMap(s => [s.traits, s.features])];
      for (const t of traitArrs.flat().filter(Boolean)) {
        if (!t.name || !t.text) continue;
        if (!byName.has(t.name)) byName.set(t.name, { name: t.name, text: t.text, role: t.role || null, sources: [] });
        byName.get(t.name).sources.push(src + ':' + o.name);
      }
    }
  };
  walk(list, f.replace('.json', ''));
}

const roster = [...byName.values()].map(r => {
  const role = deriveRole(r.name, r.text, r.role);
  const guess = CHANNEL_GUESS.find(g => g.re.test(r.text))?.channel ?? null;
  return { name: r.name, role, guess, covered: COVERED.has(r.name), sources: r.sources.slice(0, 3), text: r.text.slice(0, 80) };
});

const by = (arr, k) => arr.reduce((m, x) => { m[x[k] ?? 'unmatched'] = (m[x[k] ?? 'unmatched'] ?? 0) + 1; return m; }, {});
const passive = roster.filter(r => r.role === 'passive');
const stat = {
  total: roster.length,
  roleDist: by(roster, 'role'),
  passiveTotal: passive.length,
  passiveCovered: passive.filter(p => p.covered).length,
  passiveGuessDist: by(passive.filter(p => !p.covered), 'guess'),
  passiveNotCovered: passive.filter(p => !p.covered).map(p => ({ name: p.name, guess: p.guess })),
};

if (process.argv.includes('--stdout')) console.log(JSON.stringify(stat, null, 2));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), stat, roster }, null, 2));
console.log(`种子 ${roster.length} 名 → passive ${stat.passiveTotal}（已接入 ${stat.passiveCovered} / 待接入 ${stat.passiveTotal - stat.passiveCovered}）→ ${path.relative(process.cwd(), OUT)}`);
