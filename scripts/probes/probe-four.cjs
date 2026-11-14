// E2E probe: PC 被动战斗规则引擎三类行为验证
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const result = await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const { deriveCharacterAffinities, resolveUnarmoredAc, deriveSpeedModifier } = await import('/src/data/passiveCombatRules.ts');
    const { detectAdvantage } = await import('/src/data/advantageRules.ts');
    const { computeCombatantAc } = await import('/src/data/combatStore.ts');

    const mk = (name, features, extra = {}) => characterStore.add({
      name,
      race: '',
      background: '',
      level: 5,
      experience: 3500,
      abilities: {
        strength: { score: 10, modifier: 0 },
        dexterity: { score: 14, modifier: 2 },
        constitution: { score: 16, modifier: 3 },
        intelligence: { score: 10, modifier: 0 },
        wisdom: { score: 10, modifier: 0 },
        charisma: { score: 10, modifier: 0 },
      },
      features,
      ...extra,
    });

    const out = {};

    // ===== 类1：优劣势 =====
    const dwarf = mk('probe矮人', [
      { name: '矮人体魄', description: '对毒素豁免优势' },
      { name: '险境感知', description: 'DEX 豁免优势' },
    ], { profession: { class: '战士' } });
    const advPoison = detectAdvantage({
      scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: dwarf,
      saveAbility: 'constitution', sourceSpellName: '毒云术', roster: [],
    });
    out.a1_矮人体魄_毒 = advPoison.advantage.map(a => a.label);

    const advDexUnknown = detectAdvantage({
      scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: dwarf,
      saveAbility: 'dexterity', roster: [],
    });
    out.a2_险境感知_未知来源DEX = advDexUnknown.advantage.map(a => a.label);

    const advWisUnknown = detectAdvantage({
      scene: 'saving_throw', attacker: { id: 'c1' }, attackerCharacter: dwarf,
      saveAbility: 'wisdom', roster: [],
    });
    out.a3_WIS未知来源_应为空 = advWisUnknown.advantage.map(a => a.label);

    // 光环：圣武士守护灵光 2 格内
    const paladin = mk('probe圣武士', [{ name: '守护灵光', description: '10尺内豁免优势' }], { profession: { class: '圣武士' } });
    const roller = { id: 'c1', isPc: true, characterId: dwarf.id, isDead: false };
    const auraCtx = (dist) => ({
      scene: 'saving_throw', attacker: roller, attackerCharacter: dwarf,
      saveAbility: 'wisdom', sourceSpellName: '恐惧术', roster: [
        roller,
        { id: 'c2', isPc: true, characterId: paladin.id, isDead: false },
      ],
      combatantPositions: { c1: { col: 5, row: 5 }, c2: { col: 5 + dist, row: 5 } },
    });
    out.a4_守护灵光_2格内 = detectAdvantage(auraCtx(2)).advantage.map(a => a.label);
    out.a5_守护灵光_3格外_应为空 = detectAdvantage(auraCtx(3)).advantage.map(a => a.label);

    // ===== 类2：抗性派生 =====
    const dragonborn = mk('probe龙裔', [
      { name: '伤害抗性', description: '你获得火焰伤害的抗性' },
      { name: '百病不侵', description: '你免疫疾病' },
    ], { race: '龙裔' });
    const aff = deriveCharacterAffinities(dragonborn);
    out.b1_抗性条目 = (aff?.resistances ?? []).map(e => ({ types: e.types, raw: e.raw }));
    out.b2_免疫条目 = (aff?.immunities ?? []).map(e => ({ types: e.types }));
    out.b3_notes = aff?.notes ?? [];

    // ===== 类3：AC / 速度 =====
    const barbarian = mk('probe野蛮人', [{ name: '无甲防御', description: 'AC=10+敏捷+体质' }], { profession: { class: '野蛮人' } });
    out.c1_野蛮人无甲 = resolveUnarmoredAc(barbarian, false); // 10+2+3=15
    out.c2_野蛮人无甲_穿甲应为null = resolveUnarmoredAc(barbarian, true);

    const monk = mk('probe武僧', [
      { name: '无甲防御', description: 'AC=10+敏捷+感知' },
      { name: '无甲移动', description: '未着装护甲时移动力增加' },
    ], { profession: { class: '武僧' } });
    out.c3_武僧无盾 = resolveUnarmoredAc(monk, false, false); // 10+2+0=12
    out.c4_武僧持盾应为null = resolveUnarmoredAc(monk, false, true);

    out.c5_武僧无甲移动L2 = deriveSpeedModifier(monk, {}); // +10
    out.c6_武僧无甲移动持盾应为0 = deriveSpeedModifier(monk, { combatShieldHeld: true });

    const scout = mk('probe游侠', [{ name: '快速移动', description: '未穿重甲+10尺' }], { profession: { class: '游侠' } });
    out.c7_快速移动轻装 = deriveSpeedModifier(scout, { wearingHeavyArmor: false });
    out.c8_快速移动重甲应为0 = deriveSpeedModifier(scout, { wearingHeavyArmor: true });

    // computeCombatantAc：无甲防御 + 战斗层持盾
    const combatant = {
      id: 'cx', name: 'probe', isPc: true, characterId: barbarian.id,
      heldLeft: { equipmentId: 'shield-x', handState: 'hand' },
      heldRight: null,
    };
    const inv = [{ id: 'shield-x', childId: 'shield-x', name: '盾牌', subtype: '盾牌' }];
    out.c9_战斗层野蛮人带盾 = computeCombatantAc(combatant, barbarian, inv); // 15+2=17

    return out;
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch(e => { console.error('PROBE FAIL', e); process.exit(1); });
