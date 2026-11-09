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
const RAR = '(普通|非普通|珍稀|极珍稀|传说|特殊|多种稀有度)(或(普通|非普通|珍稀|极珍稀|传说|特殊|多种稀有度))?';
const ATT = '(（需[^（）]*同调）)?';
const CATS = '(武器|护甲|药水|戒指|权杖|卷轴|法杖|魔杖|奇物)';
const TYPE_FULL = new RegExp(`^${CATS}(（[^（）]*）)?，${RAR}${ATT}$`);
const TYPE_INLINE = new RegExp(`${CATS}(（[^（）]*）)?，${RAR}${ATT}`);

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

function parseBlock(lines) {
  const item = { nameLines: [], type: null, subtype: null, rarity: null, attune: false, prereq: null, desc: [] };
  let typeLine = null;
  for (const line of lines) {
    if (!typeLine) {
      const m = line.match(TYPE_FULL);
      if (m) {
        typeLine = line;
        item.type = m[1];
        item.subtype = m[2] ? m[2].slice(1, -1) : null;
        item.rarity = m[3] + (m[5] ? '或' + m[5] : '');
        item.attune = !!m[6];
        item.prereq = parsePrereq(m[6]);
        continue;
      }
      item.nameLines.push(line);
      continue;
    }
    item.desc.push(line);
  }
  // 级联：类型行黏在名称行内（名称与类型行之间无标签分隔）
  if (!item.type) {
    for (let li = 0; li < item.nameLines.length; li++) {
      const m = item.nameLines[li].match(TYPE_INLINE);
      if (m) {
        const before = item.nameLines[li].slice(0, m.index).trim();
        const after = item.nameLines[li].slice(m.index + m[0].length).trim();
        if (before) item.nameLines.push(before);
        item.type = m[1];
        item.subtype = m[2] ? m[2].slice(1, -1) : null;
        item.rarity = m[3] + (m[5] ? '或' + m[5] : '');
        item.attune = !!m[6];
        item.prereq = parsePrereq(m[6]);
        item.typeLine = m[0];
        item.desc = [after, ...item.desc].filter(Boolean);
        item.nameLines.splice(li, 1);
        break;
      }
    }
  }
  return item;
}

// 名称行 → { zh, en }：中文名 + 英文名（可能跨 2~3 行）
function splitName(nameLines) {
  const joined = nameLines.join(' ').replace(/\s+/g, ' ').trim();
  if (!joined) return { zh: '', en: '' };
  const m = joined.match(/^([\u4e00-\u9fff·、0-9\s+]+?)\s*([A-Za-z].*)$/);
  if (m) return { zh: m[1].trim(), en: m[2].trim() };
  return { zh: joined, en: '' };
}

function buildItem(parsed, rel) {
  const { zh, en } = splitName(parsed.nameLines);
  if (!parsed.type || !zh) return null;
  const desc = parsed.desc.join('\n').trim();
  const category = CATEGORY_MAP[parsed.type];
  const chargeMatch = desc.match(/(\d+)\s*发充能/);
  const regenMatch = desc.match(/(每天黎明|每[\u4e00-\u9fff]{1,4}黎明|每周|[\d]+天)[^\n]{0,30}?充能/);
  const bonusMatch = desc.match(/[+＋](\d)\s*加值/);
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
    magicBonus: bonusMatch ? parseInt(bonusMatch[1], 10) : 0,
    charges: chargeMatch ? parseInt(chargeMatch[1], 10) : 0,
    chargeRegen: regenMatch ? regenMatch[0] : '',
    cursed: /诅咒\s*Curse/.test(desc),
    activation: '',
  };
}

const files = listFiles(ROOT).filter(f => !f.includes('随机魔法物品表'));
const items = [];
const skipped = [];
for (const f of files) {
  const rel = f.replace(ROOT + '/', '');
  const html = decode(f);
  const parts = html.split(/<P>\s*<STRONG>\s*<FONT color=#800000>/i);
  for (let k = 1; k < parts.length; k++) {
    const parsed = parseBlock(strip('<P><STRONG>' + parts[k]));
    // 原书无类型行条目（如命令元素戒指）：文件路径兜底
    if (!parsed.type) {
      const dirCat = rel.split('/')[0];
      const rarityFromFile = rel.split('/')[1]?.replace(/\.html?$/i, '') || '';
      const VALID_RARITY = ['普通', '非普通', '珍稀', '极珍稀', '传说', '特殊', '多种稀有度'];
      if (CATEGORY_MAP[dirCat] && VALID_RARITY.includes(rarityFromFile)) {
        parsed.type = dirCat;
        parsed.rarity = rarityFromFile;
        parsed.attune = true;
      }
    }
    const item = buildItem(parsed, rel);
    if (item) {
      if (!items.some(x => x.id === item.id)) items.push(item);
      else skipped.push(`${item.name}（重复）`);
    } else {
      // 嵌套召唤物数据块（万象无常牌/异能塑像子条目）等非物品块
      skipped.push(`${rel} 块${k}: ${parsed.nameLines.join(' ').slice(0, 24)}`);
    }
  }
}

writeFileSync(OUT, JSON.stringify(items, null, 2));
console.log(`产出 ${items.length} 条 → ${OUT}`);
console.log(`跳过 ${skipped.length} 条:`);
skipped.forEach(s => console.log('  -', s));
