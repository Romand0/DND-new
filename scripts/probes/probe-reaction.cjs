// E2E probe: 借机攻击反应机制 v1
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

  // ===== 0. 清场 + 搭建：PC（长剑近战）贴身 NPC =====
  await page.evaluate(async () => {
    const { setRulebookScope } = await import('/src/data/libraryScope.ts');
    setRulebookScope(['玩家手册 2014']);
    const { characterStore } = await import('/src/data/characterStore.ts');
    characterStore.getAll().filter(c => c.isSandbox).forEach(c => characterStore.delete(c.id));
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    // 沙盘清空
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    if (rec) {
      const olds = combatStore.getAll().filter(r => r.isProvingGround);
      // 沙盒记录保留一个，重置参战者
      const record = olds[0];
      const pcChar = characterStore.add({
        name: '反应测试·战士', race: '人类', level: 5, profession: { class: '战士' },
        maxHp: 40, currentHp: 40, isSandbox: true,
        abilities: { strength: { score: 16, modifier: 3 }, dexterity: { score: 12, modifier: 1 }, constitution: { score: 14, modifier: 2 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 10, modifier: 0 } },
        attacks: [{ name: '长剑', damageDice: '1d8', damageType: '挥砍', bonus: 5, range: '5尺', properties: ['多用(M)1d10'] }],
      });
      combatStore.update(record.id, {
        combatants: [
          { id: 'react-pc', name: '反应战士', isPc: true, characterId: pcChar, initiative: 10, actions: 1, bonusActions: 1, reactions: 0, currentHp: 40, maxHp: 40, movementUsed: 0, heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
          { id: 'react-npc', name: '反应地精', isPc: false, initiative: 5, actions: 1, bonusActions: 1, reactions: 0, currentHp: 7, maxHp: 7, movementUsed: 0, heldLeft: null, heldRight: null, status: '', attacks: [{ name: '弯刀', damageDice: '1d6', damageType: '挥砍', bonus: 2, range: '5尺', properties: ['灵巧'] }], pendingAdvantageSources: [], pendingCheckModifiers: [] },
        ],
        rounds: [{ 'react-pc': '', 'react-npc': '' }, { 'react-pc': '', 'react-npc': '' }],
        updatedAt: Date.now(),
      });
      battlegroundStore.getOrCreate(record.id);
      battlegroundStore.setTokens(record.id, [
        { combatantId: 'react-pc', col: 2, row: 2 },
        { combatantId: 'react-npc', col: 3, row: 2 },
      ]);
    }
  });
  await page.waitForTimeout(400);

  // ===== 1. detectReactions 判定规则（move 事件） =====
  const detect = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { detectReactions } = await import('/src/data/reactionRules.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const det = (moverId, from, to) => detectReactions(rec, { kind: 'move', moverId, from, to, source: 'dm_drag' });
    const out = {};
    out.npcLeavesPcReach = det('react-npc', { col: 3, row: 2 }, { col: 6, row: 2 });
    out.npcStaysAdjacent = det('react-npc', { col: 3, row: 2 }, { col: 3, row: 3 });
    out.pcLeavesNpcReach = det('react-pc', { col: 2, row: 2 }, { col: 2, row: 6 });
    out.diagonalStep = det('react-npc', { col: 3, row: 2 }, { col: 4, row: 3 });
    return {
      a: out.npcLeavesPcReach.length,
      aOwner: out.npcLeavesPcReach[0]?.ownerId,
      aType: out.npcLeavesPcReach[0]?.trigger,
      b: out.npcStaysAdjacent.length,
      c: out.pcLeavesNpcReach.length,
      cOwner: out.pcLeavesNpcReach[0]?.ownerId,
      d: out.diagonalStep.length,
    };
  });
  check('1a NPC 离开 PC 触及 → 生成机会', detect.a === 1, detect);
  check('1a-owner 持有者为 PC', detect.aOwner === 'react-pc', detect);
  check('1a-trigger 借机攻击', detect.aType === 'move_leave_reach', detect);
  check('1b 保持相邻（1格）→ 无机会', detect.b === 0, detect);
  check('1c PC 离开 NPC 触及 → NPC 持有机会', detect.c === 1 && detect.cOwner === 'react-npc', detect);
  // (4,3) 距 PC(2,2) 切比雪夫距离 2 → 离开触及，应生成机会；(3,1) 距离 1 → 仍触及
  const diag = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { detectReactions } = await import('/src/data/reactionRules.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const det = (moverId, from, to) => detectReactions(rec, { kind: 'move', moverId, from, to, source: 'dm_drag' });
    return {
      leave: det('react-npc', { col: 3, row: 2 }, { col: 4, row: 3 }).length,
      stay: det('react-npc', { col: 3, row: 2 }, { col: 3, row: 1 }).length,
    };
  });
  check('1d 斜向离开触及 → 生成机会', diag.leave === 1, diag);
  check('1d2 斜向保持触及 → 无机会', diag.stay === 0, diag);

  // ===== 1e-1h 边界：死亡移动者 / 友方 / 纯远程 NPC / 已死持有者 =====
  const detectEdge = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { detectReactions } = await import('/src/data/reactionRules.ts');
    let rec = combatStore.getAll().find(r => r.isProvingGround);
    const det = (r, moverId, from, to) => detectReactions(r, { kind: 'move', moverId, from, to, source: 'dm_drag' });
    const deadMover = structuredClone(rec);
    deadMover.combatants = deadMover.combatants.map(c => c.id === 'react-npc' ? { ...c, isDead: true } : c);
    const r1 = det(deadMover, 'react-npc', { col: 3, row: 2 }, { col: 6, row: 2 });
    const friendly = structuredClone(rec);
    friendly.combatants = friendly.combatants.map(c => c.id === 'react-npc' ? { ...c, isPc: true } : c);
    const r2 = det(friendly, 'react-npc', { col: 3, row: 2 }, { col: 6, row: 2 });
    const rangedOnly = structuredClone(rec);
    rangedOnly.combatants = rangedOnly.combatants.map(c => c.id === 'react-pc'
      ? { ...c, attacks: [{ name: '短弓', damageDice: '1d6', damageType: '穿刺', bonus: 4, range: '80/320', properties: ['弹药', '双手'] }] }
      : c);
    const r3 = det(rangedOnly, 'react-npc', { col: 3, row: 2 }, { col: 6, row: 2 });
    const deadOwner = structuredClone(rec);
    deadOwner.combatants = deadOwner.combatants.map(c => c.id === 'react-pc' ? { ...c, isDead: true } : c);
    const r4 = det(deadOwner, 'react-npc', { col: 3, row: 2 }, { col: 6, row: 2 });
    const noReachFrom = det(rec, 'react-npc', { col: 6, row: 2 }, { col: 7, row: 2 });
    return { r1: r1.length, r2: r2.length, r3: r3.length, r4: r4.length, r5: noReachFrom.length };
  });
  check('1e 死亡移动者 → 无机会', detectEdge.r1 === 0, detectEdge);
  check('1f 友方移动 → 无机会', detectEdge.r2 === 0, detectEdge);
  check('1g 纯远程持有者 → 无机会', detectEdge.r3 === 0, detectEdge);
  check('1h 死亡持有者 → 无机会', detectEdge.r4 === 0, detectEdge);
  check('1i 起点已超出触及 → 无机会', detectEdge.r5 === 0, detectEdge);

  // ===== 2. store API：add/consume/clear/resetActions =====
  const storeApi = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const rid = rec.id;
    const opp = { ownerId: 'react-pc', moverId: 'react-npc', definitionId: 'builtin:opportunity_attack', trigger: 'move_leave_reach', fromPos: { col: 3, row: 2 }, toPos: { col: 6, row: 2 } };
    const fulls = combatStore.addPendingReactions(rid, 'react-pc', [opp], 1);
    const c1 = combatStore.get(rid).combatants.find(c => c.id === 'react-pc');
    const persisted = c1.pendingReactions?.[0];
    combatStore.consumeReaction(rid, 'react-pc');
    const c2 = combatStore.get(rid).combatants.find(c => c.id === 'react-pc');
    combatStore.resetActions(rid, 'react-pc');
    const c3 = combatStore.get(rid).combatants.find(c => c.id === 'react-pc');
    combatStore.consumePendingReaction(rid, 'react-pc', fulls[0].id);
    const c4 = combatStore.get(rid).combatants.find(c => c.id === 'react-pc');
    // round2 再加一条 → clearExpired(2) 保留 round2 清 round1
    const fulls2 = combatStore.addPendingReactions(rid, 'react-pc', [{ ...opp, fromPos: { col: 4, row: 2 }, toPos: { col: 7, row: 2 } }], 2);
    combatStore.clearExpiredReactions(rid, 2);
    const c5 = combatStore.get(rid).combatants.find(c => c.id === 'react-pc');
    return {
      id: !!persisted?.id, round: persisted?.round, consumed: persisted?.consumed,
      used: c2.reactionUsed, reset: c3.reactionUsed,
      consumedFlag: c4.pendingReactions?.[0]?.consumed,
      afterClear: c5.pendingReactions?.length,
      afterClearRound: c5.pendingReactions?.[0]?.round,
    };
  });
  check('2a addPendingReactions 生成 id', storeApi.id === true, storeApi);
  check('2b round 落库', storeApi.round === 1, storeApi);
  check('2c 初始未消费', storeApi.consumed === false, storeApi);
  check('2d consumeReaction 置位', storeApi.used === true, storeApi);
  check('2e resetActions 恢复反应', storeApi.reset === false, storeApi);
  check('2f consumePendingReaction 消费机会', storeApi.consumedFlag === true, storeApi);
  check('2g clearExpiredReactions 跨回合清除+保留同回合', storeApi.afterClear === 1 && storeApi.afterClearRound === 2, storeApi);

  // ===== 3. turnCommitApply：PC move op 落库触发 NPC 借机 =====
  const commit = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { combatants: rec.combatants.map(c => ({ ...c, pendingReactions: [], reactionUsed: false })), updatedAt: Date.now() });
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'react-pc', col: 2, row: 2 },
      { combatantId: 'react-npc', col: 3, row: 2 },
    ]);
    const request = {
      requestId: 'probe-move-1', round: 1, combatantId: 'react-pc', baseSeq: 0,
      action: { ops: [{ kind: 'move', to: { col: 2, row: 6 }, roundText: '移动' }] },
    };
    const outcome = applyTurnCommit({
      record: combatStore.get(rec.id), request, currentRound: 1,
      applyDamage: () => null, consumeAction: () => {}, consumeBonusAction: () => {},
      advanceTurn: () => {}, beginConcentration: () => {},
    });
    const after = combatStore.get(rec.id).combatants.find(c => c.id === 'react-npc');
    const token = battlegroundStore.get(rec.id)?.tokens.find(t => t.combatantId === 'react-pc');
    return {
      ok: outcome.ok, reactions: outcome.ok ? (outcome.reactions?.length ?? 0) : 0,
      owner: outcome.ok ? outcome.reactions?.[0]?.ownerId : null,
      mover: outcome.ok ? outcome.reactions?.[0]?.moverId : null,
      fromPos: outcome.ok ? outcome.reactions?.[0]?.fromPos : null,
      persisted: after.pendingReactions?.length ?? 0,
      pcMoved: token ? `${token.col},${token.row}` : null,
    };
  });
  check('3a 落库成功', commit.ok === true, commit);
  check('3b 返回 reactions ≥1', (commit.reactions ?? 0) >= 1, commit);
  check('3c 持有者=NPC 移动者=PC', commit.owner === 'react-npc' && commit.mover === 'react-pc', commit);
  check('3d fromPos=起点格', commit.fromPos && commit.fromPos.col === 2 && commit.fromPos.row === 2, commit);
  check('3e 机会持久化在 NPC', commit.persisted >= 1, commit);
  check('3f PC 已移动到落点', commit.pcMoved === '2,6', commit);

  // ===== 4. UI：⚡ 徽标点击 → 借机弹窗 → 放弃 → 机会消费保留反应 =====
  // 徽标在先攻表格（放映模式）里，先切放映模式
  await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { mode: 'playback', updatedAt: Date.now() });
  });
  await page.waitForTimeout(600);
  const badge = page.locator('button[title*="未决反应"]');
  check('4a ⚡ 徽标可见', await badge.count() >= 1);
  if (await badge.count() > 0) {
    await badge.first().click();
    await page.waitForTimeout(500);
    const modalTitle = await page.locator('text=借机攻击（反应）').count();
    check('4b 借机弹窗打开', modalTitle >= 1);
    const hint = await page.locator('text=放弃则保留反应').count();
    check('4c 行使/放弃提示条', hint >= 1);
    // 放弃：点弹窗背景遮罩（onClick=onClose）
    await page.locator('div.fixed.inset-0.z-50').last().click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(400);
    const afterClose = await page.evaluate(async () => {
      const combatStore = (await import('/src/data/combatStore.ts')).default;
      const rec = combatStore.getAll().find(r => r.isProvingGround);
      const npc = rec.combatants.find(c => c.id === 'react-npc');
      const open = (npc.pendingReactions || []).filter(o => !o.consumed).length;
      return { open, used: npc.reactionUsed === true };
    });
    check('4d 放弃后机会已消费', afterClose.open === 0, afterClose);
    check('4e 放弃后反应次数保留', afterClose.used === false, afterClose);
  }

  // ===== 5. UI：DM 点击棋子 → 点击目标格移动 → 借机弹窗自动打开 =====
  // 机会已消费，重置一条用于移动测试；切回模拟模式避免放映未启动状态干扰棋子选中
  await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { mode: 'simulation', combatants: rec.combatants.map(c => c.id === 'react-npc' ? { ...c, pendingReactions: [], reactionUsed: false } : c), updatedAt: Date.now() });
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'react-pc', col: 2, row: 2 },
      { combatantId: 'react-npc', col: 3, row: 2 },
    ]);
  });
  await page.waitForTimeout(500);
  const moved = await (async () => {
    const src = page.locator('div[title="反应地精"]').first();
    const dst = page.locator('div[title="6,2"]').first();
    if ((await src.count()) === 0 || (await dst.count()) === 0) return { found: false };
    await src.click();
    await page.waitForTimeout(500);
    await dst.click();
    await page.waitForTimeout(800);
    return { found: true };
  })();
  check('5a 移动元素找到', moved.found === true, moved);
  if (moved.found) {
    const modal = await page.locator('text=借机攻击（反应）').count();
    check('5b 移动触发借机弹窗', modal >= 1);
    if (modal >= 1) {
      // 放弃：点弹窗背景遮罩
      await page.locator('div.fixed.inset-0.z-50').last().click({ position: { x: 5, y: 5 } });
      await page.waitForTimeout(400);
    }
    const after = await page.evaluate(async () => {
      const combatStore = (await import('/src/data/combatStore.ts')).default;
      const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
      const rec = combatStore.getAll().find(r => r.isProvingGround);
      const npc = rec.combatants.find(c => c.id === 'react-npc');
      const token = battlegroundStore.get(rec.id)?.tokens.find(t => t.combatantId === 'react-npc');
      return {
        token: token ? `${token.col},${token.row}` : null,
        consumed: (npc.pendingReactions || []).every(o => o.consumed),
        openCount: (npc.pendingReactions || []).filter(o => !o.consumed).length,
        reactionKept: npc.reactionUsed !== true,
      };
    });
    check('5c NPC 已移动到落点', after.token === '6,2', after);
    check('5d 放弃后机会消费+反应保留', after.consumed === true && after.openCount === 0 && after.reactionKept, after);
  }

  // ===== 6. 持久化：刷新后未决反应不丢 + 老数据字段回填 =====
  const seedAndReload = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.addReactionPrompts(rec.id, 'react-pc', [{
      ownerId: 'react-pc', definitionId: 'builtin:opportunity_attack',
      trigger: 'move_leave_reach', moverId: 'react-npc',
      fromPos: { col: 3, row: 2 }, toPos: { col: 6, row: 2 },
    }], 1);
    const before = (combatStore.get(rec.id).combatants.find(c => c.id === 'react-pc').pendingReactions || []).length;
    return { before };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const afterReload = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const pc = rec.combatants.find(c => c.id === 'react-pc');
    const list = pc.pendingReactions || [];
    return {
      count: list.length,
      definitionId: list[list.length - 1]?.definitionId,
      trigger: list[list.length - 1]?.trigger,
      ownerId: list[list.length - 1]?.ownerId,
      reactionUsed: pc.reactionUsed,
    };
  });
  check('6a 刷新后未决反应保留（load 白名单）', seedAndReload.before >= 1 && afterReload.count >= seedAndReload.before, { seedAndReload, afterReload });
  check('6b definitionId/trigger/ownerId 完整', afterReload.definitionId === 'builtin:opportunity_attack' && afterReload.trigger === 'move_leave_reach' && afterReload.ownerId === 'react-pc', afterReload);
  check('6c reactionUsed 保留布尔', afterReload.reactionUsed === false || afterReload.reactionUsed === true, afterReload);

  // ===== 7. P2 法术反应（数据驱动）：注入探测法术 → 命中 → 反应提示先于伤害弹窗 → 行使 =====
  await page.evaluate(async () => {
    const { setRulebookScope } = await import('/src/data/libraryScope.ts');
    setRulebookScope(['玩家手册 2014']);
    const { spellStore } = await import('/src/data/spellStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const all = spellStore.getAllRaw().filter(s => s.id !== 'probe:reaction-spell');
    all.push({
      id: 'probe:reaction-spell', name: '探测反应术', level: 1, school: '防护系', source: '玩家手册 2014',
      castingTime: '1 反应', range: '自身', components: { verbal: true, somatic: true, material: false },
      duration: '1 轮', description: '探针数据，仅声明触发，不含效果逻辑。', classes: [],
      reaction: { trigger: 'attack_targeted', resolution: 'spell', scope: 'self', slotLevel: 0, prompt: '探针提示：效果由 DM 结算' },
    });
    spellStore.save(all);
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, {
      mode: 'simulation',
      combatants: rec.combatants.map(c => ({ ...c, pendingReactions: [], reactionUsed: false, actions: 1, bonusActions: 1 })),
      updatedAt: Date.now(),
    });
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'react-pc', col: 2, row: 2 },
      { combatantId: 'react-npc', col: 3, row: 2 },
    ]);
  });
  await page.waitForTimeout(600);

  const rxDetect = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { detectReactions } = await import('/src/data/reactionRules.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const m = detectReactions(rec, { kind: 'attack', attackerId: 'react-npc', targetId: 'react-pc' });
    return { n: m.length, owner: m[0]?.ownerId, def: m[0]?.definitionId, trigger: m[0]?.trigger, name: m[0]?.definitionName };
  });
  check('7a 攻击目标触发法术反应检测（数据驱动）', rxDetect.n >= 1 && rxDetect.owner === 'react-pc' && rxDetect.def === 'spell:probe:reaction-spell' && rxDetect.trigger === 'attack_targeted', rxDetect);

  let rxUi = { opened: false, dmgBefore: 0, step: 'start' };
  try {
    rxUi.step = 'dblclick';
    await page.locator('div[title="反应地精"]').first().dblclick();
    await page.waitForTimeout(600);
    rxUi.step = 'op-tab';
    await page.getByRole('button', { name: '操作', exact: true }).first().click();
    await page.waitForTimeout(500);
    rxUi.step = 'attack-btn';
    await page.getByRole('button', { name: '攻击', exact: true }).first().click();
    await page.waitForTimeout(700);
    rxUi.step = 'attack-entry';
    const entry = page.locator('div.rounded-lg.border.p-3').filter({ hasText: '弯刀' }).first();
    await entry.click();
    await page.waitForTimeout(400);
    rxUi.step = 'd20';
    await page.locator('input[placeholder="输入 1-20"]').first().fill('20');
    await page.getByRole('button', { name: '确定', exact: true }).first().click();
    await page.waitForTimeout(500);
    rxUi.step = 'confirm-hit';
    await page.getByRole('button', { name: '确认命中，进入伤害结算' }).first().click();
    await page.waitForTimeout(700);
    rxUi.opened = (await page.locator('text=探测反应术').count()) >= 1;
    rxUi.dmgBefore = await page.locator('text=伤害结算').count();
  } catch (e) {
    console.error('section7 UI error at', rxUi.step, ':', e.message.split('\n')[0]);
  }
  check('7b 命中后先打开反应提示弹窗', rxUi.opened === true, rxUi);
  check('7c 反应未处理前伤害弹窗不打开', rxUi.dmgBefore === 0, rxUi);

  if (rxUi.opened) {
    await page.getByRole('button', { name: '行使', exact: true }).first().click();
    await page.waitForTimeout(700);
    const afterRx = await page.evaluate(async () => {
      const combatStore = (await import('/src/data/combatStore.ts')).default;
      const rec = combatStore.getAll().find(r => r.isProvingGround);
      const pc = rec.combatants.find(c => c.id === 'react-pc');
      return {
        used: pc.reactionUsed === true,
        open: (pc.pendingReactions || []).filter(o => !o.consumed).length,
      };
    });
    const dmgAfter = await page.locator('text=伤害结算').count();
    check('7d 行使后扣反应并消费 prompt', afterRx.used === true && afterRx.open === 0, afterRx);
    check('7e 反应处理完伤害弹窗才打开', dmgAfter >= 1, { dmgAfter });
    if (dmgAfter >= 1) {
      await page.locator('div.fixed.inset-0.z-50').last().locator('svg.lucide-x').first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  console.log(`\n==== probe-reaction: ${pass} pass, ${fail} fail ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
