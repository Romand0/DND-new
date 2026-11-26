// E2E probe: 躲藏 per-observer 建模（被动察觉自动对抗 + 逐观察者揭晓 + 优劣势门控）
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

  // ===== 0. 场景搭建 =====
  const setup = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    if (!rec) return { ok: false };
    const base = { actions: 1, bonusActions: 1, reactions: 0, currentHp: 20, maxHp: 20, movementUsed: 0,
      heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] };
    combatStore.update(rec.id, {
      mode: 'simulation',
      combatants: [
        { ...base, id: 'hide-pc', name: '躲藏游侠', isPc: true, initiative: 10 },
        { ...base, id: 'hide-seer15', name: '锐眼斥候', isPc: false, initiative: 8,
          passiveChecks: { perception: 15, insight: 10, investigation: 10 } },
        { ...base, id: 'hide-seer12', name: '普通卫兵', isPc: false, initiative: 6,
          passiveChecks: { perception: 12, insight: 10, investigation: 10 } },
        { ...base, id: 'hide-nopp', name: '迟钝巨魔', isPc: false, initiative: 4 },
      ],
      rounds: [{ 'hide-pc': '', 'hide-seer15': '', 'hide-seer12': '', 'hide-nopp': '' }],
      roundsDm: [{ 'hide-pc': '', 'hide-seer15': '', 'hide-seer12': '', 'hide-nopp': '' }],
      updatedAt: Date.now(),
    });
    battlegroundStore.getOrCreate(rec.id);
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'hide-pc', col: 1, row: 1 },
      { combatantId: 'hide-seer15', col: 3, row: 1 },
      { combatantId: 'hide-seer12', col: 5, row: 1 },
      { combatantId: 'hide-nopp', col: 7, row: 1 },
    ]);
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    ['hide-pc', 'hide-seer15', 'hide-seer12', 'hide-nopp'].forEach(id => {
      globalStatusManager.getActiveStatuses(id, 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    });
    return { ok: true };
  });
  check('0 场景搭建成功', setup.ok === true, setup);

  // ===== 1. contestHide 纯函数（平局隐藏成立 / 无数据按 10） =====
  const contest = await page.evaluate(async () => {
    const { contestHide } = await import('/src/data/hiddenRules.ts');
    const observers = [
      { id: 'o15', name: 'A', pp: 15 },
      { id: 'o12', name: 'B', pp: 12 },
      { id: 'o10', name: 'C', pp: 10 },
    ];
    return {
      c12: contestHide(12, observers),
      c15: contestHide(15, observers),
      c9: contestHide(9, observers),
    };
  });
  check('1a 隐匿 12 → 蒙蔽 pp12/pp10，看破 pp15',
    JSON.stringify(contest.c12.unseenBy) === JSON.stringify(['o12', 'o10'])
    && contest.c12.seenBy.length === 1 && contest.c12.seenBy[0].id === 'o15', contest.c12);
  check('1b 平局（隐匿 15 = PP 15）隐藏成立', JSON.stringify(contest.c15.unseenBy) === JSON.stringify(['o15', 'o12', 'o10']), contest.c15);
  check('1c 隐匿 9 全部看破', contest.c9.unseenBy.length === 0 && contest.c9.seenBy.length === 3, contest.c9);

  // ===== 2. hide op 入账：metadata.unseenBy + 双通道明细 =====
  const hideOp = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const outcome = applyTurnCommit({
      record: rec,
      request: { requestId: 'p-hide-po', round: 1, combatantId: 'hide-pc', baseSeq: 0,
        action: { ops: [{ kind: 'hide', stealthTotal: 12, roundText: '躲藏' }] } },
      currentRound: 1,
      applyDamage: () => null, consumeAction: () => {}, consumeBonusAction: () => {},
      advanceTurn: () => {}, beginConcentration: () => {},
    });
    const latest = combatStore.get(rec.id);
    const inst = globalStatusManager.getActiveStatuses('hide-pc', 'combat').find(i => i.definitionId === 'hidden');
    return {
      ok: outcome.ok,
      unseenBy: inst?.metadata?.unseenBy,
      stealthTotal: inst?.metadata?.stealthTotal,
      dmLine: latest?.roundsDm?.[0]?.['hide-pc'] ?? '',
      playerLine: latest?.rounds?.[0]?.['hide-pc'] ?? '',
    };
  });
  check('2a hide op 入账成功且落 unseenBy', hideOp.ok === true
    && JSON.stringify(hideOp.unseenBy) === JSON.stringify(['hide-seer12', 'hide-nopp']), hideOp);
  check('2b stealthTotal 保留', hideOp.stealthTotal === 12, hideOp);
  check('2c DM 明细逐观察者标注未察觉/看破',
    hideOp.dmLine.includes('（未察觉）') && hideOp.dmLine.includes('（看破）'), hideOp.dmLine);
  check('2d 玩家行不含观察者清单', !hideOp.playerLine.includes('被动察觉'), hideOp.playerLine);

  // ===== 3. 优劣势 per-observer 门控 =====
  const adv = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { detectAdvantage } = await import('/src/data/advantageRules.ts');
    const rec = combatStore.get(combatStore.getAll().find(r => r.isProvingGround).id);
    const byId = (id) => rec.combatants.find(c => c.id === id);
    const has = (res, text) => [...res.advantage, ...res.disadvantage].some(r => r.label.includes(text));
    const probe = (attackerId, targetId) => detectAdvantage({
      scene: 'attack_melee', attacker: byId(attackerId), target: byId(targetId),
      distanceCells: 2, recordId: rec.id, currentRound: 1,
    });
    // 现有实例：hide-pc 对 seer12/nopp 隐藏，对 seer15 已看破
    const seer15VsPc = probe('hide-seer15', 'hide-pc');
    const seer12VsPc = probe('hide-seer12', 'hide-pc');
    const pcVsSeer15 = probe('hide-pc', 'hide-seer15');
    // 攻击者躲藏：hide-pc 攻击 seer12（在其 unseenBy 内）→ 优势；攻击 seer15（已看破）→ 无优势
    const pcVsSeer12 = probe('hide-pc', 'hide-seer12');
    globalStatusManager.getActiveStatuses('hide-pc', 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    return {
      seer15: { adv: seer15VsPc.advantage.length, dis: seer15VsPc.disadvantage.length },
      seer12: { dis: seer12VsPc.disadvantage.length },
      pcVsSeer15: { adv: pcVsSeer15.advantage.length },
      pcVsSeer12: { adv: pcVsSeer12.advantage.some(r => r.label.includes('躲藏')) },
      seer15DisLabel: seer15VsPc.disadvantage.some(r => r.label.includes('躲藏')),
      pcAdvLabel: pcVsSeer12.advantage.some(r => r.label.includes('躲藏')),
    };
  });
  check('3a 已看破的观察者攻击躲藏者无劣势', adv.seer15.dis === 0 && adv.seer15DisLabel === false, adv.seer15);
  check('3b 未察觉的观察者攻击躲藏者劣势', adv.seer12.dis === 1, adv.seer12);
  check('3c 躲藏者攻击已看破目标无优势', adv.pcVsSeer15.adv === 0, adv.pcVsSeer15);
  check('3d 躲藏者攻击未察觉目标有优势', adv.pcAdvLabel === true, adv.pcVsSeer12);

  // ===== 4. 搜索逐观察者揭晓（最后一个看破才解实例） =====
  const search = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { resolveSearch } = await import('/src/data/searchRules.ts');
    const rec = combatStore.get(combatStore.getAll().find(r => r.isProvingGround).id);
    globalStatusManager.applyEffect('hide-pc', 'hidden', 'combat', rec.id, {
      combatMode: 'simulation',
      metadata: { stealthTotal: 12, stealthSource: 'roll', unseenBy: ['hide-seer12', 'hide-nopp'] },
    });
    const active = () => globalStatusManager.getActiveStatuses('hide-pc', 'combat').find(i => i.definitionId === 'hidden');
    const r1 = resolveSearch({ searcherId: 'hide-seer12', total: 14, combatants: rec.combatants });
    const after1 = active();
    const r2 = resolveSearch({ searcherId: 'hide-nopp', total: 14, combatants: rec.combatants });
    const after2 = active();
    const r3 = resolveSearch({ searcherId: 'hide-seer15', total: 14, combatants: rec.combatants });
    return {
      r1: r1.revealed.length, remain1: !!after1, unseen1: after1?.metadata?.unseenBy,
      r2: r2.revealed.length, remain2: !!after2,
      r3: r3.revealed.length,
    };
  });
  check('4a 首个观察者揭晓但实例存续（收窄 unseenBy）',
    search.r1 === 1 && search.remain1 === true
    && JSON.stringify(search.unseen1) === JSON.stringify(['hide-nopp']), search);
  check('4b 最后观察者揭晓后实例解除', search.r2 === 1 && search.remain2 === false, search);
  check('4c 解除后搜索无目标', search.r3 === 0, search);

  // ===== 5. legacy 兼容（无 unseenBy 实例：一次成功搜索即解除） =====
  const legacy = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { resolveSearch } = await import('/src/data/searchRules.ts');
    const { detectAdvantage } = await import('/src/data/advantageRules.ts');
    const rec = combatStore.get(combatStore.getAll().find(r => r.isProvingGround).id);
    globalStatusManager.applyEffect('hide-nopp', 'hidden', 'combat', rec.id, {
      combatMode: 'simulation', metadata: { stealthTotal: 10, stealthSource: 'roll' },
    });
    const byId = (id) => rec.combatants.find(c => c.id === id);
    const before = detectAdvantage({ scene: 'attack_melee', attacker: byId('hide-seer15'), target: byId('hide-nopp'),
      distanceCells: 2, recordId: rec.id, currentRound: 1 });
    const r = resolveSearch({ searcherId: 'hide-seer15', total: 11, combatants: rec.combatants });
    const after = globalStatusManager.getActiveStatuses('hide-nopp', 'combat').some(i => i.definitionId === 'hidden');
    return { legacyDis: before.disadvantage.some(x => x.label.includes('躲藏')), r: r.revealed.length, after };
  });
  check('5a legacy 实例对所有观察者构成躲藏劣势', legacy.legacyDis === true, legacy);
  check('5b legacy 实例一次成功搜索即解除', legacy.r === 1 && legacy.after === false, legacy);

  // ===== 6. patchMetadata 触发 update 事件 =====
  const patch = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const inst = globalStatusManager.applyEffect('hide-seer15', 'hidden', 'combat', rec.id, {
      combatMode: 'simulation', metadata: { stealthTotal: 11, stealthSource: 'roll', unseenBy: ['hide-pc', 'hide-nopp'] },
    });
    const events = [];
    const unsub = globalStatusManager.subscribe(e => events.push(e.type));
    globalStatusManager.patchMetadata(inst.instanceId, { unseenBy: ['hide-nopp'] });
    unsub();
    const after = globalStatusManager.getInstanceById(inst.instanceId)?.metadata?.unseenBy;
    globalStatusManager.declareEnd(inst.instanceId);
    return { events, after };
  });
  check('6a patchMetadata 生效且发出 update 事件',
    JSON.stringify(patch.after) === JSON.stringify(['hide-nopp']) && patch.events.includes('update'), patch);

  // ===== 7. 投影透传 unseenBy =====
  const proj = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { buildCombatDelta } = await import('/src/hooks/combat/useCombatBroadcast.ts');
    const rec = combatStore.get(combatStore.getAll().find(r => r.isProvingGround).id);
    const inst = globalStatusManager.applyEffect('hide-nopp', 'hidden', 'combat', rec.id, {
      combatMode: 'simulation', metadata: { stealthTotal: 14, stealthSource: 'roll', unseenBy: ['hide-pc'] },
    });
    const delta = buildCombatDelta(rec);
    const entry = delta.roster.find(r => r.id === 'hide-nopp')?.statuses?.find(s => s.definitionId === 'hidden');
    globalStatusManager.declareEnd(inst.instanceId);
    return { entry };
  });
  check('7a roster 投影携带 unseenBy', Array.isArray(proj.entry?.unseenBy)
    && JSON.stringify(proj.entry.unseenBy) === JSON.stringify(['hide-pc'])
    && proj.entry.stealthTotal === 14, proj.entry);

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
