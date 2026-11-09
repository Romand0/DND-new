// 解析 2014 城主指南魔法物品 → 装备库导入 JSON
// 用法: node scripts/parse-magic-items.mjs [输出路径，默认 public/magic-items-import.json]
// 数据源: /workspace/data/DND5e_chm/城主指南/宝藏/魔法物品（GBK/GB18030 编码的 Word HTML）
// 产出: EquipmentItem 兼容数组，可经「数据管理 → 从 JSON 直接导入_装备」一键导入
import { execFileSync } from 'child_process';
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = '/workspace/data/DND5e_chm/城主指南/宝藏/魔法物品';
const OUT = process.argv[2] || 'public/magic-items-import.json';

// 目录名 → 功能分类（对齐 EquipmentList.FUNC_CATEGORIES）
const CATEGORY_MAP = {
  '武器': '武器', '护甲': '护甲', '药水': '药水', '卷轴': '卷轴',
  '权杖': '法器', '法杖': '法器', '魔杖': '法器',
  '戒指': '杂物', '奇物': '杂物',
};
const CATS = '(武器|护甲|药水|戒指|权杖|卷轴|法杖|魔杖|奇物)';
// 类型行仅匹配「类别(子类)?，稀有度描述」；稀有度描述的具体归一在 parseTypeLine 内完成，
// 避免用多分组大正则（旧正则把同调读成第 8 组，实际是第 10 组，导致 130 条同调标志整批丢失）
const TYPE_FULL = new RegExp(`^${CATS}(（[^（）]*）)?，(.+)$`);

// 稀有度词：长词优先，避免「非普通」被「普通」重复命中
const RARITY_WORDS = ['多种稀有度', '非普通', '极珍稀', '普通', '珍稀', '传说', '特殊'];
function extractRarities(rest) {
  const found = [];
  let s = rest;
  for (const w of RARITY_WORDS) {
    if (s.includes(w)) { found.push(w); s = s.split(w).join(''); }
  }
  return found;
}

// 括号内「需同调」= 无先决条件；「需法师同调」= 先决条件「法师」
function parsePrereq(attGroup) {
  if (!attGroup) return null;
  const inner = attGroup.slice(2, -3); // 去掉「（需」与「同调）」
  return inner === '' ? '' : inner;
}

function decode(p) {
  return execFileSync('iconv', ['-f', 'GB18030', '-t', 'UTF-8', p], { encoding: 'utf8' });
}

function strip(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n').map(s => s.trim()).filter(Boolean)
    .filter(s => !/^(html|body|lang=|punctuation|font-family|\{|\}|xmlns|TEXT-JUSTIFY|tab-interval|FONT-SIZE|FONT-FAMILY|COLOR|FONT-WEIGHT|WORD-WRAP|mso|LAYOUT|MARGIN|PAGE-|PADDING|BORDER|BACKGROUND|TEXT-ALIGN|TEXT-INDENT|style)/i.test(s));
}

function listFiles(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(listFiles(p));
    else if (/\.html?$/i.test(name)) out.push(p);
  }
  return out;
}

function slugify(zh) {
  // 中文名作 id 基：magic-<中文名>，避免和英文装备 id 冲突
  return 'magic-' + zh.replace(/[·、，。！？：；\s()（）]/g, '');
}

// 类型行 → { type, subtype, rarity, attune, prereq }；非类型行返回 null。
// 只接受「类别(子类)?，…」且长度短、无句号的行，避免把正文/怪物数据块误判为物品。
function parseTypeLine(line) {
  if (line.length > 48 || line.includes('。')) return null;
  const m = line.match(TYPE_FULL); // ^(类别)(（子类）)?，(.+)$
  if (!m) return null;
  let rest = m[3];
  const attMatch = rest.match(/（需[^（）]*同调）/);
  const attune = !!attMatch;
  const prereq = attMatch ? parsePrereq(attMatch[0]) : null;
  if (attMatch) rest = rest.replace(attMatch[0], '');
  // 泛表条目「非普通（+1）/珍稀（+2）/极珍稀（+3）」：具体稀有度依加值而定，单条无法表达 → null
  if (/（\+\d）/.test(rest)) return { type: m[1], subtype: m[2] ? m[2].slice(1, -1) : null, rarity: null, attune, prereq };
  const rarities = extractRarities(rest);
  // 「稀有度依塑像种类而不同」类：无具体稀有度词但语义是多种 → 多种稀有度
  const rarity = rarities.length === 0
    ? (/依.*而不同/.test(rest) ? '多种稀有度' : null)
    : rarities.length === 1 ? rarities[0] : '多种稀有度';
  return { type: m[1], subtype: m[2] ? m[2].slice(1, -1) : null, rarity, attune, prereq };
}

