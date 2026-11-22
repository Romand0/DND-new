// P6-2 战技 rider 豁免探针：5 条战技选项构建 + 豁免失败挂状态/位移 + 池扣 + 行记录
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
  await page.click('button[title*="沙盒试验场"]');
  await page.waitForTimeout(800);

  // setup：战斗大师战士卡（力 2 敏 2 → DC 8+2+2=12）+ 目标棋子 (4,2)，攻击者 (1,2)
  await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    for (const c of characterStore.getAll().filter(c => c.name.startsWith('P6探针'))) {
      characterStore.delete(c.id);
    }
    characterStore.add({
      name: 'P6探针·战斗大师', level: 5, proficiencyBonus: 3,
      profession: { class: '战士', subclass: 'battle_master' },
      abilities: { strength: { score: 14, modifier: 2 }, dexterity: { score: 14, modifier: 2 } },
      features: [],
    });
    const card = characterStore.getAll().find(c => c.name === 'P6探针·战斗大师');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, {
      resourceConsumption: true,
      featureUses: {},
      combatants: [
        { id: 'p62-atk', name: '战技攻击者', isPc: true, characterId: card.id, initiative: 10, actions: 1, bonusActions: 1, currentHp: 20, maxHp: 20, movementUsed: 0, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
        { id: 'p62-tgt', name: '战技目标', isPc: false, initiative: 5, actions: 1, bonusActions: 1, currentHp: 20, maxHp: 20, movementUsed: 0, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
      ],
      rounds: [{ 'p62-atk': '', 'p62-tgt': '' }, { 'p62-atk': '', 'p62-tgt': '' }],
      updatedAt: Date.now(),
    });
    battlegroundStore.getOrCreate(rec.id);
    battlegroundStore.setTokens(rec.id, [
      { combatantId: 'p62-atk', col: 1, row: 2 },
      { combatantId: 'p62-tgt', col: 4, row: 2 },
    ]);
  });
  await page.reload();
  await page.waitForTimeout(1200);

  const wire = await page.evaluate(async () => {
    const { characterStore } = await import('/src/data/characterStore.ts');
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const { getAttackRiders, applyAttackRiders } = await import('/src/data/attackRiders.ts');
    const { globalStatusManager } = await import('/src/data/statusManager.ts');
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const atk = combatStore.get(rec.id).combatants.find(c => c.id === 'p62-atk');
    const tgt = combatStore.get(rec.id).combatants.find(c => c.id === 'p62-tgt');

    // A 组：选项构建（进战合并已把战技写上卡）
    const riders = getAttackRiders(combatStore.get(rec.id), atk);
    const names = riders.map(r => r.featureName).sort();
    const trip = riders.find(r => r.featureName === '摔绊攻击');
    const pushOpt = riders.find(r => r.featureName === '推撞攻击');
    const poolView = combatStore.getFeaturePoolView(rec.id, 'p62-atk');
    const pool = (poolView ?? []).find(p => p.name === '卓越战技');

    // B 组：各战技豁免失败落地（每次重置池账 + 目标状态，防相互污染）
    const statesOf = (id) => globalStatusManager.getActiveStatuses(id, 'combat').map(s => s.definitionId);
    async function runOne(name, saveResult) {
      combatStore.update(rec.id, { featureUses: {} });
      globalStatusManager.getActiveStatuses('p62-tgt').forEach(i => globalStatusManager.declareEnd(i.instanceId));
      combatStore.get(rec.id).turnTodos?.forEach(t => combatStore.removeTurnTodo(rec.id, t.id));
      const lines = applyAttackRiders(combatStore.get(rec.id), atk, tgt, [{ featureName: name, saveResult }], 0, { targetAlive: true });
      const states = statesOf(tgt.id);
      const todos = combatStore.get(rec.id).turnTodos ?? [];
      const after = combatStore.get(rec.id).featureUses?.['p62-atk']?.[`feature:${name === '摔绊攻击' || name === '恐吓攻击' || name === '挑衅攻击' || name === '推撞攻击' || name === '缴械攻击' ? '卓越战技' : name}`] ?? 0;
      const tok = battlegroundStore.get(rec.id)?.tokens.find(t => t.combatantId === 'p62-tgt');
      return { lines, states, todos: todos.map(t => t.name), poolDelta: after, tgtCol: tok?.col, tgtRow: tok?.row };
    }
    const tripFail = await runOne('摔绊攻击', 'fail');
    globalStatusManager.declareAllEnd ? globalStatusManager.declareAllEnd() : null;
    const scareFail = await runOne('恐吓攻击', 'fail');
    const goadFail = await runOne('挑衅攻击', 'fail');
    const disarmFail = await runOne('缴械攻击', 'fail');
    const pushFail = await runOne('推撞攻击', 'fail');
    battlegroundStore.setTokens(rec.id, [
        { combatantId: 'p62-atk', col: 1, row: 2 },
        { combatantId: 'p62-tgt', col: 4, row: 2 },
      ]);
    const pushOk = await runOne('推撞攻击', 'success');
    const tripOk = await runOne('摔绊攻击', 'success');
    return {
      names, tripDc: trip?.save?.dc, pushDc: pushOpt?.save?.dc,
      tripDamage: trip?.damage?.dice, tripFailLabel: trip?.save?.failLabel,
      poolMax: pool?.max, poolAvail: pool?.available,
      tripFail, scareFail, goadFail, disarmFail, pushFail, pushOk, tripOk,
    };
  });

  check('B1 getAttackRiders 出 5 条战技选项', ['缴械攻击', '恐吓攻击', '摔绊攻击', '推撞攻击', '挑衅攻击'].every(n => wire.names.includes(n)), wire.names);
  check('B2 战技 DC = 13（8+熟练3+力敏高2）', wire.tripDc === 13 && wire.pushDc === 13, { tripDc: wire.tripDc, pushDc: wire.pushDc });
  check('B3 战技骰 = 1d8 + 失败提示「倒地」', wire.tripDamage === '1d8' && wire.tripFailLabel === '倒地', { d: wire.tripDamage, l: wire.tripFailLabel });
  check('B4 卓越骰池视图 max 4', wire.poolMax === 4 && wire.poolAvail === 4, wire.poolMax);
  check('B5 摔绊 fail → 倒地状态 + TurnTodo + 池扣 1', wire.tripFail.states.includes('prone') && wire.tripFail.todos.some(t => t.includes('倒地')) && wire.tripFail.poolDelta === 1, wire.tripFail);
  check('B6 恐吓 fail → 恐惧状态', wire.scareFail.states.includes('frightened'), wire.scareFail);
  check('B7 挑衅 fail → 挑衅状态', wire.goadFail.states.includes('goaded'), wire.goadFail);
  check('B8 缴械 fail → 缴械状态 + 行文本', wire.disarmFail.states.includes('disarmed') && wire.disarmFail.lines.join('').includes('缴械'), wire.disarmFail);
  check('B9 推撞 fail → 目标推 2 格 (4,2)→(6,2) + 不挂状态', wire.pushFail.tgtCol === 6 && wire.pushFail.tgtRow === 2 && !wire.pushFail.states.some(s => s !== ''), wire.pushFail);
  check('B10 推撞成功 → 目标不动', wire.pushOk.tgtCol === 4 && wire.pushOk.tgtRow === 2, wire.pushOk);
  check('B11 摔绊成功 → 无状态挂载', !wire.tripOk.states.includes('prone'), wire.tripOk);

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  if (failures.length) console.log('FAILED: ' + failures.join(' | '));
  await browser.close();
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
