// 弹药/握持探针：弓+箭无需「双持弓」、背包「箭」能被识别为弓弹药、双手握持判定口径。
// 运行：NODE_PATH=$(npm root -g) QUIET=1 node scripts/probes/probe-ammo-grip.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = !!process.env.QUIET;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; if (!QUIET) console.log('PASS ' + name); }
  else { fail++; failures.push(name); console.log('FAIL ' + name + ' :: ' + JSON.stringify(detail)); }
}

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const USER = { id: 'e2e', username: 'e2e-dm', role: 'dm', isAdmin: true };
  await ctx.addInitScript((u) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, USER);
  await ctx.route('**/api/auth/me', r => r.fulfill({ json: { user: USER } }));
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(BASE + '/combat', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const out = await page.evaluate(async () => {
    const ammo = await import('/src/data/ammo.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;

    const bowNames = ammo.getAmmoNames({ name: '长弓', subtype: '军用远程' });
    const magicBowNames = ammo.getAmmoNames({ name: '誓仇弓', subtype: '长弓' });
    const crossbowNames = ammo.getAmmoNames({ name: '轻弩' });
    const slingNames = ammo.getAmmoNames({ name: '投石索' });

    const bow = { id: 'bow1', childId: 'bow1', name: '长弓', subtype: '军用远程', properties: ['弹药（射程150/600）', '双手'], quantity: 1 };
    const magicBow = { id: 'bow2', childId: 'bow2', name: '誓仇弓', subtype: '长弓', properties: ['弹药', '双手'], quantity: 1 };
    const arrows = { id: 'ammo1', childId: 'ammo1', name: '箭', category: '杂物', quantity: 5 };
    const sword = { id: 'sword1', childId: 'sword1', name: '巨剑', subtype: '军用近战', properties: ['双手', '重型'], quantity: 1 };
    const dagger = { id: 'dagger1', childId: 'dagger1', name: '匕首', properties: ['灵巧', '轻型'], quantity: 1 };

    const inv = [bow, magicBow, arrows, sword, dagger];
    const mk = (leftId, rightId) => ({
      id: 'c1', name: '测试者',
      heldLeft: { state: 'ready', equipmentId: leftId },
      heldRight: { state: 'ready', equipmentId: rightId },
    });

    return {
      bowNames, magicBowNames, crossbowNames, slingNames,
      matchArrow: ammo.matchesAmmoName('箭', bowNames),
      matchArrowSuffix: ammo.matchesAmmoName('箭（20支）', bowNames),
      matchArrowCount: ammo.matchesAmmoName('箭×20', bowNames),
      matchQuiver: ammo.matchesAmmoName('箭袋', bowNames),
      matchBoltAsArrow: ammo.matchesAmmoName('弩矢', bowNames),

      gripBothHands: ammo.isTwoHandedGripOk(bow, true, null),
      gripBowArrow: ammo.isTwoHandedGripOk(bow, false, '箭'),
      gripBowDagger: ammo.isTwoHandedGripOk(bow, false, '匕首'),
      gripSwordArrow: ammo.isTwoHandedGripOk(sword, false, '箭'),
      gripSwordBoth: ammo.isTwoHandedGripOk(sword, true, null),

      useBowArrowLeft: combatStore.isCombatantWeaponUsable(mk('ammo1', 'bow1'), 'left', inv),
      useBowArrowRight: combatStore.isCombatantWeaponUsable(mk('ammo1', 'bow1'), 'right', inv),
      useBowAlone: combatStore.isCombatantWeaponUsable(mk(null, 'bow1'), 'right', inv),
      useBowBoth: combatStore.isCombatantWeaponUsable(mk('bow1', 'bow1'), 'right', inv),
      useMagicBowArrow: combatStore.isCombatantWeaponUsable(mk('ammo1', 'bow2'), 'right', inv),
      useSwordArrow: combatStore.isCombatantWeaponUsable(mk('ammo1', 'sword1'), 'right', inv),
      useSwordBoth: combatStore.isCombatantWeaponUsable(mk('sword1', 'sword1'), 'right', inv),
    };
  });

  check('长弓弹药识别为「箭」', out.bowNames.includes('箭'), out.bowNames);
  check('魔法弓（子类长弓）也识别「箭」', out.magicBowNames.includes('箭'), out.magicBowNames);
  check('轻弩识别为弩矢', out.crossbowNames.includes('弩矢'), out.crossbowNames);
  check('投石索识别为弹丸', out.slingNames.includes('投石索弹丸'), out.slingNames);
  check('「箭」命中弓弹药', out.matchArrow === true, out.matchArrow);
  check('「箭（20支）」命中', out.matchArrowSuffix === true, out.matchArrowSuffix);
  check('「箭×20」命中', out.matchArrowCount === true, out.matchArrowCount);
  check('「箭袋」不误判', out.matchQuiver === false, out.matchQuiver);
  check('「弩矢」不当作弓弹药', out.matchBoltAsArrow === false, out.matchBoltAsArrow);

  check('双手同持弓满足握持', out.gripBothHands === true, out.gripBothHands);
  check('弓+箭满足握持（无需双持弓）', out.gripBowArrow === true, out.gripBowArrow);
  check('弓+匕首不满足握持', out.gripBowDagger === false, out.gripBowDagger);
  check('非弹药双手武器+箭不满足', out.gripSwordArrow === false, out.gripSwordArrow);
  check('巨剑双持满足握持', out.gripSwordBoth === true, out.gripSwordBoth);

  check('装备层：弓+箭左手可用', out.useBowArrowLeft === true, out.useBowArrowLeft);
  check('装备层：弓+箭右手可用', out.useBowArrowRight === true, out.useBowArrowRight);
  check('装备层：单手持弓不可用（需双持或另手持箭）', out.useBowAlone === false, out.useBowAlone);
  check('装备层：弓双手可用', out.useBowBoth === true, out.useBowBoth);
  check('装备层：魔法弓+箭可用', out.useMagicBowArrow === true, out.useMagicBowArrow);
  check('装备层：巨剑+箭不可用', out.useSwordArrow === false, out.useSwordArrow);
  check('装备层：巨剑双持可用', out.useSwordBoth === true, out.useSwordBoth);

  await browser.close();
  if (!QUIET) console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) { console.error('FAILURES: ' + failures.join(', ')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
