// P2 光线/感官探针：光照档位解析 + 感官降档矩阵 + parseSenses + 黑暗/微光 detector + 光照格三桶
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
    const bgStore = (await import('/src/data/battlegroundStore.ts')).default;
    const out = {};

    // ===== A. 光照档位：区域 > 环境 =====
    const zoneBg = { ambientLight: 'bright', lightCells: { bright: [], dim: ['2,2'], darkness: [] } };
    out.tierAmbient = vr.getLightTierAt({}, '9,9');
    out.tierZoneDim = vr.getLightTierAt(zoneBg, '2,2');
    out.tierNullBg = vr.getLightTierAt(null, '0,0');
    out.tierObjCell = vr.getLightTierAt(zoneBg, { col: 2, row: 2 });

    // ===== B. 感官降档矩阵 =====
    const darkBg = { ambientLight: 'darkness' };
    const dimBg = { ambientLight: 'dim' };
    out.effNone = vr.getEffectiveTierAt(darkBg, '0,0', undefined).tier;
    out.effDarkvision = vr.getEffectiveTierAt(darkBg, '0,0', { darkvision: 60 }).tier;
    out.effBlindsight = vr.getEffectiveTierAt(darkBg, '0,0', { blindsight: 60 }).tier;
    out.effTruesight = vr.getEffectiveTierAt(darkBg, '0,0', { truesight: 60 }).tier;
    out.effTruesightDim = vr.getEffectiveTierAt(dimBg, '0,0', { truesight: 60 }).tier;
    out.effDarkvisionDim = vr.getEffectiveTierAt(dimBg, '0,0', { darkvision: 60 }).tier;

    // ===== C. canSenseInDark =====
    out.senseTremorNear = vr.canSenseInDark({ tremorsense: 30 }, 6);
    out.senseTremorFar = vr.canSenseInDark({ tremorsense: 30 }, 7);
    out.senseBlindNear = vr.canSenseInDark({ blindsight: 60 }, 12);
    out.senseNone = vr.canSenseInDark(undefined, 1);

    // ===== D. parseSenses =====
    out.parse1 = vr.parseSenses('盲视60尺，黑暗视觉120尺，被动察觉21');
    out.parse2 = vr.parseSenses('黑暗视觉60尺，被动察觉15');
    out.parse3 = vr.parseSenses('被动察觉12');
    out.parse4 = vr.parseSenses(undefined);
    out.parse5 = vr.parseSenses('真实视觉120尺，震颤感知30尺');

    // ===== E. environment-light detector =====
    const baseCtx = {
      scene: 'attack_ranged',
      currentRound: 1,
      attacker: { id: 'a1', name: '黑暗攻击者', isPc: true },
      target: { id: 't1', name: '目标', isPc: false },
      attackerPos: { col: 0, row: 0 },
      targetPos: { col: 5, row: 0 },
      distanceCells: 5,
      battleground: { ambientLight: 'darkness', lightCells: { bright: [], dim: [], darkness: [] } },
    };
    out.lightBothBlind = advMod.detectAdvantage(baseCtx);
    out.lightDvAttacker = advMod.detectAdvantage({ ...baseCtx, attacker: { ...baseCtx.attacker, senses: { darkvision: 60 } } });
    out.lightBright = advMod.detectAdvantage({ ...baseCtx, battleground: { ambientLight: 'bright' } });
    out.lightNoPos = advMod.detectAdvantage({ ...baseCtx, attackerPos: null, targetPos: null, combatantPositions: null });

    // ===== F. environment-dim detector（仅察觉） =====
    const dimCtx = {
      scene: 'skill_check',
      currentRound: 1,
      attacker: { id: 'p1', name: '侦探', isPc: true },
      attackerPos: { col: 3, row: 3 },
      battleground: { ambientLight: 'dim' },
      skillKey: 'perception',
    };
    out.dimPerception = advMod.detectAdvantage(dimCtx);
    out.dimStealth = advMod.detectAdvantage({ ...dimCtx, skillKey: 'stealth' });
    out.dimDv = advMod.detectAdvantage({ ...dimCtx, battleground: { ambientLight: 'darkness' }, attacker: { ...dimCtx.attacker, senses: { darkvision: 60 } } });
    out.detectorList = advMod.listDetectors();

    // ===== G. 光照格三桶互斥 + 重涂擦除 =====
    const sid = 'probe-p2-light';
    bgStore.getOrCreate(sid);
    bgStore.setLightCell(sid, '1,1', 'dim');
    bgStore.setLightCell(sid, '2,2', 'darkness');
    bgStore.setLightCell(sid, '1,1', 'bright');
    const afterMove = bgStore.get(sid).lightCells;
    bgStore.setLightCell(sid, '1,1', 'bright');
    const afterErase = bgStore.get(sid).lightCells;
    bgStore.setAmbientLight(sid, 'darkness');
    const ambient = bgStore.get(sid).ambientLight;
    bgStore.clearLightCells(sid);
    const afterClear = bgStore.get(sid).lightCells;
    out.cellsAfterMove = afterMove;
    out.cellsAfterErase = afterErase;
    out.ambientSet = ambient;
    out.cellsAfterClear = afterClear;

    return out;
  });

  // A
  check('环境档位默认明亮', results.tierAmbient.tier === 'bright' && results.tierAmbient.source === 'ambient', results.tierAmbient);
  check('区域微光覆盖环境', results.tierZoneDim.tier === 'dim' && results.tierZoneDim.source === 'zone', results.tierZoneDim);
  check('沙盘缺失回落明亮', results.tierNullBg.tier === 'bright', results.tierNullBg);
  check('对象格参数与字符串等价', results.tierObjCell.tier === 'dim', results.tierObjCell);
  // B
  check('无障碍黑暗仍黑暗', results.effNone === 'darkness', results.effNone);
  check('黑暗视觉 黑暗→微光', results.effDarkvision === 'dim', results.effDarkvision);
  check('盲视 黑暗→明亮', results.effBlindsight === 'bright', results.effBlindsight);
  check('真实视觉 黑暗→明亮', results.effTruesight === 'bright', results.effTruesight);
  check('真实视觉 微光→明亮', results.effTruesightDim === 'bright', results.effTruesightDim);
  check('黑暗视觉 微光不升档', results.effDarkvisionDim === 'dim', results.effDarkvisionDim);
  // C
  check('震颤感知 30 尺覆盖 6 格', results.senseTremorNear === true, results.senseTremorNear);
  check('震颤感知 30 尺不覆盖 7 格', results.senseTremorFar === false, results.senseTremorFar);
  check('盲视 60 尺覆盖 12 格', results.senseBlindNear === true, results.senseBlindNear);
  check('无感官不定位', results.senseNone === false, results.senseNone);
  // D
  check('parse 盲视+黑暗视觉', results.parse1.blindsight === 60 && results.parse1.darkvision === 120, results.parse1);
  check('parse 单黑暗视觉', results.parse2.darkvision === 60 && results.parse2.blindsight === undefined, results.parse2);
  check('parse 无感官为空', Object.keys(results.parse3).length === 0, results.parse3);
  check('parse undefined 为空', Object.keys(results.parse4).length === 0, results.parse4);
  check('parse 真实视觉+震颤感知', results.parse5.truesight === 120 && results.parse5.tremorsense === 30, results.parse5);
  // E
  const lbl = (r, arr) => r[arr].map(x => x.label).join('|');
  check('黑暗双向不可见：攻方劣势', results.lightBothBlind.disadvantage.length === 1, results.lightBothBlind);
  check('黑暗双向不可见：攻方优势', results.lightBothBlind.advantage.length === 1, results.lightBothBlind);
  check('攻方黑暗视觉：不劣势', results.lightDvAttacker.disadvantage.length === 0, results.lightDvAttacker);
  check('明亮环境无暗判', results.lightBright.advantage.length === 0 && results.lightBright.disadvantage.length === 0, results.lightBright);
  check('位置缺失静默', results.lightNoPos.advantage.length === 0 && results.lightNoPos.disadvantage.length === 0, results.lightNoPos);
  // F
  check('微光察觉劣势', results.dimPerception.disadvantage.length === 1, results.dimPerception);
  check('隐匿检定不受微光影响', results.dimStealth.disadvantage.length === 0, results.dimStealth);
  check('黑暗视觉把黑暗降为微光→察觉劣势', results.dimDv.disadvantage.length === 1, results.dimDv);
  check('detector 已注册 environment-light', results.detectorList.includes('environment-light'), results.detectorList);
  check('detector 已注册 environment-dim', results.detectorList.includes('environment-dim'), results.detectorList);
  // G
  check('重涂后旧桶清空', results.cellsAfterMove.bright.includes('1,1') && !results.cellsAfterMove.dim.includes('1,1'), results.cellsAfterMove);
  check('同档重涂 = 擦除', !results.cellsAfterErase.bright.includes('1,1'), results.cellsAfterErase);
  check('黑暗格保持', results.cellsAfterMove.darkness.includes('2,2'), results.cellsAfterMove);
  check('环境档位写入', results.ambientSet === 'darkness', results.ambientSet);
  check('清除光照格', results.cellsAfterClear.bright.length === 0 && results.cellsAfterClear.dim.length === 0 && results.cellsAfterClear.darkness.length === 0, results.cellsAfterClear);

  console.log(`\n=== probe-vision-p2: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('FAILURES: ' + failures.join(', '));
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
