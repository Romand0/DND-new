// debug: 回气附赠动作经济链探查（试验场开关关/开 + 老卡缺标注三变体）
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
  await page.goto(BASE + '/combat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('button[title*="沙盒试验场"]');
  await page.waitForTimeout(800);

  // 卡片构建 helper：full = 带完整标注（role/activation/resource/poolFormula），old = 老卡零标注
  async function setupVariant(cardMode, resourceConsumption) {
    await page.evaluate(async ({ cardMode, resourceConsumption }) => {
      const { characterStore } = await import('/src/data/characterStore.ts');
      const combatStore = (await import('/src/data/combatStore.ts')).default;
      const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
      // 清旧卡
      for (const c of characterStore.getAll().filter(c => c.name.startsWith('经济探针'))) {
        characterStore.delete(c.id);
      }
      const feat = cardMode === 'old'
        ? { name: '回气', description: '你可以在自己回合内用一个附赠动作恢复生命值，其总值为1d10＋你的战士职业等级。', category: '职业特性', level: 1 }
        : { name: '回气', description: '你可以在自己回合内用一个附赠动作恢复生命值，其总值为1d10＋你的战士职业等级。', category: '职业特性', role: 'active', level: 1, activation: 'bonus', resource: 'pool', poolFormula: { type: 'fixed', value: 1, restKind: 'short' } };
      characterStore.add({ name: '经济探针·战士', level: 2, profession: { class: '战士' }, features: [feat] });
      const card = characterStore.getAll().find(c => c.name === '经济探针·战士');
      const rec = combatStore.getAll().find(r => r.isProvingGround);
      combatStore.update(rec.id, {
        resourceConsumption,
        featureUses: {},
        combatants: [
          { id: 'econ-pc', name: '经济战士', isPc: true, characterId: card.id, initiative: 10, actions: 1, bonusActions: 1, currentHp: 20, maxHp: 40, movementUsed: 0, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
        ],
        rounds: [{ 'econ-pc': '' }, { 'econ-pc': '' }],
        updatedAt: Date.now(),
      });
      battlegroundStore.getOrCreate(rec.id);
      battlegroundStore.setTokens(rec.id, [{ combatantId: 'econ-pc', col: 2, row: 2 }]);
    }, { cardMode, resourceConsumption });
    await page.reload();
    await page.waitForTimeout(800);
  }

  // UI 链：双击棋子 → 操作 tab → 回气 → HealRollModal 填 8 → 确认结算
  async function useSecondWind() {
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
    const btn = panel.getByRole('button', { name: /回气/ });
    const btnCount = await btn.count();
    if (btnCount === 0) return { btnCount };
    await btn.first().click();
    await page.waitForTimeout(400);
    if (await page.locator('[data-testid="heal-roll-modal"]').count() === 1) {
      await page.fill('[data-testid="heal-roll-input"]', '8');
      await page.locator('[data-testid="heal-roll-modal"]').getByRole('button', { name: '确认结算' }).click();
      await page.waitForTimeout(400);
    }
    return { btnCount };
  }

  async function readLedger() {
    return page.evaluate(async () => {
      const combatStore = (await import('/src/data/combatStore.ts')).default;
      const rec = combatStore.getAll().find(r => r.isProvingGround);
      const c = combatStore.get(rec.id).combatants.find(x => x.id === 'econ-pc');
      return {
        bonusActions: c.bonusActions,
        actions: c.actions,
        poolUsed: combatStore.get(rec.id).featureUses?.['econ-pc']?.['feature:回气'] ?? 0,
      };
    });
  }

  // ===== B1: 开关关 + 新卡（完整标注）=====
  await setupVariant('full', false);
  let d1 = null;
  page.once('dialog', (dd) => { d1 = dd.message(); dd.dismiss(); });
  const u1 = await useSecondWind();
  const l1 = await readLedger();
  check('B1 开关关+新卡：回气按钮可见', u1.btnCount === 1, u1);
  check('B1 开关关+新卡：bonusActions（现状预期 1 不扣）', l1.bonusActions === 1, l1);
  check('B1 开关关+新卡：池扣 1（现状零门控）', l1.poolUsed === 1, l1);

  // ===== B2: 开关开 + 新卡 =====
  await setupVariant('full', true);
  let d2 = null;
  page.once('dialog', (dd) => { d2 = dd.message(); dd.dismiss(); });
  const u2 = await useSecondWind();
  const l2 = await readLedger();
  check('B2 开关开+新卡：回气按钮可见', u2.btnCount === 1, u2);
  check('B2 开关开+新卡：bonusActions 0（开关打开真扣）', l2.bonusActions === 0, l2);
  check('B2 开关开+新卡：池扣 1', l2.poolUsed === 1, l2);
  check('B2 alert 走 heal 引擎', d2 != null && d2.includes('回气') && d2.includes('恢复'), d2);

  // ===== B3: 开关开 + 老卡（零标注——进战自动升级后应正确记账）=====
  await setupVariant('old', true);
  let d3 = null;
  page.once('dialog', (dd) => { d3 = dd.message(); dd.dismiss(); });
  const u3 = await useSecondWind();
  const l3 = await readLedger();
  check('B3 开关开+老卡：回气按钮可见', u3.btnCount === 1, u3);
  check('B3 开关开+老卡：进战合并后 bonusActions 0（activation 已刷新）', l3.bonusActions === 0, l3);
  check('B3 开关开+老卡：进战合并后池扣 1（resource/poolFormula 已刷新）', l3.poolUsed === 1, l3);
  check('B3 老卡升级后走 heal 引擎', d3 != null && d3.includes('回气') && d3.includes('恢复'), d3);

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  if (failures.length) console.log('FAILED: ' + failures.join(' | '));
  await browser.close();
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
