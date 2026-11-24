// P3 躲藏/隐身探针：canSeeThroughHide 感官豁免 + unseen 检测器 + 状态库条目
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
    const advMod = await import('/src/data/advantageRules.ts');
    const lib = (await import('/src/data/statusLibrary.ts')).default;
    const smMod = await import('/src/data/statusManager.ts');
    const sm = smMod.globalStatusManager;
    const out = {};

    // ===== A. canSeeThroughHide 感官豁免矩阵 =====
    out.hideNone = vr.canSeeThroughHide(undefined, 6, 'hidden');
    out.hideBlindCover = vr.canSeeThroughHide({ blindsight: 60 }, 12, 'hidden');
    out.hideBlindShort = vr.canSeeThroughHide({ blindsight: 30 }, 12, 'hidden');
    out.hideTrue = vr.canSeeThroughHide({ truesight: 60 }, 6, 'hidden');
    out.hideDarkvision = vr.canSeeThroughHide({ darkvision: 120 }, 6, 'hidden');
    out.hideTremor = vr.canSeeThroughHide({ tremorsense: 120 }, 6, 'hidden');
    out.invBlind = vr.canSeeThroughHide({ blindsight: 120 }, 6, 'invisible');
    out.invTrue = vr.canSeeThroughHide({ truesight: 120 }, 6, 'invisible');
    out.invTrueShort = vr.canSeeThroughHide({ truesight: 30 }, 12, 'invisible');

    // ===== B. 状态库条目 =====
    out.defHidden = lib.get('hidden');
    out.defInvisible = lib.get('invisible');

    // ===== C. unseen 检测器 =====
    const baseCtx = {
      scene: 'attack_ranged',
      currentRound: 1,
      attacker: { id: 'u-a', name: '攻击者', isPc: true },
      target: { id: 'u-t', name: '躲藏目标', isPc: false },
      distanceCells: 5,
    };
    const mk = (over) => ({ ...baseCtx, ...over });
    // 目标躲藏、攻方无感官 → 劣势
    sm.applyEffect('u-t', 'hidden', 'combat', 'probe-p3', { combatMode: 'simulation' });
    out.unseenHidden = advMod.detectAdvantage(mk({}));
    // 攻方盲视 60 尺（5 格 = 25 尺）→ 看破
    out.unseenBlind = advMod.detectAdvantage(mk({ attacker: { ...baseCtx.attacker, senses: { blindsight: 60 } } }));
    // 攻方盲视 20 尺（5 格 = 25 尺）→ 覆盖不足
    out.unseenBlindShort = advMod.detectAdvantage(mk({ attacker: { ...baseCtx.attacker, senses: { blindsight: 20 } } }));
    // 目标隐形：盲视无效
    sm.declareEnd(sm.getActiveStatuses('u-t', 'combat')[0].instanceId);
    sm.applyEffect('u-t', 'invisible', 'combat', 'probe-p3', { combatMode: 'simulation' });
    out.unseenInvBlind = advMod.detectAdvantage(mk({ attacker: { ...baseCtx.attacker, senses: { blindsight: 60 } } }));
    // 目标隐形：真实视觉看破
    out.unseenInvTrue = advMod.detectAdvantage(mk({ attacker: { ...baseCtx.attacker, senses: { truesight: 60 } } }));
    // 攻方躲藏、目标无感官 → 优势
    sm.declareEnd(sm.getActiveStatuses('u-t', 'combat')[0].instanceId);
    sm.applyEffect('u-a', 'hidden', 'combat', 'probe-p3', { combatMode: 'simulation' });
    out.unseenAttackerHidden = advMod.detectAdvantage(mk({}));
    // 双向躲藏 → 优劣势各一（抵消）
    sm.applyEffect('u-t', 'hidden', 'combat', 'probe-p3', { combatMode: 'simulation' });
    out.unseenBoth = advMod.detectAdvantage(mk({}));
    // 非攻击场景 → 空
    out.unseenNonAttack = advMod.detectAdvantage(mk({ scene: 'skill_check', skillKey: 'perception' }));
    // 目标感官看破攻方 → 无优势
    sm.declareEnd(sm.getActiveStatuses('u-t', 'combat')[0].instanceId);
    out.unseenTargetSees = advMod.detectAdvantage(mk({ target: { ...baseCtx.target, senses: { truesight: 120 } } }));
    // 清理
    sm.getActiveStatuses('u-a', 'combat').forEach(i => sm.declareEnd(i.instanceId));
    sm.getActiveStatuses('u-t', 'combat').forEach(i => sm.declareEnd(i.instanceId));
    out.detectorList = advMod.listDetectors();

    return out;
  });

  const lbl = (r) => ({ adv: r.advantage.map(x => x.label), dis: r.disadvantage.map(x => x.label) });
  // A
  check('无感官不能看破躲藏', results.hideNone === false, results.hideNone);
  check('盲视 60 尺覆盖 12 格看破躲藏', results.hideBlindCover === true, results.hideBlindCover);
  check('盲视 30 尺不覆盖 12 格', results.hideBlindShort === false, results.hideBlindShort);
  check('真实视觉看破躲藏', results.hideTrue === true, results.hideTrue);
  check('黑暗视觉不看破躲藏', results.hideDarkvision === false, results.hideDarkvision);
  check('震颤感知不看破躲藏', results.hideTremor === false, results.hideTremor);
  check('盲视不看破隐形', results.invBlind === false, results.invBlind);
  check('真实视觉看破隐形', results.invTrue === true, results.invTrue);
  check('真实视觉 30 尺不覆盖 12 格', results.invTrueShort === false, results.invTrueShort);
  // B
  check('状态库 hidden 条目', results.defHidden?.name === '躲藏', results.defHidden?.name);
  check('状态库 invisible 条目', results.defInvisible?.name === '隐形', results.defInvisible?.name);
  // C
  check('目标躲藏→攻方劣势', results.unseenHidden.disadvantage.length === 1, lbl(results.unseenHidden));
  check('盲视 60 尺看破→无劣势', results.unseenBlind.disadvantage.length === 0, lbl(results.unseenBlind));
  check('盲视 20 尺不足→劣势', results.unseenBlindShort.disadvantage.length === 1, lbl(results.unseenBlindShort));
  check('隐形+盲视→仍劣势', results.unseenInvBlind.disadvantage.length === 1, lbl(results.unseenInvBlind));
  check('隐形+真实视觉→看破', results.unseenInvTrue.disadvantage.length === 0, lbl(results.unseenInvTrue));
  check('攻方躲藏→优势', results.unseenAttackerHidden.advantage.length === 1, lbl(results.unseenAttackerHidden));
  check('双向躲藏→各一（抵消）', results.unseenBoth.advantage.length === 1 && results.unseenBoth.disadvantage.length === 1, lbl(results.unseenBoth));
  check('非攻击场景不判', results.unseenNonAttack.advantage.length === 0 && results.unseenNonAttack.disadvantage.length === 0, lbl(results.unseenNonAttack));
  check('守方真实视觉看破攻方→无优势', results.unseenTargetSees.advantage.length === 0, lbl(results.unseenTargetSees));
  check('detector 已注册 unseen', results.detectorList.includes('unseen'), results.detectorList);

  console.log(`\n=== probe-vision-p3: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('FAILURES: ' + failures.join(', '));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
