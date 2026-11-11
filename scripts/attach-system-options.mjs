// 把 extract-options 产出的嵌套 options 清洗后挂到现有职业种子（保留 role/level）
// 用法：先 node scripts/extract-options.mjs class，再 node scripts/attach-system-options.mjs
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const EXTRACT = path.join(ROOT, 'src/data/options.json');
const SEED = path.join(ROOT, 'public/seed/玩家手册2014/角色选项/职业.json');

const DROP_OPTION = new Set([
  '豁免', '战技', '圣誓法术', '德鲁伊与诸神', '武僧修道会',
  '链之魔契', '刃之魔契', '书之魔契',
]);
const SKIP_CONTAINER = new Set(['荒野变形', '气']);
const KEEP_CONTAINER = new Set([
  '卓越战技', '超魔法', '魔能祈唤', '战斗风格',
  '防守战术', '多重攻击', '猎物', '高效猎人防术',
  '图腾精魄', '兽之形', '图腾同调', '引导神力',
]);

const extract = JSON.parse(fs.readFileSync(EXTRACT, 'utf8'));
const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));

const extractMap = new Map();
const indexExtract = (owner, features) => {
  for (const t of features || []) {
    if (!t?.name || !t.options?.length) continue;
    extractMap.set(`${owner}|${t.name}`, t.options);
  }
};
for (const c of extract.classes || []) {
  indexExtract(c.name, c.features);
  for (const s of c.subclasses || []) indexExtract(s.name, s.features);
}

const clean = (opts) =>
  (opts || [])
    .filter((o) => o?.name && o?.text && !DROP_OPTION.has(o.name))
    .map((o) => ({ name: o.name, nameEn: o.nameEn || '', text: o.text }));

let attached = 0;
const attachOn = (owner, traits) => {
  if (!Array.isArray(traits)) return;
  for (const t of traits) {
    if (!KEEP_CONTAINER.has(t.name) || SKIP_CONTAINER.has(t.name)) continue;
    const opts = clean(extractMap.get(`${owner}|${t.name}`));
    if (!opts.length) continue;
    t.options = opts;
    attached++;
  }
};

for (const entry of seed) {
  attachOn(entry.name, entry.traits);
  attachOn(entry.name, entry.features);
  for (const sub of entry.subclasses || []) {
    attachOn(sub.name, sub.features);
  }
}

fs.writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n');
console.log(`已挂载 ${attached} 个容器的 options → ${path.relative(ROOT, SEED)}`);
