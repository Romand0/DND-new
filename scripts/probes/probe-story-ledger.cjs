// E2E probe: 剧情账本聚合纯函数（P2）
// 端点权限/SQL 需 wrangler pages dev + 0017 迁移验证，本探针覆盖组装与汇总。
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
    const m = await import('/functions/api/story/_shared.ts');

    const links = [
      { id: 'l1', scene_id: 's1', source_kind: 'check', source_id: 'msg1', character_id: 'c1', created_at: 5 },
      { id: 'l2', scene_id: 's1', source_kind: 'treasure', source_id: 'logT', character_id: 'c2', created_at: 6 },
      { id: 'l3', scene_id: 's1', source_kind: 'spell', source_id: 'logS', character_id: 'c1', created_at: 7 },
      { id: 'l4', scene_id: 's1', source_kind: 'growth', source_id: 'logG', character_id: 'c2', created_at: 8 },
      { id: 'l5', scene_id: 's1', source_kind: 'item', source_id: 'gone', character_id: 'c1', created_at: 9 },
      { id: 'l6', scene_id: 's1', source_kind: 'item', source_id: 'logI', character_id: 'c1', note: 'DM 备注', created_at: 10 },
    ];
    const checkRequests = new Map([
      ['msg1', { id: 'msg1', payload: JSON.stringify({ characterId: 'c1', characterName: '游侠', checkLabel: '察觉', dc: 15, dcMode: 'open' }), created_at: 1 }],
      ['msg2', { id: 'msg2', payload: JSON.stringify({ characterName: '法师', checkLabel: '奥秘', dc: 12, dcMode: 'hidden_dc' }), created_at: 2 }],
    ]);
    const checkResults = new Map([
      ['msg1', { payload: JSON.stringify({ appliedValue: 18, submittedAt: 100 }) }],
    ]);
    const logs = new Map([
      ['logT', { id: 'logT', title: '宝藏分配：地精金库（50gp · 药水×2 · 经验 +120）', kind: 'item_acquire', detail: JSON.stringify({ treasureId: 't1', currency: { pp: 0, gp: 50, ep: 0, sp: 0, cp: 0 }, items: [{ name: '药水', quantity: 2 }], experience: 120 }), created_at: 20 }],
      ['logS', { id: 'logS', title: '2环法术位 0/2 → 1/2', kind: 'slot_change', detail: JSON.stringify({ levelKey: 'level2', from: { used: 0, max: 2 }, to: { used: 1, max: 2 } }), created_at: 21 }],
      ['logG', { id: 'logG', title: '经验值 100 → 250', kind: 'exp_change', detail: JSON.stringify({ from: 100, to: 250 }), created_at: 22 }],
      ['logI', { id: 'logI', title: '获得 长剑 ×1', kind: 'item_acquire', detail: JSON.stringify({ childId: 'x' }), created_at: 23 }],
    ]);

    const entries = m.buildLedgerEntries(links, { checkRequests, checkResults, logs });
    const pendingLink = [{ id: 'p', source_kind: 'check', source_id: 'msg2', created_at: 1 }];
    const pending = m.buildLedgerEntries(pendingLink, { checkRequests, checkResults, logs });
    const summary = m.summarizeLedger(links, { logs });
    const summaryNoTreasure = m.summarizeLedger([links[4]], { logs });

    return {
      count: entries.length,
      invalid: entries.filter(e => e.invalid).map(e => e.linkId),
      order: entries.map(e => e.linkId),
      checkTitle: entries.find(e => e.linkId === 'l1').title,
      checkAmount: entries.find(e => e.linkId === 'l1').amountText,
      checkAt: entries.find(e => e.linkId === 'l1').occurredAt,
      treasureAmount: entries.find(e => e.linkId === 'l2').amountText,
      itemNote: entries.find(e => e.linkId === 'l6').note,
      pendingAmount: pending[0].amountText,
      pendingAt: pending[0].occurredAt,
      summary,
      summaryNoTreasure,
      playerKinds: m.isLedgerSourceKind('check') && m.isLedgerSourceKind('item') && m.isLedgerSourceKind('treasure') && m.isLedgerSourceKind('spell') && m.isLedgerSourceKind('growth'),
      badKind: m.isLedgerSourceKind('battle'),
    };
  }).catch(e => ({ error: e.message }));

  if (result.error) {
    check('聚合模块可导入', false, result);
  } else {
    check('1 条目数量等于索引数', result.count === 6, result.count);
    check('2 缺失源记录标 invalid', JSON.stringify(result.invalid) === JSON.stringify(['l5']), result.invalid);
    check('3 按发生时间稳定排序（终态）', JSON.stringify(result.order) === JSON.stringify(['l5', 'l2', 'l3', 'l4', 'l6', 'l1']), result.order);
    check('4 检定标题含角色', result.checkTitle.includes('游侠') && result.checkTitle.includes('察觉'), result.checkTitle);
    check('5 检定展示 DC 与结果', result.checkAmount.includes('DC 15') && result.checkAmount.includes('18'), result.checkAmount);
    check('6 检定取结果提交时间', result.checkAt === 100, result.checkAt);
    check('7 宝藏金额格式化', result.treasureAmount.includes('50gp') && result.treasureAmount.includes('药水×2') && result.treasureAmount.includes('经验 +120'), result.treasureAmount);
    check('8 DM 备注透出', result.itemNote === 'DM 备注', result.itemNote);
    check('9 未回应检定显示待回应且取请求时间', result.pendingAmount === '待回应' && result.pendingAt === 2, result.pendingAmount);
    check('10 汇总钱币 50gp', result.summary.currency.gp === 50, result.summary.currency);
    check('11 汇总物品 3 件（宝藏 2 + 物资日志 1）', result.summary.itemCount === 3, result.summary.itemCount);
    check('12 汇总经验 120 + 150', result.summary.experience === 270, result.summary.experience);
    check('13 汇总法术位 2 环消耗 1', result.summary.spellSlots[2] === 1, result.summary.spellSlots);
    check('14 失效索引不计入汇总', result.summaryNoTreasure.itemCount === 0 && result.summaryNoTreasure.experience === 0, result.summaryNoTreasure);
    check('15 五类源白名单', result.playerKinds === true, result.playerKinds);
    check('16 非白名单拒绝', result.badKind === false, result.badKind);
  }

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
