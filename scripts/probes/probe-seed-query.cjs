// 探针：种子查询层 + 校验门禁自检——纯引擎断言，无 UI
// 运行：QUIET=1 node scripts/probes/probe-seed-query.cjs
const path = require('path');
const { execFileSync } = require('child_process');

const QUIET = !!process.env.QUIET;
let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; if (!QUIET) console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + ' :: ' + JSON.stringify(detail)); }
}

const SEED_ROOT = path.resolve(__dirname, '..');
const seed = require(path.join(SEED_ROOT, 'lib/seedQuery.cjs'));

function runCli(...args) {
  return execFileSync('node', [path.join(SEED_ROOT, 'seed.cjs'), ...args], { encoding: 'utf8', cwd: SEED_ROOT });
}

async function main() {
  // ---- 库加载 ----
  const monsters = seed.loadMonsters();
  const options = seed.loadOptions();
  const spells = seed.loadSpells();
  check('怪物库 421 条', monsters.length === 421, monsters.length);
  check('选项库三分类', options.classes.length === 12 && options.races.length === 9 && options.backgrounds.length === 13, { c: options.classes.length, r: options.races.length, b: options.backgrounds.length });
  check('法术库 17 条', spells.length === 17, spells.length);

  // ---- findMonster：ID / 中文名 / 未知 ----
  const byId = seed.findMonster('werewolf');
  check('按 templateId 精确查怪', byId && byId.name === '狼人', byId && byId.name);
  const byName = seed.findMonster('狼人');
  check('按中文名查怪', byName && byName.templateId === 'werewolf', byName && byName.templateId);
  check('未知 → null', seed.findMonster('不存在的东西') === null);

  // ---- searchMonsters：子串 / 组合筛选 / has / 投影 ----
  const goblins = seed.searchMonsters({ name: '地精' });
  check('名称子串 7 条（地精家族）', goblins.length === 7, goblins.length);
  const lowCr = seed.searchMonsters({ cr: '1/2', size: '小型' });
  check('CR+体型组合筛选全命中', lowCr.length === 7 && lowCr.every(m => m.cr === '1/2' && m.size === '小型'), lowCr.length);
  const elements = seed.searchMonsters({ type: '元素生物' });
  check('类型筛选全命中', elements.length === 23 && elements.every(m => m.type === '元素生物'), elements.length);
  const multi = seed.searchMonsters({ has: 'multiattack' });
  check('has 过滤 = multiattack 非空', multi.length === 193 && multi.every(m => Array.isArray(m.multiattack) && m.multiattack.length > 0), multi.length);
  const proj = seed.searchMonsters({ name: '狼人', fields: ['name', 'size', 'cr'] });
  check('字段投影仅含指定键', proj.length === 1 && JSON.stringify(proj[0]) === JSON.stringify({ name: '狼人', size: '中型', cr: '3' }), proj[0]);
  const limited = seed.searchMonsters({ limit: 5 });
  check('limit 截断', limited.length === 5, limited.length);

  // ---- size 修复回归：中形 不复现 ----
  const badSizes = monsters.filter(m => !seed.SIZE_VALUES.includes(m.size));
  check('size 值域全部合法（中形 已修复）', badSizes.length === 0, badSizes.map(m => m.name + ':' + m.size));

  // ---- searchOptions / searchSpells ----
  const fighter = seed.searchOptions({ kind: 'class', name: '战士' });
  check('选项库：职业战士 1 条含 features 数组', fighter.length === 1 && Array.isArray(fighter[0].features) && fighter[0].features.length > 0, fighter.length);
  const elves = seed.searchOptions({ kind: 'race', name: '精灵' });
  check('选项库：种族精灵 2 条', elves.length === 2, elves.map(o => o.name));
  const allOptions = seed.searchOptions({});
  check('无 kind 时跨三库查询', allOptions.length === 34, allOptions.length);
  const fireball = seed.searchSpells({ name: '火球', fields: ['name', 'level'] });
  check('法术查询+投影', fireball.length === 1 && fireball[0].level === 3, fireball[0]);
  const wiz3 = seed.searchSpells({ level: 3, forClass: '法师' });
  check('环阶+职业适配筛选', wiz3.length > 0 && wiz3.every(s => s.level === 3 && s.classes.includes('法师')), wiz3.length);

  // ---- stats ----
  const stats = seed.seedStats();
  check('统计概览总数一致', stats.monsters.total === 421 && stats.monsters.withMultiattack === 193 && stats.options.classes === 12, stats.monsters);

  // ---- CLI 冒烟（grep 约定退出码）----
  const cnt = runCli('monster', '--cr', '1/2', '--size', '小型', '--count').trim();
  check('CLI --count 输出数字', cnt === '7', cnt);
  let cliExit1 = false;
  try { runCli('monster', '-n', '绝不存在的怪', '--count'); } catch (e) { cliExit1 = e.status === 1; }
  check('CLI 无匹配退出码 1', cliExit1);
  const compactOut = runCli('monster', '-n', '狼人', '--fields', 'name,size', '--compact').trim().split('\n');
  check('CLI --compact 单行 JSON', compactOut.length === 1 && JSON.parse(compactOut[0]).size === '中型', compactOut[0]);

  // ---- 校验门禁冒烟 ----
  const validateOut = execFileSync('node', [path.join(SEED_ROOT, 'validate-seed.cjs')], { encoding: 'utf8', cwd: SEED_ROOT });
  check('校验器 0 错误通过', /错误 0/.test(validateOut), validateOut.split('\n')[0]);

  console.log(`\n=== 种子查询探针: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) { console.log('FAILED: ' + failures.join(', ')); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
