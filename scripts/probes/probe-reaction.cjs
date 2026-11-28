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
          { id: 'react-npc', name: '反应地精', isPc: false, initiative: 5, actions: 1, bonusActions: 1, reactions: 0, currentHp: 7, maxHp: 7, movementUsed: 0, heldLeft: null, heldRight: null, status: '', attacks: [{ name: '弯刀', damage: '1d6+2', damageType: '挥砍', range: '5尺', properties: ['灵巧'] }], pendingAdvantageSources: [], pendingCheckModifiers: [] },
        ],
        rounds: [{ 'react-pc': '', 'react-npc': '' }, { 'react-pc': '', 'react-npc': '' }],
        updatedAt: Date.now(),
      });
      battlegroundStore.getOrCreate(record.id);
      battlegroundStore.setTokens(record.id, [
        { combatantId: 'react-pc', col: 2, row: 2 },
        { combatantId: 'react-npc', col: 3, row: 2 },
      ]);
      // 清理上一轮崩溃可能残留的撤离状态，避免污染 baseline 断言
      const { globalStatusManager } = await import('/src/data/statusManager.ts');
      globalStatusManager.getActiveStatuses('react-npc', 'combat')
        .filter(i => i.definitionId === 'disengaging')
        .forEach(i => globalStatusManager.declareEnd(i.instanceId));
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

  // ===== 8. P3：damage_taken / enter_reach / spell_cast 检测 + 特性数据源 =====
  await page.evaluate(async () => {
    const { setRulebookScope } = await import('/src/data/libraryScope.ts');
    setRulebookScope(['玩家手册 2014']);
    const { spellStore } = await import('/src/data/spellStore.ts');
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const probeIds = new Set(['probe:reaction-spell', 'probe:damage-reaction', 'probe:enter-reach', 'probe:counterspell']);
    const all = spellStore.getAllRaw().filter(s => !probeIds.has(s.id));
    const base = {
      level: 1, school: '防护系', source: '玩家手册 2014', castingTime: '1 反应', range: '自身',
      components: { verbal: true, somatic: true, material: false }, duration: '1 轮',
      description: '探针数据，仅声明触发，不含效果逻辑。', classes: [],
    };
    all.push(
      { ...base, id: 'probe:damage-reaction', name: '探测减伤术', reaction: { trigger: 'damage_taken', resolution: 'spell', scope: 'self', slotLevel: 0 } },
      { ...base, id: 'probe:enter-reach', name: '探测哨兵术', reaction: { trigger: 'enter_reach', resolution: 'spell', scope: 'self', slotLevel: 0 } },
      { ...base, id: 'probe:counterspell', name: '探测反制术', reaction: { trigger: 'spell_cast', resolution: 'spell', scope: 'self', slotLevel: 0 } },
    );
    spellStore.save(all);

    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const pc = rec.combatants.find(c => c.id === 'react-pc');
    // 早期搭建把 add() 返回的 Character 对象直接塞进了 characterId；读回真实 id 修正，
    // 否则特性来源（要求 characterId 可查）无法参与检测。
    const pcChar = characterStore.getAll().find(c => c.isSandbox && c.name === '反应测试·战士') || null;
    if (pcChar) {
      characterStore.update(pcChar.id, {
        features: [
          ...(pcChar.features || []).filter(f => f.name !== '探针特性反应'),
          {
            name: '探针特性反应', description: '探针数据', category: '职业特性', level: 1,
            reaction: { trigger: 'damage_taken', resolution: 'spell', scope: 'self', slotLevel: 0 },
          },
        ],
      });
    }
    // PC 习得三张探测法术（普通战斗只取习得列表）
    if (pcChar) {
      characterStore.update(pcChar.id, {
        spells: {
          ...(pcChar.spells || {}),
          cantrips: Array.from(new Set([...(pcChar.spells?.cantrips || []), '探测减伤术', '探测哨兵术', '探测反制术'])),
        },
      });
    }
    combatStore.update(rec.id, {
      combatants: rec.combatants.map(c => ({
        ...c,
        characterId: c.id === 'react-pc' && pcChar ? pcChar.id : c.characterId,
        pendingReactions: [],
        reactionUsed: false,
      })),
      updatedAt: Date.now(),
    });
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'react-pc', col: 2, row: 2 },
      { combatantId: 'react-npc', col: 3, row: 2 },
    ]);
  });
  await page.waitForTimeout(500);

  const p3 = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { detectReactions } = await import('/src/data/reactionRules.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const defs = (arr) => arr.map(m => m.definitionId).sort();
    const damage = detectReactions(rec, { kind: 'damage', targetId: 'react-pc', attackerId: 'react-npc', amount: 5, damageType: '挥砍' });
    const enter = detectReactions(rec, { kind: 'move', moverId: 'react-npc', from: { col: 6, row: 2 }, to: { col: 2, row: 3 }, source: 'dm_drag' });
    const cast = detectReactions(rec, { kind: 'spell_cast', casterId: 'react-npc', spellId: 'probe:reaction-spell' });
    const selfOnly = detectReactions(rec, { kind: 'damage', targetId: 'react-npc', attackerId: 'react-pc', amount: 5, damageType: '挥砍' });
    return {
      damage: defs(damage),
      damageOwner: damage[0]?.ownerId,
      damageLabel: damage.find(m => m.trigger === 'damage_taken')?.eventLabel,
      enter: defs(enter),
      enterTrigger: enter[0]?.trigger,
      cast: defs(cast),
      castCaster: cast[0]?.casterId,
      castTrigger: cast[0]?.trigger,
      selfCount: selfOnly.filter(m => m.ownerId === 'react-pc').length,
    };
  });
  check('8a damage_taken 法术来源命中', p3.damage.includes('spell:probe:damage-reaction'), p3);
  check('8b damage_taken 特性来源（feature: 前缀）', p3.damage.includes('feature:探针特性反应'), p3);
  check('8c damage_taken 事件标签含伤害量', typeof p3.damageLabel === 'string' && p3.damageLabel.includes('5'), p3);
  check('8d enter_reach 哨兵触发', p3.enter.includes('spell:probe:enter-reach') && p3.enterTrigger === 'enter_reach', p3);
  check('8e spell_cast 敌对施法者触发反制', p3.cast.includes('spell:probe:counterspell') && p3.castTrigger === 'spell_cast' && p3.castCaster === 'react-npc', p3);
  check('8f self 范围不误伤他人（受击者为 NPC 时 PC 不触发）', p3.selfCount === 0, p3);

  // ===== 17. P5 反应数据面：种子声明透传 + damage_modifier 直连 + attack 路由 =====
  const seedDecl = await page.evaluate(async () => {
    const data = await (await fetch('/seed/玩家手册2014/角色选项/职业.json')).json();
    const found = {};
    const walk = (node) => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node && typeof node === 'object') {
        if (Array.isArray(node.traits)) {
          node.traits.forEach(t => { if (t && typeof t.name === 'string' && t.reaction && !found[t.name]) found[t.name] = t.reaction; });
        }
        Object.values(node).forEach(walk);
      }
    };
    walk(data);
    const want = ['报偿', '投射守御', '守御闪光', '风暴狂怒', '幻影化形', '直觉魅惑', '法术窃贼', '雾遁'];
    return {
      decls: want.filter(n => found[n]?.trigger && found[n]?.prompt).length,
      retal: found['报偿']?.trigger === 'damage_taken' && found['报偿']?.resolution === 'attack',
      ward: found['投射守御']?.trigger === 'damage_taken' && found['投射守御']?.resolution === 'damage_modifier' && found['投射守御']?.scope === 'ally',
      flash: found['守御闪光']?.trigger === 'attack_targeted' && !found['守御闪光']?.resolution,
      warGod: typeof found['引导神力：战神祝福']?.prompt === 'string' && !found['引导神力：战神祝福']?.trigger,
    };
  });
  check('17a 种子 reaction 声明 8 条齐备（trigger+prompt）', seedDecl.decls === 8, seedDecl);
  check('17b 直连声明：报偿 attack / 投射守御 damage_modifier+ally / 守御闪光 manual', seedDecl.retal && seedDecl.ward && seedDecl.flash, seedDecl);
  check('17c 战神祝福 prompt 意图记录（无 trigger，待第 2 期）', seedDecl.warGod === true, seedDecl);

  await page.evaluate(async () => {
    const { setRulebookScope } = await import('/src/data/libraryScope.ts');
    setRulebookScope(['玩家手册 2014']);
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    // 清掉 7/8 段注入的探测法术：试验场反应检测取全库，probe 法术会混进 17 段反应队列
    const { spellStore } = await import('/src/data/spellStore.ts');
    spellStore.save(spellStore.getAllRaw().filter(s => !s.id.startsWith('probe:')));
    // 保留 0 段的 react-pc/react-npc（panel 选中 id 存活）；报偿+守御闪光挂 react-pc 卡
    const pcChar = characterStore.getAll().find(c => c.isSandbox && c.name === '反应测试·战士');
    if (pcChar) {
      // level 提到 14：getFeatureReactionSources 按 f.level <= level 过滤（报偿 14）
      characterStore.update(pcChar.id, {
        experience: 140000,
        features: [
          { name: '报偿', description: '探针', category: '职业特性', level: 14, activation: 'reaction', resource: 'manual', reaction: { trigger: 'damage_taken', resolution: 'attack', scope: 'self' } },
          { name: '守御闪光', description: '探针', category: '职业特性', level: 1, activation: 'reaction', resource: 'manual', reaction: { trigger: 'attack_targeted', scope: 'self' } },
        ],
      });
    }
    // 投射守御挂新 PC 卡（ally scope 排除本人 → 守御者与受击者须为两个参战者）
    characterStore.add({
      name: 'RX17守御者', race: '人类', level: 6, profession: { class: '战士' },
      maxHp: 30, currentHp: 30, isSandbox: true,
      abilities: { strength: { score: 14, modifier: 2 }, dexterity: { score: 12, modifier: 1 }, constitution: { score: 14, modifier: 2 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 10, modifier: 0 } },
      features: [
        { name: '投射守御', description: '探针', category: '职业特性', level: 6, activation: 'reaction', resource: 'manual', reaction: { trigger: 'damage_taken', resolution: 'damage_modifier', scope: 'ally' } },
      ],
    });
    const warderId = characterStore.getAll().find(c => c.isSandbox && c.name === 'RX17守御者')?.id ?? null;
    const combatants = rec.combatants.filter(c => c.id === 'react-pc' || c.id === 'react-npc').map(c => ({
      ...c,
      currentHp: c.id === 'react-pc' ? 40 : 7,
      pendingReactions: [],
      reactionUsed: false,
      actions: 1,
      bonusActions: 1,
    }));
    // ally2 排尾：potentialTarget = 第一个非本人活体（npc 视角恒为 react-pc）
    combatants.push({ id: 'react-ally2', name: 'RX17守御盟友', isPc: true, characterId: warderId, initiative: 7, actions: 1, bonusActions: 1, reactions: 0, currentHp: 30, maxHp: 30, movementUsed: 0, heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] });
    combatStore.update(rec.id, {
      combatants,
      rounds: [{ 'react-pc': '', 'react-npc': '', 'react-ally2': '' }, { 'react-pc': '', 'react-npc': '', 'react-ally2': '' }],
      currentTurn: { round: 0, combatantId: 'react-npc' },
      mode: 'simulation',
      updatedAt: Date.now(),
    });
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'react-pc', col: 2, row: 2 },
      { combatantId: 'react-npc', col: 3, row: 3 },
      { combatantId: 'react-ally2', col: 4, row: 2 },
    ]);
  });
  await page.waitForTimeout(500);

  const det17 = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { detectReactions } = await import('/src/data/reactionRules.ts');
    const { resolveReactionDefinition } = await import('/src/data/reactionDefinitions.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const pcDmg = detectReactions(rec, { kind: 'damage', targetId: 'react-pc', attackerId: 'react-npc', amount: 5, damageType: '挥砍' });
    const pcAtk = detectReactions(rec, { kind: 'attack', attackerId: 'react-npc', targetId: 'react-pc' });
    return {
      wardOwner: pcDmg.find(m => m.definitionId === 'feature:投射守御')?.ownerId,
      wardRes: resolveReactionDefinition('feature:投射守御')?.resolution,
      retalOwner: pcDmg.find(m => m.definitionId === 'feature:报偿')?.ownerId,
      retalRes: resolveReactionDefinition('feature:报偿')?.resolution,
      flashOwner: pcAtk.find(m => m.definitionId === 'feature:守御闪光')?.ownerId,
    };
  });
  check('17d 投射守御 ally 受伤产出（owner=守御者）', det17.wardOwner === 'react-ally2', det17);
  check('17e 报偿 self 受伤产出', det17.retalOwner === 'react-pc', det17);
  check('17f 守御闪光 attack_targeted 被攻者产出', det17.flashOwner === 'react-pc', det17);
  check('17g 派生定义 resolution：报偿 attack / 投射守御 damage_modifier', det17.retalRes === 'attack' && det17.wardRes === 'damage_modifier', det17);

  // ---- 17h UI 全链：投射守御减伤直连（守御闪光 prompt → 伤害弹窗 → 吸收弹窗 → finalDamage 落账）----
  // 双击用格子坐标（probe-active-skills 13 段模式）：locator dblclick 在参战者替换后受 actionability 检查拖死
  const geo17 = await page.evaluate(() => {
    const g = document.querySelector('div.grid.origin-top-left');
    const r = g.children[0].getBoundingClientRect();
    return { x: r.x, y: r.y, cell: r.width };
  });
  // 7 段遗留的面板仍显示被替换掉的旧参战者 → 点远端空格清选择，再重开
  await page.mouse.click(geo17.x + 22.5 * geo17.cell, geo17.y + 22.5 * geo17.cell);
  await page.waitForTimeout(400);
  let ui17 = { absorb: false, retal: false, hp: null, logLine: '', step: 'start' };
  try {
    ui17.step = 'dblclick';
    await page.mouse.dblclick(geo17.x + 3.5 * geo17.cell, geo17.y + 3.5 * geo17.cell);
    await page.waitForTimeout(600);
    ui17.step = 'op-tab';
    await page.getByRole('button', { name: '操作', exact: true }).first().click();
    await page.waitForTimeout(400);
    ui17.step = 'attack-btn';
    await page.getByRole('button', { name: '攻击', exact: true }).first().click();
    await page.waitForTimeout(600);
    ui17.step = 'attack-entry';
    await page.locator('div.rounded-lg.border.p-3').filter({ hasText: '弯刀' }).first().click();
    await page.waitForTimeout(400);
    ui17.step = 'd20';
    await page.locator('input[placeholder="输入 1-20"]').first().fill('20');
    await page.getByRole('button', { name: '确定', exact: true }).first().click();
    await page.waitForTimeout(500);
    ui17.step = 'confirm-hit';
    await page.getByRole('button', { name: '确认命中，进入伤害结算' }).first().click();
    await page.waitForTimeout(700);
    ui17.step = 'flash-prompt';
    // 守御闪光（attack_targeted 窗口）：放弃（保留反应），推进到伤害弹窗
    await page.getByRole('button', { name: '放弃（保留反应）' }).first().click();
    await page.waitForTimeout(700);
    ui17.step = 'damage-calc';
    await page.locator('input[placeholder="d6"]').first().fill('3');
    await page.getByRole('button', { name: '计算', exact: true }).first().click();
    await page.waitForTimeout(500);
    ui17.step = 'confirm-damage';
    await page.getByRole('button', { name: '确认伤害' }).first().click();
    await page.waitForTimeout(900);
    ui17.step = 'retaliate-open';
    // damage_taken 窗口队列 [报偿(attack), 投射守御(absorb)]：报偿先弹（react-pc 排前）→ 借机攻击弹窗
    ui17.retal = (await page.locator('text=借机攻击（反应）').count()) >= 1;
    if (ui17.retal) {
      ui17.step = 'retaliate-close';
      // X 关闭报偿（保留反应）→ 队列推进到投射守御（用标题文本定位弹窗，避免 .last() 命中伤害弹窗）
      await page.locator('div.fixed.inset-0').filter({ hasText: '借机攻击（反应）' }).locator('svg.lucide-x').first().click().catch(() => {});
      await page.waitForTimeout(700);
      ui17.step = 'absorb-open';
      ui17.absorb = (await page.locator('[data-testid="damage-absorb-modal"]').count()) >= 1;
    }
    if (ui17.absorb) {
      ui17.step = 'absorb-fill';
      await page.locator('[data-testid="damage-absorb-input"]').fill('2');
      await page.locator('[data-testid="damage-absorb-confirm"]').click();
      await page.waitForTimeout(700);
      ui17.step = 'confirm-damage-final';
      // 队列清空 → 伤害弹窗仍在（挂起未关），再次确认 → finalDamage = 重击 8 - 吸收 2 = 6
      await page.getByRole('button', { name: '确认伤害' }).first().click();
      await page.waitForTimeout(700);
      ui17.hp = await page.evaluate(async () => {
        const combatStore = (await import('/src/data/combatStore.ts')).default;
        const rec = combatStore.getAll().find(r => r.isProvingGround);
        const pc = rec.combatants.find(c => c.id === 'react-pc');
        const log = JSON.stringify(rec.operationLog || rec.rounds || []);
        return { pcHp: pc.currentHp, maxHp: pc.maxHp, logLine: log.includes('反应吸收2') ? '吸收记录' : (log.includes('【3】') ? '3伤' : '') };
      });
    }
  } catch (e) {
    console.error('section17 UI error at', ui17.step, ':', e.message.split('\n')[0]);
  }
  check('17k 报偿路由到借机攻击弹窗（reactionMode）', ui17.retal === true, ui17);
  check('17h 吸收弹窗弹出（damage_modifier 直连）', ui17.absorb === true, ui17);
  check('17i 重击 8 伤 - 吸收 2 = 6，反应战士 HP 40→34', ui17.hp?.pcHp === 34 && ui17.hp?.maxHp === 40, ui17.hp);
  check('17j 操作日志含反应吸收记录', ui17.hp?.logLine === '吸收记录', ui17.hp);

  // ===== 18. 撤离（disengage）状态抑制借机攻击 =====
  const dis = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { detectReactions } = await import('/src/data/reactionRules.ts');
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { applyConvTarget } = await import('/src/data/engines/resourceConvEngine.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const det = (moverId, from, to) => detectReactions(rec, { kind: 'move', moverId, from, to, source: 'dm_drag' });
    const clear = () => globalStatusManager.getActiveStatuses('react-npc', 'combat')
      .filter(i => i.definitionId === 'disengaging')
      .forEach(i => globalStatusManager.declareEnd(i.instanceId));
    clear();
    const before = det('react-npc', { col: 3, row: 2 }, { col: 6, row: 2 }).length;

    globalStatusManager.applyEffect('react-npc', 'disengaging', 'combat', rec.id, { durationRounds: 1 });
    const active = globalStatusManager.getActiveStatuses('react-npc', 'combat').some(i => i.definitionId === 'disengaging');
    const suppressed = det('react-npc', { col: 3, row: 2 }, { col: 6, row: 2 }).length;
    const pcStill = det('react-pc', { col: 2, row: 2 }, { col: 2, row: 6 }).length;
    clear();
    const restored = det('react-npc', { col: 3, row: 2 }, { col: 6, row: 2 }).length;

    const npc = rec.combatants.find(c => c.id === 'react-npc');
    const conv = applyConvTarget(rec.id, npc, 'disengage');
    const npcAfter = combatStore.get(rec.id).combatants.find(c => c.id === 'react-npc');
    const convActive = globalStatusManager.getActiveStatuses('react-npc', 'combat').some(i => i.definitionId === 'disengaging');
    const convSuppressed = det('react-npc', { col: 3, row: 2 }, { col: 6, row: 2 }).length;
    clear();
    const convCleared = det('react-npc', { col: 3, row: 2 }, { col: 6, row: 2 }).length;
    return { before, active, suppressed, pcStill, restored, convNote: conv.note, convActive, convSuppressed, convCleared, actionsBefore: npc.actions, actionsAfter: npcAfter.actions };
  });
  check('18a 基线：无撤离时 NPC 离开触及生成机会', dis.before >= 1, dis);
  check('18b 撤离状态挂载成功', dis.active === true, dis);
  check('18c 撤离持有者移动 → 机会被抑制', dis.suppressed === 0, dis);
  check('18d 撤离仅豁免持有者：PC 移动仍被借机', dis.pcStill === 1, dis);
  check('18e 解除撤离后机会恢复（与基线一致）', dis.restored === dis.before, dis);
  check('18f 特性转换挂同一撤离状态并返回提示', dis.convActive === true && /借机攻击/.test(dis.convNote ?? ''), dis);
  check('18g 特性转换后被抑制、解除后恢复（与基线一致）', dis.convSuppressed === 0 && dis.convCleared === dis.before, dis);
  check('18h 特性转换不改变主动作数（消耗在转换上游）', dis.actionsBefore === dis.actionsAfter, dis);

  // ===== 19. 躲藏（hidden）：特性转换挂状态 + 玩家攻击 op 一攻揭晓 =====
  const hide = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { applyConvTarget } = await import('/src/data/engines/resourceConvEngine.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec0 = combatStore.getAll().find(r => r.isProvingGround);
    const has = id => globalStatusManager.getActiveStatuses(id, 'combat').some(i => i.definitionId === 'hidden');
    const clearHidden = () => ['react-pc', 'react-npc'].forEach(id => {
      globalStatusManager.getActiveStatuses(id, 'combat')
        .filter(i => i.definitionId === 'hidden')
        .forEach(i => globalStatusManager.declareEnd(i.instanceId));
    });
    clearHidden();
    const pc = rec0.combatants.find(c => c.id === 'react-pc');

    // 特性转换（灵巧动作等）→ 挂 hidden，与 hideFor 同口径
    const conv = applyConvTarget(rec0.id, pc, 'hide');
    const pcHiddenAfterConv = has('react-pc');

    // 攻守双方各挂一层：验证揭晓只解攻方
    globalStatusManager.applyEffect('react-npc', 'hidden', 'combat', rec0.id, { combatMode: 'simulation' });

    const rec = combatStore.get(rec0.id);
    const round = Math.max(1, rec.rounds.length);
    const request = {
      combatantId: 'react-pc',
      round,
      action: {
        ops: [{
          kind: 'attack', weaponName: '长剑', targetId: 'react-npc', targetName: '反应地精',
          d20: 5, bonus: 5, hit: false, critical: false, damage: null,
          roundText: '躲藏后发起攻击（探针）',
        }],
      },
    };
    const outcome = applyTurnCommit({
      record: rec, request, currentRound: round,
      applyDamage: () => null, consumeAction: () => {}, consumeBonusAction: () => {}, advanceTurn: () => {},
    });
    const pcHiddenAfterAttack = has('react-pc');
    const npcHiddenAfterAttack = has('react-npc');
    clearHidden();
    return { note: conv.note, pcHiddenAfterConv, ok: outcome.ok, pcHiddenAfterAttack, npcHiddenAfterAttack };
  });
  check('19a 特性转换到躲藏 → 挂 hidden 状态', hide.pcHiddenAfterConv === true, hide);
  check('19b 转换提示含躲藏文案', /躲藏/.test(hide.note ?? ''), hide);
  check('19c 玩家攻击 op 入账成功', hide.ok === true, hide);
  check('19d 一攻揭晓：攻击 op 结算后 hidden 移除', hide.pcHiddenAfterAttack === false, hide);
  check('19e 揭晓只作用于攻方（守方 hidden 保留）', hide.npcHiddenAfterAttack === true, hide);

  console.log(`\n==== probe-reaction: ${pass} pass, ${fail} fail ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
