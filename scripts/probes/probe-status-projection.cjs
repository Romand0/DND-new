// E2E probe: 状态投影进 roster + roundsDm 双通道
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; if (!QUIET) console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, extra ?? ''); }
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

  // ===== 场景搭建 =====
  const setup = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    if (!rec) return { ok: false };
    combatStore.update(rec.id, {
      mode: 'simulation',
      combatants: [
        { id: 'proj-pc', name: '投影游侠', isPc: true, initiative: 10, actions: 1, bonusActions: 1, reactions: 0, currentHp: 40, maxHp: 40, movementUsed: 0, heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
        { id: 'proj-npc', name: '投影地精', isPc: false, initiative: 5, actions: 1, bonusActions: 1, reactions: 0, currentHp: 7, maxHp: 7, movementUsed: 0, heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
      ],
      rounds: [{ 'proj-pc': '', 'proj-npc': '' }],
      roundsDm: [{ 'proj-pc': '', 'proj-npc': '' }],
      updatedAt: Date.now(),
    });
    battlegroundStore.getOrCreate(rec.id);
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'proj-pc', col: 1, row: 1 },
      { combatantId: 'proj-npc', col: 5, row: 5 },
    ]);
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    ['proj-pc', 'proj-npc'].forEach(id => {
      globalStatusManager.getActiveStatuses(id, 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    });
    return { ok: true };
  });
  check('0 场景搭建成功', setup.ok === true, setup);

  // ===== 1. 状态投影进 roster（buildCombatDelta） =====
  const projection = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { buildCombatDelta } = await import('/src/hooks/combat/useCombatBroadcast.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    globalStatusManager.applyEffect('proj-npc', 'hidden', 'combat', rec.id, {
      combatMode: 'simulation', metadata: { stealthTotal: 13, stealthSource: 'roll' },
    });
    globalStatusManager.applyEffect('proj-pc', 'dodging', 'combat', rec.id, {
      combatMode: 'simulation', durationRounds: 1,
    });
    const delta = buildCombatDelta(rec);
    const pc = delta.roster.find(r => r.id === 'proj-pc');
    const npc = delta.roster.find(r => r.id === 'proj-npc');
    const clear = () => ['proj-pc', 'proj-npc'].forEach(id =>
      globalStatusManager.getActiveStatuses(id, 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId)));
    const pcStatuses = pc.statuses ?? [];
    const npcStatuses = npc.statuses ?? [];
    const hiddenEntry = npcStatuses.find(s => s.definitionId === 'hidden');
    const dodgeEntry = pcStatuses.find(s => s.definitionId === 'dodging');
    clear();
    return {
      pcStatuses, npcStatuses,
      hiddenOk: !!hiddenEntry && hiddenEntry.stealthTotal === 13 && hiddenEntry.name === '躲藏',
      dodgeOk: !!dodgeEntry && dodgeEntry.name === '回避' && dodgeEntry.stealthTotal === undefined,
    };
  });
  check('1a hidden 投影进 roster 且带隐匿总值', projection.hiddenOk === true, projection.npcStatuses);
  check('1b dodge 投影进 roster 无隐匿值', projection.dodgeOk === true, projection.pcStatuses);

  // ===== 2. 躲藏 op 双通道（applyTurnCommit 玩家路径） =====
  const hideDual = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const outcome = applyTurnCommit({
      record: rec,
      request: { requestId: 'pp-hide', round: 1, combatantId: 'proj-pc', baseSeq: 0,
        action: { ops: [{ kind: 'hide', stealthTotal: 13, roundText: '躲藏' }] } },
      currentRound: 1,
      applyDamage: () => null, consumeAction: () => {}, consumeBonusAction: () => {},
      advanceTurn: () => {}, beginConcentration: () => {},
    });
    const playerLine = (combatStore.get(rec.id)?.rounds ?? [])[0]?.['proj-pc'] ?? '';
    const dmLine = (combatStore.get(rec.id)?.roundsDm ?? [])[0]?.['proj-pc'] ?? '';
    globalStatusManager.getActiveStatuses('proj-pc', 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    return { ok: outcome.ok, playerLine, dmLine };
  });
  check('2a 躲藏玩家行只写「躲藏」', hideDual.ok && hideDual.playerLine === '躲藏', hideDual.playerLine);
  check('2b 躲藏 DM 明细含隐匿总值+观察者',
    /隐匿总值 13/.test(hideDual.dmLine) && /观察者/.test(hideDual.dmLine) && /被动察觉/.test(hideDual.dmLine),
    hideDual.dmLine);

  // ===== 3. 搜索 op 双通道：玩家行只回数量，DM 明细含目标名+隐匿值 =====
  const searchDual = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    globalStatusManager.applyEffect('proj-npc', 'hidden', 'combat', rec.id, {
      combatMode: 'simulation', metadata: { stealthTotal: 10, stealthSource: 'roll' },
    });
    const outcome = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: { requestId: 'pp-search', round: 1, combatantId: 'proj-pc', baseSeq: 0,
        action: { ops: [{ kind: 'search', d20: 16, bonus: 5, roundText: '搜索' }] } },
      currentRound: 1,
      applyDamage: () => null, consumeAction: () => {}, consumeBonusAction: () => {},
      advanceTurn: () => {}, beginConcentration: () => {},
    });
    const playerLine = (combatStore.get(rec.id)?.rounds ?? [])[0]?.['proj-pc'] ?? '';
    const dmLine = (combatStore.get(rec.id)?.roundsDm ?? [])[0]?.['proj-pc'] ?? '';
    globalStatusManager.getActiveStatuses('proj-npc', 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    return { ok: outcome.ok, playerLine, dmLine };
  });
  check('3a 搜索玩家行只回数量（无察觉总值/目标名）',
    searchDual.ok && /发现 1 名潜伏者/.test(searchDual.playerLine)
      && !/察觉/.test(searchDual.playerLine) && !/投影地精/.test(searchDual.playerLine),
    searchDual.playerLine);
  check('3b 搜索 DM 明细含掷骰拆解+目标名+隐匿值',
    /察觉 16\+5=21/.test(searchDual.dmLine) && /《投影地精》隐匿 10/.test(searchDual.dmLine),
    searchDual.dmLine);

  // ===== 4. summarizeOpDetail 直接断言 =====
  const detail = await page.evaluate(async () => {
    const { summarizeOpDetail, summarizeOp } = await import('/src/lib/combatActionSummary.ts');
    const searchOp = { kind: 'search', d20: 16, bonus: 5, roundText: '搜索' };
    const sctx = {
      search: { total: 21, revealed: 1, skipped: 0, estimated: 0, hits: [{ name: '投影地精', stealthTotal: 10, estimated: false }] },
    };
    const hideOp = { kind: 'hide', stealthTotal: 13, roundText: '躲藏' };
    const hctx = { hide: { stealthTotal: 13, observers: [{ name: '投影游侠', pp: 15 }] } };
    return {
      searchPlayer: summarizeOp(searchOp, sctx),
      searchDetail: summarizeOpDetail(searchOp, sctx),
      hidePlayer: summarizeOp(hideOp, hctx),
      hideDetail: summarizeOpDetail(hideOp, hctx),
    };
  });
  check('4a 搜索玩家行不含总值/目标名',
    detail.searchPlayer.length === 1 && /发现 1 名潜伏者/.test(detail.searchPlayer[0])
      && !/21/.test(detail.searchPlayer[0]) && !/投影地精/.test(detail.searchPlayer[0]),
    detail.searchPlayer);
  check('4b 搜索明细含拆解与目标',
    /察觉 16\+5=21/.test(detail.searchDetail[0]) && /《投影地精》隐匿 10/.test(detail.searchDetail[0]),
    detail.searchDetail);
  check('4c 躲藏玩家行=「躲藏」', detail.hidePlayer.join('') === '躲藏', detail.hidePlayer);
  check('4d 躲藏明细含总值与观察者清单',
    /隐匿总值 13/.test(detail.hideDetail[0]) && /《投影游侠》被动察觉 15/.test(detail.hideDetail.join('\n')),
    detail.hideDetail);

  console.log(`\n==== probe-status-projection: ${pass} pass, ${fail} fail ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
