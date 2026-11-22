// P6-1 体系池接线探针：卓越骰池主入卡 + 战技成员展开 + 池扣链（数据级为主 + UI 冒烟）
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + ' :: ' + JSON.stringify(detail)); }
}

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const USER = { id: 'e2e', username: 'e2e-dm', role: 'dm', isAdmin: true };
  await ctx.addInitScript((u) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, USER);
  await ctx.route('**/api/auth/me', r => r.fulfill({ json: { user: USER } }));
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(BASE + '/combat', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.click('button[title*="沙盒试验场"]');
  await page.waitForTimeout(800);

  // setup：战斗大师战士卡（features 空）+ 参战者挂卡 → 进战合并自动展开成员/池主
  await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    for (const c of characterStore.getAll().filter(c => c.name.startsWith('P6探针'))) {
      characterStore.delete(c.id);
    }
    characterStore.add({ name: 'P6探针·战斗大师', level: 5, profession: { class: '战士', subclass: 'battle_master' }, features: [] });
    const card = characterStore.getAll().find(c => c.name === 'P6探针·战斗大师');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, {
      resourceConsumption: true,
      featureUses: {},
      combatants: [
        { id: 'p61-pc', name: '战斗大师', isPc: true, characterId: card.id, initiative: 10, actions: 1, bonusActions: 1, currentHp: 40, maxHp: 44, movementUsed: 0, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
      ],
      rounds: [{ 'p61-pc': '' }, { 'p61-pc': '' }],
      updatedAt: Date.now(),
    });
    battlegroundStore.getOrCreate(rec.id);
    battlegroundStore.setTokens(rec.id, [{ combatantId: 'p61-pc', col: 2, row: 2 }]);
  });
  await page.reload();
  await page.waitForTimeout(1000);

  // 数据级：进战合并后的卡状态 + 池链路
  const wire = await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { resolvePoolKey, findPoolOwner, getPoolMax } = await import('/src/data/featurePool.ts');
    const card = characterStore.getAll().find(c => c.name === 'P6探针·战斗大师');
    const feats = card?.features ?? [];
    const owner = feats.find(f => f.name === '卓越战技');
    const members = feats.filter(f => f.system === '卓越战技' && f.systemKind === 'member');
    const trip = feats.find(f => f.name === '摔绊攻击');
    const poolKey = trip ? resolvePoolKey(trip) : null;
    const poolOwner = poolKey ? findPoolOwner(card, poolKey) : null;
    const max = poolOwner ? getPoolMax(card, poolOwner.poolFormula) : 0;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const view = combatStore.getFeaturePoolView(rec.id, 'p61-pc');
    const consume1 = poolKey ? combatStore.consumeFeatureUse(rec.id, 'p61-pc', poolKey, 1) : false;
    const consume2 = poolKey ? combatStore.consumeFeatureUse(rec.id, 'p61-pc', poolKey, 1) : false;
    const consume3 = poolKey ? combatStore.consumeFeatureUse(rec.id, 'p61-pc', poolKey, 1) : false;
    const consume4 = poolKey ? combatStore.consumeFeatureUse(rec.id, 'p61-pc', poolKey, 1) : false;
    const consume5 = poolKey ? combatStore.consumeFeatureUse(rec.id, 'p61-pc', poolKey, 1) : false;
    const delta = combatStore.get(rec.id).featureUses?.['p61-pc']?.[poolKey ?? ''] ?? 0;
    const viewAfter = combatStore.getFeaturePoolView(rec.id, 'p61-pc');
    const viewPool = (view ?? []).find(p => p.featureKey === poolKey);
    const viewPoolAfter = (viewAfter ?? []).find(p => p.featureKey === poolKey);
    return {
      cardCount: feats.length,
      ownerOk: !!(owner && owner.resource === 'pool' && owner.poolFormula?.type === 'levelTiers'),
      memberNames: members.map(m => m.name),
      tripOk: !!(trip && trip.role === 'active' && trip.systemKind === 'member'),
      poolKey, poolOwnerName: poolOwner?.name ?? null, max,
      viewPool, consume1, consume2, consume3, consume4, consume5, delta, viewPoolAfter,
    };
  });
  check('A1 卓越战技池主入卡（resource=pool + poolFormula levelTiers）', wire.ownerOk, wire.ownerOk);
  check('A2 16 条战技成员展开入卡', wire.memberNames.length === 16, wire.memberNames);
  check('A3 摔绊攻击标注完整（role=active + systemKind=member）', wire.tripOk, wire.tripOk);
  check('A4 成员池键解析 = feature:卓越战技', wire.poolKey === 'feature:卓越战技', wire.poolKey);
  check('A5 findPoolOwner 命中卓越战技池主', wire.poolOwnerName === '卓越战技', wire.poolOwnerName);
  check('A6 L5 档池满量 = 4', wire.max === 4, wire.max);
  check('A7 面板池视图含卓越骰池（max 4 available 4）', wire.viewPool && wire.viewPool.max === 4 && wire.viewPool.available === 4, wire.viewPool);
  check('A8 连扣 4 次成功第 5 次拒', wire.consume1 && wire.consume2 && wire.consume3 && wire.consume4 && !wire.consume5 && wire.delta === 4, wire);
  check('A9 扣减后池视图 available 0', wire.viewPoolAfter && wire.viewPoolAfter.available === 0, wire.viewPoolAfter);

  // UI 冒烟：操作 tab 含战技成员按钮（数据投影）
  const geo = await page.evaluate(() => {
    const g = document.querySelector('div.grid.origin-top-left');
    const r = g.children[0].getBoundingClientRect();
    return { x: r.x, y: r.y, cell: r.width };
  });
  await page.mouse.dblclick(geo.x + 2.5 * geo.cell, geo.y + 2.5 * geo.cell);
  await page.waitForTimeout(400);
  const panel = page.locator('div.fixed.inset-0.z-50').last();
  await panel.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  const tripBtn = await panel.getByRole('button', { name: /摔绊攻击/ }).count();
  const tripBtn2 = await panel.getByRole('button', { name: /精准攻击/ }).count();
  check('A10 操作 tab 战技成员按钮渲染（摔绊+精准）', tripBtn === 1 && tripBtn2 === 1, { tripBtn, tripBtn2 });

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  if (failures.length) console.log('FAILED: ' + failures.join(' | '));
  await browser.close();
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
