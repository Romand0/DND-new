// E2E probe: 战斗状态机持久化（statusManager ↔ CombatRecord.statusInstances）
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
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    if (!rec) return { ok: false };
    const base = { actions: 1, bonusActions: 1, reactions: 0, currentHp: 20, maxHp: 20, movementUsed: 0,
      heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] };
    combatStore.update(rec.id, {
      mode: 'simulation',
      combatants: [
        { ...base, id: 'sp-pc', name: '持久游侠', isPc: true, initiative: 10 },
        { ...base, id: 'sp-npc', name: '持久地精', isPc: false, initiative: 5 },
      ],
      rounds: [{ 'sp-pc': '', 'sp-npc': '' }],
      roundsDm: [{ 'sp-pc': '', 'sp-npc': '' }],
      statusInstances: undefined,
      updatedAt: Date.now(),
    });
    battlegroundStore.getOrCreate(rec.id);
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'sp-pc', col: 1, row: 1 },
      { combatantId: 'sp-npc', col: 5, row: 5 },
    ]);
    ['sp-pc', 'sp-npc'].forEach(id => {
      globalStatusManager.getActiveStatuses(id, 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    });
    return { ok: true, recordId: rec.id };
  });
  check('0 场景搭建成功', setup.ok === true, setup);
  const recId = setup.recordId;

  // ===== 1. 状态变更防抖写回记录 =====
  const write = await page.evaluate(async (rid) => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    globalStatusManager.applyEffect('sp-pc', 'hidden', 'combat', rid, {
      combatMode: 'simulation',
      metadata: { stealthTotal: 13, stealthSource: 'roll', unseenBy: ['sp-npc'] },
    });
    globalStatusManager.applyEffect('sp-pc', 'dodging', 'combat', rid, {
      combatMode: 'simulation', durationRounds: 1, startRound: 0,
    });
    await new Promise(r => setTimeout(r, 300));
    const rec = combatStore.get(rid);
    const hidden = (rec.statusInstances ?? []).find(s => s.definitionId === 'hidden');
    return {
      count: (rec.statusInstances ?? []).length,
      managerActive: globalStatusManager.getActiveCombatInstances(rid).map(s => s.definitionId),
      raw: (rec.statusInstances ?? []).map(s => s.definitionId),
      stealthTotal: hidden?.metadata?.stealthTotal,
      unseenBy: hidden?.metadata?.unseenBy,
    };
  }, recId);
  check('1a 状态变更防抖写回记录（2 条）', write.count === 2, write);
  check('1b hidden metadata 完整落记录',
    write.stealthTotal === 13 && JSON.stringify(write.unseenBy) === JSON.stringify(['sp-npc']), write);

  // ===== 2. 无变化不 bump updatedAt =====
  const noop = await page.evaluate(async (rid) => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { persistCombatStatuses } = await import('/src/data/statusPersistence.ts');
    const before = combatStore.get(rid).updatedAt;
    persistCombatStatuses(rid);
    persistCombatStatuses(rid);
    const after = combatStore.get(rid).updatedAt;
    return { before, after };
  }, recId);
  check('2a 内容无变化时跳过写回（updatedAt 不变）', noop.before === noop.after, noop);

  // ===== 3. 快照捕获 + 还原 =====
  const snap = await page.evaluate(async (rid) => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { buildTurnSnapshot } = await import('/src/data/turnSnapshot.ts');
    const s = buildTurnSnapshot(rid);
    globalStatusManager.applyEffect('sp-npc', 'hidden', 'combat', rid, {
      combatMode: 'simulation', metadata: { stealthTotal: 9, stealthSource: 'roll' },
    });
    const during = globalStatusManager.getActiveCombatInstances(rid).length;
    globalStatusManager.loadCombatInstances(rid, s.statusInstances ?? []);
    const after = globalStatusManager.getActiveCombatInstances(rid).length;
    return { snapCount: (s.statusInstances ?? []).length, during, after };
  }, recId);
  check('3a 快照捕获状态机实例', snap.snapCount === 2, snap);
  check('3b 快照还原回到捕获时刻', snap.during === 3 && snap.after === 2, snap);

  // ===== 4. declareEnd 后从记录移除 =====
  const removed = await page.evaluate(async (rid) => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const inst = globalStatusManager.getActiveStatuses('sp-pc', 'combat').find(i => i.definitionId === 'hidden');
    globalStatusManager.declareEnd(inst.instanceId);
    await new Promise(r => setTimeout(r, 300));
    const rec = combatStore.get(rid);
    return { count: (rec.statusInstances ?? []).length, ids: (rec.statusInstances ?? []).map(s => s.definitionId) };
  }, recId);
  check('4a 结束的状态从记录移除（剩回避）', removed.count === 1 && removed.ids[0] === 'dodging', removed);

  // ===== 5. 刷新水合 =====
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const hydrated = await page.evaluate(async () => {
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const active = globalStatusManager.getActiveCombatInstances(
      (await import('/src/data/combatStore.ts')).default.getAll().find(r => r.isProvingGround).id,
    );
    return { count: active.length, ids: active.map(s => s.definitionId) };
  });
  check('5a 刷新后状态水合恢复', hydrated.count === 1 && hydrated.ids[0] === 'dodging', hydrated);

  // ===== 6. 白名单重建（脏数据过滤） =====
  const sanitize = await page.evaluate(async (rid) => {
    const key = Object.keys(localStorage).find(k => k.includes('dnd-combat-records'));
    const records = JSON.parse(localStorage.getItem(key));
    const rec = records.find(r => r.id === rid);
    rec.statusInstances = [
      { instanceId: 'ok-1', definitionId: 'hidden', targetId: 'sp-pc', scope: 'combat', combatId: rid,
        isActive: true, declaredAt: Date.now(), metadata: { stealthTotal: 11 } },
      { instanceId: 'bad-1', definitionId: 'hidden', targetId: 'sp-pc', isActive: true },
      { instanceId: 'bad-2', definitionId: 'hidden', targetId: 'sp-pc', scope: 'combat', isActive: false },
      { garbage: true },
    ];
    localStorage.setItem(key, JSON.stringify(records));
    return { ok: true };
  }, recId);
  check('6a 注入脏数据', sanitize.ok === true, sanitize);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const afterSanitize = await page.evaluate(async (rid) => {
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const active = globalStatusManager.getActiveCombatInstances(rid);
    return { count: active.length, ids: active.map(a => `${a.instanceId}:${a.definitionId}:${a.targetId}`),
      id: active[0]?.instanceId, stealthTotal: active[0]?.metadata?.stealthTotal };
  }, recId);
  check('6b 白名单只保留合法活跃实例', afterSanitize.count === 1
    && afterSanitize.id === 'ok-1' && afterSanitize.stealthTotal === 11, afterSanitize);

  await browser.close();
  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
