// 迁移：用最新 parseSpellcasting 重算 npcTemplates.json 与 public/seed 种子快照的 spellcasting 字段。
// traits 是单一事实源；SOURCE_DIR 不在仓库，无法跑完整 CLI，故对存量 JSON 就地重算。
// 幂等：重算结果与现值相等则跳过；--dry-run 只报告不写盘
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpellcasting } from './parse-monsters.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry-run');

const SEED_DIR = path.join(ROOT, 'public/seed/怪物图鉴2014/怪物');
const files = [
  path.join(ROOT, 'src/data/npcTemplates.json'),
  ...fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.json')).map((f) => path.join(SEED_DIR, f)),
];

const kindLabel = { atWill: '随意', slots: '法术位', perDay: '/日', perDayEach: '每项/日' };

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  const items = Array.isArray(data) ? data : data.templates;
  if (!Array.isArray(items)) { console.error(`SKIP ${path.relative(ROOT, file)}：顶层结构非列表`); continue; }
  let changed = 0;
  const details = [];
  for (const t of items) {
    if (!t || typeof t !== 'object' || !Array.isArray(t.traits)) continue;
    const next = parseSpellcasting(t.traits) ?? undefined;
    const prev = t.spellcasting ?? undefined;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changed++;
      const gained = prev ? '扩展' : (next ? '新增' : '丢失');
      const prevDesc = prev ? `${prev.groups?.length ?? 0}组` : '无';
      const nextDesc = next ? `${next.groups?.length ?? 0}组/${next.groups?.map((g) => `${g.ring}${g.usage ? `(${kindLabel[g.usage.kind] ?? g.usage.kind}${g.usage.count ?? ''})` : ''}`).join(' ')}` : '无';
      details.push(`  ${gained} ${t.name}: ${prevDesc} -> ${nextDesc}`);
      t.spellcasting = next;
    }
  }
  if (!DRY && changed > 0) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
  console.log(`${DRY ? '[dry] ' : ''}${path.relative(ROOT, file)}：${changed}/${items.length} 条变更`);
  details.slice(0, 20).forEach((d) => console.log(d));
  if (details.length > 20) console.log(`  ...共 ${details.length} 条`);
}
console.log(DRY ? 'dry-run 完成，未写盘' : '迁移完成');
