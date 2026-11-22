// E2E probe: P1 积木编辑器冒烟（specs/scratch-block-flow-editor design §6）
// 覆盖：帽子播种/palette禁用/堆叠添加/C体嵌套/插槽锚点/拖拽移动/删除/迁移门控（静默+告警）
// 环境备注：容器内存压力下 chromium 渲染进程偶发被杀，故每个场景组用独立浏览器实例。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; if (!QUIET) console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra)); }
}

const USER = { id: 'e2e', username: 'e2e-dm', role: 'dm', isAdmin: true };

/** 开浏览器 + 登录态 mock，返回 { page, gotoEditor, close }；浏览器启动即死时自动重开（宿主内存气球压力） */
async function openScenario(seedFlows) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await openScenarioOnce(seedFlows);
    } catch (e) {
      if (attempt >= 2) throw e;
      console.log(`(browser died at launch, retrying: ${e.message.split('\n')[0]})`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

async function openScenarioOnce(seedFlows) {
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  const ctx = await browser.newContext();
  await ctx.addInitScript((u) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, USER);
  // 流程种子在 addInitScript 里写入（先于应用脚本）：页面内事后播种会被 fetchRemote 的镜像回写竞态清掉
  if (seedFlows && seedFlows.length > 0) {
    await ctx.addInitScript((list) => {
      localStorage.setItem('dnd-flows', JSON.stringify(list));
    }, seedFlows);
  }
  await ctx.route('**/api/auth/me', r => r.fulfill({ json: { user: USER } }));
  let page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  // 页面死亡时换新页重试一次（新页继承 context 级 auth）
  const gotoEditor = async (url) => {
    for (let i = 0; i < 2; i++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(600);
        return true;
      } catch (e) {
        if (i === 1) throw e;
        if (page.isClosed()) { page = await ctx.newPage(); page.on('pageerror', ev => console.error('PAGE ERROR:', ev.message)); }
        await page.waitForTimeout(500);
      }
    }
    return false;
  };
  return { browser, ctx, getPage: () => page, gotoEditor, close: () => browser.close() };
}

// ===== S1-S6 编辑器交互（同一会话内连续操作） =====
async function runEditorInteractions() {
  const s = await openScenario();
  const { gotoEditor, getPage: page } = s;
  try {
    // S1 新建流程：帽子直接播种，无迁移面板
    await gotoEditor(BASE + '/flow-editor/new');
    await page().waitForTimeout(600);
    const hatVisible = await page().locator('[data-node-id="cast_start"]').isVisible().catch(() => false);
    check('S1 帽子自动播种', hatVisible);
    const panelAbsent = !(await page().getByText('转换为积木模式').isVisible().catch(() => false));
    check('S1 无迁移面板', panelAbsent);
    const paletteVisible = await page().locator('.node-card').first().isVisible().catch(() => false);
    check('S1 调色板可见', paletteVisible);

    // S2 帽子类型在调色板中禁用
    const hatBtnDisabled = await page().locator('button.node-card', { hasText: '施法开始' }).isDisabled().catch(() => false);
    check('S2 施法开始条目禁用', hatBtnDisabled);

    // S3 堆叠添加
    await page().locator('button.node-card', { hasText: '目标指定' }).click();
    await page().waitForTimeout(200);
    let blockCount = await page().locator('[data-node-id]').count();
    check('S3 添加目标指定后块数=2', blockCount === 2, { blockCount });
    const endEnabled = await page().locator('button.node-card', { hasText: '施法结束' }).isEnabled().catch(() => false);
    check('S3 施法结束可用', endEnabled);

    // S4 条件分支 C 形 + 槽内插入
    await page().locator('button.node-card', { hasText: '条件分支' }).click();
    await page().waitForTimeout(200);
    const hasTrue = await page().getByText('满足').first().isVisible().catch(() => false);
    const hasFalse = await page().getByText('否则').first().isVisible().catch(() => false);
    check('S4 C 形双体标签', hasTrue && hasFalse);
    blockCount = await page().locator('[data-node-id]').count();
    check('S4 添加条件分支后块数=3', blockCount === 3, { blockCount });

    // 点击 C 体真分支插槽 → 设插入锚点 → 调色板添加落入体内
    const trueSlot = page().locator('[data-slot-key$="onTrue|0"]').first();
    const slotVisible = await trueSlot.isVisible().catch(() => false);
    check('S4 真分支插槽存在', slotVisible);
    await trueSlot.click();
    await page().waitForTimeout(200);
    const hint = await page().locator('p', { hasText: '将插入到' }).first().textContent().catch(() => '');
    check('S4 插入提示更新', !!hint && hint.includes('将插入到'), { hint });
    await page().locator('button.node-card', { hasText: '目标指定' }).click();
    await page().waitForTimeout(200);
    const nestedSlot1 = await page().locator('[data-slot-key$="onTrue|1"]').first().isVisible().catch(() => false);
    check('S4 块落入 C 体（槽位索引推移）', nestedSlot1);
    blockCount = await page().locator('[data-node-id]').count();
    check('S4 嵌套后块数=4', blockCount === 4, { blockCount });

    // S5 拖拽移动：顶层顺序 [目标指定, 条件分支]，把目标指定拖到末尾槽 ||2
    const grip = page().locator('[data-node-id] span[title="拖动移动块（含子块）"]').first();
    const gb = await grip.boundingBox();
    const tb = await page().locator('[data-slot-key="||2"]').first().boundingBox().catch(() => null);
    check('S5 拖柄与末尾槽可见', !!gb && !!tb, { gb: !!gb, tb: !!tb });
    if (gb && tb) {
      await page().mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
      await page().mouse.down();
      await page().mouse.move(gb.x + gb.width / 2 + 10, gb.y + gb.height / 2 + 10, { steps: 3 });
      await page().waitForTimeout(150);
      const ghostActive = await page().evaluate(() => !!document.querySelector('.fixed.pointer-events-none'));
      check('S5 拖拽幽灵层激活', ghostActive);
      // 拖拽激活后插槽拉高（h-2.5 → h-5）布局下移，需重取槽位坐标
      const tb2 = await page().locator('[data-slot-key="||2"]').first().boundingBox();
      if (!tb2) throw new Error('drag-activated slot ||2 not found');
      await page().mouse.move(tb2.x + tb2.width / 2, tb2.y + tb2.height / 2, { steps: 10 });
      await page().waitForTimeout(120);
      await page().mouse.up();
      await page().waitForTimeout(300);
      const labels = await page().evaluate(() => [...document.querySelectorAll('[data-node-id]')].map(el => el.getAttribute('data-node-id')));
      // DOM 序 [帽子, 条件分支, 顶层目标指定...]；拖拽把首个顶层块移到末尾 → labels[1] 变 C 形，末位是 select_target
      check('S5 拖拽改变顶层顺序', labels.length === 4 && labels[1].startsWith('condition_branch') && labels[3].startsWith('select_target'), { labels });
      const slotKeys = await page().evaluate(() => [...document.querySelectorAll('[data-slot-key]')].map(el => el.getAttribute('data-slot-key')));
      check('S5 拖后顶层槽位规范', slotKeys.filter(k => k === '||0' || k === '||1' || k === '||2').length === 3, { slotKeys });
    }

    // S6 删除：DOM 序 [帽子, 条件分支, 内嵌目标指定, 顶层目标指定]
    await page().locator('[data-node-id]').nth(3).hover();
    await page().waitForTimeout(150);
    await page().locator('[data-node-id]').nth(3).locator('button[title*="删除"]').click();
    await page().waitForTimeout(200);
    blockCount = await page().locator('[data-node-id]').count();
    check('S6 删除叶子块后块数=3', blockCount === 3, { blockCount });
    // 删除 C 形（DOM 第 2 块，含 1 子块）
    await page().locator('[data-node-id]').nth(1).hover();
    await page().waitForTimeout(150);
    await page().locator('[data-node-id]').nth(1).locator('button[title*="删除"]').click();
    await page().waitForTimeout(200);
    blockCount = await page().locator('[data-node-id]').count();
    check('S6 删除 C 形连带子块', blockCount === 1, { blockCount });
  } finally {
    s.close();
  }
}

// ===== S7 fireball 无损迁移：静默直接进入 =====
async function runFireballSilent() {
  const s = await openScenario();
  const { gotoEditor, getPage: page } = s;
  try {
    const fireball = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/flows/fireball.flow.json'), 'utf8'));
    const s2 = await openScenario([fireball]);
    const { gotoEditor, getPage: page } = s2;
    try {
      // fireball 正式 id 为 spell:fireball（合格 ID 格式），路径需编码冒号
      await gotoEditor(BASE + '/flow-editor/spell%3Afireball');
      await page().waitForTimeout(600);
      const fbHat = await page().locator('[data-node-id="cast_start"]').isVisible().catch(() => false);
      const fbPanel = await page().getByText('转换为积木模式').isVisible().catch(() => false);
      check('S7 fireball 直接进入（无面板）', fbHat && !fbPanel, { fbHat, fbPanel });
    // fireball 种子 5 节点：帽子 + 4 个步骤块
    const fbBlocks = await page().locator('[data-node-id]').count();
    check('S7 fireball 块数=5', fbBlocks === 5, { fbBlocks });
    } finally {
      s2.close();
    }
  } finally {
    s.close();
  }
}

// ===== S8 有损迁移：告警面板 + 一次性确认 =====
async function runMigrationGate() {
  // 构造 dropped_edge 图（镜像 P0 S8）：条件分支带第三条 on_partial 出边
  const warnFlow = {
    id: 'mig-warn', name: '迁移告警样例', category: 'custom', description: '',
    tags: [], version: 1, status: 'draft',
    createdAt: Date.now(), updatedAt: Date.now(), publishedAt: 0, publishedVersion: 0,
    spellId: null,
    nodes: [
      { id: 'cast_start', type: 'cast_start', label: '施法开始', config: {}, notes: null },
      { id: 'cond', type: 'condition_branch', label: '条件', config: { condition: 'state.x' }, notes: null },
      { id: 'A', type: 'apply_effect', label: '满足效果', config: { effectType: 'damage', value: '1d4' }, notes: null },
      { id: 'B', type: 'apply_effect', label: '否则效果', config: { effectType: 'heal', value: '1d4' }, notes: null },
      { id: 'P', type: 'apply_effect', label: '半伤效果', config: { effectType: 'damage', value: '1d4' }, notes: null },
      { id: 'cast_end', type: 'cast_end', label: '施法结束', config: {}, notes: null },
    ],
    edges: [
      { id: 'e0', from: 'cast_start', to: 'cond', trigger: 'on_complete', label: null, config: {} },
      { id: 'e1', from: 'cond', to: 'A', trigger: 'on_true', label: null, config: {} },
      { id: 'e2', from: 'A', to: 'cast_end', trigger: 'on_complete', label: null, config: {} },
      { id: 'e3', from: 'cond', to: 'B', trigger: 'on_false', label: null, config: {} },
      { id: 'e4', from: 'B', to: 'cast_end', trigger: 'on_complete', label: null, config: {} },
      { id: 'e5', from: 'cond', to: 'P', trigger: 'on_partial', label: null, config: {} },
    ],
  };
  const s = await openScenario([warnFlow]);
  const { gotoEditor, getPage: page } = s;
  try {
    await gotoEditor(BASE + '/flow-editor/mig-warn');
    await page().waitForTimeout(600);
    const warnPanel = await page().getByText('迁移存在行为损失').isVisible().catch(() => false);
    check('S8 告警面板出现', warnPanel);
    const confirmBtn = page().getByText('仍要进入积木编辑');
    check('S8 确认按钮存在', await confirmBtn.isVisible().catch(() => false));
    await confirmBtn.click();
    await page().waitForTimeout(300);
    const afterHat = await page().locator('[data-node-id="cast_start"]').isVisible().catch(() => false);
    const afterBlocks = await page().locator('[data-node-id]').count();
    check('S8 确认后进入积木编辑', afterHat && afterBlocks >= 3, { afterHat, afterBlocks });
  } finally {
    s.close();
  }
}

async function main() {
  // 场景级重试：浏览器死亡（宿主内存压力）时整个场景重跑
  for (const [name, fn] of [
    ['S1-S6', runEditorInteractions],
    ['S7', runFireballSilent],
    ['S8', runMigrationGate],
  ]) {
    let done = false;
    for (let i = 0; i < 3 && !done; i++) {
      const [p0, f0] = [pass, fail];
      try { await fn(); done = true; }
      catch (e) {
        pass = p0; fail = f0;
        console.log(`(${name} 第${i + 1}次浏览器死亡，重试: ${e.message.split('\n')[0]})`);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    if (!done) { fail++; console.log(`FAIL ${name} 场景三连崩`); }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
