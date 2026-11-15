// E2E probe: 被动技能引擎七类验收（口径冻结见 .monkeycode/specs/passive-engine/progress.md）
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; if (!QUIET) console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra)); }
}

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

  // ===== 1. 七类单元派生（直接 import 派生函数，不走 UI）=====
  const unit = await page.evaluate(async () => {
    const m = await import('/src/data/passiveCombatRules.ts');
    const ar = await import('/src/data/advantageRules.ts');
    const { characterStore } = await import('/src/data/characterStore.ts');

    const mk = (name, features, extra = {}) => characterStore.add({
      name,
      race: '',
      level: 5,
      experience: 3500,
      abilities: { strength: { score: 10, modifier: 0 }, dexterity: { score: 14, modifier: 2 }, constitution: { score: 16, modifier: 3 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 10, modifier: 0 } },
      skills: {},
      proficiencyBonus: 3,
      features,
      ...extra,
    }).id;

    const out = {};

    // 类1 豁免优劣势
    const dwarf = mk('验·矮人', [
      { name: '矮人体魄', description: '对毒素豁免优势' },
      { name: '险境感知', description: 'DEX 豁免优势' },
    ], { profession: { class: '战士' } });
    const dwarfChar = characterStore.get(dwarf);
    out.s1 = ar.detectAdvantage({ scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: dwarfChar, saveAbility: 'constitution', sourceSpellName: '毒云术', roster: [] }).advantage.map(a => a.label);
    out.s2 = ar.detectAdvantage({ scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: dwarfChar, saveAbility: 'dexterity', roster: [] }).advantage.map(a => a.label);
    out.s3 = ar.detectAdvantage({ scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: dwarfChar, saveAbility: 'wisdom', roster: [] }).advantage.map(a => a.label);

    // 类2 伤害抗性/免疫
    const dragonborn = mk('验·龙裔', [
      { name: '伤害抗性', description: '你获得火焰伤害的抗性' },
      { name: '百病不侵', description: '你免疫疾病' },
    ], { race: '龙裔' });
    const aff = m.deriveCharacterAffinities(characterStore.get(dragonborn));
    out.f1 = (aff?.resistances ?? []).map(e => e.types);
    out.f2 = (aff?.immunities ?? []).map(e => e.types);

    // 类3 无甲防御 AC + 类4 速度修正
    const barbarian = mk('验·野蛮人', [{ name: '无甲防御', description: 'AC=10+敏捷+体质' }], { profession: { class: '野蛮人' } });
    out.a1 = m.resolveUnarmoredAc(characterStore.get(barbarian), false);
    out.a2 = m.resolveUnarmoredAc(characterStore.get(barbarian), true);
    const monk = mk('验·武僧', [
      { name: '无甲防御', description: 'AC=10+敏捷+感知' },
      { name: '无甲移动', description: '未着装护甲时移动力增加' },
    ], { profession: { class: '武僧' }, level: 2, experience: 0 });
    const monkChar = characterStore.get(monk);
    out.a3 = m.resolveUnarmoredAc(monkChar, false, true);
    out.v1 = m.deriveSpeedModifier(monkChar, {});
    out.v2 = m.deriveSpeedModifier(monkChar, { combatShieldHeld: true });
    const scout = mk('验·游侠速', [{ name: '快速移动', description: '未穿重甲+10尺' }], { profession: { class: '游侠' } });
    const scoutChar = characterStore.get(scout);
    out.v3 = m.deriveSpeedModifier(scoutChar, { wearingHeavyArmor: false });
    out.v4 = m.deriveSpeedModifier(scoutChar, { wearingHeavyArmor: true });

    // 类5 被动检定三件套 + 类6 黑暗视觉
    const ranger = mk('验·游侠检', [
      { name: '黑暗视觉', description: '你拥有 60 尺的黑暗视觉。' },
      { name: '观察者', description: '被动感知+5' },
    ], {
      race: '精灵',
      abilities: { strength: { score: 10, modifier: 0 }, dexterity: { score: 14, modifier: 2 }, constitution: { score: 10, modifier: 0 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 14, modifier: 2 }, charisma: { score: 10, modifier: 0 } },
      skills: { perception: { proficient: true, extra: 0 }, investigation: { proficient: false, extra: 0 } },
    });
    const rangerChar = characterStore.get(ranger);
    out.p1 = m.derivePassiveChecks(rangerChar);
    out.d1 = m.deriveDarkvision(rangerChar);
    const drow = mk('验·卓尔', [], { race: '精灵（黑暗精灵）' });
    out.d2 = m.deriveDarkvision(characterStore.get(drow));

    // 类7 先攻优劣势（等级门槛）
    const barb7 = mk('验·野7', [{ name: '野性直觉', description: '先攻优势', level: 7 }], { profession: { class: '野蛮人' }, level: 7, experience: 16500 });
    const barb2 = mk('验·野2', [{ name: '野性直觉', description: '先攻优势', level: 7 }], { profession: { class: '野蛮人' }, level: 2, experience: 0 });
    out.i1 = m.deriveInitiativeAdvantage(characterStore.get(barb7))?.label ?? null;
    out.i2 = m.deriveInitiativeAdvantage(characterStore.get(barb2))?.label ?? null;

    for (const id of [dwarf, dragonborn, barbarian, monk, scout, ranger, drow, barb7, barb2]) characterStore.delete(id);
    return out;
  });
  await page.waitForTimeout(300);

  // 类1
  check('1a 矮人体魄毒豁免优势', (unit.s1 || []).some(l => l.includes('矮人体魄')), unit.s1);
  check('1b 险境感知未知来源DEX优势', (unit.s2 || []).length >= 1, unit.s2);
  check('1c WIS未知来源不误报', (unit.s3 || []).length === 0, unit.s3);
  // 类2
  check('2a 龙裔火焰抗性', (unit.f1 || []).flat().includes('火焰'), unit.f1);
  check('2b 百病不侵毒素免疫', (unit.f2 || []).flat().includes('毒素'), unit.f2);
  // 类3
  check('3a 野蛮人无甲AC15', unit.a1 === 15, unit.a1);
  check('3b 穿甲后无无甲AC', unit.a2 === null, unit.a2);
  check('3c 武僧持盾无无甲AC', unit.a3 === null, unit.a3);
  // 类4
  check('4a 武僧L2无甲移动+10', unit.v1 === 10, unit.v1);
  check('4b 武僧持盾速度+0', unit.v2 === 0, unit.v2);
  check('4c 快速移动轻装+10', unit.v3 === 10, unit.v3);
  check('4d 快速移动重甲+0', unit.v4 === 0, unit.v4);
  // 类5
  check('5a 被动感知=10+2+3+5=20', unit.p1?.perception === 20, unit.p1);
  check('5b 被动洞察=12', unit.p1?.insight === 12, unit.p1);
  check('5c 被动调查=10', unit.p1?.investigation === 10, unit.p1);
  // 类6
  check('6a 精灵黑暗视觉60', unit.d1 === 60, unit.d1);
  check('6b 卓尔种族兜底120', unit.d2 === 120, unit.d2);
  // 类7
  check('7a 野性直觉L7先攻优势', typeof unit.i1 === 'string' && unit.i1.includes('野性直觉'), unit.i1);
  check('7b L2不触发', unit.i2 === null, unit.i2);

  // ===== 2. UI 冒烟：入战快照链路（先攻弹窗 → 参战者面板）=====
  let ui = { step: 'start', dlg: false, alert5: false, panel: false, dv: false };
  try {
    await page.evaluate(async () => {
      const { characterStore } = await import('/src/data/characterStore.ts');
      characterStore.add({
        name: '验收·入战卡', race: '精灵', level: 5, profession: { class: '游侠' }, maxHp: 20, currentHp: 20,
        abilities: { strength: { score: 10, modifier: 0 }, dexterity: { score: 14, modifier: 2 }, constitution: { score: 10, modifier: 0 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 14, modifier: 2 }, charisma: { score: 10, modifier: 0 } },
        skills: { perception: { proficient: true, extra: 0 } },
        proficiencyBonus: 3,
        features: [
          { name: '黑暗视觉', description: '你拥有 60 尺的黑暗视觉。', category: '种族' },
          { name: '观察者', description: '被动感知+5', category: '专长' },
          { name: '警觉', description: '先攻+5', category: '专长' },
        ],
      });
    });
    await page.waitForTimeout(400);
    ui.step = 'add-participant';
    await page.click('button:has-text("添加参战者")');
    await page.waitForTimeout(400);
    ui.step = 'select-char';
    await page.click('text=验收·入战卡');
    await page.waitForTimeout(400);
    ui.step = 'init-dialog';
    const dlgText = await page.evaluate(() => document.body.innerText);
    ui.dlg = dlgText.includes('警觉');
    ui.alert5 = /\+5/.test(dlgText);
    ui.step = 'confirm-join';
    await page.fill('input[type="number"]', '10');
    await page.click('text=确认加入');
    await page.waitForTimeout(600);
    ui.step = 'open-panel';
    await page.click('text=验收·入战卡').catch(() => {});
    await page.waitForTimeout(500);
    const panelText = await page.evaluate(() => document.body.innerText);
    ui.panel = /感知 20/.test(panelText);
    ui.dv = /60 尺/.test(panelText);
  } catch (e) {
    console.error('UI smoke error at', ui.step, ':', e.message.split('\n')[0]);
  }
  check('UI-a 先攻弹窗显示警觉+5', ui.dlg && ui.alert5, ui);
  check('UI-b 面板显示被动感知20', ui.panel, ui);
  check('UI-c 面板显示黑暗视觉60尺', ui.dv, ui);

  console.log(`\n==== probe-passive2: ${pass} pass, ${fail} fail ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
