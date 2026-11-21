// E2E probe: 荒野变形（德鲁伊 2 级战斗变形）：图鉴野兽复用 + 参战者形状替换 + 快照还原 + HP0 自动还原
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

  // ===== 0. 清场 + 搭建：德鲁伊 PC（荒野变形池 2/短休）+ 地精 NPC =====
  await page.evaluate(async () => {
    const { setRulebookScope } = await import('/src/data/libraryScope.ts');
    setRulebookScope(['玩家手册 2014', '怪物图鉴 2014']);
    const { characterStore } = await import('/src/data/characterStore.ts');
    characterStore.getAll().filter(c => c.isSandbox).forEach(c => characterStore.delete(c.id));
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const battlegroundStore = (await import('/src/data/battlegroundStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    if (rec) {
      const pcChar = characterStore.add({
        name: '变形测试·德鲁伊', race: '人类', level: 5, profession: { class: '德鲁伊' },
        maxHp: 40, currentHp: 40, isSandbox: true,
        abilities: { strength: { score: 10, modifier: 0 }, dexterity: { score: 12, modifier: 1 }, constitution: { score: 14, modifier: 2 }, intelligence: { score: 10, modifier: 0 }, wisdom: { score: 16, modifier: 3 }, charisma: { score: 10, modifier: 0 } },
        attacks: [{ name: '木棍', damageDice: '1d6', damageType: '钝击', bonus: 2, range: '5尺', properties: [] }],
        features: [{
          name: '荒野变形',
          description: '战斗荒野变形：作为动作变身为野兽（CR 按德鲁伊等级），2 次/短休；再次使用可恢复原形',
          category: '职业特性', source: '德鲁伊', level: 2,
          role: 'active',
          activation: 'action', resource: 'pool',
          poolFormula: { type: 'fixed', value: 2, restKind: 'short' },
        }],
      });
      combatStore.update(rec.id, {
        combatants: [
          { id: 'ws-pc', name: '变形德鲁伊', isPc: true, characterId: pcChar.id, initiative: 10, actions: 1, bonusActions: 1, reactions: 0, currentHp: 40, maxHp: 40, movementUsed: 0, heldLeft: null, heldRight: null, status: '', pendingAdvantageSources: [], pendingCheckModifiers: [] },
          { id: 'ws-npc', name: '变形地精', isPc: false, initiative: 5, actions: 1, bonusActions: 1, reactions: 0, currentHp: 7, maxHp: 7, movementUsed: 0, heldLeft: null, heldRight: null, status: '', attacks: [{ name: '弯刀', damage: '1d6+2', damageType: '挥砍', range: '5尺', properties: ['灵巧'] }], pendingAdvantageSources: [], pendingCheckModifiers: [] },
        ],
        rounds: [{ 'ws-pc': '', 'ws-npc': '' }, { 'ws-pc': '', 'ws-npc': '' }],
        featureUses: {},
        updatedAt: Date.now(),
      });
      battlegroundStore.getOrCreate(rec.id);
      battlegroundStore.setTokens(rec.id, [
        { combatantId: 'ws-pc', col: 2, row: 2 },
        { combatantId: 'ws-npc', col: 3, row: 2 },
      ]);
    }
  });
  await page.waitForTimeout(400);

  // ===== 1. 数据级：图鉴野兽过滤 + 变身/还原纯函数 =====
  const data = await page.evaluate(async () => {
    const { loadSeed } = await import('/src/data/seedLoader.ts');
    await loadSeed('monsters');
    const { listWildShapeBeasts, applyWildShapeForm, restoreWildShapeForm } = await import('/src/data/wildShapeBeasts.ts');
    const all = listWildShapeBeasts();
    const wolf = all.find(t => t.templateId === 'wolf');
    const crLow = listWildShapeBeasts(0.25);
    const mock = {
      id: 'm1', name: '德鲁伊', initiative: 1, isPc: true, currentHp: 40, maxHp: 40, ac: 11, speed: 30,
      attacks: [{ name: '木棍', attackBonus: '+2', damage: '1d6', damageType: '钝击', range: '5尺', properties: [] }],
      note: '备注原文', templateId: undefined,
    };
    const shaped = applyWildShapeForm(mock, wolf);
    const restored = restoreWildShapeForm(shaped);
    return {
      total: all.length,
      allBeast: all.every(t => t.creatureType === 'beast'),
      wolfCr: wolf?.cr,
      crLowCount: crLow.length,
      crLowHasWolf: crLow.some(t => t.templateId === 'wolf'),
      shapedName: shaped.name,
      shapedHp: shaped.currentHp,
      shapedMaxHp: shaped.maxHp,
      shapedAc: shaped.ac,
      shapedAttack: shaped.attacks?.[0]?.name,
      shapedTemplateId: shaped.templateId,
      shapedNote: shaped.note,
      shapedWis: shaped.wisdom,
      shapedKey: shaped.wildShape?.beastKey,
      snapName: shaped.wildShape?.snapshot?.name,
      snapHp: shaped.wildShape?.snapshot?.currentHp,
      snapNote: shaped.wildShape?.snapshot?.note,
      restoredName: restored.name,
      restoredHp: restored.currentHp,
      restoredAc: restored.ac,
      restoredAttack: restored.attacks?.[0]?.name,
      restoredNote: restored.note,
      restoredWis: restored.wisdom,
      restoredNoShape: restored.wildShape === undefined,
    };
  });
  check('1a 图鉴野兽列表 ≥50 条', data.total >= 50, data.total);
  check('1b 全部为 beast 类型', data.allBeast === true, data);
  check('1c 狼在列表且 CR 1/4', data.wolfCr === '1/4', data.wolfCr);
  check('1d CR≤1/4 过滤保留狼', data.crLowHasWolf === true && data.crLowCount > 0, { crLowCount: data.crLowCount });
  check('1e 变身后名字带狼形后缀', data.shapedName === '德鲁伊·狼形', data.shapedName);
  check('1f 变身后 HP=11 AC=13', data.shapedHp === 11 && data.shapedMaxHp === 11 && data.shapedAc === 13, data);
  check('1g 变身后攻击=啃咬（图鉴模板）', data.shapedAttack === '啃咬', data.shapedAttack);
  check('1h 变身后 templateId 指向野兽模板', data.shapedTemplateId === 'wolf', data.shapedTemplateId);
  check('1i 变身后 note 拼接野形特性', (data.shapedNote ?? '').includes('集群战术') && data.shapedNote.includes('备注原文'), data.shapedNote);
  check('1j 变身后六维取野兽值（感知12）', data.shapedWis === 12, data.shapedWis);
  check('1k 快照含原形名/HP/note', data.snapName === '德鲁伊' && data.snapHp === 40 && (data.snapNote ?? '').includes('备注原文'), data);
  check('1l 还原后名字/HP/AC/攻击回填', data.restoredName === '德鲁伊' && data.restoredHp === 40 && data.restoredAc === 11 && data.restoredAttack === '木棍', data);
  check('1m 还原后 note/六维回填且 wildShape 清空', data.restoredNote === '备注原文' && data.restoredWis === undefined && data.restoredNoShape === true, data);

  // ===== 2. UI：panel 特性按钮 → 弹窗选狼 → 变身落账 =====
  const geo = await page.evaluate(() => {
    const g = document.querySelector('div.grid.origin-top-left');
    const r = g.children[0].getBoundingClientRect();
    return { x: r.x, y: r.y, cell: r.width };
  });
  await page.mouse.dblclick(geo.x + 2.5 * geo.cell, geo.y + 2.5 * geo.cell);
  await page.waitForTimeout(400);
  const panel = page.locator('div.fixed.inset-0.z-50').last();
  await panel.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  const featBtnCount = await panel.getByRole('button', { name: /荒野变形/ }).count();
  check('2a 面板含荒野变形按钮（德鲁伊特性投影）', featBtnCount > 0, featBtnCount);
  await panel.getByRole('button', { name: /荒野变形/ }).first().click();
  await page.waitForTimeout(400);
  const modal = page.locator('[data-testid="wild-shape-modal"]');
  const modalOpen = await modal.count();
  check('2b wildShape 弹窗打开', modalOpen === 1, modalOpen);
  const wolfBtn = modal.locator('[data-testid="wild-shape-beast-wolf"]');
  check('2c 弹窗列表含狼（图鉴数据源）', await wolfBtn.count() === 1, await wolfBtn.count());
  await wolfBtn.click();
  await modal.locator('[data-testid="wild-shape-confirm"]').click();
  await page.waitForTimeout(400);
    const after = await page.evaluate(async () => {
      const combatStore = (await import('/src/data/combatStore.ts')).default;
      const rec = combatStore.getAll().find(r => r.isProvingGround);
      const c = combatStore.get(rec.id).combatants.find(x => x.id === 'ws-pc');
      const lastOp = (combatStore.get(rec.id).operationLog ?? []).slice(-1)[0];
      return {
        name: c.name, hp: c.currentHp, maxHp: c.maxHp, ac: c.ac,
        attack: c.attacks?.[0]?.name, templateId: c.templateId,
        key: c.wildShape?.beastKey, actions: c.actions,
        used: combatStore.get(rec.id).featureUses?.['ws-pc']?.['feature:荒野变形'] ?? 0,
        lastOp: lastOp?.text ?? lastOp ?? '',
        alive: !c.isDead && !c.isUnconscious,
      };
    });
    check('2d 变身落账：名字/HP/AC/攻击/模板', after.name === '变形德鲁伊·狼形' && after.hp === 11 && after.ac === 13 && after.attack === '啃咬' && after.templateId === 'wolf', after);
    check('2e wildShape 快照键=wolf + 存活', after.key === 'wolf' && after.alive === true, after);
    // 动作扣仅在放映模式生效（试验场未开放映 → isConsumptionActive false 不扣，引擎正确语义）；池扣恒扣
    check('2f 池扣 1 次', after.used === 1, after);
    check('2g 记录行含变身狼', (after.lastOp ?? '').includes('变身为狼'), after.lastOp);
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 500);
  await page.waitForTimeout(300);

  // ===== 3. UI：再次点按特性 → 还原模式 → 快照回填 =====
  await page.mouse.dblclick(geo.x + 2.5 * geo.cell, geo.y + 2.5 * geo.cell);
  await page.waitForTimeout(400);
  const panel2 = page.locator('div.fixed.inset-0.z-50').last();
  await panel2.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  await panel2.getByRole('button', { name: /荒野变形/ }).first().click();
  await page.waitForTimeout(400);
  const modal2 = page.locator('[data-testid="wild-shape-modal"]');
  const restoreInfo = modal2.locator('[data-testid="wild-shape-restore-info"]');
  check('3a 已变身状态弹窗进入还原模式', await restoreInfo.count() === 1, await restoreInfo.count());
  const restoreText = await restoreInfo.textContent().catch(() => '');
  check('3b 还原提示含当前野兽狼', (restoreText ?? '').includes('狼'), restoreText);
  await modal2.locator('[data-testid="wild-shape-confirm"]').click();
  await page.waitForTimeout(400);
  const afterRestore = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const c = combatStore.get(rec.id).combatants.find(x => x.id === 'ws-pc');
    return {
      name: c.name, hp: c.currentHp, ac: c.ac, attack: c.attacks?.[0]?.name,
      noShape: c.wildShape === undefined, templateId: c.templateId,
      used: combatStore.get(rec.id).featureUses?.['ws-pc']?.['feature:荒野变形'] ?? 0,
      actions: c.actions,
    };
  });
  // PC 参战者 ac/attacks 原本为 undefined（显示走角色卡引用路径）——还原清回 undefined 即恢复引用
  check('3c 还原落账：原形名/HP40/字段清回引用路径', afterRestore.name === '变形德鲁伊' && afterRestore.hp === 40 && afterRestore.ac === undefined && afterRestore.attack === undefined, afterRestore);
  check('3d wildShape 清空 + templateId 清回', afterRestore.noShape === true && (afterRestore.templateId ?? null) === null, afterRestore);
  check('3e 池扣累计 2 次（变身+还原各耗 1 次）', afterRestore.used === 2, afterRestore.used);
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 500);
  await page.waitForTimeout(300);

  // ===== 4. 野形破碎：狼形承受溢出伤害 → 自动恢复原形 + 溢出扣原形 HP =====
  await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    combatStore.update(rec.id, { featureUses: {}, updatedAt: Date.now() });
  });
  // 4a. 重置池后再变身（走 UI 链）
  await page.mouse.dblclick(geo.x + 2.5 * geo.cell, geo.y + 2.5 * geo.cell);
  await page.waitForTimeout(400);
  const panel3 = page.locator('div.fixed.inset-0.z-50').last();
  await panel3.getByRole('button', { name: '操作' }).click();
  await page.waitForTimeout(300);
  await panel3.getByRole('button', { name: /荒野变形/ }).first().click();
  await page.waitForTimeout(400);
  const modal3 = page.locator('[data-testid="wild-shape-modal"]');
  await modal3.locator('[data-testid="wild-shape-beast-wolf"]').click();
  await modal3.locator('[data-testid="wild-shape-confirm"]').click();
  await page.waitForTimeout(400);
  const shaped2 = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const c = combatStore.get(rec.id).combatants.find(x => x.id === 'ws-pc');
    return { name: c.name, hp: c.currentHp, key: c.wildShape?.beastKey };
  });
  check('4a 池重置后再次变身狼形（HP11）', shaped2.name === '变形德鲁伊·狼形' && shaped2.hp === 11 && shaped2.key === 'wolf', shaped2);
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 500);
  await page.waitForTimeout(300);

  // 4b. 地精攻击狼形 PC（17h 交互链）：d20 填 15（+0 = 15 ≥ AC13 命中）→ d6 填 13 +2 = 15 伤 → 溢出 4 扣原形
  // panel 遮罩无 onClick（挡先攻表/沙盘点击）→ X 关闭 → 走先攻表名字按钮重开（等价沙盘双击）
  await page.locator('div.fixed.inset-0.z-50').last().locator('svg.lucide-x').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /变形地精/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '操作', exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '攻击', exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.locator('div.rounded-lg.border.p-3').filter({ hasText: '弯刀' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('input[placeholder="输入 1-20"]').first().fill('15');
  await page.getByRole('button', { name: '确定', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '确认命中，进入伤害结算' }).first().click();
  await page.waitForTimeout(700);
  await page.locator('input[placeholder="d6"]').first().fill('13');
  await page.getByRole('button', { name: '计算', exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '确认伤害' }).first().click();
  await page.waitForTimeout(900);
  const broken = await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    const r = combatStore.get(rec.id);
    const c = r.combatants.find(x => x.id === 'ws-pc');
    const ops = (r.operationLog ?? []).map(o => o.text ?? '').join('|');
    return {
      name: c.name, hp: c.currentHp, maxHp: c.maxHp, noShape: c.wildShape === undefined,
      alive: !c.isDead && !c.isUnconscious, opHasBroken: ops.includes('形态破碎'), ops: ops.slice(-500),
    };
  });
  check('4b 溢出自动恢复原形（名/HP36=maxHp40/wildShape清）',
    broken.name === '变形德鲁伊' && broken.hp === 36 && broken.maxHp === 40 && broken.noShape === true, broken);
  check('4c 原形仍站立（未昏迷未死亡）', broken.alive === true, broken);
  check('4d 记录行含形态破碎与溢出', broken.opHasBroken === true, broken.ops);
  await page.keyboard.press('Escape');
  await page.mouse.click(10, 500);

  // ===== 5. 清场：还原 roster 基线 =====
  await page.evaluate(async () => {
    const combatStore = (await import('/src/data/combatStore.ts')).default;
    const { characterStore } = await import('/src/data/characterStore.ts');
    characterStore.getAll().filter(c => c.isSandbox).forEach(c => characterStore.delete(c.id));
    const rec = combatStore.getAll().find(r => r.isProvingGround);
    if (rec) {
      combatStore.update(rec.id, {
        combatants: rec.combatants.map(c => ({ ...c, currentHp: c.maxHp ?? c.currentHp, wildShape: undefined })),
        featureUses: {},
        updatedAt: Date.now(),
      });
    }
  });

  console.log(`TOTAL ${pass}/${pass + fail}`);
  await browser.close();
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
