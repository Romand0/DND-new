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
      experience: 6500,
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

    // 类1 新条目（P4）：法术抗性（spell 表）/ 大地行者（植物效应 spellMatch）
    const caster = mk('验·术士', [
      { name: '魔法抗性', description: '对法术豁免优势' },
      { name: '法术抗性', description: '对法术豁免优势' },
    ], { profession: { class: '术士' } });
    out.s4 = ar.detectAdvantage({ scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: characterStore.get(caster), saveAbility: 'wisdom', sourceSpellName: '火球术', roster: [] }).advantage.map(a => a.label).join('|');
    const druid = mk('验·德鲁伊', [{ name: '大地行者', description: '对植物效应豁免优势' }], { profession: { class: '德鲁伊' } });
    out.s5 = ar.detectAdvantage({ scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: characterStore.get(druid), saveAbility: 'strength', sourceSpellName: '纠缠术', roster: [] }).advantage.map(a => a.label).join('|');
    out.s6 = ar.detectAdvantage({ scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: characterStore.get(druid), saveAbility: 'strength', sourceSpellName: '火球术', roster: [] }).advantage.map(a => a.label).join('|');

    // 类2 伤害抗性/免疫
    const dragonborn = mk('验·龙裔', [
      { name: '伤害抗性', description: '你获得火焰伤害的抗性' },
      { name: '百病不侵', description: '你免疫疾病' },
    ], { race: '龙裔' });
    const aff = m.deriveCharacterAffinities(characterStore.get(dragonborn));
    out.f1 = (aff?.resistances ?? []).map(e => e.types);
    out.f2 = (aff?.immunities ?? []).map(e => e.types);

    // 类2 新条目（P4）：思维之盾 → 心灵抗性
    const mindShield = mk('验·魔导师', [{ name: '思维之盾', description: '心灵伤害抗性' }], { profession: { class: '魔导师' } });
    out.f3 = (m.deriveCharacterAffinities(characterStore.get(mindShield))?.resistances ?? []).map(e => e.types).flat().join(',');

    // 类3 无甲防御 AC + 类4 速度修正
    const barbarian = mk('验·野蛮人', [{ name: '无甲防御', description: 'AC=10+敏捷+体质' }], { profession: { class: '野蛮人' } });
    out.a1 = m.resolveUnarmoredAc(characterStore.get(barbarian), false);
    out.a2 = m.resolveUnarmoredAc(characterStore.get(barbarian), true);
    const monk = mk('验·武僧', [
      { name: '无甲防御', description: 'AC=10+敏捷+感知' },
      { name: '无甲移动', description: '未着装护甲时移动力增加' },
    ], { profession: { class: '武僧' }, level: 2, experience: 300 });
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
    const barb7 = mk('验·野7', [{ name: '野性直觉', description: '先攻优势', level: 7 }], { profession: { class: '野蛮人' }, level: 7, experience: 23000 });
    const barb2 = mk('验·野2', [{ name: '野性直觉', description: '先攻优势', level: 7 }], { profession: { class: '野蛮人' }, level: 2, experience: 300 });
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
  check('1d 法术抗性（spell 表）：对法术豁免双命中', typeof unit.s4 === 'string' && unit.s4.includes('魔法抗性') && unit.s4.includes('法术抗性'), unit.s4);
  check('1e 大地行者：纠缠术命中', typeof unit.s5 === 'string' && unit.s5.includes('大地行者'), unit.s5);
  check('1f 大地行者：火球术不误报', (unit.s6 || []).length === 0 || !unit.s6.includes('大地行者'), unit.s6);

  check('2a 龙裔火焰抗性', (unit.f1 || []).flat().includes('火焰'), unit.f1);
  check('2b 百病不侵毒素免疫', (unit.f2 || []).flat().includes('毒素'), unit.f2);
  check('2c 思维之盾：心灵伤害抗性', unit.f3 === '心灵', unit.f3);
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

  // ===== 1.5 整改验收：类1/2/3/4 等级门槛 + 勇气/勇敢别名 =====
  const gate = await page.evaluate(async () => {
    const m = await import('/src/data/passiveCombatRules.ts');
    const ar = await import('/src/data/advantageRules.ts');
    const { characterStore } = await import('/src/data/characterStore.ts');

    const mk = (name, features, extra = {}) => characterStore.add({
      name,
      race: '',
      level: 5,
      experience: 6500,
      abilities: { strength: { score: 10, modifier: 0 }, dexterity: { score: 14, modifier: 2 }, constitution: { score: 16, modifier: 3 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 10, modifier: 0 } },
      skills: {},
      proficiencyBonus: 3,
      features,
      ...extra,
    }).id;
    const saveCtx = (char, saveAbility, sourceSpellName) => ar.detectAdvantage({
      scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: char,
      saveAbility, sourceSpellName, roster: [],
    }).advantage.map(a => a.label);

    const out = {};

    // 类1 险境感知 L2 门槛
    const r1 = mk('验·险L1', [{ name: '险境感知', description: 'DEX豁免优势', level: 2 }], { profession: { class: '游侠' }, level: 1, experience: 0 });
    const r2 = mk('验·险L2', [{ name: '险境感知', description: 'DEX豁免优势', level: 2 }], { profession: { class: '游侠' }, level: 2, experience: 300 });
    out.g1 = saveCtx(characterStore.get(r1), 'dexterity');
    out.g2 = saveCtx(characterStore.get(r2), 'dexterity');

    // 类2 自然之护 L10 门槛（德鲁伊）
    const d2 = mk('验·德L2', [{ name: '自然之护', description: '免疫毒素疾病', level: 10 }], { profession: { class: '德鲁伊' }, level: 2, experience: 300 });
    const d10 = mk('验·德L10', [{ name: '自然之护', description: '免疫毒素疾病', level: 10 }], { profession: { class: '德鲁伊' }, level: 10, experience: 64000 });
    out.g3 = m.deriveCharacterAffinities(characterStore.get(d2))?.immunities?.length ?? 0;
    out.g4 = m.deriveCharacterAffinities(characterStore.get(d10))?.immunities?.map(e => e.types.flat()) ?? [];

    // 类3 速度门槛
    const s1 = mk('验·速L1', [{ name: '快速移动', description: '未穿重甲+10尺', level: 5 }], { profession: { class: '游侠' }, level: 1, experience: 0 });
    const s5 = mk('验·速L5', [{ name: '快速移动', description: '未穿重甲+10尺', level: 5 }], { profession: { class: '游侠' }, level: 5, experience: 6500 });
    out.g5 = m.deriveSpeedModifier(characterStore.get(s1), {});
    out.g6 = m.deriveSpeedModifier(characterStore.get(s5), {});
    const m1 = mk('验·僧L1', [{ name: '无甲移动', description: '移动力增加', level: 2 }], { profession: { class: '武僧' }, level: 1, experience: 0 });
    const m2 = mk('验·僧L2', [{ name: '无甲移动', description: '移动力增加', level: 2 }], { profession: { class: '武僧' }, level: 2, experience: 300 });
    out.g7 = m.deriveSpeedModifier(characterStore.get(m1), {});
    out.g8 = m.deriveSpeedModifier(characterStore.get(m2), {});

    // 类1 勇气（新种子名）+ 勇敢（旧别名）
    const c1 = mk('验·勇', [{ name: '勇气', description: '对恐慌豁免优势' }], { race: '半身人' });
    const c2 = mk('验·敢', [{ name: '勇敢', description: '对恐慌豁免优势' }], { race: '半身人' });
    out.g9 = saveCtx(characterStore.get(c1), 'wisdom', '恐惧之源');
    out.g10 = saveCtx(characterStore.get(c2), 'wisdom', '恐惧之源');

    for (const id of [r1, r2, d2, d10, s1, s5, m1, m2, c1, c2]) characterStore.delete(id);
    return out;
  });
  await page.waitForTimeout(300);
  check('8a 险境感知L1不触发', (gate.g1 || []).length === 0, gate.g1);
  check('8b 险境感知L2触发', (gate.g2 || []).length >= 1, gate.g2);
  check('8c 自然之护L2无免疫', gate.g3 === 0, gate.g3);
  check('8d 自然之护L10毒素免疫', (gate.g4 || []).flat().includes('毒素'), gate.g4);
  check('8e 快速移动L1不生效', gate.g5 === 0, gate.g5);
  check('8f 快速移动L5生效', gate.g6 === 10, gate.g6);
  check('8g 无甲移动L1不生效', gate.g7 === 0, gate.g7);
  check('8h 无甲移动L2生效', gate.g8 === 10, gate.g8);
  check('8i 勇气恐慌豁免优势', (gate.g9 || []).some(l => l.includes('勇气')), gate.g9);
  check('8j 旧名勇敢仍命中', (gate.g10 || []).some(l => l.includes('勇气')), gate.g10);

  // ===== 3. 种子反应数据（src 捆绑反制法术 + fallback 三反应法术）=====
  const seedRx = await page.evaluate(async () => {
    const rd = await import('/src/data/reactionDefinitions.ts');
    const rr = await import('/src/data/reactionRules.ts');
    const { spellStore } = await import('/src/data/spellStore.ts');
    const out = {};

    // src 捆绑种子：反制法术带 reaction 声明
    const cs = spellStore.getById('counterspell');
    out.rs1 = cs?.reaction?.trigger === 'spell_cast' && cs.reaction?.slotLevel === 3;
    out.rs2 = rd.resolveReactionDefinition('spell:counterspell')?.cost?.spellSlot === 3;

    // fallback 全库三反应法术（护盾术/法术反制/炼狱叱喝）
    const res = await fetch('/spells-fallback.json');
    const all = await res.json();
    const threeIds = ['shield', 'counterspell', 'hellish-rebuke'];
    const three = all.filter(s => threeIds.includes(s.id));
    out.rs3 = three.filter(s => s.reaction?.trigger).map(s => s.id).sort();
    const merged = [...spellStore.getAllRaw().filter(s => !threeIds.includes(s.id)), ...three];
    spellStore.save(merged);

    // 试验场伪记录（全库开放）下检测三类触发
    const fake = {
      id: 'probe-fake',
      isProvingGround: true,
      combatants: [
        { id: 'pc', name: '探针PC', isPc: true, isDead: false, isUnconscious: false, isIncapacitated: false },
        { id: 'npc', name: '探针NPC', isPc: false, isDead: false, isUnconscious: false, isIncapacitated: false },
      ],
    };
    out.rs4 = rr.detectReactions(fake, { kind: 'attack', attackerId: 'npc', targetId: 'pc' }).map(x => `${x.definitionId}@${x.ownerId}`);
    out.rs5 = rr.detectReactions(fake, { kind: 'spell_cast', casterId: 'npc', spellId: 'fireball' }).map(x => `${x.definitionId}@${x.ownerId}`);
    out.rs6 = rr.detectReactions(fake, { kind: 'damage', targetId: 'pc', attackerId: 'npc', amount: 12, damageType: '火焰' }).map(x => `${x.definitionId}@${x.ownerId}`);
    return out;
  });
  await page.waitForTimeout(300);
  check('9a src种子反制法术spell_cast声明', seedRx.rs1 === true, seedRx);
  check('9b 反应定义法术位3环', seedRx.rs2 === true);
  check('9c fallback三法术全带trigger', (seedRx.rs3 || []).join(',') === 'counterspell,hellish-rebuke,shield', seedRx.rs3);
  check('9d attack触发护盾术@pc', (seedRx.rs4 || []).includes('spell:shield@pc'), seedRx.rs4);
  check('9e spell_cast触发法术反制@pc', (seedRx.rs5 || []).includes('spell:counterspell@pc'), seedRx.rs5);
  check('9f damage触发炼狱叱喝@pc', (seedRx.rs6 || []).includes('spell:hellish-rebuke@pc'), seedRx.rs6);

  // ===== 2. UI 冒烟：入战快照链路（先攻弹窗 → 参战者面板）=====
  let ui = { step: 'start', dlg: false, alert5: false, panel: false, dv: false };
  try {
    await page.evaluate(async () => {
      const { characterStore } = await import('/src/data/characterStore.ts');
      characterStore.add({
        name: '验收·入战卡', race: '精灵', level: 5, experience: 6500, profession: { class: '游侠' }, maxHp: 20, currentHp: 20,
        abilities: { strength: { score: 10, modifier: 0 }, dexterity: { score: 14, modifier: 2 }, constitution: { score: 10, modifier: 0 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 14, modifier: 2 }, charisma: { score: 10, modifier: 0 } },
        skills: { perception: { proficient: true, extra: 0 } },
        proficiencyBonus: 3,
        features: [
          { id: 'pf-dv', name: '黑暗视觉', description: '你拥有 60 尺的黑暗视觉。', category: '种族' },
          { id: 'pf-obs', name: '观察者', description: '被动感知+5', category: '专长' },
          { id: 'pf-alert', name: '警觉', description: '先攻+5', category: '专长' },
          { id: 'pf-trance', name: '出神', description: '4 小时冥想代替 8 小时睡眠。', category: '种族' },
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

  // ===== 2.5 被动徽标三态（「…」信息对话框内：engine/mechanic/setting）=====
  let badge = { step: 'start', engine: 0, mechanic: 0, setting: 0 };
  try {
    const charId = await page.evaluate(async () => {
      const { characterStore } = await import('/src/data/characterStore.ts');
      return characterStore.getAll().find(c => c.name === '验收·入战卡')?.id ?? '';
    });
    badge.step = 'goto-detail';
    await page.goto(BASE + '/characters/' + charId, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    badge.step = 'passive-tab';
    await page.click('button:has-text("被动技能")').catch(() => {});
    await page.waitForTimeout(500);
    badge.step = 'badges';
    const kinds = [];
    for (const name of ['黑暗视觉', '观察者', '警觉', '出神']) {
      await page.click(`[data-feature-info="${name}"]`);
      await page.waitForTimeout(200);
      kinds.push(await page.locator('[data-passive-badge]').getAttribute('data-passive-badge'));
      await page.click('[data-close-info]');
      await page.waitForTimeout(200);
    }
    badge.engine = kinds.filter(k => k === 'engine').length;
    badge.mechanic = kinds.filter(k => k === 'mechanic').length;
    badge.setting = kinds.filter(k => k === 'setting').length;
  } catch (e) {
    console.error('Badge smoke error at', badge.step, ':', e.message.split('\n')[0]);
  }
  check('UI-d 徽标 engine≥2（黑暗视觉/观察者已接入表）', badge.engine >= 2, badge);
  check('UI-e 徽标 mechanic≥1（警觉未标注默认 DM 裁定）', badge.mechanic >= 1, badge);
  check('UI-f 徽标 setting=1（出神显式标注）', badge.setting === 1, badge);

  console.log(`\n==== probe-passive2: ${pass} pass, ${fail} fail ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
