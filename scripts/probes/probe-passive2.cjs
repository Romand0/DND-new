// E2E probe: 被动技能引擎第二期（被动检定三件套 / 黑暗视觉 / 警觉 / 野性直觉）
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
  await page.goto(BASE + '/combat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('button[title*="沙盒试验场"]');
  await page.waitForTimeout(800);

  await page.evaluate(async () => {
    const { setRulebookScope } = await import('/src/data/libraryScope.ts');
    setRulebookScope(['玩家手册 2014']);
    const { characterStore } = await import('/src/data/characterStore.ts');
    characterStore.getAll().filter(c => c.isSandbox).forEach(c => characterStore.delete(c.id));
  });
  await page.waitForTimeout(600);

  const results = {};

  // ===== 1. 单元派生：影子卡（武僧 L4，感知16 智10，无技能熟练）=====
  results.unit = await page.evaluate(async () => {
    const m = await import('/src/data/passiveCombatRules.ts');
    const { characterStore } = await import('/src/data/characterStore.ts');
    const mk = (o) => characterStore.add({ name: o.name, race: o.race ?? '-', level: o.level ?? 1, profession: { class: o.cls ?? '-' }, maxHp: 10, currentHp: 10, ...o.extra }).id;
    // 武僧影子卡形态：abilities 有 modifier
    const monk = mk({
      name: '被动测试·武僧', cls: '武僧', level: 4, isSandbox: true,
      extra: {
        abilities: { strength: { score: 10, modifier: 0 }, dexterity: { score: 10, modifier: 0 }, constitution: { score: 10, modifier: 0 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 16, modifier: 3 }, charisma: { score: 10, modifier: 0 } },
        skills: {}, proficiencyBonus: 2, features: [],
      },
    });
    const pc = m.derivePassiveChecks(characterStore.get(monk));
    const dv = m.deriveDarkvision(characterStore.get(monk));
    const ia = m.deriveInitiativeAdvantage(characterStore.get(monk));
    characterStore.delete(monk);
    return { pc, dv: dv ?? null, ia: ia?.label ?? null };
  });

  // ===== 2. 精灵游侠 L5：黑暗视觉(文本60尺) + 观察者(被动感知+5) + 察觉熟练 + 警觉 =====
  results.ranger = await page.evaluate(async () => {
    const m = await import('/src/data/passiveCombatRules.ts');
    const ab = await import('/src/lib/attackBonus.ts');
    const { characterStore } = await import('/src/data/characterStore.ts');
    const mk = (o) => characterStore.add({ name: o.name, race: o.race ?? '-', level: o.level ?? 1, profession: { class: o.cls ?? '-' }, maxHp: 10, currentHp: 10, ...o.extra }).id;
    const ranger = mk({
      name: '被动测试·游侠', race: '精灵', cls: '游侠', level: 5,
      extra: {
        abilities: { strength: { score: 10, modifier: 0 }, dexterity: { score: 14, modifier: 2 }, constitution: { score: 10, modifier: 0 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 14, modifier: 2 }, charisma: { score: 10, modifier: 0 } },
        skills: { perception: { proficient: true, extra: 0 }, investigation: { proficient: false, extra: 0 } },
        proficiencyBonus: 3,
        features: [
          { name: '黑暗视觉', description: '你拥有 60 尺的黑暗视觉。', category: '种族' },
          { name: '观察者', description: '被动感知+5', category: '专长' },
          { name: '警觉', description: '先攻+5', category: '专长' },
        ],
      },
    });
    const ch = characterStore.get(ranger);
    const pc = m.derivePassiveChecks(ch);
    const dv = m.deriveDarkvision(ch);
    const init = ab.computeInitiativeBonus(ch);
    characterStore.delete(ranger);
    // 预期：perception=10+2+3+5=20, insight=10+2=12, investigation=10+0=10, dv=60, alert=5
    return { pc, dv, alert: init.alertBonus, total: init.total, dex: init.dexMod };
  });

  // ===== 3. 卓尔兜底：race 含「黑暗精灵」无 features → 120 尺 =====
  results.drow = await page.evaluate(async () => {
    const m = await import('/src/data/passiveCombatRules.ts');
    const { characterStore } = await import('/src/data/characterStore.ts');
    const mk = (o) => characterStore.add({ name: o.name, race: o.race ?? '-', level: 1, profession: { class: '-' }, maxHp: 10, currentHp: 10, ...o.extra }).id;
    const drow = mk({ name: '被动测试·卓尔', race: '精灵（黑暗精灵）', extra: { abilities: {}, skills: {}, proficiencyBonus: 2, features: [] } });
    const dv = m.deriveDarkvision(characterStore.get(drow));
    characterStore.delete(drow);
    return { dv };
  });

  // ===== 4. 野性直觉等级门槛：L7 生效 / L2 不生效 =====
  results.gate = await page.evaluate(async () => {
    const m = await import('/src/data/passiveCombatRules.ts');
    const { characterStore } = await import('/src/data/characterStore.ts');
    const mk = (o) => characterStore.add({ name: o.name, race: '-', level: o.level, profession: { class: '野蛮人' }, maxHp: 10, currentHp: 10, ...o.extra }).id;
    const l7 = mk({ name: '被动测试·野7', level: 7, extra: { abilities: {}, skills: {}, proficiencyBonus: 3, features: [{ name: '野性直觉', description: '先攻优势', category: '职业', level: 7 }] } });
    const l2 = mk({ name: '被动测试·野2', level: 2, extra: { abilities: {}, skills: {}, proficiencyBonus: 2, features: [{ name: '野性直觉', description: '先攻优势', category: '职业', level: 7 }] } });
    const r7 = m.deriveInitiativeAdvantage(characterStore.get(l7))?.label ?? null;
    const r2 = m.deriveInitiativeAdvantage(characterStore.get(l2))?.label ?? null;
    characterStore.delete(l7);
    characterStore.delete(l2);
    return { r7, r2 };
  });

  console.log('单元派生(武僧影子卡):', JSON.stringify(results.unit));
  console.log('精灵游侠L5:', JSON.stringify(results.ranger));
  console.log('卓尔兜底:', JSON.stringify(results.drow));
  console.log('野性直觉门槛:', JSON.stringify(results.gate));

  // ===== 5. UI 链路：精灵游侠入战 → 参战者面板显示被动检定/黑暗视觉 =====
  // 造卡留在页面 → 先攻弹窗（警觉+5）→ 确认 → 点开参战者详情
  const charId = await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    return characterStore.add({
      name: '被动测试·入战卡', race: '精灵', level: 5, profession: { class: '游侠' }, maxHp: 20, currentHp: 20,
      abilities: { strength: { score: 10, modifier: 0 }, dexterity: { score: 14, modifier: 2 }, constitution: { score: 10, modifier: 0 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 14, modifier: 2 }, charisma: { score: 10, modifier: 0 } },
      skills: { perception: { proficient: true, extra: 0 } },
      proficiencyBonus: 3,
      features: [
        { name: '黑暗视觉', description: '你拥有 60 尺的黑暗视觉。', category: '种族' },
        { name: '观察者', description: '被动感知+5', category: '专长' },
        { name: '警觉', description: '先攻+5', category: '专长' },
        { name: '野性直觉', description: '先攻优势', category: '职业', level: 7 },
      ],
    });
  });
  await page.waitForTimeout(400);

  // 先攻投掷弹窗：session 顶栏「添加参战者」→ 选 PC → 先攻弹窗
  await page.click('button:has-text("添加参战者")');
  await page.waitForTimeout(400);
  // 选「被动测试·入战卡」（CharacterSelectPanel）
  await page.click('text=被动测试·入战卡');
  await page.waitForTimeout(400);
  const dlgText = await page.evaluate(() => document.body.innerText);
  console.log('先攻弹窗含警觉+5:', dlgText.includes('警觉'), '| 含野性直觉(应无,L5<7):', dlgText.includes('野性直觉'), '| 含+5:', /\+5/.test(dlgText));

  // 输 d20 → 确认 → 点开参战者看面板
  await page.fill('input[type="number"]', '10');
  await page.click('text=确认加入');
  await page.waitForTimeout(500);
  // 点参战者棋子/列表打开详情面板
  await page.click('text=被动测试·入战卡').catch(() => {});
  await page.waitForTimeout(500);
  const panelText = await page.evaluate(() => document.body.innerText);
  const perceptionShown = /感知 20/.test(panelText);
  const dvShown = /60 尺/.test(panelText);
  console.log('面板含被动感知20(10+2+3+5):', perceptionShown, '| 含黑暗视觉60尺:', dvShown);

  await browser.close();
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1); });
