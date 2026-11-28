// E2E probe: 剧情道具投送纯函数（P4）
// 端点权限/SQL 需 wrangler pages dev + 0017 迁移验证，本探针覆盖归一化、可读性、撤回门槛与行投影。
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
  await ctx.route('**/api/story/handouts', r => r.fulfill({
    json: [{
      id: 'h1', campaignId: 'cmp', kind: 'letter', title: '染血的密信',
      body: '港口午夜，把信交给灯塔守夜人。', targetUserIds: [], createdBy: 'dm1',
      createdAt: 1700000000000, readCount: 0,
    }],
  }));
  await ctx.route('**/api/table/my-characters', r => r.fulfill({
    json: { characters: [{ id: 'c1', name: '游侠' }] },
  }));
  await ctx.route('**/api/characters/c1', r => r.fulfill({
    json: { id: 'c1', name: '游侠', level: 3, profession: { class: '游侠' }, currency: { pp: 0, gp: 12, ep: 0, sp: 5, cp: 0 } },
  }));
  await ctx.route('**/api/character-logs?**', r => r.fulfill({
    json: [{ id: 'l1', campaignId: 'cmp', characterId: 'c1', category: 'item', kind: 'item_acquire', title: '获得 长剑 ×1', createdAt: 1700000000000 }],
  }));

  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const m = await import('/functions/api/story/_shared.ts');

    const raw = {
      kind: 'letter',
      title: '  染血的密信  ',
      body: '  交给玩家阅读  ',
      sceneId: 's1',
      targetUserIds: ['u2', 'u2', '', 'u3'],
    };
    const normalized = m.normalizeHandout(raw, 'cmp', 'dm1', 1000);
    const invalidKind = m.normalizeHandout({ kind: 'battle', title: 'x', body: 'y' }, 'cmp', 'dm1');
    const imageOnly = m.normalizeHandout({ kind: 'map', title: '藏宝图', imageUrl: 'https://x/y.png' }, 'cmp', 'dm1');

    const row = {
      id: 'h1',
      campaign_id: 'cmp',
      scene_id: 's1',
      kind: 'notice',
      target_user_ids: JSON.stringify(['u2', 'u3']),
      data: JSON.stringify({ title: '通缉令', body: '悬赏 500gp', imageUrl: 'https://x/p.png' }),
      created_by: 'dm1',
      created_at: 2000,
      recalled_at: null,
    };
    const projected = m.projectHandoutRow(row, { read_at: 2100, favorited_at: 2200 }, 1);
    const recalledRow = { ...row, recalled_at: 3000 };
    const projectedRecalled = m.projectHandoutRow(recalledRow, null, 0);
    const unreadProjected = m.projectHandoutRow(row, { read_at: 0, favorited_at: 2300 }, 0);

    return {
      normalize: normalized,
      invalidKind,
      imageOnly,
      projected,
      projectedRecalled,
      unreadProjected,
      view: {
        global: m.canViewHandout({ targetUserIds: [] }, 'u9', false),
        targeted: m.canViewHandout({ targetUserIds: ['u2', 'u3'] }, 'u2', false),
        other: m.canViewHandout({ targetUserIds: ['u2', 'u3'] }, 'u9', false),
        recalledPlayer: m.canViewHandout({ targetUserIds: ['u2'], recalledAt: 1 }, 'u2', false),
        recalledDm: m.canViewHandout({ targetUserIds: ['u2'], recalledAt: 1 }, 'u9', true),
      },
      recall: {
        zero: m.canRecallHandout(0),
        missing: m.canRecallHandout(undefined),
        read: m.canRecallHandout(2),
      },
      validate: {
        ok: m.validateHandout(normalized),
        emptyTitle: m.validateHandout({ ...normalized, title: '  ' }),
        badKind: m.validateHandout(invalidKind),
        emptyBody: m.validateHandout({ ...normalized, body: '  ', imageUrl: '' }),
        imageOnly: m.validateHandout(imageOnly),
      },
    };
  }).catch(e => ({ error: e.message }));

  if (result.error) {
    check('道具模块可导入', false, result);
  } else {
    check('1 标题去空白', result.normalize.title === '染血的密信', result.normalize.title);
    check('2 目标去重去空', JSON.stringify(result.normalize.targetUserIds) === JSON.stringify(['u2', 'u3']), result.normalize.targetUserIds);
    check('3 场景与创建者保留', result.normalize.sceneId === 's1' && result.normalize.createdBy === 'dm1', result.normalize);
    check('4 未知道具类别被校验拒绝', result.validate.badKind.ok === false, result.validate.badKind);
    check('5 无标题拒绝', result.validate.emptyTitle.ok === false, result.validate.emptyTitle);
    check('6 正文与图片皆空拒绝', result.validate.emptyBody.ok === false, result.validate.emptyBody);
    check('7 仅图片可投送', result.validate.imageOnly.ok === true, result.validate.imageOnly);
    check('8 全团道具所有玩家可见', result.view.global === true, result.view.global);
    check('9 目标玩家可见', result.view.targeted === true, result.view.targeted);
    check('10 非目标玩家不可见', result.view.other === false, result.view.other);
    check('11 撤回后玩家不可见', result.view.recalledPlayer === false, result.view.recalledPlayer);
    check('12 撤回后 DM 仍可见', result.view.recalledDm === true, result.view.recalledDm);
    check('13 零已读可撤回', result.recall.zero === true && result.recall.missing === true, result.recall);
    check('14 已有已读不可撤回', result.recall.read === false, result.recall.read);
    check('15 行投影展开 data 与目标', result.projected.title === '通缉令' && result.projected.body === '悬赏 500gp'
      && result.projected.imageUrl === 'https://x/p.png'
      && JSON.stringify(result.projected.targetUserIds) === JSON.stringify(['u2', 'u3']), result.projected);
    check('16 行投影附查看者已读/收藏/人数', result.projected.readAt === 2100 && result.projected.favoritedAt === 2200 && result.projected.readCount === 1, result.projected);
    check('17 未读状态不暴露 readAt', result.unreadProjected.readAt === undefined && result.unreadProjected.favoritedAt === 2300, result.unreadProjected);
    check('18 撤回时间透出', result.projectedRecalled.recalledAt === 3000, result.projectedRecalled);
  }

  await page.goto(BASE + '/player/story', { waitUntil: 'networkidle' });
  const ui = await page.evaluate(() => ({
    heading: document.body.innerText.includes('故事与物资'),
    handout: document.body.innerText.includes('染血的密信'),
    box: document.body.innerText.includes('道具箱'),
    economy: document.body.innerText.includes('经济事件'),
    character: document.body.innerText.includes('游侠'),
    log: document.body.innerText.includes('获得 长剑 ×1'),
    money: document.body.innerText.includes('12gp'),
  }));
  check('19 玩家故事页渲染', ui.heading === true && ui.box === true && ui.economy === true, ui);
  check('20 玩家道具箱展示投送', ui.handout === true, ui);
  check('21 玩家经济视图展示角色/日志/钱币', ui.character === true && ui.log === true && ui.money === true, ui);

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
