// E2E probe: 主动技能引擎 P2（池漏斗 / C 类 status+advantage 通道 / D 类反应种子 / 投影 / 回合包 feature-use / 结算并入 + 休息恢复）
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

  console.log(`\n==== probe-active-skills: ${pass} pass, ${fail} fail ====`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('PROBE CRASH:', e); process.exit(1); });
