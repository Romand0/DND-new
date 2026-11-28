// E2E probe: 角色成长路径纯函数（职业表/子职业/法术位/等级派生/数据缺失/确定性）
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
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const growth = await import('/src/lib/growthPath.ts');
    const experience = await import('/src/lib/experience.ts');
    const rawModule = await import('/src/data/options.json');
    const raw = rawModule.default ?? rawModule;
    const options = raw.classes.map((c) => ({ ...c, category: 'class', traits: c.features ?? c.traits ?? [] }));
    const character = (over = {}) => ({
      id: 'c1',
      profession: { class: '战士' },
      experience: 0,
      level: 1,
      abilities: { constitution: { score: 14, modifier: 2 } },
      ...over,
    });
    const names = (list) => list.map((f) => f.name);
    const fighter = growth.buildGrowthPath(character(), options);
    const wizard = growth.buildGrowthPath(character({ profession: { class: '法师' } }), options);
    const champion = growth.buildGrowthPath(character({ profession: { class: '战士', subclass: 'champion' } }), options);
    const warlock = growth.buildGrowthPath(character({ profession: { class: '邪术师' }, experience: 900 }), options);
    const brokenOptions = options.map((option) => (
      option.name === '战士'
        ? { ...option, table: option.table.filter((row) => row.level !== 2) }
        : option
    ));
    const broken = growth.buildGrowthPath(character(), brokenOptions);
    const derived = growth.buildGrowthPath(character({ level: 3, experience: 6500 }), options);
    const derivedAgain = growth.buildGrowthPath(character({ level: 3, experience: 6500 }), options);
    const missing = growth.buildGrowthPath(character({ profession: { class: '不存在的职业' } }), options);
    const noTraitOptions = options.map((option) => (
      option.name === '战士'
        ? { ...option, traits: option.traits.filter((trait) => trait.name !== '额外攻击') }
        : option
    ));
    const noTrait = growth.buildGrowthPath(character(), noTraitOptions);
    const evocation = growth.buildGrowthPath(character({ profession: { class: '法师', subclass: 'school-of-evocation' }, experience: 900 }), options);

    return {
      fighter: {
        levels: fighter.milestones.map((m) => m.level),
        prof: fighter.milestones.slice(0, 6).map((m) => m.proficiencyBonus),
        lv1: names(fighter.milestones[0].classFeatures),
        lv2: names(fighter.milestones[1].classFeatures),
        lv5: names(fighter.milestones[4].classFeatures),
        asi4: fighter.milestones[3].abilityScoreImprovement,
        asi6: fighter.milestones[5].abilityScoreImprovement,
        choice: fighter.milestones[2].subclassChoice,
        hp2: fighter.milestones[1].hpGain,
        hitDie: fighter.milestones[1].hitDie,
      },
      wizard: {
        slots1: wizard.milestones[0].spellSlots,
        slots3: wizard.milestones[2].spellSlots,
        cantrips1: wizard.milestones[0].cantripsKnown,
        cantrips4: wizard.milestones[3].cantripsKnown,
        choiceLevel: wizard.milestones.findIndex((m) => m.subclassChoice) + 1,
        choiceRequired: wizard.milestones[1].subclassChoice?.required,
      },
      champion: {
        lv3: names(champion.milestones[2].subclassFeatures),
        lv7: names(champion.milestones[6].subclassFeatures),
        lv10: names(champion.milestones[9].subclassFeatures),
      },
      warlock: {
        classKey: warlock.classKey,
        effectiveLevel: warlock.effectiveLevel,
        slots1: warlock.milestones[0].spellSlots,
        slots3: warlock.milestones[2].spellSlots,
        choiceLevel: warlock.milestones.findIndex((m) => m.subclassChoice) + 1,
      },
      brokenGaps: broken.milestones[1].gaps,
      derived: {
        effectiveLevel: derived.effectiveLevel,
        helper: experience.getEffectiveLevel({ experience: 6500 }),
        level5: derived.milestones[4].level,
        level4: derived.milestones[3].level,
        same: JSON.stringify(derived) === JSON.stringify(derivedAgain),
        versionSame: derived.pathVersion === derivedAgain.pathVersion,
      },
      noTraitGaps: noTrait.milestones[4].gaps,
      missingGaps: missing.milestones[0].gaps,
      evocationLv2: names(evocation.milestones[1].subclassFeatures),
    };
  }).catch((e) => ({ error: e.message }));

  if (result.error) {
    check('成长路径模块可导入', false, result);
  } else {
    check('1 战士路径覆盖 1-20 级', result.fighter.levels.length === 20 && result.fighter.levels[19] === 20, result.fighter.levels);
    check('2 战士熟练加值档位', JSON.stringify(result.fighter.prof) === JSON.stringify([2, 2, 2, 2, 3, 3]), result.fighter.prof);
    check('3 战士 1 级职业特性', result.fighter.lv1.includes('战斗风格') && result.fighter.lv1.includes('回气'), result.fighter.lv1);
    check('4 战士 2 级动作如潮', result.fighter.lv2.includes('动作如潮'), result.fighter.lv2);
    check('5 战士 5 级额外攻击', result.fighter.lv5.includes('额外攻击'), result.fighter.lv5);
    check('6 属性值提升 4/6 级', result.fighter.asi4?.points === 2 && result.fighter.asi6?.points === 2, [result.fighter.asi4, result.fighter.asi6]);
    check('7 战士 3 级子职业必填', result.fighter.choice?.required === true && result.fighter.choice.candidates.some((c) => c.name === '勇士'), result.fighter.choice);
    check('8 生命值固定值含体质调整', result.fighter.hp2?.fixed === 8 && result.fighter.hp2?.formula === '6 + 2' && result.fighter.hitDie === 10, result.fighter.hp2);
    check('9 法师 1/3 级法术位', JSON.stringify(result.wizard.slots1) === JSON.stringify({ 1: 2 }) && JSON.stringify(result.wizard.slots3) === JSON.stringify({ 1: 4, 2: 2 }), [result.wizard.slots1, result.wizard.slots3]);
    check('10 法师戏法数量成长', result.wizard.cantrips1 === 3 && result.wizard.cantrips4 === 4, [result.wizard.cantrips1, result.wizard.cantrips4]);
    check('11 法师 2 级子职业门槛', result.wizard.choiceLevel === 2 && result.wizard.choiceRequired === true, result.wizard);
    check('12 勇士子职业特性合并', ['精通重击'].every((n) => result.champion.lv3.includes(n)) && result.champion.lv7.includes('运动健将') && result.champion.lv10.includes('额外战斗风格'), result.champion);
    check('13 邪术师别名与契约法术位', result.warlock.classKey === '魔契师' && result.warlock.effectiveLevel === 3 && JSON.stringify(result.warlock.slots1) === JSON.stringify({ 1: 1 }) && JSON.stringify(result.warlock.slots3) === JSON.stringify({ 2: 2 }), result.warlock);
    check('14 职业表缺失写入 gap', result.brokenGaps.some((g) => g.field === 'class-table'), result.brokenGaps);
    check('15 经验推导覆盖等级缓存', result.derived.helper === 5 && result.derived.effectiveLevel === 5 && result.derived.level5 === 5 && result.derived.level4 === 4, result.derived);
    check('16 路径确定性', result.derived.same === true && result.derived.versionSame === true, result.derived);
    check('17 特性描述缺失写入 gap', result.noTraitGaps.some((g) => g.field === 'class-feature'), result.noTraitGaps);
    check('18 职业缺失写入 gap', result.missingGaps.some((g) => g.field === 'class'), result.missingGaps);
    check('19 法师子职业特性合并', result.evocationLv2.includes('塑能学者'), result.evocationLv2);
  }

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILED'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
