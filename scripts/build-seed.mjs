#!/usr/bin/env node
/**
 * 三宝书种库快照 → public/seed/ 中文分片
 *
 * 输入：数据管理页「导出种库快照」下载的 JSON
 *   { equipments: [], monsters: [], options: [], exportedAt: string }
 * 输出：public/seed/ 下按「书 → 库 → 分类」三级中文目录的分片 + 索引.json
 *
 * 用法：
 *   node scripts/build-seed.mjs <snapshot.json> [--out public/seed] [--date 2026-11-09] [--dry-run]
 *
 * 幂等：同一输入重复运行产出字节一致（分片内按 id/templateId 排序，索引分片按固定序）。
 * 产物允许手动改后直接提交；重跑会覆盖同名分片，先 --dry-run 看差异。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
// 支持一次传多个快照文件（分库导出时传 3 个），也可传单个合并快照。
// 需要跳过带值选项（--out/--date）的取值，否则会被误当作输入文件。
const VALUE_FLAGS = new Set(['--out', '--date']);
const inputPaths = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    if (VALUE_FLAGS.has(a)) i++; // 跳过该选项的值
    continue;
  }
  inputPaths.push(a);
}
if (inputPaths.length === 0) {
  console.error('用法: node scripts/build-seed.mjs <snapshot.json> [more.json ...] [--out public/seed] [--date YYYY-MM-DD] [--dry-run]');
  process.exit(1);
}
const flag = (name) => args.includes(name);
const optValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const OUT_DIR = path.resolve(optValue('--out', 'public/seed'));
const DATE = optValue('--date', new Date().toISOString().slice(0, 10));
const DRY_RUN = flag('--dry-run');

// ---------- 分类映射 ----------
const BOOK_DIR = {
  '玩家手册 2014': '玩家手册2014',
  '玩家手册': '玩家手册2014',
  '城主指南 2014': '城主指南2014',
  '城主指南': '城主指南2014',
  '怪物图鉴 2014': '怪物图鉴2014',
  '怪物图鉴': '怪物图鉴2014',
};

const CREATURE_TYPE_CN = {
  humanoid: '类人', aberration: '异怪', monstrosity: '怪兽', dragon: '龙类',
  elemental: '元素生物', beast: '野兽', construct: '构装', fiend: '邪魔',
  plant: '植物', undead: '亡灵', ooze: '泥怪', fey: '妖精', giant: '巨人',
  celestial: '天族',
};

// 装备分片名：玩家手册按 category；城主指南魔法物品 category 前加「魔法」，杂物再按 subtype 拆奇物/戒指
function equipmentShardName(item, book) {
  const isGuide = book.includes('城主指南');
  if (!isGuide) return item.category || '未分类';
  if (item.category === '杂物') {
    if (item.subtype === '戒指') return '戒指';
    return '奇物';
  }
  return `魔法${item.category || '杂物'}`;
}

// ---------- 规范化 ----------
function normalizeSource(raw) {
  if (!raw || raw === '玩家手册') return '玩家手册 2014';
  return raw;
}

const warnings = [];
function warn(msg) {
  warnings.push(msg);
}

// ---------- 读取输入 ----------
// 多个快照按库合并：同一库出现多次时按 id 去重（后出现的覆盖先出现的，便于分库导出后补跑）
const equipments = [];
const monsters = [];
const optionsRaw = [];
for (const p of inputPaths) {
  let snap;
  try {
    snap = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`读取快照失败 ${p}: ${e.message}`);
    process.exit(1);
  }
  if (Array.isArray(snap.equipments)) equipments.push(...snap.equipments);
  if (Array.isArray(snap.monsters)) monsters.push(...snap.monsters);
  if (Array.isArray(snap.options)) optionsRaw.push(...snap.options);
}
if (equipments.length === 0 && monsters.length === 0 && optionsRaw.length === 0) {
  console.error('快照三库均为空，拒绝生成空种子');
  process.exit(1);
}
// 分库导出时应把三个文件一起传入；缺库会导致索引缺失对应 kind，提示避免误生成残缺种子
if (equipments.length === 0) console.warn('警告: 输入无装备数据，将不生成装备分片');
if (monsters.length === 0) console.warn('警告: 输入无怪物数据，将不生成怪物分片');
if (optionsRaw.length === 0) console.warn('警告: 输入无角色选项数据，将不生成选项分片');

// ---------- 分组容器：kind -> bookDir -> group -> items[] ----------
const buckets = {
  equipments: new Map(),
  monsters: new Map(),
  options: new Map(),
};

function push(kind, bookDir, group, item) {
  if (!buckets[kind].has(bookDir)) buckets[kind].set(bookDir, new Map());
  const groups = buckets[kind].get(bookDir);
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(item);
}

// ---------- 出版物行过滤 ----------
// 快照取自 ?scope=all，同时含三类行：出版物（campaignId 为空）、用户私有自建（campaignId=团组 id）、
// 覆盖/墓碑行（id 前缀 ovl-/del- 且带 seedId/deleted）。只有出版物行能进种子；后两类若混入会把
// 某个团组的私有改动固化成全局种子，必须剔除。
function isPublicationRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.campaignId !== null && row.campaignId !== undefined) return false;
  if (row.seedId) return false;       // 覆盖/墓碑行
  if (row.deleted === true) return false;
  const id = String(row.id ?? row.templateId ?? '');
  if (id.startsWith('ovl-') || id.startsWith('del-')) return false;
  return true;
}

// ---------- 装备 ----------
const eqSeen = new Set();
for (const raw of equipments) {
  if (!raw || typeof raw !== 'object') { warn(`装备条目非对象，已跳过`); continue; }
  if (!isPublicationRow(raw)) { warn(`装备非出版物行（私有/覆盖/墓碑），已跳过: ${raw.name || raw.id || '(无标识)'}`); continue; }
  if (!raw.id || !raw.name || !raw.category) {
    warn(`装备缺字段 id/name/category，已跳过: ${raw.name || raw.id || '(无标识)'}`);
    continue;
  }
  if (eqSeen.has(raw.id)) { warn(`装备重复 id，保留后者: ${raw.id}`); }
  eqSeen.add(raw.id);
  const source = normalizeSource(raw.source);
  const bookDir = BOOK_DIR[source];
  if (!bookDir) { warn(`装备来源未映射书籍，已归入「其他」: ${raw.id} (source=${raw.source})`); }
  const book = bookDir || '其他';
  const item = { ...raw, campaignId: null, source };
  push('equipments', book, equipmentShardName(item, source), item);
}

// ---------- 怪物 ----------
const monSeen = new Set();
for (const raw of monsters) {
  if (!raw || typeof raw !== 'object') { warn(`怪物条目非对象，已跳过`); continue; }
  if (!isPublicationRow(raw)) { warn(`怪物非出版物行（私有/覆盖/墓碑），已跳过: ${raw.name || raw.templateId || raw.id || '(无标识)'}`); continue; }
  const key = raw.templateId || raw.id;
  if (!key) { warn(`怪物缺 templateId/id: ${raw.name || '(无标识)'}`); continue; }
  if (!raw.name) { warn(`怪物缺 name，已跳过: ${key}`); continue; }
  if (monSeen.has(key)) { warn(`怪物重复 templateId，保留后者: ${key}`); }
  monSeen.add(key);
  const source = normalizeSource(raw.source);
  const bookDir = BOOK_DIR[source] || '其他';
  const typeCn = CREATURE_TYPE_CN[raw.creatureType] || '未分类';
  const item = { ...raw, campaignId: null, source };
  push('monsters', bookDir, typeCn, item);
}

// ---------- 角色选项 ----------
// 快照来自 ?scope=all，条目为扁平形状（每行一个 category）。还原为嵌套：种族含亚种、职业含子职业。

// 快照行里的特质文本可能携带上一句遗留的句末标点（如 D1 早期导入的种族特质「。你的魅力加2」），
// 提取器本身会剥（extract-options L426），这里在种子落盘前兜底剥一次，保证种子文本干净
const LEADING_PUNCT_RE = /^[。、：；\s]+/;
function cleanTraitTexts(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'text' && typeof v === 'string' && obj.name) {
      const cleaned = v.replace(LEADING_PUNCT_RE, '');
      if (cleaned) obj[k] = cleaned;
    } else if (v && typeof v === 'object') {
      cleanTraitTexts(v);
    }
  }
}

// 职业引导/风味条目剪除：创建指引与开头风味散文（如战士「全能武斗家」「为冒险而生」）
// 属于职业页叙事，写进种子会被「刷新选项特性」写上角色卡，模糊工具的核心定位。
// 判据：条目 role=profile（风味标注）且名字匹配不进职业特性表（宽匹配：剥括号/空格/
// 「选择」前缀后等值或互为尾缀，如「选择诗人学院」↔「吟游诗人学院」）；
// 同名重复条目豁免未标级 flavor（武僧「气」×2，机制条带「第X级时/起」标注）。
// features 与 traits 同名并行（读端 traits 优先、features 兜底），两处同步剪除防回潮。
const GUIDANCE_LEVEL_RE = /第\s*\d+\s*级(?:时|起)/;
function normalizeTableName(n) {
  return String(n || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .replace(/^选择/, '');
}
function pruneGuidanceTraits(list, tableNames) {
  if (!Array.isArray(list)) return list;
  const dup = new Map();
  for (const t of list) dup.set(t.name, (dup.get(t.name) || 0) + 1);
  const inTable = (name) => {
    const t = normalizeTableName(name);
    for (const f of tableNames) {
      if (f === t || (f && t.endsWith(f)) || (t && f.endsWith(t))) return true;
    }
    return false;
  };
  return list.filter((t) => {
    if (t.role !== 'profile') return true;
    if (dup.get(t.name) > 1 && !GUIDANCE_LEVEL_RE.test(t.text || '')) return false;
    return inTable(t.name);
  });
}
function pruneClassGuidance(entry) {
  const tableNames = new Set();
  for (const row of entry.table || []) {
    for (const f of row.features || []) {
      const n = normalizeTableName(f);
      if (n) tableNames.add(n);
    }
  }
  if (tableNames.size === 0) return;
  entry.traits = pruneGuidanceTraits(entry.traits, tableNames);
  entry.features = pruneGuidanceTraits(entry.features, tableNames);
}

function buildOptionsTree(rows) {
  const races = [];
  const classes = [];
  const backgrounds = [];
  const subracesByParent = new Map();
  const subclassesByParent = new Map();

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') { warn(`选项条目非对象，已跳过`); continue; }
    if (!isPublicationRow(raw)) { warn(`选项非出版物行（私有/覆盖/墓碑），已跳过: ${raw.name || raw.id || '(无标识)'}`); continue; }
    if (!raw.id || !raw.name || !raw.category) {
      warn(`选项缺字段 id/name/category，已跳过: ${raw.name || raw.id || '(无标识)'}`);
      continue;
    }
    const source = normalizeSource(raw.source);
    const item = { ...raw, source, campaignId: null };
    cleanTraitTexts(item);
    if (raw.category === 'subrace') {
      const parent = raw.parentName || '';
      if (!subracesByParent.has(parent)) subracesByParent.set(parent, []);
      subracesByParent.get(parent).push(item);
    } else if (raw.category === 'subclass') {
      const parent = raw.parentName || '';
      if (!subclassesByParent.has(parent)) subclassesByParent.set(parent, []);
      subclassesByParent.get(parent).push(item);
    } else if (raw.category === 'race') {
      races.push(item);
    } else if (raw.category === 'class') {
      classes.push(item);
    } else if (raw.category === 'background') {
      backgrounds.push(item);
    } else {
      warn(`选项未知分类，已跳过: ${raw.category} (${raw.name})`);
    }
  }

  for (const r of races) {
    r.subraces = subracesByParent.get(r.name) || [];
    push('options', '玩家手册2014', '种族', r);
  }
  for (const c of classes) {
    pruneClassGuidance(c);
    c.subclasses = subclassesByParent.get(c.name) || [];
    push('options', '玩家手册2014', '职业', c);
  }
  for (const b of backgrounds) push('options', '玩家手册2014', '背景', b);
}
buildOptionsTree(optionsRaw);

// ---------- 排序（幂等） ----------
const byKey = (a, b) => String(a.id ?? a.templateId).localeCompare(String(b.id ?? b.templateId));
for (const kind of Object.keys(buckets)) {
  for (const groups of buckets[kind].values()) {
    for (const list of groups.values()) list.sort(byKey);
  }
}

// ---------- 写出分片 ----------
const KIND_LABEL = { equipments: '装备库', monsters: '怪物图鉴', options: '角色选项' };
const KIND_DIR = { equipments: '装备', monsters: '怪物', options: '角色选项' };
const index = {
  version: `${DATE}.1`,
  // 用 DATE 而非实时时间：同一快照重复运行产出字节一致，避免 git diff 噪音
  generatedAt: DATE,
  versionNote: DATE,
  kinds: {},
  sources: [],
};

const sourceSet = new Set();
const written = [];
let totalBytes = 0;
let totalGzip = 0;

for (const kind of ['equipments', 'monsters', 'options']) {
  const meta = { label: KIND_LABEL[kind], count: 0, shards: [] };
  const bookDirs = [...buckets[kind].keys()].sort((a, b) => a.localeCompare(b, 'zh'));
  for (const bookDir of bookDirs) {
    const groups = buckets[kind].get(bookDir);
    const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'zh'));
    for (const group of groupNames) {
      const items = groups.get(group);
      const rel = path.posix.join(bookDir, KIND_DIR[kind], `${group}.json`);
      const abs = path.join(OUT_DIR, rel);
      const json = JSON.stringify(items, null, 2) + '\n';
      const bytes = Buffer.byteLength(json);
      const gzip = zlib.gzipSync(Buffer.from(json)).length;
      totalBytes += bytes;
      totalGzip += gzip;
      meta.count += items.length;
      meta.shards.push({ book: bookDir, group, path: rel, count: items.length, bytes, gzip });
      if (!DRY_RUN) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, json);
      }
      written.push({ rel, count: items.length, bytes, gzip });
      for (const it of items) if (it.source) sourceSet.add(it.source);
    }
  }
  index.kinds[kind] = meta;
}
index.sources = [...sourceSet].sort((a, b) => a.localeCompare(b, 'zh'));

const indexPath = path.join(OUT_DIR, '索引.json');
const indexJson = JSON.stringify(index, null, 2) + '\n';
if (!DRY_RUN) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(indexPath, indexJson);
}

// ---------- 报告 ----------
console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}输出目录: ${OUT_DIR}`);
console.log(`版本: ${index.version}`);
console.log('');
for (const kind of ['equipments', 'monsters', 'options']) {
  const meta = index.kinds[kind];
  console.log(`${meta.label}: ${meta.count} 条 / ${meta.shards.length} 分片`);
  for (const s of meta.shards) {
    console.log(`  ${s.path.padEnd(34)} ${String(s.count).padStart(3)} 条  ${(s.gzip / 1024).toFixed(1)}KB gz`);
  }
}
console.log('');
console.log(`合计: ${written.length} 分片  raw ${(totalBytes / 1024).toFixed(1)}KB  gzip ${(totalGzip / 1024).toFixed(1)}KB`);
console.log(`索引: ${indexPath}${DRY_RUN ? ' (未写入)' : ''}`);

if (warnings.length > 0) {
  console.log(`\n告警 ${warnings.length} 条:`);
  for (const w of warnings) console.log(`  - ${w}`);
} else {
  console.log('\n无告警。');
}