// 单个块 HTML（已去掉开头的 <P><STRONG><FONT color=#800000>）→ 结构化条目。
// 名称 = 标题（到 </FONT> 为止）；正文 = 标题之后。以 HTML 边界切分，避免名称/描述粘行。
function parseBlockHtml(blockHtml) {
  const fontEnd = blockHtml.search(/<\/FONT>/i);
  const nameHtml = fontEnd >= 0 ? blockHtml.slice(0, fontEnd) : blockHtml;
  let bodyHtml = fontEnd >= 0 ? blockHtml.slice(fontEnd + 7) : '';
  bodyHtml = bodyHtml.replace(/^\s*<\/STRONG>/i, '');
  const nameLines = strip(nameHtml);
  const bodyLines = strip(bodyHtml);
  // 类型行在正文头部：优先直接匹配正文短行，其次匹配 <EM>…</EM>（标准格式）。
  // 不能无条件用首个 <EM>：部分条目首个 <EM> 是正文深处的法术名（如「异界之门gate」），
  // 会把真正的类型行挤掉，导致「奇物，传说」残留进 description。
  let typeIdx = -1;
  let tp = null;
  for (let i = 0; i < bodyLines.length && i < 6; i++) {
    const p = parseTypeLine(bodyLines[i]);
    if (p) { typeIdx = i; tp = p; break; }
  }
  if (!tp) {
    const emMatch = bodyHtml.match(/<EM>(.*?)<\/EM>/i);
    const emLine = emMatch ? strip(emMatch[1]).join(' ') : '';
    if (emLine) {
      const p = parseTypeLine(emLine);
      // 找到 emLine 对应的正文行下标，以便正确截断后续描述
      if (p) { tp = p; typeIdx = bodyLines.findIndex(l => l === emLine || emLine.includes(l) || l.includes(emLine)); if (typeIdx < 0) typeIdx = 0; }
    }
  }
  if (!tp) return { nameLines, type: null, desc: bodyLines };
  return {
    nameLines,
    type: tp.type,
    subtype: tp.subtype,
    rarity: tp.rarity,
    attune: tp.attune,
    prereq: tp.prereq,
    desc: bodyLines.slice(typeIdx + 1),
  };
}

// 名称行 → { zh, en }：中文名 + 英文名（可能跨 2~3 行）。
// 中文名可能含全角括号（如「吉运之石（幸运石）」），也可能以拉丁字母起头（如「X射线戒指」），
// 故以「最后一个中文字/右括号」为界切分，避免把整段英文误判进 zh 或反之。
function splitName(nameLines) {
  const joined = nameLines.join(' ').replace(/\s+/g, ' ').trim();
  if (!joined) return { zh: '', en: '' };
  // 中文名与英文名之间可能无空格（如「折叠船Folding Boat」）；以「中文/右括号 → 拉丁字母」为界切分
  const m = joined.match(/^(.*?[\u4e00-\u9fff）)])\s*([A-Za-z].*)$/);
  if (m) return { zh: m[1].trim(), en: m[2].trim() };
  return { zh: joined, en: '' };
}

// 按语境提取物品增强加值；无法确定则返回 0（宁可少提，不可污染攻击/AC）
function extractMagicBonus(desc, category) {
  if (!['武器', '护甲', '法器'].includes(category)) return 0;
  for (const sentence of desc.split(/[。\n]/)) {
    // 护甲：明确「AC…获得+N加值」，且不含条件限定（对抗/若/如果表示特定情形加成）
    if (category === '护甲' && /AC.*[+＋](\d)\s*加值/.test(sentence) && !/对抗|针对|若|如果/.test(sentence)) {
      const m = sentence.match(/AC.*?[+＋](\d)/);
      if (m) return parseInt(m[1], 10);
    }
    // 武器/法器：同一句同时出现「攻击检定」与「伤害」，且加值数值一致
    if (category === '武器' || category === '法器') {
      const atk = sentence.match(/攻击检定[^。\n]*?[+＋](\d)/);
      const dmg = sentence.match(/伤害[^。\n]*?[+＋](\d)/);
      if (atk && dmg && atk[1] === dmg[1]) return parseInt(atk[1], 10);
    }
  }
  return 0;
}

