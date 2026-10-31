/**
 * 法术描述表格自动解析：从 data/DND5e_chm 的法术详述 HTML 提取 <TABLE>
 * 生成 Wikidot 语法 table + 增量 SQL（json_set 写 $.table、REPLACE 从 $.description 删压平残留）。
 *
 * 用法: node scripts/parse-spell-tables.mjs
 * 输出: spell-tables.sql（在 Cloudflare D1 Console 手动执行）
 *
 * 零 npm 依赖：Node 内置 TextDecoder('gb18030') + 正则。
 * 与 functions/api/import/spells.ts 的 htmlTableToWikidot 保持同构——重导数据时导入器自带表格，
 * 本脚本只为已入库的历史数据做增量修补。
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dec = new TextDecoder('gb18030', { fatal: false });
const DIR = 'data/DND5e_chm/玩家手册/魔法/法术详述';

/** HTML 表格 → Wikidot 语法（首行 TR = 表头） */
function htmlTableToWikidot(tableHtml) {
  const cellText = (td) =>
    td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = [];
  const trRe = /<TR[\s\S]*?<\/TR>/gi;
  let trM;
  while ((trM = trRe.exec(tableHtml)) !== null) {
    const cells = [];
    const tdRe = /<T[D H][^>]*>[\s\S]*?<\/T[D H]>/gi;
    let tdM;
    while ((tdM = tdRe.exec(trM[0])) !== null) cells.push(cellText(tdM[0]));
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';
  const colCount = Math.max(...rows.map((r) => r.length));
  const pad = (r) => Array.from({ length: colCount }, (_, i) => r[i] ?? '');
  return [
    `|| ${pad(rows[0]).join(' || ')} ||`,
    ...rows.slice(1).map((r) => `| ${pad(r).join(' | ')} |`),
  ].join('\n');
}

/** 复刻导入器的压平形态（中英文加空格 + 压缩空格），用于从已入库 description 中定位删除 */
function flattenLikeImporter(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([\u4e00-\u9fff])([a-zA-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])([\u4e00-\u9fff])/g, '$1 $2')
    .trim();
}

const sqlEscape = (s) => s.replace(/'/g, "''");

const files = readdirSync(DIR).filter((f) => f.endsWith('.html'));
const results = [];
let blocksTotal = 0;

for (const file of files) {
  const html = dec.decode(readFileSync(join(DIR, file)));
  // 与导入器同构：H4 id → 小写 + 下划线转连字符
  const blockRe = /<H4 id="([^"]+)"[^>]*>([\s\S]*?)(?=<H4 |$)/g;
  let bm;
  while ((bm = blockRe.exec(html)) !== null) {
    blocksTotal++;
    const id = bm[1].toLowerCase().replace(/_/g, '-');
    const nameText = bm[2].replace(/<[^>]+>/g, '').trim();
    const name = nameText.split('｜')[0].trim();
    const block = bm[0];
    const tableM = block.match(/<TABLE[\s\S]*?<\/TABLE>/i);
    if (!tableM) continue;
    const table = htmlTableToWikidot(tableM[0]);
    if (!table) continue;
    const flat = flattenLikeImporter(tableM[0]);
    results.push({ id, name, file, table, flat });
  }
}

// 生成增量 SQL：table 写入 + description 删压平串（嵌套 REPLACE 清理残留双空格）
let sql = '-- 法术描述表格自动提取（node scripts/parse-spell-tables.mjs 生成）\n';
sql += '-- json_set 写入 $.table；description 用 REPLACE 删除表格压平残留文本\n\n';
for (const r of results) {
  sql += `-- ${r.name}（${r.file}）\n`;
  sql += `UPDATE spells SET data = json_set(data, '$.table', '${sqlEscape(r.table)}', '$.description',\n`;
  sql += `  REPLACE(REPLACE(json_extract(data, '$.description'), '${sqlEscape(r.flat)}', ' '), '  ', ' '))\n`;
  sql += `WHERE json_extract(data, '$.id') = '${r.id}';\n\n`;
}
writeFileSync('spell-tables.sql', sql);

console.log(`扫描 ${blocksTotal} 个法术块，命中 ${results.length} 个表格：`);
for (const r of results) {
  const rows = r.table.split('\n').length;
  console.log(`  ${r.name}（${r.id}）${rows} 行，压平串 ${r.flat.length} 字`);
}
console.log(`\n输出: spell-tables.sql（${results.length} 条 UPDATE，D1 Console 手动执行）`);
