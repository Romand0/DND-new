#!/usr/bin/env node
/**
 * 种子数据查询 CLI —— 精确查询怪物图鉴 / 角色选项 / 法术库
 *
 * 用法：
 *   node scripts/seed.cjs <monster|option|spell|find <ID或名>|stats> [筛选] [输出]
 *
 * 筛选：
 *   --id <templateId|id>               精确 ID
 *   -n, --name <关键词>                名称子串（含 nameEn，不区分大小写）
 *   --cr <1|1/2|...>                   怪物挑战等级
 *   --type <类型>                      怪物类型（野兽/人形生物/...）
 *   --size <体型>                      怪物体型（微型/小型/中型/...）
 *   --class|--race|--background <名>   选项库分类筛选（隐含 kind）
 *   --kind <class|race|background>     选项库分类（与上等价）
 *   --level <0-9>                      法术环阶
 *   --school <学派>                    法术学派
 *   --for <职业名>                     法术职业适配（子串匹配）
 *   --has <字段>                       字段存在且非空（数组长度>0）
 *
 * 输出：
 *   --fields <a,b,c>                   字段投影
 *   --count                            仅输出数量（grep 约定：0 条时退出码 1）
 *   --limit <N>                        截断输出
 *   --compact                          每条一行 JSON（便于 grep / 二次处理）
 *
 * 退出码：无匹配 1，参数错误 2，正常 0
 */
const { searchMonsters, searchOptions, searchSpells, seedStats, normalizeOptionKind, findMonster } = require('./lib/seedQuery.cjs');

const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--id', '-n', '--name', '--cr', '--type', '--size', '--class', '--race', '--background', '--kind', '--level', '--school', '--for', '--has', '--fields', '--limit']);
const BOOL_FLAGS = new Set(['--count', '--compact']);

const cmd = args[0];
const flags = {};
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (BOOL_FLAGS.has(a)) { flags[a.slice(2)] = true; continue; }
  if (!a.startsWith('--') && a !== '-n') continue;
  const key = a === '-n' ? 'name' : a.slice(2);
  if (!VALUE_FLAGS.has(a)) { console.error(`未知参数: ${a}`); process.exit(2); }
  const next = args[i + 1];
  if (next === undefined || next.startsWith('--')) { console.error(`缺少参数值: ${a}`); process.exit(2); }
  flags[key] = next;
  i++;
}
// --class/--race/--background 隐含 kind + 默认作为名称筛选
for (const [alias, kind] of [['class', 'class'], ['race', 'race'], ['background', 'background']]) {
  if (flags[alias]) { flags.kind = kind; if (!flags.name) flags.name = flags[alias]; delete flags[alias]; }
}
if (flags.for) { flags.forClass = flags.for; delete flags.for; }

function printResults(list) {
  if (flags.count) { console.log(list.length); process.exit(list.length > 0 ? 0 : 1); }
  if (list.length === 0) { console.error('无匹配结果'); process.exit(1); }
  // --compact 免表头（便于管道 grep/二次处理）；常规模式带总数行
  if (flags.compact) { list.forEach(x => console.log(JSON.stringify(x))); return; }
  console.log(`共 ${list.length} 条`);
  list.forEach(x => console.log(JSON.stringify(x, null, 2)));
}

function runQuery(searchFn) {
  printResults(searchFn(flags));
}

if (cmd === 'monster' || cmd === 'monsters') runQuery(searchMonsters);
else if (cmd === 'option' || cmd === 'options') {
  if (flags.kind && !normalizeOptionKind(flags.kind)) { console.error(`未知选项分类: ${flags.kind}（可用 class/race/background）`); process.exit(2); }
  runQuery(searchOptions);
}
else if (cmd === 'spell' || cmd === 'spells') runQuery(searchSpells);
else if (cmd === 'stats') console.log(JSON.stringify(seedStats(), null, 2));
else if (cmd === 'find' && args[1]) {
  const m = findMonster(args[1]);
  console.log(m ? JSON.stringify(m, null, 2) : `未找到: ${args[1]}`);
  process.exit(m ? 0 : 1);
}
else {
  console.error('用法: node scripts/seed.cjs <monster|option|spell|find <ID或名>|stats> [筛选] [输出]');
  console.error('示例: node scripts/seed.cjs monster --cr 1/2 --size 小型 --fields name,ac,maxHp --compact');
  process.exit(2);
}
