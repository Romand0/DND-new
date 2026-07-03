// 生成初始数据导入 SQL
// 用法: node scripts/generate-seed.js > seed.sql
// 然后在 Cloudflare D1 Console 中执行 seed.sql

import { readFileSync, writeFileSync } from 'fs';

const equipments = JSON.parse(readFileSync('src/data/equipments.json', 'utf-8'));
const spells = JSON.parse(readFileSync('src/data/spells.json', 'utf-8'));

const now = Date.now();
let sql = '-- 初始数据导入\n\n';

// 装备
sql += '-- 装备库\n';
for (const item of equipments) {
  const data = JSON.stringify(item).replace(/'/g, "''");
  sql += `INSERT OR IGNORE INTO equipments (id, name, category, data, created_at, updated_at) VALUES ('${item.id}', '${item.name.replace(/'/g, "''")}', '${item.category}', '${data}', ${now}, ${now});\n`;
}

sql += '\n-- 法术库\n';
for (const spell of spells) {
  const data = JSON.stringify(spell).replace(/'/g, "''");
  sql += `INSERT OR IGNORE INTO spells (id, name, level, school, data, created_at, updated_at) VALUES ('${spell.id}', '${spell.name.replace(/'/g, "''")}', ${spell.level}, '${spell.school}', '${data}', ${now}, ${now});\n`;
}

writeFileSync('seed.sql', sql);
console.log(`生成 seed.sql: ${equipments.length} 条装备, ${spells.length} 条法术`);