function buildItem(parsed, rel) {
  const { zh, en } = splitName(parsed.nameLines);
  if (!parsed.type || !zh) return null;
  const desc = parsed.desc.join('\n').trim();
  const category = CATEGORY_MAP[parsed.type];
  const chargeMatch = desc.match(/(\d+)\s*发充能/);
  const regenMatch = desc.match(/(每天黎明|每[\u4e00-\u9fff]{1,4}黎明|每周|[\d]+天)[^\n]{0,30}?充能/);
  // 魔法加值 = 物品自身的「增强加值」，只对武器/护甲/法器有意义（并入攻击检定或 AC）。
  // 描述里到处是「+N 加值」（技能/豁免/临时 AC/涂油增益），按语境精确提取，避免污染：
  //   护甲：仅「AC获得+N加值」的无条件护甲强化
  //   武器/法器：仅同一句内同时出现「攻击」与「伤害」的增强（法器作魔法长棍时成立）
  const magicBonus = extractMagicBonus(desc, category);
  return {
    id: slugify(zh),
    name: zh,
    nameEn: en || undefined,
    category,
    subtype: parsed.subtype || parsed.type,
    weight: 0,
    price: { amount: 0, unit: 'gp' },
    description: desc,
    properties: [],
    isCustom: false,
    tags: [],
    source: '城主指南 2014',
    dataResource: '5E不全书',
    campaignId: null, // 出版物条目：全局共享（写入需站点管理员）
    magicCategory: '魔法物品',
    tradeCategory: parsed.rarity === '传说' || parsed.rarity === '极珍稀' ? '贵重物品' : '冒险物品',
    rarity: parsed.rarity,
    attunement: parsed.attune,
    attunePrereq: parsed.prereq || '',
    magicBonus,
    charges: chargeMatch ? parseInt(chargeMatch[1], 10) : 0,
    chargeRegen: regenMatch ? regenMatch[0] : '',
    cursed: /诅咒\s*Curse/.test(desc),
    activation: '',
  };
}

const files = listFiles(ROOT).filter(f => !f.includes('随机魔法物品表'));
const items = [];
const skipped = [];
// 怪物数据块：标题后正文形如「AC：/HP：/速度：」或「X体型/生物类型，阵营」——不是魔法物品，跳过
const isStatBlock = (parsed) => {
  const head = parsed.desc.slice(0, 4).join(' ');
  return /(AC|HP|速度|挑战等级)[：:]/i.test(head)
    || /(超?小|中|大|巨|超巨)型[^，]*，[^，]+/.test(head)
    || /^(超?小|中|大|巨|超巨)型/.test(head);
};
for (const f of files) {
  const rel = f.replace(ROOT + '/', '');
  const html = decode(f);
  const parts = html.split(/<P>\s*<STRONG>\s*<FONT color=#800000>/i);
  // 上一个成功解析的顶级条目：BLOCKQUOTE 内的变体子条目（如命令元素戒指的 4 个元素版本）继承其类别/稀有度/同调
  let lastParent = null;
  for (let k = 1; k < parts.length; k++) {
    const raw = parts[k];
    const nested = /<BLOCKQUOTE/i.test(raw.split('</P>')[0]);
    let parsed = parseBlockHtml(raw);
    // 子条目无类型行时继承父条目元数据（仅对非怪物数据块）
    if (!parsed.type && lastParent && !isStatBlock(parsed)) {
      parsed = { ...parsed, type: lastParent.type, subtype: lastParent.subtype, rarity: lastParent.rarity, attune: lastParent.attune, prereq: lastParent.prereq };
    }
    const item = buildItem(parsed, rel);
    if (item) {
      if (!items.some(x => x.id === item.id)) { items.push(item); if (!nested) lastParent = parsed; }
      else skipped.push(`${item.name}（重复）`);
    } else {
      skipped.push(`${rel} 块${k}: ${parsed.nameLines.join(' ').slice(0, 24)}`);
    }
  }
}

writeFileSync(OUT, JSON.stringify(items, null, 2));
console.log(`产出 ${items.length} 条 → ${OUT}`);
console.log(`跳过 ${skipped.length} 条:`);
skipped.forEach(s => console.log('  -', s));
