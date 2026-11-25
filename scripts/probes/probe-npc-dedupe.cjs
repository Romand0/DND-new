// 图鉴去重探针：旧版「整库上云」快照行（id=种子 uuid、无 seedId、templateId=slug）
// 不得让怪物图鉴翻倍（421 → 842），且覆盖/自建/墓碑语义保持。
// 运行：NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-npc-dedupe.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = !!process.env.QUIET;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; if (!QUIET) console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + ' :: ' + JSON.stringify(detail)); }
}

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const USER = { id: 'e2e', username: 'e2e-dm', role: 'dm', isAdmin: true };
  await ctx.addInitScript((u) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_user', JSON.stringify(u));
    localStorage.setItem('dnd-current-campaign', 'default');
  }, USER);
  await ctx.route('**/api/auth/me', r => r.fulfill({ json: { user: USER } }));
  // 模板列表接口失败：让页面 fetchAll 走 catch 分支，不覆盖探针写入的旧快照行
  await ctx.route('**/api/templates**', r => r.fulfill({ status: 500, json: { error: 'probe' } }));
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(BASE + '/monsters', { waitUntil: 'domcontentloaded' });

  const out = await page.evaluate(async () => {
    const seedMod = await import('/src/data/seedLoader.ts');
    const seeds = await seedMod.loadSeed('monsters');
    const scopeMod = await import('/src/data/libraryScope.ts');
    scopeMod.setRulebookScope(['玩家手册 2014', '怪物图鉴 2014', '城主指南 2014']);

    const CLOUD_KEY = 'dnd-default:dnd-npc-templates';
    const writeCloud = (rows) => localStorage.setItem(CLOUD_KEY, JSON.stringify(rows));
    const readCloud = () => {
      try { return JSON.parse(localStorage.getItem(CLOUD_KEY) || '[]'); } catch { return []; }
    };
    const boot = async (n) => (await import('/src/data/npcTemplateStore.ts?t=' + n + '-' + Date.now())).default;
    const names = (rows) => {
      const m = new Map();
      for (const r of rows) m.set(r.name, (m.get(r.name) || 0) + 1);
      return [...m.values()].filter(c => c > 1).length;
    };

    const slug = seeds[0].templateId;
    // 模拟历史残留：整库种子以原始 uuid id 上云，归属当前团组
    const legacy = seeds.map(s => ({ ...s, campaignId: 'default', updatedAt: 1 }));
    const result = {};

    writeCloud(legacy);
    const store1 = await boot('legacy');
    const all1 = store1.getAll();
    const raw1 = store1.getAllRaw();
    result.legacyRaw = raw1.length;
    result.legacyVisible = all1.length;
    result.legacyDupNames = names(all1);
    result.seedId = slug;
    result.legacyFirstId = all1.find(t => t.name === seeds[0].name)?.id || null;
    result.prunedCloudLen = readCloud().length;

    // 覆盖行（编辑种子）仍生效，且不新增条目
    writeCloud([
      ...legacy,
      { id: 'ovl-default-' + slug, templateId: 'ovl-default-' + slug, seedId: slug, name: '覆盖后的名字', campaignId: 'default' },
    ]);
    const store2 = await boot('overlay');
    const all2 = store2.getAll();
    result.overlayCount = all2.length;
    result.overlayName = all2.find(t => t.id === slug)?.name || null;

    // 自建条目保留
    writeCloud([
      ...legacy,
      { id: 'custom-1', templateId: 'custom-test-monster', name: '自定义测试怪', campaignId: 'default', updatedAt: 2 },
    ]);
    const store3 = await boot('custom');
    const all3 = store3.getAll();
    result.customCount = all3.length;
    result.customFound = all3.some(t => t.id === 'custom-1');

    // 墓碑行剔除种子
    writeCloud([
      ...legacy,
      { id: 'del-default-' + slug, templateId: 'del-default-' + slug, seedId: slug, deleted: true, campaignId: 'default' },
    ]);
    const store4 = await boot('tomb');
    const all4 = store4.getAll();
    result.tombCount = all4.length;
    result.tombGone = !all4.some(t => t.id === slug);

    // 种子缓存自愈：历史重复拼接结果（分片各存两份）读回后去重
    const rawSeed = localStorage.getItem('seed:monsters:data');
    localStorage.setItem('seed:monsters:data', JSON.stringify([...seeds, ...seeds]));
    const seedFresh = await import('/src/data/seedLoader.ts?t=' + Date.now());
    result.seedDedupe = (seedFresh.getCachedSeed('monsters') || []).length;
    if (rawSeed) localStorage.setItem('seed:monsters:data', rawSeed);

    return result;
  });

  const expected = 421;
  check('旧快照行不产生重复（raw 421）', out.legacyRaw === expected, out.legacyRaw);
  check('旧快照行不产生重复（视图 421）', out.legacyVisible === expected, out.legacyVisible);
  check('无重名条目', out.legacyDupNames === 0, out.legacyDupNames);
  check('展示用种子 id（templateId）', out.legacyFirstId === out.seedId, { id: out.legacyFirstId, slug: out.seedId });
  check('旧快照行从持久化副本剔除', out.prunedCloudLen === 0, out.prunedCloudLen);
  check('覆盖行生效且不新增条目', out.overlayCount === expected && out.overlayName === '覆盖后的名字', { n: out.overlayCount, name: out.overlayName });
  check('自建条目保留', out.customCount === expected + 1 && out.customFound === true, { n: out.customCount, found: out.customFound });
  check('墓碑行剔除种子', out.tombCount === expected - 1 && out.tombGone === true, { n: out.tombCount, gone: out.tombGone });
  check('重复种子缓存读回后去重', out.seedDedupe === expected, out.seedDedupe);

  await browser.close();
  if (!QUIET) console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.error('FAILURES: ' + failures.join(', '));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
