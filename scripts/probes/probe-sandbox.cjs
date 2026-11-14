// E2E probe: 试验场人偶设置（职业/子职业/特性/法术位）+ 资源消耗模式
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const USER = { id: 'e2e', username: 'e2e-dm', role: 'dm', isAdmin: true };
  await ctx.addInitScript((u) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, USER);
  await ctx.route('**/api/auth/me', r => r.fulfill({ json: { user: USER } }));
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE:', m.text().slice(0, 300)); });
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1. 进试验场
  await page.goto(BASE + '/combat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('button[title*="沙盒试验场"]');
  await page.waitForTimeout(800);
  console.log('URL:', page.url());

  // 1.5 设置规则书范围（CampaignContext 在真实流程注入；SPA 会话内设置后订阅驱动 Dialog 刷新）
  // 注意：在 session 页内删除 isProvingGround 记录会让页面 state 指向已删 id，故只清影子卡
  await page.evaluate(async () => {
    const { setRulebookScope } = await import('/src/data/libraryScope.ts');
    setRulebookScope(['玩家手册 2014']);
    const { characterStore } = await import('/src/data/characterStore.ts');
    characterStore.getAll().filter(c => c.isSandbox).forEach(c => characterStore.delete(c.id));
  });
  await page.waitForTimeout(600);

  // 2. 点「己方人偶」开弹窗
  await page.click('text=己方人偶');
  await page.waitForTimeout(300);

  // 3. 选武僧 L4 + 属性
  await page.selectOption('select >> nth=0', 'monk');
  await page.waitForTimeout(200);
  const levelInput = page.locator('div:has(> label:text-is("等级")) input');
  await levelInput.fill("4");
  await levelInput.blur();
  await page.waitForTimeout(200);
  // 体质 16 → +3（无甲防御 10+敏2+体3=15）
  const conInput = page.locator('div:has(> div:text-is("体质")) input').last();
  await conInput.fill('16');
  // 感知 16 → +3（武僧无甲防御用感知：AC = 10 + dex0 + wis3 = 13）
  const wisInput = page.locator('div:has(> div:text-is("感知")) input').last();
  await wisInput.fill('16');
  // HP 30
  const hpInput = page.locator('div:has(> label:text-is("生命上限")) input');
  await hpInput.fill('30');
  await page.waitForTimeout(200);

  // 特性预览断言（L4：气、无甲防御、无甲移动）
  const previewText = await page.locator('text=已解锁特性').locator('..').innerText();
  console.log('预览含无甲防御:', previewText.includes('无甲防御'), '| 含无甲移动:', previewText.includes('无甲移动'));

  // 4. 生成
  await page.click('text=生成人偶');
  await page.waitForTimeout(500);

  // 5. 数据层断言
  const out = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    const record = combatStore.getAll().find(r => r.isProvingGround);
    const dummy = record.combatants[record.combatants.length - 1];
    const shadow = dummy.characterId ? characterStore.get(dummy.characterId) : null;
    return {
      dummyName: dummy.name,
      isPc: dummy.isPc,
      shadowProfession: shadow?.profession,
      shadowAc: shadow?.armorClass,
      heldRight: dummy.heldRight?.equipmentId ?? null,
      speedModifier: dummy.speedModifier ?? null,
      affinities: dummy.damageAffinities ?? null,
      shadowLevel: shadow?.level,
      shadowCon: shadow?.abilities?.constitution,
      shadowFeatures: (shadow?.features ?? []).map(f => f.name),
      shadowSlotsL1: shadow?.spells?.spellSlots?.level1,
      shadowMaxHp: shadow?.maxHp,
      ac: dummy.ac,
    };
  });
  console.log('人偶数据:', JSON.stringify(out, null, 2));

  // 6. 资源消耗开关
  await page.click('text=资源消耗');
  await page.waitForTimeout(300);
  const res = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const record = combatStore.getAll().find(r => r.isProvingGround);
    const dummy = record.combatants[record.combatants.length - 1];
    const off = {
      flag: record.resourceConsumption,
      // 关：模拟模式扣到 0 立即回 1
      simConsume: combatStore.consumeAction(record.id, dummy.id, 'simulation'),
      moveOff: combatStore.getRemainingMovement(dummy, 'simulation', false, !!record.resourceConsumption),
    };
    // 开：真扣 + 移动真扣
    const rec2 = combatStore.get(record.id);
    combatStore.update(rec2.id, { resourceConsumption: true, updatedAt: Date.now() });
    const d2 = combatStore.get(rec2.id).combatants.find(c => c.id === dummy.id);
    const on = {
      flag: combatStore.get(rec2.id).resourceConsumption,
      consumeTo0: combatStore.consumeAction(rec2.id, d2.id, 'simulation'),
      actionsAfter: combatStore.get(rec2.id).combatants.find(c => c.id === d2.id).actions,
      moveConsume: combatStore.consumeMovement(rec2.id, d2.id, 15, 'simulation', false),
      remaining: combatStore.getRemainingMovement(combatStore.get(rec2.id).combatants.find(c => c.id === d2.id), 'simulation', false, true),
    };
    return { off, on };
  });
  console.log('资源消耗:', JSON.stringify(res, null, 2));

  // 7. 被动引擎经人偶链路验证：无甲防御（computeCombatantAc）+ 险境感知豁免优势
  const passive = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    const { computeCombatantAc } = await import('/src/data/combatStore.ts');
    const { detectAdvantage } = await import('/src/data/advantageRules.ts');
    const record = combatStore.getAll().find(r => r.isProvingGround);
    const dummy = record.combatants[record.combatants.length - 1];
    const shadow = characterStore.get(dummy.characterId);
    // AC：无甲防御 = 10 + dex(2) + con(3) = 15；战斗层手持长剑（非盾）不影响
    const ac = computeCombatantAc(dummy, shadow, shadow.equipment);
    // 被动引擎：detectPassiveFeatureRules 读影子卡 features（无甲移动/气非豁免类 → 应为空数组）
    const adv = detectAdvantage({
      scene: 'saving_throw', attacker: dummy, attackerCharacter: shadow,
      saveAbility: 'constitution', roster: record.combatants,
    });
    return { ac, passiveAdv: adv.advantage.map(a => a.label) };
  });
  console.log('被动链路:', JSON.stringify(passive, null, 2));

  // 8. 法师 L3：验证法术位按职业表填充（L3 = 1环×4 + 2环×2）
  await page.click('text=己方人偶');
  await page.waitForTimeout(300);
  await page.selectOption('select >> nth=0', 'wizard');
  const lv3 = page.locator('div:has(> label:text-is("等级")) input');
  await lv3.fill('3');
  await lv3.blur();
  await page.waitForTimeout(200);
  console.log('弹窗select值:', await page.locator('select >> nth=0').inputValue(), '| 名称:', await page.locator('div:has(> label:text-is("名称")) input').inputValue());
  await page.evaluate(async () => {
    window.addEventListener('error', e => console.error('WINERR:', e.message));
    window.addEventListener('unhandledrejection', e => console.error('REJECT:', String(e.reason)));
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    window.__updateLog = [];
    const orig = combatStore.update.bind(combatStore);
    combatStore.update = (id, patch) => {
      window.__updateLog.push({ id, keys: Object.keys(patch), cbLen: (patch.combatants ?? []).length });
      return orig(id, patch);
    };
  });
  const dlgVisibleBefore = await page.locator('text=生成人偶').isVisible();
  const clickResult = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.includes('生成人偶'));
    if (btns.length !== 1) return 'btn count=' + btns.length;
    window.addEventListener('error', e => console.error('CLICKERR:', e.message));
    btns[0].click();
    return 'clicked';
  });
  console.log('clickResult:', clickResult);
  await page.waitForTimeout(500);
  const dlgVisibleAfter = await page.locator('text=生成人偶').count() > 0 && await page.locator('text=生成人偶').isVisible().catch(() => false);
  console.log('弹窗before/after:', dlgVisibleBefore, dlgVisibleAfter);
  console.log('update日志:', JSON.stringify(await page.evaluate(() => window.__updateLog)));
  const namesDump = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    return combatStore.getAll().find(r => r.isProvingGround)?.combatants.map(c => c.name);
  });
  console.log('参战者名单:', namesDump);
  const slots = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    const record = combatStore.getAll().find(r => r.isProvingGround);
    // 先攻排序后最后一个≠最新生成，按名字定位法师人偶
    const dummy = record.combatants.find(c => c.name === '试验体·友2');
    const shadow = dummy.characterId ? characterStore.get(dummy.characterId) : null;
    return {
      prof: shadow?.profession,
      l1: shadow?.spells?.spellSlots?.level1,
      l2: shadow?.spells?.spellSlots?.level2,
      l3: shadow?.spells?.spellSlots?.level3,
      features: shadow?.features?.map(f => f.name).slice(0, 4),
    };
  });
  console.log('法师L3法术位:', JSON.stringify(slots, null, 2));

  await browser.close();
}

main().catch(e => { console.error('PROBE FAIL', e); process.exit(1); });
