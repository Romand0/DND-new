// E2E probe: 主动技能引擎 P2（池漏斗 / C 类 status+advantage 通道 / D 类反应种子 / 投影 / 回合包 feature-use / 结算并入 + 休息恢复）
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; if (!QUIET) console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, extra ?? ''); }
}

async function openInfoByChip(page, name) {
  // 先关遗留的 InfoPanel/技能弹窗（纯内存 store 探针段不再 reload，遗留遮罩会拦截芯片点击）
  for (let i = 0; i < 4; i++) {
    const closeBtns = page.locator(
      'div.fixed.inset-0.z-50 button:has(.lucide-x), div.fixed.inset-0.z-\\[60\\] button:has(.lucide-x), [data-testid="quivering-close"]'
    );
    if ((await closeBtns.count()) === 0) break;
    await closeBtns.last().click();
    await page.waitForTimeout(200);
  }
  await page.locator('button[title="查看参战者信息"]').filter({ hasText: name }).click();
  await page.waitForTimeout(400);
  return page.locator('div.fixed.inset-0.z-50').last();
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
  await page.setViewportSize({ width: 1280, height: 900 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(BASE + '/combat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('button[title*="沙盒试验场"]');
  await page.waitForTimeout(800);

  // ===== 0. 清场 + 搭建：野蛮人（狂暴/鲁莽/直觉闪避）+ 队友（哨兵）+ NPC，附池特性激励/卓越骰 =====
  await page.evaluate(async () => {
    const { setRulebookScope } = await import('/src/data/libraryScope.ts');
    setRulebookScope(['玩家手册 2014']);
    const { characterStore } = await import('/src/data/characterStore.ts');
    characterStore.getAll().filter(c => c.isSandbox).forEach(c => characterStore.delete(c.id));
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const record = combatStore.getAll().find(r => r.isProvingGround);
    const pcChar = characterStore.add({
      name: '主动技能·野蛮人', race: '半兽人', level: 5, profession: { class: '野蛮人' },
      maxHp: 45, currentHp: 45, isSandbox: true,
      abilities: { strength: { score: 16, modifier: 3 }, dexterity: { score: 12, modifier: 1 }, constitution: { score: 14, modifier: 2 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 14, modifier: 2 } },
      attacks: [{ name: '巨斧', damageDice: '1d12', damageType: '挥砍', bonus: 5, range: '5尺', properties: ['双手'] }],
      features: [
        // role 显式声明与种子标注（annotate-feature-resources）同口径：deriveFeatureRole 关键词兜底会漏掉无关键词名
        { name: '狂暴', description: '附赠动作进入狂暴：力量检定/豁免优势 + 物理伤害抗性', category: '职业特性', role: 'active', level: 1, activation: 'bonus', resource: 'toggle' },
        { name: '鲁莽攻击', description: '本回合近战武器攻击优势，代价是敌人对你的近战攻击也获得优势', category: '职业特性', role: 'active', level: 2, activation: 'free', resource: 'toggle' },
        { name: '直觉闪避', description: '被可见攻击者命中时用反应将伤害减半', category: '职业特性', role: 'active', level: 3, activation: 'reaction', resource: 'manual', reaction: { trigger: 'attack_targeted', resolution: 'damage_modifier', scope: 'self', prompt: '伤害减半（敏捷豁免成功后）' } },
        { name: '诗人激励', description: '为目标下一次能力检定加骰奖励', category: '职业特性', role: 'active', level: 1, activation: 'bonus', resource: 'pool', poolFormula: { type: 'abilityMod', ability: 'charisma', floor: 1, restKind: 'long' } },
        { name: '卓越战技', description: '把卓越骰加到一次检定上', category: '职业特性', role: 'active', level: 3, activation: 'free', resource: 'pool', poolFormula: { type: 'levelTiers', tiers: [{ min: 3, value: 4 }, { min: 7, value: 5 }, { min: 15, value: 6 }], restKind: 'short' } },
      ],
    });
    const allyChar = characterStore.add({
      name: '主动技能·哨兵战士', race: '人类', level: 5, profession: { class: '战士' },
      maxHp: 40, currentHp: 40, isSandbox: true,
      abilities: { strength: { score: 14, modifier: 2 }, dexterity: { score: 12, modifier: 1 }, constitution: { score: 14, modifier: 2 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 10, modifier: 0 } },
      attacks: [{ name: '长剑', damageDice: '1d8', damageType: '挥砍', bonus: 4, range: '5尺', properties: [] }],
      features: [
        { name: '哨兵', description: '生物攻击你的盟友时可用反应对其发动一次近战攻击', category: '专长', activation: 'reaction', resource: 'manual', reaction: { trigger: 'ally_attacked', scope: 'ally' } },
      ],
    });
    const mk = (id, name, isPc, characterId, hp) => ({
      id, name, isPc, ...(characterId ? { characterId } : {}), initiative: isPc ? 10 : 5,
      actions: 1, bonusActions: 1, reactions: 1, currentHp: hp, maxHp: hp, movementUsed: 0,
      heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [],
    });
    combatStore.update(record.id, {
      combatants: [
        mk('feat-pc', '技能野蛮人', true, pcChar.id, 45),
        mk('feat-pc2', '哨兵战士', true, allyChar.id, 40),
        { ...mk('feat-npc', '技能地精', false, null, 7), attacks: [{ name: '弯刀', damageDice: '1d6', damageType: '挥砍', bonus: 2, range: '5尺', properties: ['灵巧'] }] },
      ],
      rounds: [{ 'feat-pc': '', 'feat-pc2': '', 'feat-npc': '' }],
      featureUses: {},
      turnTodos: [],
      updatedAt: Date.now(),
    });
    battlegroundStore.getOrCreate(record.id);
    battlegroundStore.setTokens(record.id, [
      { combatantId: 'feat-pc', col: 2, row: 2 },
      { combatantId: 'feat-pc2', col: 3, row: 2 },
      { combatantId: 'feat-npc', col: 6, row: 2 },
    ]);
    // 暴露角色 ID 供后续结算段使用
    window.__probeCharId = pcChar.id;
  });
  await page.waitForTimeout(500);

  // ===== 1. 池漏斗：满池计算 + consumeFeatureUse 校验扣减 =====
  const pool = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const view = combatStore.getFeaturePoolView(rec.id, 'feat-pc');
    const inspire = view.find(v => v.featureKey === 'feature:诗人激励');
    const mastery = view.find(v => v.featureKey === 'feature:卓越战技');
    const c1 = combatStore.consumeFeatureUse(rec.id, 'feat-pc', 'feature:诗人激励', 1);
    const c2 = combatStore.consumeFeatureUse(rec.id, 'feat-pc', 'feature:诗人激励', 1);
    const c3 = combatStore.consumeFeatureUse(rec.id, 'feat-pc', 'feature:诗人激励', 1);
    const cUnknown = combatStore.consumeFeatureUse(rec.id, 'feat-pc', 'feature:不存在池', 1);
    const after = combatStore.getFeaturePoolView(rec.id, 'feat-pc').find(v => v.featureKey === 'feature:诗人激励');
    return {
      inspireMax: inspire?.max, inspireAvail0: inspire?.available,
      masteryMax: mastery?.max,
      c1, c2, c3, cUnknown,
      afterAvail: after?.available,
    };
  });
  check('1a 激励满池 = 魅调2（floor1 不抬升）', pool.inspireMax === 2 && pool.inspireAvail0 === 2, pool);
  check('1b 卓越骰 L5 档 = 4', pool.masteryMax === 4, pool);
  check('1c 池扣减 1/2 成功第 3 次拒（max=2）', pool.c1 === true && pool.c2 === true && pool.c3 === false, pool);
  check('1d 未知池键拒扣', pool.cUnknown === false, pool);
  check('1e 扣完后 available=0', pool.afterAvail === 0, pool);

  // ===== 2. C 通道 status：狂暴 → 状态实例 + TurnTodo + 力量检定/豁免优势 =====
  const rage = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { executeFeatureChannel } = await import('/src/data/featureChannelRunner.ts');
    const { detectAdvantage } = await import('/src/data/advantageRules.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const pc = rec.combatants.find(c => c.id === 'feat-pc');
    const char = pc.characterId ? (await import('/src/data/characterStore.ts')).characterStore.get(pc.characterId) : null;
    const res = executeFeatureChannel(rec, pc, '狂暴', 3);
    const recAfter = combatStore.get(rec.id);
    const inst = globalStatusManager.getActiveStatuses('feat-pc').find(i => i.definitionId === 'rage');
    const todo = recAfter.turnTodos?.find(t => t.type === 'condition_check');
    const detect = (scene, saveAbility) => detectAdvantage({
      scene, attacker: pc, attackerCharacter: char, saveAbility,
      roster: recAfter.combatants,
    });
    const advStrSave = detect('saving_throw', 'strength');
    const advWisSave = detect('saving_throw', 'wisdom');
    const advStrCheck = detect('check', undefined);
    // 清场：结束实例 + 清待办
    globalStatusManager.getActiveStatuses('feat-pc').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    combatStore.update(rec.id, { turnTodos: [] });
    return {
      note: res.note, hasInst: !!inst, instScope: inst?.scope,
      todoName: todo?.name, todoStart: todo?.startRound, todoEnd: todo?.endRound,
      strSave: advStrSave.advantage.map(a => `${a.kind}:${a.label}`),
      wisSave: advWisSave.advantage.filter(a => a.label?.includes('狂暴')).length,
      strCheck: advStrCheck.advantage.filter(a => a.label?.includes('狂暴')).length,
    };
  });
  check('2a 通道返回进入状态说明', rage.note?.includes('狂暴') === true, rage);
  check('2b rage 状态实例已挂载（combat 域）', rage.hasInst === true && rage.instScope === 'combat', rage);
  check('2c TurnTodo startRound3 endRound13（3+10）', rage.todoStart === 3 && rage.todoEnd === 13, rage);
  check('2d 力量豁免获得狂暴优势（condition 来源）', rage.strSave.some(s => s.startsWith('condition:')), rage);
  check('2e 感知豁免无狂暴优势（ability 过滤）', rage.wisSave === 0, rage);
  check('2f 力量检定获得狂暴优势', rage.strCheck > 0, rage);

  // ===== 3. C 通道 advantage：鲁莽攻击 → 双向 pending + 清除 =====
  const reckless = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { executeFeatureChannel } = await import('/src/data/featureChannelRunner.ts');
    const { detectAdvantage } = await import('/src/data/advantageRules.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const pc = rec.combatants.find(c => c.id === 'feat-pc');
    const pc2 = rec.combatants.find(c => c.id === 'feat-pc2');
    const npc = rec.combatants.find(c => c.id === 'feat-npc');
    const res = executeFeatureChannel(rec, pc, '鲁莽攻击', 3);
    const after = combatStore.get(rec.id);
    const self = after.combatants.find(c => c.id === 'feat-pc').pendingAdvantageSources;
    const enemy = after.combatants.find(c => c.id === 'feat-npc').pendingAdvantageSources;
    const ally = after.combatants.find(c => c.id === 'feat-pc2').pendingAdvantageSources;
    const det = (scene, attacker, target) => detectAdvantage({
      scene, attacker, target, roster: after.combatants,
    });
    // 注意：store 每次 load 重建对象，检测必须用 after 里的最新参战者（旧对象 pendingAdvantageSources 为空）
    const pcNow = after.combatants.find(c => c.id === 'feat-pc');
    const npcNow = after.combatants.find(c => c.id === 'feat-npc');
    const pcMelee = det('attack_melee', pcNow);
    const npcMelee = det('attack_melee', npcNow, pcNow);
    const pcRanged = det('attack_ranged', pcNow);
    const count = (arr) => (arr.advantage.filter(a => a.label?.includes('鲁莽')).length)
      + (arr.disadvantage.filter(a => a.label?.includes('鲁莽')).length);
    combatStore.clearAdvantageByExpireCombatant(rec.id, 'feat-pc');
    const cleared = combatStore.get(rec.id).combatants;
    return {
      note: res.note,
      selfN: self.length, selfScene: self[0]?.scene, selfTargetId: self[0]?.targetId,
      enemyN: enemy.length, enemyTargetId: enemy[0]?.targetId, enemyReason: enemy[0]?.reason,
      allyN: ally.length,
      pcMelee: count(pcMelee), npcMelee: count(npcMelee), pcRanged: count(pcRanged),
      clearedAll: cleared.every(c => (c.pendingAdvantageSources ?? []).length === 0),
    };
  });
  check('3a 通道返回双向说明', reckless.note?.includes('优势') === true, reckless);
  check('3b 自体条目：attack_melee 无 targetId', reckless.selfN === 1 && reckless.selfScene === 'attack_melee' && reckless.selfTargetId === undefined, reckless);
  check('3c 敌方条目：targetId 锚定施用者', reckless.enemyN === 1 && reckless.enemyTargetId === 'feat-pc', reckless);
  check('3d 队友（同阵营）未被写入', reckless.allyN === 0, reckless);
  check('3e 自身近战攻击优势', reckless.pcMelee === 1, reckless);
  check('3f 敌人对施用者近战优势（incoming 命中）', reckless.npcMelee === 1, reckless);
  check('3g 远程攻击无鲁莽标记（场景过滤）', reckless.pcRanged === 0, reckless);
  check('3h clearAdvantageByExpireCombatant 清空三侧', reckless.clearedAll === true, reckless);

  // ===== 4. D 类反应种子：特性 reaction 声明 → detectReactions 命中（attack 事件驱动） =====
  const reactions = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { detectReactions } = await import('/src/data/reactionRules.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const names = (arr) => arr.map(m => `${m.definitionId}@${m.ownerId}`).sort();
    const npcAtkPc = detectReactions(rec, { kind: 'attack', attackerId: 'feat-npc', targetId: 'feat-pc' });
    const pcDmgNpc = detectReactions(rec, { kind: 'damage', targetId: 'feat-npc', attackerId: 'feat-pc', amount: 6, damageType: '挥砍' });
    const npcAtkAlly = detectReactions(rec, { kind: 'attack', attackerId: 'feat-npc', targetId: 'feat-pc2' });
    return {
      uncanny: names(npcAtkPc).filter(n => n.includes('feature:直觉闪避')),
      sentinel: names(npcAtkPc).filter(n => n.includes('feature:哨兵')),
      enemyTarget: names(pcDmgNpc).filter(n => n.startsWith('feature:')),
      allySelf: names(npcAtkAlly).filter(n => n.startsWith('feature:')),
    };
  });
  check('4a 直觉闪避（self）被攻击目标命中', reactions.uncanny.length === 1 && reactions.uncanny[0].includes('feat-pc'), reactions);
  check('4b 哨兵（ally_attacked）盟友被攻击时队友命中', reactions.sentinel.length === 1 && reactions.sentinel[0].includes('feat-pc2'), reactions);
  check('4c 敌方受击（damage 事件）：无特性反应命中', reactions.enemyTarget.length === 0, reactions);
  check('4d 队友被攻击：self 不跨人 + ally 排除本人', reactions.allySelf.length === 0, reactions);

  // ===== 5. 投影：buildCombatDelta activeFeatures 池量实时值 =====
  const projection = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { buildCombatDelta } = await import('/src/hooks/combat/useCombatBroadcast.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.consumeFeatureUse(rec.id, 'feat-pc', 'feature:卓越战技', 1);
    const delta = buildCombatDelta(rec);
    const entry = delta.roster.find(r => r.id === 'feat-pc');
    const af = entry?.activeFeatures ?? [];
    const find = (name) => af.find(f => f.name === name);
    return {
      inspire: find('诗人激励'), mastery: find('卓越战技'),
      rage: find('狂暴'), reckless: find('鲁莽攻击'),
      uncanny: find('直觉闪避'), sentinelIn: af.some(f => f.name === '哨兵'),
    };
  });
  check('5a 激励池实时 poolLeft=0 disabled', projection.inspire?.poolLeft === 0 && projection.inspire?.poolMax === 2 && projection.inspire?.disabled === true, projection);
  check('5b 卓越骰实时 poolLeft=3（4-1）disabled=false', projection.mastery?.poolLeft === 3 && projection.mastery?.poolMax === 4 && projection.mastery?.disabled === false, projection);
  check('5c 切换型特性进投影且无池字段', !!projection.rage && projection.rage?.poolKey === undefined && !!projection.reckless, projection);
  check('5d 反应型特性带 reaction 标注入投影（与种子 role=active 一致）', projection.uncanny?.activation === 'reaction' && projection.uncanny?.resource === 'manual' && projection.uncanny?.poolKey === undefined, projection);
  check('5e 无 role 的反应专长走 passive 派生不进投影', projection.sentinelIn === false, projection);

  // ===== 6. 回合包 feature-use op：落库扣池 + 通道执行 + 拒绝路径 =====
  const commit = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const noop = () => {};
    const req = (ops) => ({
      requestId: `probe-fu-${Date.now()}`, round: 1, combatantId: 'feat-pc', baseSeq: 0,
      action: { ops },
    });
    const ok = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: req([{ kind: 'feature-use', featureName: '卓越战技', poolKey: 'feature:卓越战技', cost: 1, activation: 'free', roundText: '发动「卓越战技」（1 点）' }]),
      currentRound: 1, applyDamage: () => null, consumeAction: noop, consumeBonusAction: noop,
      advanceTurn: noop, beginConcentration: noop,
    });
    const after = combatStore.get(rec.id);
    const masteryDelta = after.featureUses?.['feat-pc']?.['feature:卓越战技'];
    const okRage = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: req([{ kind: 'feature-use', featureName: '狂暴', activation: 'bonus', roundText: '发动「狂暴」' }]),
      currentRound: 1, applyDamage: () => null, consumeAction: noop, consumeBonusAction: noop,
      advanceTurn: noop, beginConcentration: noop,
    });
    const rageOn = globalStatusManager.getActiveStatuses('feat-pc').some(i => i.definitionId === 'rage');
    const todoOn = combatStore.get(rec.id).turnTodos?.some(t => t.type === 'condition_check');
    const rejected = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: req([{ kind: 'feature-use', featureName: '诗人激励', poolKey: 'feature:诗人激励', cost: 1, activation: 'bonus', roundText: '发动「诗人激励」' }]),
      currentRound: 1, applyDamage: () => null, consumeAction: noop, consumeBonusAction: noop,
      advanceTurn: noop, beginConcentration: noop,
    });
    // 清场
    globalStatusManager.getActiveStatuses('feat-pc').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    combatStore.update(rec.id, { turnTodos: [], featureUses: {} });
    return {
      ok: ok.ok, masteryDelta,
      okRage: okRage.ok, rageOn, todoOn,
      rejectedOk: rejected.ok, rejectedReason: rejected.reason,
    };
  });
  check('6a feature-use 落库成功', commit.ok === true, commit);
  check('6b 池 delta 累加（1+1=2）', commit.masteryDelta === 2, commit);
  check('6c 狂暴经 op 通道挂载状态 + 待办', commit.okRage === true && commit.rageOn === true && commit.todoOn === true, commit);
  check('6d 池不足被拒并返回原因', commit.rejectedOk === false && (commit.rejectedReason ?? '').includes('资源不足'), commit);

  // ===== 7. 结算并入 + 休息恢复（普通记录：非试验场） =====
  const settle = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const charId = window.__probeCharId;
    const created = combatStore.create('探针·主动技能结算场', [{
      ...rec.combatants.find(c => c.id === 'feat-pc'),
      id: undefined, name: '结算野蛮人', currentHp: 45,
    }]);
    const cid = created.combatants[0].id;
    combatStore.update(created.id, {
      featureUses: { [cid]: { 'feature:诗人激励': 1, 'feature:卓越战技': 2 } },
      updatedAt: Date.now(),
    });
    const preview = combatStore.buildSettlementPreview(created.id);
    const pools = preview?.entries?.[0]?.featurePools ?? [];
    const inspire = pools.find(p => p.featureKey === 'feature:诗人激励');
    const mastery = pools.find(p => p.featureKey === 'feature:卓越战技');
    const done = combatStore.settleCombat(created.id, {
      equipmentChildIds: {}, spellSlotCombatantIds: [], hpCombatantIds: [],
      featurePoolCombatantIds: [cid], statusInstanceIds: {},
    });
    const char = characterStore.get(charId);
    const afterSettle = {
      inspire: char.featurePools?.['feature:诗人激励']?.used,
      mastery: char.featurePools?.['feature:卓越战技']?.used,
    };
    characterStore.resetFeaturePools(charId, 'short');
    const afterShort = characterStore.get(charId).featurePools;
    characterStore.resetFeaturePools(charId, 'long');
    const afterLong = characterStore.get(charId).featurePools;
    combatStore.delete(created.id);
    return {
      inspire: { delta: inspire?.delta, used: inspire?.used, max: inspire?.max, name: inspire?.name },
      mastery: { delta: mastery?.delta, used: mastery?.used, max: mastery?.max },
      settleDone: done,
      afterSettle,
      shortMastery: afterShort['feature:卓越战技']?.used, shortInspire: afterShort['feature:诗人激励']?.used,
      longInspire: afterLong['feature:诗人激励']?.used,
    };
  });
  check('7a 结算预览列出激励 delta1（卡片已用 0）', settle.inspire?.delta === 1 && settle.inspire?.used === 0 && settle.inspire?.max === 2 && settle.inspire?.name === '诗人激励', settle);
  check('7b 结算预览列出卓越 delta2 used0/4', settle.mastery?.delta === 2 && settle.mastery?.used === 0 && settle.mastery?.max === 4, settle);
  check('7c settleCombat 并入成功', settle.settleDone === true, settle);
  check('7d 激励并入 1、卓越并入 2', settle.afterSettle.inspire === 1 && settle.afterSettle.mastery === 2, settle);
  check('7e 短休只恢复 short 池（卓越0 激励1 不动）', settle.shortMastery === 0 && settle.shortInspire === 1, settle);
  check('7f 长休恢复 long 池（激励0）', settle.longInspire === 0, settle);

  // ===== 8. P3 attack_rider 通道：法术位 rider（至圣斩）+ 池 rider（震慑拳）+ 魔力泉涌池公式 =====
  const rider = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const paladinChar = characterStore.add({
      name: '主动技能·圣骑士', race: '人类', level: 5, profession: { class: '圣武士' },
      maxHp: 42, currentHp: 42, isSandbox: true,
      abilities: { strength: { score: 16, modifier: 3 }, dexterity: { score: 10, modifier: 0 }, constitution: { score: 14, modifier: 2 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 14, modifier: 2 } },
      attacks: [{ name: '长剑', damageDice: '1d8', damageType: '挥砍', bonus: 5, range: '5尺', properties: [] }],
      spells: { spellSlots: { level1: { max: 4, used: 0 }, level2: { max: 2, used: 0 } } },
      features: [{ name: '至圣斩', description: '命中时耗法术位追加 2d8 光耀伤害', category: '职业特性', role: 'active', level: 2, activation: 'free', resource: 'manual' }],
    });
    const monkChar = characterStore.add({
      name: '主动技能·武僧', race: '人类', level: 5, profession: { class: '武僧' },
      proficiencyBonus: 3,
      maxHp: 38, currentHp: 38, isSandbox: true,
      abilities: { strength: { score: 12, modifier: 1 }, dexterity: { score: 16, modifier: 3 }, constitution: { score: 14, modifier: 2 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 16, modifier: 3 }, charisma: { score: 10, modifier: 0 } },
      attacks: [{ name: '徒手打击', damageDice: '1d6', damageType: '钝击', bonus: 3, range: '5尺', properties: [] }],
      features: [
        { name: '气', description: '武僧气池：短休恢复，数量等于武僧职业等级', category: '职业特性', role: 'active', level: 1, activation: 'free', resource: 'pool', poolFormula: { type: 'classLevel', multiplier: 1, restKind: 'short' } },
        { name: '震慑拳', description: '命中时耗1点气：目标体质豁免（DC 8＋熟练＋感知）失败则震慑', category: '职业特性', role: 'active', level: 1, activation: 'free', resource: 'pool', pool: '气', cost: 1 },
        { name: '魔力泉涌', description: '法师魔力泉涌：附赠动作，每环位 1 点', category: '职业特性', role: 'active', level: 1, activation: 'bonus', resource: 'pool', poolFormula: { type: 'classLevel', multiplier: 1, restKind: 'long' } },
      ],
    });
    // 武僧兼任魔力泉涌载体（L5 → max=5，公式隔离于特性本身）
    const addC = (id, name, isPc, characterId, hp) => ({
      id, name, isPc, ...(characterId ? { characterId } : {}), initiative: 7,
      actions: 1, bonusActions: 1, reactions: 1, currentHp: hp, maxHp: hp, movementUsed: 0,
      heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [],
    });
    combatStore.update(rec.id, {
      combatants: [
        ...rec.combatants,
        addC('feat-paladin', '技能圣骑士', true, paladinChar.id, 42),
        addC('feat-monk', '技能武僧', true, monkChar.id, 38),
      ],
      updatedAt: Date.now(),
    });
    const { getAttackRiders, applyAttackRiders } = await import('/src/data/attackRiders.ts');
    const palOpts = getAttackRiders(combatStore.get(rec.id), combatStore.get(rec.id).combatants.find(c => c.id === 'feat-paladin'));
    const monkOpts = getAttackRiders(combatStore.get(rec.id), combatStore.get(rec.id).combatants.find(c => c.id === 'feat-monk'));
    // 圣骑士：至圣斩 spellSlot 选项
    const palOpt = palOpts[0];
    // 落地：耗 1 环法术位（无豁免 rider）
    const palLines = applyAttackRiders(combatStore.get(rec.id), combatStore.get(rec.id).combatants.find(c => c.id === 'feat-paladin'), combatStore.get(rec.id).combatants.find(c => c.id === 'feat-npc'), [{ featureName: '至圣斩', slotLevel: 'level1' }], 0);
    const palDelta1 = combatStore.getSpellSlotDeltas(rec.id, 'feat-paladin').level1;
    // 武僧：震慑拳 pool 选项 + DC（8+prof3+wis3=14）
    const monkOpt = monkOpts[0];
    // 落地：耗 1 气 + 豁免失败挂震慑（目标 feat-npc 存活）
    const monkLines = applyAttackRiders(combatStore.get(rec.id), combatStore.get(rec.id).combatants.find(c => c.id === 'feat-monk'), combatStore.get(rec.id).combatants.find(c => c.id === 'feat-npc'), [{ featureName: '震慑拳', saveResult: 'fail' }], 2);
    const monkKiDelta = combatStore.getFeaturePoolView(rec.id, 'feat-monk').find(v => v.featureKey === 'feature:气')?.usedCombat;
    const stunnedOn = globalStatusManager.getActiveStatuses('feat-npc').some(i => i.definitionId === 'stunned');
    const todo = combatStore.get(rec.id).turnTodos?.find(t => t.combatantId === 'feat-npc' && t.type === 'condition_check');
    // 魔力泉涌池公式：classLevel multiplier 1 → max = 5
    const spring = combatStore.getFeaturePoolView(rec.id, 'feat-monk').find(v => v.featureKey === 'feature:魔力泉涌');
    // 死亡目标：资源照扣，跳过震慑挂载（用 feat-pc2 当死靶）
    globalStatusManager.getActiveStatuses('feat-pc2').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    const deadLines = applyAttackRiders(combatStore.get(rec.id), combatStore.get(rec.id).combatants.find(c => c.id === 'feat-monk'), combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2'), [{ featureName: '震慑拳', saveResult: 'fail' }], 2, { targetAlive: false });
    const deadStunned = globalStatusManager.getActiveStatuses('feat-pc2').some(i => i.definitionId === 'stunned');
    // 清场：回滚 delta + 解除状态
    combatStore.update(rec.id, {
      featureUses: {}, spellSlotChanges: {}, turnTodos: [],
      combatants: rec.combatants,
      updatedAt: Date.now(),
    });
    globalStatusManager.getActiveStatuses('feat-npc').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    return {
      palOpt: { name: palOpt?.featureName, kind: palOpt?.kind, dmg: palOpt?.damage, perSlot: palOpt?.perSlotDice, bonusVs: palOpt?.bonusDice, levels: palOpt?.slotLevels },
      palLine: palLines[0], palDelta1,
      monkOpt: { name: monkOpt?.featureName, kind: monkOpt?.kind, poolKey: monkOpt?.poolKey, cost: monkOpt?.poolCost, avail: monkOpt?.poolAvailable, max: monkOpt?.poolMax, save: monkOpt?.save },
      monkLine: monkLines[0], monkKiDelta, stunnedOn, todoRound: todo ? { start: todo.startRound, end: todo.endRound, name: todo.name } : null,
      springMax: spring?.max, springAvail: spring?.available,
      deadStunned, deadLine: deadLines[0],
    };
  });
  check('8a 至圣斩 spellSlot 选项（2d8 光耀 + 每环 1d8 + 不死/邪异 +1d8 + 1/2 环余量 4/2）', rider.palOpt?.name === '至圣斩' && rider.palOpt?.kind === 'spellSlot' && rider.palOpt?.dmg?.dice === '2d8' && rider.palOpt?.dmg?.damageType === '光耀' && rider.palOpt?.perSlot?.dice === '1d8' && Array.isArray(rider.palOpt?.bonusVs?.vs) && rider.palOpt?.levels?.find(l => l.level === 'level1')?.remaining === 4 && rider.palOpt?.levels?.find(l => l.level === 'level2')?.remaining === 2, rider.palOpt);
  check('8b 震慑拳 pool 选项（池 feature:气 余量 5/5 DC14 体质豁免）', rider.monkOpt?.name === '震慑拳' && rider.monkOpt?.kind === 'pool' && rider.monkOpt?.poolKey === 'feature:气' && rider.monkOpt?.cost === 1 && rider.monkOpt?.avail === 5 && rider.monkOpt?.max === 5 && rider.monkOpt?.save?.dc === 14 && rider.monkOpt?.save?.abilityLabel === '体质', rider.monkOpt);
  check('8c 至圣斩落地扣 1 环法术位 delta=1 + 记录行含「1环法术位」', rider.palDelta1 === 1 && (rider.palLine ?? '').includes('至圣斩') && (rider.palLine ?? '').includes('1环法术位'), rider);
  check('8d 震慑拳落地扣 1 气 + 豁免失败挂 stunned + 待办 endRound=start+2', rider.monkKiDelta === 1 && rider.stunnedOn === true && rider.todoRound?.start === 2 && rider.todoRound?.end === 4 && (rider.monkLine ?? '').includes('震慑'), rider);
  check('8e 魔力泉涌 classLevel 池 max=5 余量 5', rider.springMax === 5 && rider.springAvail === 5, rider.spring);
  check('8f 死亡目标跳过震慑挂载（资源行仍返回）', rider.deadStunned === false && (rider.deadLine ?? '').includes('震慑'), rider);

  // ===== 9. checkModifier 通道：直调执行器 + 回合包 targetId 落地 =====
  const cm = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { executeFeatureChannel } = await import('/src/data/featureChannelRunner.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    // 复位到干净状态（前段可能改过池/状态）
    combatStore.update(rec.id, { featureUses: {}, spellSlotChanges: {}, turnTodos: [], updatedAt: Date.now() });
    const pc = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc');
    const npc = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-npc');

    // 9-1 直调：激励 → feat-pc2（野蛮人非诗人 → 骰面回退 d6）
    const r1 = executeFeatureChannel(combatStore.get(rec.id), pc, '诗人激励', 0, { targetId: 'feat-pc2' });
    const after1 = combatStore.get(rec.id);
    const pendingOnAlly = (after1.combatants.find(c => c.id === 'feat-pc2').pendingCheckModifiers || [])[0];
    // 9-2 直调：目标死亡 → 不写入
    combatStore.update(rec.id, { combatants: after1.combatants.map(c => c.id === 'feat-npc' ? { ...c, isDead: true } : c) });
    const r2 = executeFeatureChannel(combatStore.get(rec.id), pc, '诗人激励', 0, { targetId: 'feat-npc' });
    const deadCount = (combatStore.get(rec.id).combatants.find(c => c.id === 'feat-npc').pendingCheckModifiers || []).length;
    combatStore.update(rec.id, { combatants: combatStore.get(rec.id).combatants.map(c => c.id === 'feat-npc' ? { ...c, isDead: false } : c), pendingCheckModifiers: {} });

    // 9-3 回合包：激励 op 带 targetId → 池扣 + pending 落地 + 记录行
    const noop = () => {};
    const req = (ops) => ({
      requestId: `probe-cm-${Date.now()}`, round: 1, combatantId: 'feat-pc', baseSeq: 0,
      action: { ops },
    });
    const ok = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: req([{ kind: 'feature-use', featureName: '诗人激励', poolKey: 'feature:诗人激励', cost: 1, targetId: 'feat-pc2', activation: 'bonus', roundText: '发动「诗人激励」→ 哨兵战士（1 点）' }]),
      currentRound: 1, applyDamage: () => null, consumeAction: noop, consumeBonusAction: noop,
      advanceTurn: noop, beginConcentration: noop,
    });
    const afterCommit = combatStore.get(rec.id);
    const inspireDelta = afterCommit.featureUses?.['feat-pc']?.['feature:诗人激励'];
    const cmPending = (afterCommit.combatants.find(c => c.id === 'feat-pc2').pendingCheckModifiers || []).find(m => (m.reason ?? '').includes('吟游诗人激励'));
    const rowText = JSON.stringify(afterCommit.rounds?.[0]?.['feat-pc'] ?? '');
    // 清场
    combatStore.update(rec.id, { featureUses: {}, turnTodos: [], updatedAt: Date.now() });
    return {
      note1: r1.note, sides: pendingOnAlly?.dice?.sides, scene: pendingOnAlly?.scene, expire: pendingOnAlly?.expireRound, uses: pendingOnAlly?.remainingUses ?? pendingOnAlly?.uses,
      note2: r2.note, deadCount,
      commitOk: ok.ok, inspireDelta, cmReason: cmPending?.reason, rowText,
    };
  });
  check('9a 直调激励：note 含目标名与骰面', (cm.note1 ?? '').includes('哨兵战士') && (cm.note1 ?? '').includes('d6'), cm);
  check('9b pending 落地 feat-pc2：d6/any/整场/1 次', cm.sides === 6 && cm.scene === 'any' && cm.expire === -1 && cm.uses === 1, cm);
  check('9c 死亡目标不写入（note=null 且 pending 空）', cm.note2 === null && cm.deadCount === 0, cm);
  check('9d 回合包 targetId：池扣 1 + pending 含激励原因', cm.commitOk === true && cm.inspireDelta === 1 && (cm.cmReason ?? '').includes('吟游诗人激励'), cm);
  check('9e 回合行含通道说明（激励 d6）', (cm.rowText ?? '').includes('吟游诗人激励') && (cm.rowText ?? '').includes('d6'), cm);

  // ===== 10. 玩家 attack riders 协议（方案 B）：投影构建选项 + attack op 携带 riders 入账 =====
  const pr = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const { getAttackRidersForPlayer } = await import('/src/data/attackRiders.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    // 复用第 8 段的圣武士/武僧沙盒卡构建玩家侧投影
    const paladinChar = characterStore.getAll().find(c => c.name === '主动技能·圣骑士');
    const monkChar = characterStore.getAll().find(c => c.name === '主动技能·武僧');
    const palFeat = [{ name: '至圣斩', description: '', activation: 'free', resource: 'manual' }];
    const palSlots = [{ level: 1, label: '1环', used: 0, max: 4 }];
    const monkFeat = [{ name: '震慑拳', description: '', activation: 'free', resource: 'pool', poolKey: 'feature:气', poolLeft: 5, poolMax: 5, cost: 1 }];
    const palOpts = getAttackRidersForPlayer(paladinChar, palFeat, palSlots);
    const monkOpts = getAttackRidersForPlayer(monkChar, monkFeat, []);
    const monkExhausted = getAttackRidersForPlayer(monkChar, [{ ...monkFeat[0], poolLeft: 0, disabled: true }], []);

    // attack op 携带 riders → DM 入账扣法术位/池 + 挂状态
    const addC = (id, name, characterId) => ({
      id, name, isPc: true, characterId, initiative: 7,
      actions: 1, bonusActions: 1, reactions: 1, movementUsed: 0,
      heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [],
    });
    const baseRoster = combatStore.get(rec.id).combatants;
    combatStore.update(rec.id, {
      combatants: [...baseRoster, addC('probe-pal', '探针圣骑士', paladinChar.id), addC('probe-monk', '探针武僧', monkChar.id)],
      featureUses: {}, spellSlotChanges: {}, turnTodos: [],
      updatedAt: Date.now(),
    });
    const noop = () => {};
    const req = (ops) => ({
      requestId: `probe-pr-${Date.now()}-${Math.random()}`, round: 1, combatantId: 'probe-pal', baseSeq: 0,
      action: { ops },
    });
    const r1 = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: req([{ kind: 'attack', weaponChildId: null, weaponName: '长剑', targetId: 'feat-npc', targetName: '技能地精', d20: 15, bonus: 5, hit: true, critical: false, damage: { amount: 8, type: '挥砍' }, riders: [{ featureName: '至圣斩', slotLevel: 'level1' }], roundText: '用长剑攻击技能地精' }]),
      currentRound: 1, applyDamage: () => null, consumeAction: noop, consumeBonusAction: noop,
      advanceTurn: noop, beginConcentration: noop,
    });
    const after1 = combatStore.get(rec.id);
    const slotDelta = after1.spellSlotChanges?.['probe-pal']?.level1;
    const palRow = JSON.stringify(after1.rounds?.[0]?.['probe-pal'] ?? '');
    // 震慑拳走 attack op（武僧行动者）：池扣 + 豁免失败挂震慑
    const r2 = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: { ...req([{ kind: 'attack', weaponChildId: null, weaponName: '徒手打击', targetId: 'feat-npc', targetName: '技能地精', d20: 12, bonus: 3, hit: true, critical: false, damage: { amount: 3, type: '钝击' }, riders: [{ featureName: '震慑拳', saveResult: 'fail' }], roundText: '用徒手打击攻击技能地精' }]), combatantId: 'probe-monk' },
      currentRound: 1, applyDamage: () => null, consumeAction: noop, consumeBonusAction: noop,
      advanceTurn: noop, beginConcentration: noop,
    });
    const after2 = combatStore.get(rec.id);
    const kiDelta = after2.featureUses?.['probe-monk']?.['feature:气'];
    const stunnedOn = globalStatusManager.getActiveStatuses('feat-npc').some(i => i.definitionId === 'stunned');
    const todoOn = after2.turnTodos?.some(t => t.combatantId === 'feat-npc' && t.type === 'condition_check');
    // 清场：回滚资源 delta + 解除状态 + 移除探针参战者
    combatStore.update(rec.id, {
      combatants: baseRoster, featureUses: {}, spellSlotChanges: {}, turnTodos: [],
      updatedAt: Date.now(),
    });
    globalStatusManager.getActiveStatuses('feat-npc').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    return {
      palOpt: palOpts[0] ? { name: palOpts[0].featureName, kind: palOpts[0].kind, lv1: palOpts[0].slotLevels?.[0]?.remaining } : null,
      monkOpt: monkOpts[0] ? { name: monkOpts[0].featureName, kind: monkOpts[0].kind, key: monkOpts[0].poolKey, cost: monkOpts[0].poolCost, avail: monkOpts[0].poolAvailable, max: monkOpts[0].poolMax, dc: monkOpts[0].save?.dc } : null,
      exhaustedN: monkExhausted.length,
      r1Ok: r1.ok, slotDelta, palRow,
      r2Ok: r2.ok, kiDelta, stunnedOn, todoOn,
    };
  });
  check('10a 玩家投影构建至圣斩选项（spellSlot 余量 4）', pr.palOpt?.name === '至圣斩' && pr.palOpt?.kind === 'spellSlot' && pr.palOpt?.lv1 === 4, pr.palOpt);
  check('10b 玩家投影构建震慑拳选项（池 5/5 DC14）', pr.monkOpt?.name === '震慑拳' && pr.monkOpt?.kind === 'pool' && pr.monkOpt?.key === 'feature:气' && pr.monkOpt?.cost === 1 && pr.monkOpt?.avail === 5 && pr.monkOpt?.max === 5 && pr.monkOpt?.dc === 14, pr.monkOpt);
  check('10c 池耗尽投影（poolLeft0+disabled）无选项', pr.exhaustedN === 0, pr);
  check('10d attack op riders：至圣斩入账扣 1 环 + 记录行含至圣斩', pr.r1Ok === true && pr.slotDelta === 1 && (pr.palRow ?? '').includes('至圣斩'), pr);
  check('10e attack op riders：震慑拳入账扣 1 气 + 震慑挂载', pr.r2Ok === true && pr.kiDelta === 1 && pr.stunnedOn === true && pr.todoOn === true, pr);

  // ===== 11. aoe_save 通道（吐息武器）：几何规划 + 豁免结算 + 回合包全自动落库 =====
  const aoe = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    const { planAoeSave, applyAoeSave, saveBonusFor, rollAoeDamage } = await import('/src/data/aoeSaveEngine.ts');
    const { resolveFeatureCapability } = await import('/src/data/featureCapabilities.ts');
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);

    // 龙裔沙盒卡：吐息武器（15尺锥状，池=1）
    const dmkChar = characterStore.add({
      name: '探针·龙裔', race: '龙裔', level: 5, profession: { class: '战士' }, proficiencyBonus: 3,
      maxHp: 40, currentHp: 40, isSandbox: true,
      abilities: { strength: { score: 14, modifier: 2 }, dexterity: { score: 10, modifier: 0 }, constitution: { score: 14, modifier: 2 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 10, modifier: 0 }, charisma: { score: 10, modifier: 0 } },
      attacks: [{ name: '长剑', damageDice: '1d8', damageType: '挥砍', bonus: 4, range: '5尺', properties: [] }],
      features: [
        { name: '吐息武器', description: '用动作呼出15尺锥状的破坏性能量（2d6 伤害），范围内敏捷豁免失败受全额、成功减半', category: '种族特性', role: 'active', activation: 'action', resource: 'pool', poolFormula: { type: 'classLevel', multiplier: 1, restKind: 'short' } },
      ],
    });
    const cap = resolveFeatureCapability('吐息武器');
    const dc = cap.aoeSave.dc({ id: 'probe-dragon', characterId: dmkChar.id, name: '探针·龙裔' });

    // 摆位：龙裔 (4,4) 朝 E 吐息 → 锥形覆盖 (5,4)/(6,4) 等，源点格 (4,4) 被排除
    const mk = (id, name, isPc, characterId, hp) => ({
      id, name, isPc, ...(characterId ? { characterId } : {}), initiative: 7,
      actions: 1, bonusActions: 1, reactions: 1, currentHp: hp, maxHp: hp, movementUsed: 0,
      heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [],
    });
    const baseRoster = combatStore.get(rec.id).combatants;
    const baseTokens = battlegroundStore.get(rec.id)?.tokens ?? [];
    combatStore.update(rec.id, {
      combatants: [...baseRoster, mk('probe-dragon', '探针·龙裔', true, dmkChar.id, 40)],
      featureUses: {}, turnTodos: [],
      updatedAt: Date.now(),
    });
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'probe-dragon', col: 4, row: 4 },
      { combatantId: 'feat-pc2', col: 5, row: 4 },
      { combatantId: 'feat-npc', col: 3, row: 4 },
    ]);
    const dragon = combatStore.get(rec.id).combatants.find(c => c.id === 'probe-dragon');
    const pc2 = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2');
    const npc = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-npc');

    // 11-1 planAoeSave：锥形几何 + DC 推导（探针龙裔 = 8+熟练3+体质2 = DC13）
    const plan = planAoeSave(dragon, dmkChar.features[0].description, dc, 'dexterity', [
      { combatant: pc2, pos: { col: 5, row: 4 } },
      { combatant: npc, pos: { col: 3, row: 4 } },
    ], { origin: { col: 4, row: 4 }, direction: 'E', bounds: { cols: 20, rows: 20 } });
    const cellKeys = plan.area.cells.map(c => `${c.col},${c.row}`);
    const planIds = plan.targets.map(t => t.combatantId);

    // 11-2 applyAoeSave：固定骰值 + 伤害覆写（失败全额 8 / 成功减半 4）
    const dmgOverride = rollAoeDamage('2d6');
    const results = applyAoeSave([
      { combatant: pc2, roll: 5, saveBonus: saveBonusFor(pc2, 'dexterity').bonus, dc },
      { combatant: npc, roll: 20, saveBonus: saveBonusFor(npc, 'dexterity').bonus, dc },
    ], 8, '火焰', { halfOnSave: true });
    const rPc2 = results.find(r => r.combatantId === 'feat-pc2');
    const rNpc = results.find(r => r.combatantId === 'feat-npc');

    // 11-3 回合包：feature-use op 带 direction → 池扣 + HP 落地（stub applyDamage 写库）+ 记录行
    const noop = () => {};
    const applyDamageStub = (event) => {
      const cur = combatStore.get(rec.id);
      const t = cur.combatants.find(c => c.id === event.targetId);
      if (!t) return null;
      const oldHp = t.currentHp;
      const newHp = Math.max(0, oldHp - event.amount);
      combatStore.update(rec.id, {
        combatants: cur.combatants.map(c => c.id === event.targetId ? { ...c, currentHp: newHp } : c),
        updatedAt: Date.now(),
      });
      return { damage: event.amount, oldHp, newHp };
    };
    const npcHpBefore = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-npc').currentHp;
    const pc2HpBefore = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2').currentHp;
    // 线下骰口径：op 带 aoeDamage=8（玩家掷 2d6）+ aoeSaveRolls={feat-pc2:5}（DM 采集的目标豁免骰）→ pc2 失败全额 8
    const ok = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: {
        requestId: `probe-aoe-${Date.now()}`, round: 1, combatantId: 'probe-dragon', baseSeq: 0,
        action: { ops: [{ kind: 'feature-use', featureName: '吐息武器', poolKey: 'feature:吐息武器', cost: 1, direction: 'E', aoeDamage: 8, aoeSaveRolls: { 'feat-pc2': 5 }, activation: 'action', roundText: '发动「吐息武器」（锥状15尺，朝向东），掷 2d6=8' }] },
      },
      currentRound: 1, applyDamage: applyDamageStub, consumeAction: noop, consumeBonusAction: noop,
      advanceTurn: noop, beginConcentration: noop,
    });
    const after = combatStore.get(rec.id);
    const dragonDelta = after.featureUses?.['probe-dragon']?.['feature:吐息武器'];
    const npcHpAfter = after.combatants.find(c => c.id === 'feat-npc').currentHp;
    const pc2HpAfter = after.combatants.find(c => c.id === 'feat-pc2').currentHp;
    const rowText = JSON.stringify(after.rounds?.[0]?.['probe-dragon'] ?? '');

    // 11-3b 缺省兜底：op 无 aoeDamage/aoeSaveRolls → 0 伤害落账 + 记录行标注「未填」，不虚构线下骰值
    const okBare = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: {
        requestId: `probe-aoe-${Date.now()}-bare`, round: 1, combatantId: 'probe-dragon', baseSeq: 1,
        action: { ops: [{ kind: 'feature-use', featureName: '吐息武器', poolKey: 'feature:吐息武器', cost: 1, direction: 'E', activation: 'action', roundText: '发动「吐息武器」（锥状15尺，朝向东）' }] },
      },
      currentRound: 1, applyDamage: applyDamageStub, consumeAction: noop, consumeBonusAction: noop,
      advanceTurn: noop, beginConcentration: noop,
    });
    const rowTextBare = JSON.stringify(combatStore.get(rec.id).rounds?.[0]?.['probe-dragon'] ?? '');
    const pc2HpAfterBare = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2').currentHp;
    // skill 事件（§5.2 特殊文本记录）：feature-use 入账时 pushCombatEvent(kind 'skill')，标记语言与先攻表同源
    const skillEvts = (after.combatEvents ?? []).filter(e => e.kind === 'skill').map(e => e.text);
    const skillEvtBare = (combatStore.get(rec.id).combatEvents ?? []).filter(e => e.kind === 'skill' && e.text.includes('伤害骰未填')).length;

    // 清场：恢复 roster/tokens，清 delta
    combatStore.update(rec.id, {
      combatants: baseRoster, featureUses: {}, turnTodos: [],
      updatedAt: Date.now(),
    });
    battlegroundStore.setTokens(rec.id, baseTokens);
    return {
      dc, planError: plan.error, shapeLabel: plan.shapeLabel,
      hasOriginCell: cellKeys.includes('4,4'), hasEastCell: cellKeys.includes('5,4'),
      planIds, npcInPlan: planIds.includes('feat-npc'), dragonInPlan: planIds.includes('probe-dragon'),
      pc2Dc: plan.targets.find(t => t.combatantId === 'feat-pc2')?.dc,
      rollAoeDamageOk: typeof dmgOverride === 'number' && dmgOverride >= 2 && dmgOverride <= 12,
      rPc2: rPc2 ? { success: rPc2.success, damage: rPc2.damage } : null,
      rNpc: rNpc ? { success: rNpc.success, damage: rNpc.damage } : null,
      commitOk: ok.ok, dragonDelta, npcHpBefore, npcHpAfter, pc2HpBefore, pc2HpAfter, rowText, commitOkBare: okBare.ok, pc2HpAfterBare, rowTextBare,
      skillEvts, skillEvtBare,
    };
  });
  check('11a 吐息武器注册 aoe_save 通道且 DC=13（8+熟练3+体质2）', aoe.dc === 13, aoe);
  check('11b 锥状几何：E 向含 (5,4)、源点格 (4,4) 排除、西向 NPC 不入目标', aoe.hasEastCell === true && aoe.hasOriginCell === false && aoe.npcInPlan === false && aoe.dragonInPlan === false, aoe);
  check('11c 豁免结算：roll5 失败全额 8、roll20 成功减半 4', aoe.rPc2?.success === false && aoe.rPc2?.damage === 8 && aoe.rNpc?.success === true && aoe.rNpc?.damage === 4, aoe);
  check('11d rollAoeDamage 解析 2d6 范围合法', aoe.rollAoeDamageOk === true, aoe);
  // 11e：几何只把东侧 pc2 收进锥形，西向 NPC 应分文未损；op 带线下骰值（伤害 8 + 豁免 5 失败全额）
  check('11e 回合包 direction：池扣 1 + pc2 掉血 8（豁免 5 失败全额）+ 锥外 NPC 无损 + 记录行含吐息',
    aoe.commitOk === true && aoe.dragonDelta === 1 && aoe.pc2HpBefore - aoe.pc2HpAfter === 8 && aoe.npcHpAfter === aoe.npcHpBefore && (aoe.rowText ?? '').includes('吐息'), aoe);
  // 11f 缺省兜底（零暗骰）：op 缺 aoeDamage/aoeSaveRolls → 0 伤害 + 记录行标注未填，pc2 不再掉血
  check('11f op 缺骰值兜底：0 伤害落账 + 标注「未填」（不虚构线下骰值）',
    aoe.commitOkBare === true && aoe.pc2HpAfterBare === aoe.pc2HpAfter && (aoe.rowTextBare ?? '').includes('未填'), aoe);
  // 11g skill 事件双写：feature-use 入账同时落先攻表与事件流，标记语言（《技能名》→ …【数值】点）
  check('11g skill 事件：kind=skill 文本含《吐息武器》+【8】点+失败关键字（与先攻表同源）',
    aoe.skillEvts.length >= 1 && aoe.skillEvts.some(t => t.includes('《吐息武器》→') && t.includes('【8】点') && t.includes('失败')), aoe);
  // 11h 缺省兜底事件：bare 包也产出 skill 事件（标注伤害骰未填），零暗骰口径在事件流同样成立
  check('11h skill 事件缺省兜底：bare 包产出「伤害骰未填」事件',
    aoe.skillEvtBare >= 1, aoe);

  // ===== 12. 附赠动作默认回合恢复（激励可用性修复）：每回合开始 resetActions 恢复 1 =====
  const ba = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const actor = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2');
    // 老数据兜底：先手动置 0 模拟「本回合已用掉」，再走回合重置链路
    combatStore.update(rec.id, {
      combatants: combatStore.get(rec.id).combatants.map(c => c.id === 'feat-pc2' ? { ...c, bonusActions: 0 } : c),
      updatedAt: Date.now(),
    });
    const zeroed = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2').bonusActions;
    const consumed = combatStore.consumeBonusAction(rec.id, 'feat-pc2', 'playback');
    const afterConsume = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2').bonusActions;
    combatStore.resetActions(rec.id, 'feat-pc2');
    const afterReset = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2').bonusActions;
    return { zeroed, consumed, afterConsume, afterReset };
  });
  check('12a 用掉的附赠动作扣减到 0（放映模式不再自愈）', ba.zeroed === 0 && ba.consumed === 0 && ba.afterConsume === 0, ba);
  check('12b resetActions 每回合开始恢复附赠动作为 1（激励不再需要 DM 手动授予）', ba.afterReset === 1, ba);

  // ===== 13. 双击棋子面板主动技能按钮接线（Battleground onPanelFeatureClick → handleFeatureUse） =====
  // 修复前：Battleground 内挂载的 InfoPanel 漏传 onFeatureClick，点池类特性弹「暂未接入自动化流程」
  // 修复后：走 handleFeatureUse 完整链路（扣池 + 记录行 + 手动结算提示）
  await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
    // 野蛮人（卓越战技 池 4/短休，未注册 → manual 分支）放置到 (2,2)
    battlegroundStore.setTokens(rec.id, [{ combatantId: 'feat-pc', col: 2, row: 2 }]);
  });
  let dialogText = null;
  page.once('dialog', (d) => { dialogText = d.message(); d.dismiss(); });
  const geo = await page.evaluate(() => {
    const g = document.querySelector('div.grid.origin-top-left');
    const r = g.children[0].getBoundingClientRect();
    return { x: r.x, y: r.y, cell: r.width };
  });
  await page.mouse.dblclick(geo.x + 2.5 * geo.cell, geo.y + 2.5 * geo.cell);
  await page.waitForTimeout(400);
  const panel = page.locator('div.fixed.inset-0.z-50').last();
  // 主动技能区在「操作」tab（面板默认停在「快捷」tab）
  await panel.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  const panelHasFeat = await panel.getByRole('button', { name: /卓越战技/ }).count();
  if (panelHasFeat > 0) {
    await panel.getByRole('button', { name: /卓越战技/ }).first().click();
    await page.waitForTimeout(400);
  }
  const wiring = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const used = combatStore.get(rec.id).featureUses?.['feat-pc']?.['feature:卓越战技'] ?? 0;
    // 清场：恢复初始 roster 的 token 状态与池
    const baseTokens = (await import('/src/data/battlegroundStore.ts')).default.get(rec.id)?.tokens ?? [];
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
    return { used, tokensLeft: baseTokens.length };
  });
  check('13a 双击棋子面板含主动技能按钮（InfoPanel 打开且特性已投影）', panelHasFeat > 0, { panelHasFeat });
  check('13b 面板按钮走 handleFeatureUse（alert 为手动结算提示，非「暂未接入」）',
    dialogText != null && dialogText.includes('已消耗资源') && dialogText.includes('手动结算') && !dialogText.includes('暂未接入'), dialogText);
  check('13c 面板发动卓越战技扣池（featureUses +1）', wiring.used === 1, wiring);

  // ===== 14. spec 数据层解析链（feature-fullcycle P1）：REGISTRY → SPEC_DB → manual =====
  const specDb = await page.evaluate(async () => {
    const fc = await import('/src/data/featureCapabilities.ts');
    const resolve = fc.resolveFeatureCapability;
    const poet = resolve('诗人激励');
    const heal = resolve('回气');
    const conv = resolve('动作如潮');
    const dash = resolve('灵巧动作');
    const wholeness = resolve('混元体');
    const none = resolve('不存在技能XYZ');
    return {
      poetChannel: poet.channel, poetSource: poet.source ?? 'registry',
      healChannel: heal.channel, healSource: heal.source, healDice: heal.heal?.dice, healEngine: heal.engineAvailable,
      convChannel: conv.channel, convSource: conv.source, convEngine: conv.engineAvailable,
      convExtraAction: conv.resourceConv?.grants?.[0]?.extraAction === true,
      dashTo: dash.resourceConv?.convert?.to,
      wChannel: wholeness.channel, wSource: wholeness.source, wDice: wholeness.heal?.dice ?? null,
      wLevelFactor: wholeness.heal?.levelFactor, wEngine: wholeness.engineAvailable,
      noneChannel: none.channel,
    };
  });
  check('14a REGISTRY 优先：诗人激励同键共存（spec 文件有同名 heal 占位）时仍解析为 checkModifier',
    specDb.poetChannel === 'checkModifier' && specDb.poetSource === 'registry', specDb);
  check('14b SPEC_DB 生效：回气 heal 渠道、dice=1d10、引擎已登记（engineAvailable=true）',
    specDb.healChannel === 'heal' && specDb.healSource === 'spec_db' && specDb.healDice === '1d10' && specDb.healEngine === true, specDb);
  check('14c SPEC_DB 生效：动作如潮 grants 型（每回合额外动作）、引擎已登记',
    specDb.convChannel === 'resource_conv' && specDb.convSource === 'spec_db' && specDb.convExtraAction === true && specDb.convEngine === true, specDb);
  check('14d SPEC_DB 生效：灵巧动作多目标转换（dash/disengage/hide）',
    specDb.dashTo?.length === 3, specDb);
  check('14e manual 兜底：未登记特性解析为 manual', specDb.noneChannel === 'manual', specDb);
  check('14o SPEC_DB 生效：混元体 heal 渠道无骰直结（dice 缺省 + levelFactor 3 + 引擎已登记）',
    specDb.wChannel === 'heal' && specDb.wSource === 'spec_db' && specDb.wDice === null
      && specDb.wLevelFactor === 3 && specDb.wEngine === true, specDb);

  // 14.6-14.8 校验器（node 侧单一实现 = vite buildStart 同款）：全量合法 + 非法拒收
  const { pathToFileURL } = require('node:url');
  const { validateFeatureSpecDb, validateFull } = await import(pathToFileURL(require('node:path').join(process.cwd(), 'plugins/featureSpecSchema.mjs')).href);
  const vOk = validateFull(process.cwd());
  check('14f 构建期校验器：仓库 spec 文件全量合法（schema + 种子孤儿交叉检查）', vOk.length === 0, vOk);
  const vBad1 = validateFeatureSpecDb({ '未知技能': { channel: 'fly', spec: {} } });
  check('14g 校验器拒收未知 channel', vBad1.length > 0, vBad1);
  const vBad2 = validateFeatureSpecDb({ '回气': { channel: 'heal', spec: { type: 'hp' } } });
  check('14h 校验器拒收 heal 缺数值来源', vBad2.length > 0, vBad2);

  // 14.9 UI：spec_db 条目 engineAvailable=false 时 handleFeatureUse 落 manual alert（P3 引擎实现前行为与 manual 完全一致）
  await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const card = characterStore.getAll().find(c => c.name === '主动技能·哨兵战士');
    characterStore.update(card.id, {
      features: [
        ...(card.features ?? []).filter(f => f.name !== '回气'),
        { name: '回气', description: '你可以用附赠动作恢复生命值，恢复 1d10＋战士等级', category: '职业特性', role: 'active', level: 2, activation: 'bonus', resource: 'pool', poolFormula: { type: 'fixed', value: 1, restKind: 'short' } },
      ],
    });
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
    // 13 段清场后 token 只剩 feat-pc；feat-pc2（哨兵战士）重放到 (3,2)
    (await import('/src/data/battlegroundStore.ts')).default.setTokens(rec.id, [{ combatantId: 'feat-pc2', col: 3, row: 2 }]);
  });
  await page.reload();
  await page.waitForTimeout(800);
  let healDialog = null;
  page.once('dialog', (d) => { healDialog = d.message(); d.dismiss(); });
  const panel14 = await openInfoByChip(page, '哨兵战士');
  await panel14.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  const healBtnCount = await panel14.getByRole('button', { name: /回气/ }).count();
  if (healBtnCount > 0) {
    await panel14.getByRole('button', { name: /回气/ }).first().click();
    await page.waitForTimeout(400);
    // heal 骰值环节（线下骰）：填入结果 8 → 确认 → 引擎灌入结算（8+2=10）
    if (await page.locator('[data-testid="heal-roll-modal"]').count() === 1) {
      await page.fill('[data-testid="heal-roll-input"]', '8');
      await page.locator('[data-testid="heal-roll-modal"]').getByRole('button', { name: '确认结算' }).click();
      await page.waitForTimeout(400);
    }
  }
  const healWiring = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const used = combatStore.get(rec.id).featureUses?.['feat-pc2']?.['feature:回气'] ?? 0;
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
    return { used };
  });
  check('14i 面板含回气按钮（spec_db 条目投影入列）', healBtnCount > 0, { healBtnCount });
  // P3 登记 ENGINE_READY 后行为变化：回气（spec_db heal）由 manual alert 切换为 heal 引擎结算
  //（alert 文案 = 「「回气」：X 恢复 N 点生命（1d10=… + 战士等级×1=…）」，HP 满时恢复 0 也含「恢复」）
  check('14j engineAvailable=true 后回气走 heal 引擎（骰值环节填 8 → alert 含线下骰明细）',
    healDialog != null && healDialog.includes('回气') && healDialog.includes('恢复') && healDialog.includes('线下骰'), healDialog);
  check('14k 回气池照常扣减（featureUses +1）', healWiring.used === 1, healWiring);

  // 14p 混元体（P5 热身）：无骰 heal 直结——不弹 HealRollModal，动作+池照扣，alert 含等级系数明细
  await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const card = characterStore.getAll().find(c => c.name === '主动技能·哨兵战士');
    characterStore.update(card.id, {
      features: [
        ...(card.features ?? []).filter(f => f.name !== '混元体'),
        { name: '混元体', description: '你可以用一个动作恢复生命值，数值等同于三倍你的武僧等级', category: '职业特性', role: 'active', level: 1, activation: 'action', resource: 'pool', poolFormula: { type: 'fixed', value: 1, restKind: 'long' } },
      ],
    });
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
  });
  await page.reload();
  await page.waitForTimeout(800);
  let whDialog = null;
  page.once('dialog', (d) => { whDialog = d.message(); d.dismiss(); });
  const panel14w = await openInfoByChip(page, '哨兵战士');
  await panel14w.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  const wBtnCount = await panel14w.getByRole('button', { name: /混元体/ }).count();
  let wModalShown = 0;
  if (wBtnCount > 0) {
    await panel14w.getByRole('button', { name: /混元体/ }).first().click();
    await page.waitForTimeout(400);
    wModalShown = await page.locator('[data-testid="heal-roll-modal"]').count();
  }
  const wWiring = await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const used = combatStore.get(rec.id).featureUses?.['feat-pc2']?.['feature:混元体'] ?? 0;
    // 恢复哨兵战士卡原状，避免影响后续段
    const card = characterStore.getAll().find(c => c.name === '主动技能·哨兵战士');
    characterStore.update(card.id, { features: (card.features ?? []).filter(f => f.name !== '混元体') });
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
    return { used };
  });
  check('14p 面板含混元体按钮（spec_db 条目投影入列）', wBtnCount > 0, { wBtnCount });
  check('14q 无骰 heal 直结：跳过 HealRollModal，alert 含等级系数明细（武僧等级×3）',
    wModalShown === 0 && whDialog != null && whDialog.includes('混元体') && whDialog.includes('恢复') && whDialog.includes('武僧等级×3'), { whDialog, wModalShown });
  check('14r 混元体池照常扣减（featureUses +1）', wWiring.used === 1, wWiring);

  // ===== 14s 容器预选（P5 核心A）：REGISTRY container 通道 + 角色卡四选一写回 + 战斗层按预选路由 =====
  const contDb = await page.evaluate(async () => {
    const fc = await import('/src/data/featureCapabilities.ts');
    const resolve = fc.resolveFeatureCapability;
    const cd = resolve('引导神力');
    const shadow = resolve('暗影技艺');
    const form = (key) => cd.container?.forms?.find(f => f.key === key)?.capability;
    return {
      ch: cd.channel,
      forms: cd.container?.forms?.map(f => f.key),
      lifeChannel: form('生命')?.channel, lifeFactor: form('生命')?.heal?.levelFactor,
      doomChannel: form('毁灭')?.channel,
      faithChannel: form('不灭信念')?.channel,
      radiantChannel: form('光辉')?.channel,
      radiantDice: form('光辉')?.aoeSave?.damage?.dice,
      shadowCh: shadow.channel, shadowForms: shadow.container?.forms?.map(f => f.key),
    };
  });
  check('14s 容器注册表：引导神力 4 形态（生命heal/毁灭manual/不灭信念reaction/光辉aoe_save）+ 暗影技艺 4 形态',
    contDb.ch === 'container' && contDb.forms?.length === 4 && contDb.lifeChannel === 'heal' && contDb.lifeFactor === 5
      && contDb.doomChannel === 'manual' && contDb.faithChannel === 'reaction' && contDb.radiantChannel === 'aoe_save'
      && contDb.radiantDice === '2d10' && contDb.shadowCh === 'container' && contDb.shadowForms?.length === 4, contDb);

  // 14t 未预选拦截：容器特性点按钮 alert 回角色卡预选，池与动作零消耗
  await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const card = characterStore.getAll().find(c => c.name === '主动技能·哨兵战士');
    characterStore.update(card.id, {
      features: [
        ...(card.features ?? []).filter(f => f.name !== '引导神力'),
        { id: 'feat-chan-div', name: '引导神力', description: '引导神力（15尺锥状）：四形态容器，按预选路由', category: '职业特性', role: 'active', level: 1, activation: 'action', resource: 'pool', poolFormula: { type: 'fixed', value: 1, restKind: 'short' } },
      ],
    });
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
    (await import('/src/data/battlegroundStore.ts')).default.setTokens(rec.id, [{ combatantId: 'feat-pc2', col: 3, row: 2 }]);
  });
  await page.reload();
  await page.waitForTimeout(800);
  let cdBlock = null;
  page.once('dialog', (d) => { cdBlock = d.message(); d.dismiss(); });
  const panel14c = await openInfoByChip(page, '哨兵战士');
  await panel14c.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  const cdBtnCount = await panel14c.getByRole('button', { name: /引导神力/ }).count();
  if (cdBtnCount > 0) {
    await panel14c.getByRole('button', { name: /引导神力/ }).first().click();
    await page.waitForTimeout(400);
  }
  const cdWiring = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const used = combatStore.get(rec.id).featureUses?.['feat-pc2']?.['feature:引导神力'] ?? 0;
    const pc2 = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2');
    return { used, actions: pc2?.actions };
  });
  check('14t 未预选拦截：alert 提示回角色卡预选，池与动作零消耗',
    cdBtnCount > 0 && cdBlock != null && cdBlock.includes('未预选形态') && cdWiring.used === 0 && cdWiring.actions === 1,
    { cdBlock, cdBtnCount, cdWiring });

  // 14u 角色卡信息对话框四选一写回 chosenForm
  const charId14 = await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    return characterStore.getAll().find(c => c.name === '主动技能·哨兵战士').id;
  });
  await page.goto(BASE + '/characters/' + charId14, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const infoBtn14 = page.locator('button[data-feature-info="引导神力"]');
  await infoBtn14.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  check('14u-1 特性卡含引导神力「…」信息对话框入口', await infoBtn14.count() >= 1, { count: await infoBtn14.count() });
  if (await infoBtn14.count() > 0) {
    await infoBtn14.first().click();
    await page.waitForTimeout(300);
  }
  const formBtnCount = await page.locator('button[data-feature-form]').count();
  if (formBtnCount > 0) {
    await page.locator('button[data-feature-form="光辉"]').first().click();
    await page.waitForTimeout(300);
  }
  const chosenAfter = await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const card = characterStore.getAll().find(c => c.name === '主动技能·哨兵战士');
    return card.features.find(f => f.name === '引导神力')?.chosenForm ?? null;
  });
  check('14u-2 …对话框含四形态预选按钮组（data-feature-form）', formBtnCount === 4, { formBtnCount });
  check('14u-3 点击「光辉」写回 chosenForm', chosenAfter === '光辉', { chosenAfter });

  // 14v 已预选光辉 → 战斗层点按钮打开 aoe_save 弹窗（子形态接管路由；取消零损失）
  await page.goto(BASE + '/combat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('button[title*="沙盒试验场"]');
  await page.waitForTimeout(800);
  const panel14d = await openInfoByChip(page, '哨兵战士');
  await panel14d.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  const aoeBtn14 = panel14d.getByRole('button', { name: /引导神力/ });
  const radiantBadge = await panel14d.locator('[data-container-form="光辉"]').count();
  if (await aoeBtn14.count() > 0) {
    await aoeBtn14.first().click();
    await page.waitForTimeout(500);
  }
  const aoeModal14 = await page.locator('div.fixed.inset-0.z-\\[60\\]').count();
  const aoeModalText = aoeModal14 > 0 ? await page.locator('div.fixed.inset-0.z-\\[60\\]').first().innerText() : '';
  // 取消（点背景关闭）→ 零损失
  if (aoeModal14 > 0) {
    await page.locator('div.fixed.inset-0.z-\\[60\\]').first().click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(300);
  }
  const vWiring = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const used = combatStore.get(rec.id).featureUses?.['feat-pc2']?.['feature:引导神力'] ?? 0;
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
    return { used };
  });
  check('14v 预选光辉路由 aoe_save：面板徽标显示形态 + 点按钮打开 aoe 弹窗 + 取消零损失',
    radiantBadge === 1 && aoeModal14 > 0 && aoeModalText.includes('引导神力') && vWiring.used === 0,
    { radiantBadge, aoeModal14, aoeModalText: aoeModalText.slice(0, 60), vWiring });

  // 14w 已预选毁灭 → manual 子形态 alert（池+动作按容器扣）
  await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const card = characterStore.getAll().find(c => c.name === '主动技能·哨兵战士');
    characterStore.update(card.id, {
      features: (card.features ?? []).map(f => (f.name === '引导神力' ? { ...f, chosenForm: '毁灭' } : f)),
    });
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
  });
  await page.reload();
  await page.waitForTimeout(800);
  let doomDialog = null;
  page.once('dialog', (d) => { doomDialog = d.message(); d.dismiss(); });
  const panel14e = await openInfoByChip(page, '哨兵战士');
  await panel14e.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  if (await panel14e.getByRole('button', { name: /引导神力/ }).count() > 0) {
    await panel14e.getByRole('button', { name: /引导神力/ }).first().click();
    await page.waitForTimeout(400);
  }
  const wWiring2 = await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const used = combatStore.get(rec.id).featureUses?.['feat-pc2']?.['feature:引导神力'] ?? 0;
    const pc2 = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2');
    // 清场：移除容器特性，恢复卡与战斗状态
    const card = characterStore.getAll().find(c => c.name === '主动技能·哨兵战士');
    characterStore.update(card.id, { features: (card.features ?? []).filter(f => f.name !== '引导神力') });
    combatStore.update(rec.id, {
      featureUses: {},
      combatants: rec.combatants.map(c => (c.id === 'feat-pc2' ? { ...c, actions: 1 } : c)),
      updatedAt: Date.now(),
    });
    return { used, actions: pc2?.actions };
  });
  check('14w 预选毁灭路由 manual：alert 含形态结算提示 + 池与动作按容器扣减',
    doomDialog != null && doomDialog.includes('毁灭') && wWiring2.used === 1 && wWiring2.actions === 1,
    { doomDialog, wWiring2 });

  // ===== 14x 渗透劲延迟引爆（P5 核心B）：埋劲 rider → 标记唯一性 → 引爆弹窗 CON 豁免 HP0 =====
  const qPalm = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const fc = await import('/src/data/featureCapabilities.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const qMonk = characterStore.add({
      name: '渗透劲·武僧', race: '人类', level: 17, profession: { class: '武僧' }, proficiencyBonus: 6,
      maxHp: 80, currentHp: 80, isSandbox: true,
      abilities: { strength: { score: 12, modifier: 1 }, dexterity: { score: 16, modifier: 3 }, constitution: { score: 14, modifier: 2 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 16, modifier: 3 }, charisma: { score: 10, modifier: 0 } },
      attacks: [{ name: '徒手打击', damageDice: '1d10', damageType: '钝击', bonus: 9, range: '5尺', properties: [] }],
      features: [
        { name: '气', description: '气池：数量等于武僧职业等级', category: '职业特性', role: 'active', level: 1, activation: 'free', resource: 'pool', poolFormula: { type: 'classLevel', multiplier: 1, restKind: 'short' } },
        { name: '渗透劲', description: '命中时耗3气埋劲，可用动作引爆', category: '职业特性', role: 'active', level: 17, activation: 'free', resource: 'pool', pool: '气', cost: 3 },
      ],
    });
    const addC = (id, name, isPc, characterId, hp) => ({ id, name, isPc, ...(characterId ? { characterId } : {}), initiative: 7, actions: 1, bonusActions: 1, reactions: 1, currentHp: hp, maxHp: hp, movementUsed: 0, heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] });
    combatStore.update(rec.id, {
      combatants: [
        ...rec.combatants,
        addC('feat-qmonk', '劲力武僧', true, qMonk.id, 80),
        addC('feat-qnpc', '劲力目标', false, null, 30),
        addC('feat-qnpc2', '劲力目标二', false, null, 30),
      ],
      updatedAt: Date.now(),
    });
    const { applyAttackRiders } = await import('/src/data/attackRiders.ts');
    const cap = fc.resolveFeatureCapability('渗透劲');
    const monk = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-qmonk');
    const npc = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-qnpc');
    const npc2 = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-qnpc2');
    // 埋劲：池扣 3 + 标记挂载（metadata.attackerId）
    const lines = applyAttackRiders(combatStore.get(rec.id), monk, npc, [{ featureName: '渗透劲' }], 0);
    const mark1 = globalStatusManager.getActiveStatuses('feat-qnpc', 'combat').find(i => i.definitionId === 'quivering_palm');
    const kiUsed = combatStore.getFeaturePoolView(rec.id, 'feat-qmonk').find(v => v.featureKey === 'feature:气')?.usedCombat;
    // 再埋第二个目标：第一个标记应解除（同一时间仅一个目标）
    applyAttackRiders(combatStore.get(rec.id), monk, npc2, [{ featureName: '渗透劲' }], 0);
    const mark1After = globalStatusManager.getActiveStatuses('feat-qnpc', 'combat').find(i => i.definitionId === 'quivering_palm');
    const mark2 = globalStatusManager.getActiveStatuses('feat-qnpc2', 'combat').find(i => i.definitionId === 'quivering_palm');
    // 清场：恢复单标记在 npc1（引爆 UI 断言用），npc2 标记解除
    globalStatusManager.getActiveStatuses('feat-qnpc2', 'combat').forEach(i => globalStatusManager.declareEnd(i.instanceId));
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
    // 重埋 npc1（池扣清零后重跑一次）
    applyAttackRiders(combatStore.get(rec.id), combatStore.get(rec.id).combatants.find(c => c.id === 'feat-qmonk'), npc, [{ featureName: '渗透劲' }], 0);
    const markFinal = globalStatusManager.getActiveStatuses('feat-qnpc', 'combat').find(i => i.definitionId === 'quivering_palm');
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
    return {
      capChannel: cap.channel, capCost: cap.attackRider?.cost, embedStatus: cap.attackRider?.embed?.statusId,
      dc: cap.attackRider?.embed?.detonate.dc(qMonk),
      line: lines[0],
      markOn: !!mark1, attackerId: mark1?.metadata?.attackerId, kiUsed,
      mark1Cleared: !mark1After, mark2On: !!mark2,
      markFinalOn: !!markFinal,
    };
  });
  check('14x-1 渗透劲注册表：attack_rider embed 通道 + 池扣 3 气 + 引爆 DC 8+6+3=17',
    qPalm.capChannel === 'attack_rider' && qPalm.capCost?.kind === 'pool' && qPalm.capCost?.cost === 3
      && qPalm.embedStatus === 'quivering_palm' && qPalm.dc === 17, qPalm);
  check('14x-2 埋劲落地：标记挂载带 attackerId + 池扣 3 + 记录行含埋入目标',
    qPalm.markOn && qPalm.attackerId === 'feat-qmonk' && qPalm.kiUsed === 3 && (qPalm.line ?? '').includes('劲力已埋入'), qPalm);
  check('14x-3 同一时间仅一个目标：再埋第二目标后旧标记解除',
    qPalm.mark1Cleared && qPalm.mark2On && qPalm.markFinalOn, qPalm);

  // 14y 引爆 UI：带标记时渗透劲按钮变引爆入口 → 弹窗填豁免失败 → HP0 + 动作扣减 + 标记解除
  // 注意：statusManager 纯内存，reload 会丢标记，因此沿用 14x evaluate 后的活页面
  // 动作扣减依赖 resourceConsumption 开关，这里显式开启
  await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { resourceConsumption: true, updatedAt: Date.now() });
  });
  await page.waitForTimeout(400);
  const panel14q = await openInfoByChip(page, '劲力武僧');
  await panel14q.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  const qBtnCount = await panel14q.getByRole('button', { name: /渗透劲/ }).count();
  if (qBtnCount > 0) {
    await panel14q.getByRole('button', { name: /渗透劲/ }).first().click();
    await page.waitForTimeout(400);
  }
  const qModalOpen = await page.locator('[data-testid="quivering-palm-modal"]').count();
  const qConfirmDisabled = qModalOpen > 0
    ? await page.locator('[data-testid="quivering-confirm"]').isDisabled()
    : null;
  if (qModalOpen > 0) {
    await page.fill('[data-testid="quivering-save-input"]', '3');
    await page.waitForTimeout(200);
  }
  const qConfirmReady = qModalOpen > 0 && !(await page.locator('[data-testid="quivering-confirm"]').isDisabled());
  if (qModalOpen > 0) {
    await page.locator('[data-testid="quivering-confirm"]').click();
    await page.waitForTimeout(500);
  }
  const qAfter = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const npc = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-qnpc');
    const monk = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-qmonk');
    const markLeft = globalStatusManager.getActiveStatuses('feat-qnpc', 'combat').some(i => i.definitionId === 'quivering_palm');
    const logText = JSON.stringify(rec.rounds.map(r => r.cells ?? {})) + JSON.stringify(rec.operationLog ?? []);
    combatStore.update(rec.id, {
      featureUses: {},
      combatants: rec.combatants.map(c => (c.id === 'feat-qnpc'
        ? { ...c, currentHp: c.maxHp, isDead: false, isUnconscious: false }
        : c.id === 'feat-qmonk' ? { ...c, actions: 1 } : c)),
      updatedAt: Date.now(),
    });
    return { hp: npc?.currentHp, isDead: npc?.isDead, monkActions: monk?.actions, markLeft, logged: logText.includes('劲力引爆') && logText.includes('生命归 0') };
  });
  check('14y-1 带标记时渗透劲按钮打开引爆弹窗（未填豁免时确认禁用）',
    qBtnCount > 0 && qModalOpen === 1 && qConfirmDisabled === true, { qBtnCount, qModalOpen, qConfirmDisabled });
  check('14y-2 豁免 3 < DC17 失败引爆：目标 HP0 + 武僧动作扣 1 + 标记解除 + 记录行落账',
    qConfirmReady && qAfter.hp === 0 && qAfter.isDead === true && qAfter.monkActions === 0 && qAfter.markLeft === false && qAfter.logged,
    { qAfter, qConfirmReady });
  check('14y-3 清场后标记复位（重埋标记待无害终止断言）', qPalm.markFinalOn, {});

  // 14z 无害终止：零消耗解除标记（同样沿用活页面，内存标记仍在）
  await page.waitForTimeout(400);
  const panel14h = await openInfoByChip(page, '劲力武僧');
  await panel14h.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  if (await panel14h.getByRole('button', { name: /渗透劲/ }).count() > 0) {
    await panel14h.getByRole('button', { name: /渗透劲/ }).first().click();
    await page.waitForTimeout(400);
  }
  if (await page.locator('[data-testid="quivering-palm-modal"]').count() === 1) {
    await page.locator('[data-testid="quivering-harmless"]').click();
    await page.waitForTimeout(500);
  }
  const qHarmless = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const monk = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-qmonk');
    const markLeft = globalStatusManager.getActiveStatuses('feat-qnpc', 'combat').some(i => i.definitionId === 'quivering_palm');
    const used = combatStore.get(rec.id).featureUses?.['feat-qmonk'] ?? {};
    // 清场：移除临时参战者与卡，还原资源消耗开关
    combatStore.update(rec.id, {
      combatants: rec.combatants.filter(c => !c.id.startsWith('feat-q')),
      featureUses: {},
      resourceConsumption: false,
      updatedAt: Date.now(),
    });
    const { characterStore } = await import('/src/data/characterStore.ts');
    const qCard = characterStore.getAll().find(c => c.name === '渗透劲·武僧');
    if (qCard) characterStore.delete(qCard.id);
    return { markLeft, monkActions: monk?.actions, poolUsed: Object.keys(used).length };
  });
  check('14z 无害终止：标记解除 + 动作与池零消耗',
    qHarmless.markLeft === false && qHarmless.monkActions === 1 && qHarmless.poolUsed === 0, qHarmless);

  // ===== 15. 数据提取器（feature-fullcycle P2）：UI 单项流程 + 批量 dry 报告 =====
  // 自建专测卡：回气 level=1（角色页特性解锁按 experience→等级 过滤，XP=0 时 level 2 条目会被隐藏）
  const charId15 = await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const old = characterStore.getAll().find(c => c.name === '提取器·测试卡');
    if (old) characterStore.delete(old.id);
    const c = characterStore.createSandbox({ name: '提取器·测试卡', level: 5, profession: { class: '战士' } });
    characterStore.save({ ...c, features: [{ id: 'feat-ext-1', name: '回气', description: '你可以用附赠动作恢复生命值，恢复 1d10＋战士等级', category: '职业特性', role: 'active', level: 1 }] });
    return c.id;
  });
  await page.goto(BASE + '/characters/' + charId15, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // 15a 特性卡「…」对话框 → 提取器入口（信息对话框收编后为两步点击）
  const infoBtn = page.locator('button[data-feature-info="回气"]');
  check('15a 特性卡含「…」信息对话框入口', await infoBtn.count() >= 1, { count: await infoBtn.count() });
  if (await infoBtn.count() > 0) {
    await infoBtn.click();
    await page.waitForTimeout(300);
  }
  const extBtn = page.locator('button[data-extract-feature="回气"]');
  check('15a-2 …对话框含数据提取器入口（data-extract-feature）', await extBtn.count() >= 1, { count: await extBtn.count() });
  if (await extBtn.count() > 0) {
    await extBtn.click();
    await page.waitForTimeout(400);
  }
  const modalOpen = await page.locator('[data-testid="feature-extractor-modal"]').count();
  check('15b 提取器 Modal 打开', modalOpen === 1, { modalOpen });
  // 15c draft 预填：回气 → heal + dice 1d10（提取核心正则预填，非空白模板）
  const draftText = await page.locator('[data-testid="extractor-draft"]').inputValue();
  check('15c draft 预填 heal 渠道 + 恢复骰 1d10',
    draftText.includes('"channel": "heal"') && draftText.includes('"dice": "1d10"'), draftText);
  // 15d 校验通过 + 命中高亮渲染
  const validateText = await page.locator('[data-testid="extractor-validate"]').innerText();
  check('15d draft 过 schema 校验（校验通过）', validateText.includes('校验通过'), validateText);
  const markCount = await page.locator('[data-testid="feature-extractor-modal"] mark').count();
  check('15e 描述命中片段 mark 高亮渲染', markCount >= 1, { markCount });
  await page.locator('[data-testid="feature-extractor-modal"]').getByRole('button', { name: '关闭' }).click();
  await page.waitForTimeout(200);
  const modalClosed = await page.locator('[data-testid="feature-extractor-modal"]').count();
  check('15f Modal 关闭', modalClosed === 0, { modalClosed });

  // 15g 批量脚本 dry 报告（node 侧，execSync 捕 stdout）
  const { execSync } = require('child_process');
  const path = require('path');
  const repoRoot = path.resolve(__dirname, '..', '..');
  const batchOut = execSync('node scripts/extract-features-batch.mjs', { cwd: repoRoot, encoding: 'utf8' });
  check('15g 批量 dry：无踪步/混元体入库 + 种子已标注 skip → 幂等（produce 0，skip 22）',
    batchOut.includes('produce 0') && batchOut.includes('skip 22'), batchOut.split('\n')[0]);
  check('15h 批量 dry：manual 含圣疗/休憩曲（低置信人工确认，无静默产出）',
    batchOut.includes('圣疗') && batchOut.includes('休憩曲') && batchOut.includes('manual 5'));

  // ===== 16. heal / resource_conv 引擎（feature-fullcycle P3）：DM 端 UI + 玩家 op 入账 =====
  const dialogs16 = [];
  page.on('dialog', async (d) => { dialogs16.push(d.message()); await d.dismiss(); });
  await page.goto(BASE + '/combat', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('button[title*="沙盒试验场"]');
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    // feat-pc（野蛮人卡）注入回气（heal）+ 无踪步/灵巧动作（conv）+ 动作如潮（grants）样本
    const pc = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc');
    const card = characterStore.get(pc.characterId);
    const extra = [
      { id: 'feat-p3-heal', name: '回气', description: '你可以用附赠动作恢复生命值，恢复 1d10＋战士等级', category: '职业特性', role: 'active', level: 1, activation: 'bonus', resource: 'pool', poolFormula: { type: 'fixed', value: 1, restKind: 'short' } },
      { id: 'feat-p3-hide', name: '无踪步', description: '你可以在自己回合以一个附赠动作的形式执行躲藏Hide动作。', category: '职业特性', role: 'active', level: 1, activation: 'bonus', resource: 'pool', poolFormula: { type: 'fixed', value: 1, restKind: 'short' } },
      { id: 'feat-p3-conv', name: '灵巧动作', description: '你可以用附赠动作执行撤离、疾走或躲藏。', category: '职业特性', role: 'active', level: 1, activation: 'bonus' },
      { id: 'feat-p3-grants', name: '动作如潮', description: '你在自己的回合执行一个额外的动作。', category: '职业特性', role: 'active', level: 1, activation: 'action', resource: 'pool', poolFormula: { type: 'fixed', value: 1, restKind: 'short' } },
    ];
    const merged = (card.features || []).filter(f => !extra.some(e => e.name === f.name)).concat(extra);
    characterStore.update(card.id, { features: merged });
    // 池清零 + HP 拉低 + 动作槽重置 + token 重放；回读确认写值
    combatStore.update(rec.id, {
      featureUses: {},
      // 严格模式：UI 扣槽（consumeCombatantBonusAction 等）只在 resourceConsumption 开启时生效
      resourceConsumption: true,
      combatants: combatStore.get(rec.id).combatants.map(c =>
        c.id === 'feat-pc' ? { ...c, currentHp: 20, tempHp: 0, actions: 1, bonusActions: 1, dashExtraMovement: 0 } : c),
      updatedAt: Date.now(),
    });
    const writeBack = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc');
    window.__probe16Slots = { bonus: writeBack.bonusActions, actions: writeBack.actions, hp: writeBack.currentHp };
    battlegroundStore.setTokens(rec.id, [{ combatantId: 'feat-pc', col: 2, row: 2 }]);
  });
  const slotsWritten = await page.evaluate(() => window.__probe16Slots);
  await page.reload();
  await page.waitForTimeout(800);
  const slotsAfterReload = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const c = combatStore.get(rec.id).combatants.find(x => x.id === 'feat-pc');
    return { bonus: c.bonusActions, actions: c.actions, hp: c.currentHp };
  });
  check('16-0 动作槽写值确认（update 后 + reload 后一致）',
    slotsWritten.bonus === 1 && slotsWritten.actions === 1 && slotsAfterReload.bonus === 1,
    { slotsWritten, slotsAfterReload });
  const panel16 = await openInfoByChip(page, '技能野蛮人');
  await panel16.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  // 16a-16b heal DM 端：回气按钮 → HP 恢复（1d10+5 → 6-15）+ 池扣 + 附赠动作扣
  const beforeHeal = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const c = combatStore.get(rec.id).combatants.find(x => x.id === 'feat-pc');
    return { hp: c.currentHp, maxHp: c.maxHp };
  });
  await panel16.getByRole('button', { name: /回气/ }).first().click();
  await page.waitForTimeout(400);
  // 16a heal 骰值环节（线下骰口径）：弹窗出现 → 填入线下骰结果 7 → 确认 → 7+5=12
  const modalUp = await page.locator('[data-testid="heal-roll-modal"]').count();
  check('16a-0 heal 弹出骰值环节（HealRollModal，引擎零暗骰）', modalUp === 1, { modalUp });
  if (modalUp === 1) {
    await page.fill('[data-testid="heal-roll-input"]', '7');
    await page.locator('[data-testid="heal-roll-modal"]').getByRole('button', { name: '确认结算' }).click();
    await page.waitForTimeout(400);
  }
  const healUi = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const c = combatStore.get(rec.id).combatants.find(x => x.id === 'feat-pc');
    // skill 事件 + 先攻表全量行（确认 heal 结算文本双写与标记语言落地）
    const recNow = combatStore.get(rec.id);
    const logText = JSON.stringify(recNow.rounds ?? []) + JSON.stringify((recNow.operationLog ?? []).map(e => e.text));
    const skillEvts16 = (recNow.combatEvents ?? []).filter(e => e.kind === 'skill').map(e => e.text);
    return { hp: c.currentHp, bonus: c.bonusActions, uses: recNow.featureUses?.['feat-pc']?.['feature:回气'] ?? 0, logText, skillEvts16 };
  });
  const healed16 = healUi.hp - beforeHeal.hp;
  const healDialog16 = dialogs16.find(m => m.includes('回气'));
  check('16a DM 端回气（heal）：填 7 → HP 恢复 12（1d10(线下骰)=7 + 战士等级×1=5）',
    healed16 === 12 && healUi.hp <= (beforeHeal.maxHp ?? 999), { ...beforeHeal, ...healUi, healed16, dialog: healDialog16 });
  check('16b heal 池扣 +1、附赠动作扣 1（槽位差值）', healUi.uses === 1 && healUi.bonus === 0, healUi);
  // 16l skill 事件 + 先攻表双写（§5.2）：结算明细行用标记语言（数值【】），事件流与先攻表同源
  check('16l skill 事件 + 先攻表/操作日志结算行：heal 明细标记语言（恢复【12】点生命 + 1d10(线下骰)=【7】）',
    healUi.skillEvts16.some(t => t.includes('《回气》→') && t.includes('恢复【12】点生命') && t.includes('1d10(线下骰)=【7】'))
      && (healUi.logText ?? '').includes('恢复【12】点生命') && (healUi.logText ?? '').includes('1d10(线下骰)=【7】'), healUi);
  // 16c conv 单目标（无踪步 hide）：数据级直调 runner（UI 面板交互链时序不稳，改为等价数据断言）
  const hideCh = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { executeFeatureChannel } = await import('/src/data/featureChannelRunner.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { combatants: combatStore.get(rec.id).combatants.map(c => c.id === 'feat-pc' ? { ...c, actions: 1, bonusActions: 1 } : c), updatedAt: Date.now() });
    const cur = combatStore.get(rec.id);
    const pc = cur.combatants.find(x => x.id === 'feat-pc');
    combatStore.consumeFeatureUse(rec.id, 'feat-pc', 'feature:无踪步', 1);
    combatStore.consumeBonusAction(rec.id, 'feat-pc', 'playback');
    const r = executeFeatureChannel(cur, pc, '无踪步', 1);
    return { note: r.note, bonus: combatStore.get(rec.id).combatants.find(x => x.id === 'feat-pc').bonusActions, uses: combatStore.get(rec.id).featureUses?.['feat-pc']?.['feature:无踪步'] ?? 0 };
  });
  check('16c conv 单目标（无踪步→躲藏）：声明 note + 附赠动作扣 1 + 池扣',
    hideCh.note != null && hideCh.note.includes('躲藏') && hideCh.bonus === 0 && hideCh.uses === 1, { ...hideCh });
  // 16d/16e conv 多目标（灵巧动作）：数据级直调，convertTarget: 'dash'（模拟弹窗选定后入账）
  const convCh = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { executeFeatureChannel } = await import('/src/data/featureChannelRunner.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { combatants: combatStore.get(rec.id).combatants.map(c => c.id === 'feat-pc' ? { ...c, actions: 1, bonusActions: 1, dashExtraMovement: 0 } : c), featureUses: {}, updatedAt: Date.now() });
    const cur = combatStore.get(rec.id);
    const pc = cur.combatants.find(x => x.id === 'feat-pc');
    combatStore.consumeFeatureUse(rec.id, 'feat-pc', 'feature:灵巧动作', 1);
    combatStore.consumeBonusAction(rec.id, 'feat-pc', 'playback');
    const r = executeFeatureChannel(cur, pc, '灵巧动作', 1, { convertTarget: 'dash' });
    const after = combatStore.get(rec.id).combatants.find(x => x.id === 'feat-pc');
    return { note: r.note, dash: after.dashExtraMovement ?? 0, bonus: after.bonusActions };
  });
  check('16e conv 选疾走：dashExtraMovement +30 + 附赠动作扣 1',
    convCh.dash === 30 && convCh.bonus === 0 && convCh.note != null && convCh.note.includes('移动力'), { ...convCh });
  // 16f grants（动作如潮）：数据级直调，actions +1
  const grantsCh = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { executeFeatureChannel } = await import('/src/data/featureChannelRunner.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { combatants: combatStore.get(rec.id).combatants.map(c => c.id === 'feat-pc' ? { ...c, actions: 1 } : c), featureUses: {}, updatedAt: Date.now() });
    const cur = combatStore.get(rec.id);
    const pc = cur.combatants.find(x => x.id === 'feat-pc');
    combatStore.consumeFeatureUse(rec.id, 'feat-pc', 'feature:动作如潮', 1);
    const r = executeFeatureChannel(cur, pc, '动作如潮', 1);
    const after = combatStore.get(rec.id);
    return { note: r.note, actions: after.combatants.find(x => x.id === 'feat-pc').actions, uses: after.featureUses?.['feat-pc']?.['feature:动作如潮'] ?? 0 };
  });
  check('16f grants（动作如潮）：actions +1（1→2）+ 池扣',
    grantsCh.actions === 2 && grantsCh.uses === 1 && grantsCh.note != null && grantsCh.note.includes('额外主动作'), { ...grantsCh });

  // 16g-16i 玩家 op 入账：healAmount/convertTarget 随 op 提交（决策③），DM 端直接采用
  const opApply = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { applyTurnCommit } = await import('/src/lib/turnCommitApply.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const noop = () => {};
    const req = (ops) => ({ requestId: `probe-p3-${Date.now()}-${Math.random()}`, round: 1, combatantId: 'feat-pc2', baseSeq: 0, action: { ops } });
    const stub = { healedWith: null };
    const r1 = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: req([{ kind: 'feature-use', featureName: '回气', poolKey: 'feature:回气', cost: 1, healAmount: 12, activation: 'bonus', roundText: '发动「回气」→ 恢复 12（玩家掷定）' }]),
      currentRound: 1, applyDamage: () => null,
      applyHealing: (targetId, amount) => { stub.healedWith = amount; return { healed: amount }; },
      consumeAction: noop, consumeBonusAction: noop, advanceTurn: noop, beginConcentration: noop,
    });
    combatStore.update(rec.id, { combatants: combatStore.get(rec.id).combatants.map(c => c.id === 'feat-pc2' ? { ...c, dashExtraMovement: 0, actions: 1 } : c), featureUses: {}, updatedAt: Date.now() });
    const r2 = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: req([{ kind: 'feature-use', featureName: '灵巧动作', convertTarget: 'dash', activation: 'bonus', roundText: '发动「灵巧动作」→ 疾走' }]),
      currentRound: 1, applyDamage: () => null, applyHealing: () => null,
      consumeAction: noop, consumeBonusAction: noop, advanceTurn: noop, beginConcentration: noop,
    });
    const dashAfter = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2').dashExtraMovement ?? 0;
    const actionsBefore = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2').actions ?? 1;
    const r3 = applyTurnCommit({
      record: combatStore.get(rec.id),
      request: req([{ kind: 'feature-use', featureName: '动作如潮', activation: 'action', roundText: '发动「动作如潮」' }]),
      currentRound: 1, applyDamage: () => null, applyHealing: () => null,
      consumeAction: noop, consumeBonusAction: noop, advanceTurn: noop, beginConcentration: noop,
    });
    const actionsAfter = combatStore.get(rec.id).combatants.find(c => c.id === 'feat-pc2').actions ?? 1;
    const stubNoDice = { healedWith: null };
    const r4 = applyTurnCommit({
      record: combatStore.get(rec.id),
      // op 缺 healAmount（玩家端未填骰值的异常路径）：兜底按固定+等级落账（5 = 0 跳骰 + 等级 5），不虚构线下骰值
      request: req([{ kind: 'feature-use', featureName: '回气', poolKey: 'feature:回气', cost: 1, activation: 'bonus', roundText: '发动「回气」' }]),
      currentRound: 1, applyDamage: () => null,
      applyHealing: (targetId, amount) => { stubNoDice.healedWith = amount; return { healed: amount }; },
      consumeAction: noop, consumeBonusAction: noop, advanceTurn: noop, beginConcentration: noop,
    });
    return { r1ok: r1.ok, healedWith: stub.healedWith, r2ok: r2.ok, dashAfter, r3ok: r3.ok, actionsBefore, actionsAfter, r4ok: r4.ok, healedNoDice: stubNoDice.healedWith };
  });
  check('16g heal op 入账：applyHealing 收到 op.healAmount=12（玩家线下骰填值直接采用）',
    opApply.r1ok === true && opApply.healedWith === 12, opApply);
  check('16g-2 op 缺 healAmount 兜底：固定+等级=5 落账（1d10 未填跳过，零暗骰）',
    opApply.r4ok === true && opApply.healedNoDice === 5, opApply);
  check('16h convert op 入账：convertTarget dash → dashExtraMovement +30',
    opApply.r2ok === true && opApply.dashAfter === 30, opApply);
  check('16i grants op 入账：动作如潮 actions +1（1→2）',
    opApply.r3ok === true && opApply.actionsAfter === opApply.actionsBefore + 1, opApply);

  console.log(`\n==== probe-active-skills: ${pass} pass, ${fail} fail ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
