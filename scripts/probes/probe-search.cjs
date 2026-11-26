// E2E probe: 搜索（Search）—— 察觉对抗躲藏者隐匿值
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
    const { setRulebookScope } = await import('/src/data/libraryScope.ts');
    setRulebookScope(['玩家手册 2014']);
    const { characterStore } = await import('/src/data/characterStore.ts');
    characterStore.getAll().filter(c => c.isSandbox).forEach(c => characterStore.delete(c.id));
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    if (!rec) return { ok: false };
    const pcChar = characterStore.add({
      name: '搜索测试·游侠', race: '人类', level: 5, profession: { class: '游侠' },
      maxHp: 40, currentHp: 40, isSandbox: true,
      proficiencyBonus: 3,
      abilities: {
        strength: { score: 10, modifier: 0 }, dexterity: { score: 14, modifier: 2 },
        constitution: { score: 12, modifier: 1 }, intelligence: { score: 10, modifier: 0 },
        wisdom: { score: 14, modifier: 2 }, charisma: { score: 10, modifier: 0 },
      },
      skills: { perception: { proficient: true, extra: 0 }, stealth: { proficient: false, extra: 0 } },
      attacks: [],
    });
    combatStore.update(rec.id, {
      mode: 'simulation',
      combatants: [
        { id: 'search-pc', name: '搜索游侠', isPc: true, characterId: pcChar.id, initiative: 10, actions: 1, bonusActions: 1, reactions: 0, currentHp: 40, maxHp: 40, movementUsed: 0, heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
        { id: 'search-npc', name: '潜伏地精', isPc: false, initiative: 5, actions: 1, bonusActions: 1, reactions: 0, currentHp: 7, maxHp: 7, movementUsed: 0, heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
      ],
      rounds: [{ 'search-pc': '', 'search-npc': '' }],
      updatedAt: Date.now(),
    });
    battlegroundStore.getOrCreate(rec.id);
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'search-pc', col: 1, row: 1 },
      { combatantId: 'search-npc', col: 5, row: 5 },
    ]);
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    ['search-pc', 'search-npc'].forEach(id => {
      globalStatusManager.getActiveStatuses(id, 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    });
    return { ok: true };
  });
  check('0 场景搭建成功', setup.ok === true, setup);

  // ===== 1. 隐匿总值派生 + 躲藏 op 落 metadata =====
  const derive = await page.evaluate(async () => {
    const { deriveSkillCheckBonus } = await import('/src/data/passiveCombatRules.ts');
    const { characterStore } = await import('/src/data/characterStore.ts');
    const pc = characterStore.getAll().find(c => c.name === '搜索测试·游侠');
    return {
      perception: deriveSkillCheckBonus(pc, 'perception'),
      stealth: deriveSkillCheckBonus(pc, 'stealth'),
    };
  });
  check('1a 察觉加值 = 感知调整 2 + 熟练 3', derive.perception === 5, derive);
  check('1b 未熟练隐匿加值 = 敏捷调整 2', derive.stealth === 2, derive);

  const hideOp = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const outcome = applyTurnCommit({
      record: rec,
      request: { requestId: 'p-hide', round: 1, combatantId: 'search-pc', baseSeq: 0,
        action: { ops: [{ kind: 'hide', stealthTotal: 13, roundText: '躲藏' }] } },
      currentRound: 1,
      applyDamage: () => null, consumeAction: () => {}, consumeBonusAction: () => {},
      advanceTurn: () => {}, beginConcentration: () => {},
    });
    const inst = globalStatusManager.getActiveStatuses('search-pc', 'combat').find(i => i.definitionId === 'hidden');
    return { ok: outcome.ok, total: inst?.metadata?.stealthTotal, source: inst?.metadata?.stealthSource };
  });
  check('1c 躲藏 op 入账成功', hideOp.ok === true, hideOp);
  check('1d hidden 实例携带 stealthTotal=13', hideOp.total === 13, hideOp);
  check('1e 来源标记为实际掷骰', hideOp.source === 'roll', hideOp);

  // ===== 2. 搜索对抗：低于/平局/高于 =====
  const duel = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const hiddenOf = (id) => globalStatusManager.getActiveStatuses(id, 'combat').some(i => i.definitionId === 'hidden');
    const clearAll = () => ['search-pc', 'search-npc'].forEach(id =>
      globalStatusManager.getActiveStatuses(id, 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId)));

    const run = (d20, bonus) => {
      let consumed = 0;
      const outcome = applyTurnCommit({
        record: combatStore.get(rec.id),
        request: { requestId: `p-s-${d20}`, round: 1, combatantId: 'search-pc', baseSeq: 0,
          action: { ops: [{ kind: 'search', d20, bonus, roundText: '搜索' }] } },
        currentRound: 1,
        applyDamage: () => null,
        consumeAction: () => { consumed += 1; },
        consumeBonusAction: () => {}, advanceTurn: () => {}, beginConcentration: () => {},
      });
      return { ok: outcome.ok, consumed };
    };

    const seed = (total = 20) => {
      clearAll();
      globalStatusManager.applyEffect('search-npc', 'hidden', 'combat', rec.id, {
        combatMode: 'simulation', metadata: { stealthTotal: total, stealthSource: 'roll' },
      });
    };

    seed(20);
    const below = run(14, 5); // 19 < 20
    const afterBelow = hiddenOf('search-npc');

    seed(20);
    const tie = run(15, 5); // 20 == 20 平局
    const afterTie = hiddenOf('search-npc');

    seed(20);
    const above = run(16, 5); // 21 > 20
    const afterAbove = hiddenOf('search-npc');

    seed(20);
    const noHiddenRun = (() => {
      clearAll();
      return run(1, 0);
    })();
    const afterNoHidden = hiddenOf('search-npc');

    clearAll();
    return { below, afterBelow, tie, afterTie, above, afterAbove, noHiddenRun, afterNoHidden };
  });
  check('2a 低于隐匿值：未发现（hidden 保留）', duel.below.ok && duel.afterBelow === true, duel);
  check('2b 平局：按规则维持隐蔽（hidden 保留）', duel.tie.ok && duel.afterTie === true, duel);
  check('2c 高于隐匿值：解除 hidden', duel.above.ok && duel.afterAbove === false, duel);
  check('2d 失败/无目标也照扣 1 动作', duel.noHiddenRun.consumed === 1, duel);
  check('2e 无目标搜索不报错且无副作用', duel.noHiddenRun.ok === true && duel.afterNoHidden === false, duel);

  // ===== 3. resolveSearch：排除自己 + 缺隐匿值跳过 =====
  const resolver = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { resolveSearch } = await import('/src/data/searchRules.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const clearAll = () => ['search-pc', 'search-npc'].forEach(id =>
      globalStatusManager.getActiveStatuses(id, 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId)));
    clearAll();
    // 两人都躲藏：搜索者自己 + 目标
    globalStatusManager.applyEffect('search-pc', 'hidden', 'combat', rec.id, { combatMode: 'simulation', metadata: { stealthTotal: 5 } });
    const resSelf = resolveSearch({ searcherId: 'search-pc', total: 99, combatants: rec.combatants });
    const selfHiddenAfter = globalStatusManager.getActiveStatuses('search-pc', 'combat').some(i => i.definitionId === 'hidden');

    clearAll();
    globalStatusManager.applyEffect('search-npc', 'hidden', 'combat', rec.id, { combatMode: 'simulation' }); // 老数据无隐匿值
    const resMissing = resolveSearch({ searcherId: 'search-pc', total: 99, combatants: rec.combatants });
    const missingStillHidden = globalStatusManager.getActiveStatuses('search-npc', 'combat').some(i => i.definitionId === 'hidden');
    clearAll();
    return {
      selfRevealed: resSelf.revealed.length, selfHiddenAfter,
      skipped: resMissing.skipped.length, revealed: resMissing.revealed.length, missingStillHidden,
    };
  });
  check('3a 搜索不解除搜索者自身躲藏', resolver.selfRevealed === 0 && resolver.selfHiddenAfter === true, resolver);
  check('3b 缺 stealthTotal 的实例计入 skipped 且保留', resolver.skipped === 1 && resolver.revealed === 0 && resolver.missingStillHidden === true, resolver);

  // ===== 4. 特性转换躲藏：按被动隐匿代填 =====
  const conv = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { applyConvTarget } = await import('/src/data/engines/resourceConvEngine.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const pc = rec.combatants.find(c => c.id === 'search-pc');
    const out = applyConvTarget(rec.id, pc, 'hide');
    const inst = globalStatusManager.getActiveStatuses('search-pc', 'combat').find(i => i.definitionId === 'hidden');
    const total = inst?.metadata?.stealthTotal;
    const source = inst?.metadata?.stealthSource;
    globalStatusManager.getActiveStatuses('search-pc', 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    return { note: out.note, total, source };
  });
  check('4a 转换路径代填被动隐匿 10+2=12', conv.total === 12, conv);
  check('4b 标记为 passive 来源', conv.source === 'passive', conv);
  check('4c 提示文案含复核要求', /被动/.test(conv.note ?? '') && /复核/.test(conv.note ?? ''), conv);

  // ===== 5. 文案：只回发现数量，不泄露目标身份 =====
  const summary = await page.evaluate(async () => {
    const { summarizeOp } = await import('/src/lib/combatActionSummary.ts');
    const op = { kind: 'search', d20: 15, bonus: 5, roundText: '搜索' };
    const none = summarizeOp(op, { search: { total: 20, revealed: 0, skipped: 0, estimated: 0 } });
    const found = summarizeOp(op, { search: { total: 20, revealed: 2, skipped: 0, estimated: 0 } });
    const skipped = summarizeOp(op, { search: { total: 20, revealed: 0, skipped: 1, estimated: 0 } });
    return { none, found, skipped };
  });
  check('5a 未发现文案', summary.none.length === 1 && /未发现目标/.test(summary.none[0]), summary);
  check('5b 发现文案只给数量', summary.found.length === 1 && /发现 2 名潜伏者/.test(summary.found[0]), summary);
  check('5c 缺隐匿值提示补录', summary.skipped.length === 1 && /补录/.test(summary.skipped[0]), summary);
  check('5d 文案不含具体目标名', !/潜伏地精|搜索游侠/.test(summary.found[0]), summary);

  console.log(`\n==== probe-search: ${pass} pass, ${fail} fail ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
