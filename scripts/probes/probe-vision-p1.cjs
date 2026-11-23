// P1 掩护探针：visionRules 纯函数（LOS/加值）+ computeCombatantAc 掩护修正 + 豁免管线修正
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

  const results = await page.evaluate(async () => {
    const vr = await import('/src/data/visionRules.ts');
    const combatStoreMod = await import('/src/data/combatStore.ts');
    const combatStore = combatStoreMod.default;
    const out = {};

    // ===== A. isLosBlocked 几何用例 =====
    const A = { col: 0, row: 0 };
    const B = { col: 5, row: 0 };
    const C = { col: 2, row: 3 };
    // 无墙：不遮挡
    out.losNoWall = vr.isLosBlocked({ paintedCells: [] }, A, B);
    // 相邻格：恒无遮挡（即使有墙）
    out.losAdjacent = vr.isLosBlocked({ paintedCells: ['1,0'] }, A, { col: 1, row: 0 });
    // 直线穿墙：中间格 (2,0) 是墙 → 遮挡
    out.losStraightWall = vr.isLosBlocked({ paintedCells: ['2,0'] }, A, B);
    // 斜线路径墙：A(0,0)→B(5,3) Bresenham 路径含 (2,1)
    out.losDiagWall = vr.isLosBlocked({ paintedCells: ['2,1'] }, A, { col: 5, row: 3 });
    // 斜线路径无墙：不遮挡
    out.losDiagClear = vr.isLosBlocked({ paintedCells: ['9,9'] }, A, { col: 5, row: 3 });
    // 位置缺失：不遮挡（几何证据不足时静默）
    out.losNullPos = vr.isLosBlocked({ paintedCells: ['2,0'] }, null, B);
    // bg 缺失：不遮挡
    out.losNullBg = vr.isLosBlocked(null, A, B);

    // ===== B. suggestCoverHint =====
    out.hintBlocked = vr.suggestCoverHint({ paintedCells: ['2,0'] }, A, B);
    out.hintClear = vr.suggestCoverHint({ paintedCells: [] }, A, B);

    // ===== C. 掩护加值 =====
    out.bonusHalf = vr.getCoverBonus('half');
    out.bonus3q = vr.getCoverBonus('three_quarters');
    out.bonusTotal = vr.getCoverBonus('total');
    out.bonusNull = vr.getCoverBonus(null);
    out.saveHalfDex = vr.getCoverSaveBonus('half', 'dexterity');
    out.saveHalfStr = vr.getCoverSaveBonus('half', 'strength');
    out.save3qWis = vr.getCoverSaveBonus('three_quarters', 'wisdom');

    // ===== D. computeCombatantAc 掩护修正（NPC 快照路径：coverTier 直接读参战者） =====
    const npc = { id: 'cover-npc', name: '掩护探针NPC', isPc: false, ac: 15, coverTier: 'half' };
    out.acNpcHalf = combatStoreMod.computeCombatantAc(npc, null, null);
    const npc3q = { ...npc, coverTier: 'three_quarters' };
    out.acNpc3q = combatStoreMod.computeCombatantAc(npc3q, null, null);
    const npcNone = { ...npc, coverTier: null };
    out.acNpcNone = combatStoreMod.computeCombatantAc(npcNone, null, null);
    // 单次覆盖：覆盖为 total → AC 不再加值（total 阻断在弹窗可用性层）
    out.acNpcOverrideTotal = combatStoreMod.computeCombatantAc(npc, null, null, 'total');
    out.acNpcOverrideNone = combatStoreMod.computeCombatantAc(npc, null, null, null);

    // ===== E. 沙盘环境档位骨架 =====
    out.ambientDefault = vr.getAmbientLightTier({});
    out.ambientDark = vr.getAmbientLightTier({ ambientLight: 'darkness' });

    return out;
  });

  check('LOS 无墙不遮挡', results.losNoWall === false, results.losNoWall);
  check('LOS 相邻格恒无遮挡', results.losAdjacent === false, results.losAdjacent);
  check('LOS 直线穿墙遮挡', results.losStraightWall === true, results.losStraightWall);
  check('LOS 斜线路径墙遮挡', results.losDiagWall === true, results.losDiagWall);
  check('LOS 斜线无墙不遮挡', results.losDiagClear === false, results.losDiagClear);
  check('LOS 位置缺失静默', results.losNullPos === false, results.losNullPos);
  check('LOS 沙盘缺失静默', results.losNullBg === false, results.losNullBg);
  check('遮挡提示输出', results.hintBlocked === '沙盘攻击线被墙体遮挡，建议考虑掩护等级', results.hintBlocked);
  check('无遮挡无提示', results.hintClear === null, results.hintClear);
  check('半身加值 +2', results.bonusHalf === 2, results.bonusHalf);
  check('四分之三加值 +5', results.bonus3q === 5, results.bonus3q);
  check('全身无 AC 加值', results.bonusTotal === 0, results.bonusTotal);
  check('空掩护无加值', results.bonusNull === 0, results.bonusNull);
  check('半身 Dex 豁免 +2', results.saveHalfDex === 2, results.saveHalfDex);
  check('半身 力量豁免无加值', results.saveHalfStr === 0, results.saveHalfStr);
  check('四分之三 感知豁免无加值', results.save3qWis === 0, results.save3qWis);
  check('NPC AC 掩护 half 15→17', results.acNpcHalf === 17, results.acNpcHalf);
  check('NPC AC 掩护 3q 15→20', results.acNpc3q === 20, results.acNpc3q);
  check('NPC AC 无掩护 15', results.acNpcNone === 15, results.acNpcNone);
  check('NPC AC 覆盖 total 15（阻断走弹窗层）', results.acNpcOverrideTotal === 15, results.acNpcOverrideTotal);
  check('NPC AC 覆盖无掩护 15', results.acNpcOverrideNone === 15, results.acNpcOverrideNone);
  check('环境档位默认明亮', results.ambientDefault === 'bright', results.ambientDefault);
  check('环境档位黑暗', results.ambientDark === 'darkness', results.ambientDark);

  console.log(`\n=== probe-vision-p1: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('FAILURES: ' + failures.join(', '));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
