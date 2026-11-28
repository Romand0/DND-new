// E2E probe: 剧情 P5 回顾纯函数（时间线筛选 / 结算摘要 / Markdown 导出）
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; if (!QUIET) console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra)); }
}

const USER = { id: 'e2e', username: 'e2e-dm', role: 'dm', isAdmin: true };

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript((u) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, USER);
  await ctx.route('**/api/auth/me', r => r.fulfill({ json: { user: USER } }));

  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const m = await import('/src/lib/storyReview.ts');
    const entries = [
      { linkId: 'e1', sceneId: 's1', sourceKind: 'item', sourceId: 'l1', title: '获得长剑', characterId: 'c1', occurredAt: 100, sceneTitle: '港口', chapterTitle: '第一章', arcTitle: '主线', sessionNo: 1, gameDate: '1492-01-01', gameMinute: 600 },
      { linkId: 'e2', sceneId: 's2', sourceKind: 'treasure', sourceId: 'l2', title: '地精金库', characterId: 'c2', occurredAt: 200, sceneTitle: '地窖', chapterTitle: '第一章', arcTitle: '主线', sessionNo: 2, gameDate: '1492-02-02', gameMinute: 0 },
      { linkId: 'e3', sceneId: 's1', sourceKind: 'check', sourceId: 'm1', title: '察觉', characterId: 'c1', occurredAt: 300, sceneTitle: '港口', chapterTitle: '第一章', arcTitle: '主线', sessionNo: 1, gameDate: '1492-01-03', gameMinute: 720 },
      { linkId: 'e4', sceneId: 's3', sourceKind: 'growth', sourceId: 'l4', title: '升级', characterId: 'c1', occurredAt: 400, sceneTitle: '无日期场景', chapterTitle: '第二章', arcTitle: '支线', sessionNo: 1 },
    ];
    const ids = (list) => list.map(e => e.linkId);
    const s1 = m.filterStoryTimeline(entries, { sessionNo: 1 });
    const dates = m.filterStoryTimeline(entries, { dateFrom: '1492-01-02', dateTo: '1492-01-31' });
    const chars = m.filterStoryTimeline(entries, { characterId: 'c1' });
    const kinds = m.filterStoryTimeline(entries, { sourceKind: 'item' });
    const combined = m.filterStoryTimeline(entries, { sessionNo: 1, characterId: 'c1' });
    const summary = m.buildSettlementSummary({
      itemCount: 3,
      currency: { pp: 0, gp: 50, ep: 0, sp: 2, cp: 0 },
      experience: 120,
      spellSlots: { 2: 1, 1: 2 },
    }, 5);
    const emptySummary = m.buildSettlementSummary({
      itemCount: 0, currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, experience: 0, spellSlots: {},
    }, 0);
    const md = m.buildStoryReviewMarkdown(entries, { c1: '游侠', c2: '法师' }, { sessionNo: 1, characterId: 'c1', sourceKind: 'check' });
    const mdGrouped = m.buildStoryReviewMarkdown(entries, { c1: '游侠', c2: '法师' }, {});
    const mdEmpty = m.buildStoryReviewMarkdown([], {}, {});

    return {
      ids: { s1: ids(s1), dates: ids(dates), chars: ids(chars), kinds: ids(kinds), combined: ids(combined) },
      summary,
      emptySummary,
      md,
      mdGrouped,
      mdEmpty,
    };
  }).catch(e => ({ error: e.message }));

  if (result.error) {
    check('回顾模块可导入', false, result);
  } else {
    check('1 按场次筛选', JSON.stringify(result.ids.s1) === JSON.stringify(['e1', 'e3', 'e4']), result.ids.s1);
    check('2 按游戏日期区间筛选（无日期条目不匹配）', JSON.stringify(result.ids.dates) === JSON.stringify(['e3']), result.ids.dates);
    check('3 按角色筛选', JSON.stringify(result.ids.chars) === JSON.stringify(['e1', 'e3', 'e4']), result.ids.chars);
    check('4 按类别筛选', JSON.stringify(result.ids.kinds) === JSON.stringify(['e1']), result.ids.kinds);
    check('5 多条件叠加', JSON.stringify(result.ids.combined) === JSON.stringify(['e1', 'e3', 'e4']), result.ids.combined);
    check('6 结算摘要口径', result.summary === '事件 5 条；物资 3 件；钱币 50gp 2sp；经验 120；法术位 1环×2 2环×1', result.summary);
    check('7 空结算摘要', result.emptySummary === '事件 0 条', result.emptySummary);
    check('8 Markdown 标题与筛选行', result.md.startsWith('# 战役经济回顾') && result.md.includes('筛选：第 1 场 · 角色 游侠 · 类别 检定'), result.md.slice(0, 160));
    check('9 Markdown 按场景分组并带角色', result.md.includes('## 港口') && result.md.includes('**检定** 察觉') && result.md.includes('游侠'), result.md);
    check('10 空 Markdown 占位', result.mdEmpty.includes('（无记录）'), result.mdEmpty);
    check('11 交错条目按场景归组只出一个标题', (result.mdGrouped.match(/## 港口/g) || []).length === 1 && (result.mdGrouped.match(/## 地窖/g) || []).length === 1, result.mdGrouped);
  }

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
