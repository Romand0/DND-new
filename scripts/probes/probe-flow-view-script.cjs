// E2E probe: P2 上下游 —— FlowView 脚本树只读渲染 + flowStore.import 编译桥
// 覆盖：积木 tab/块数统计/只读无编辑件；无 script 回退图视图；import script-only JSON 自动编译+布局+过门禁
// 环境备注：容器内存压力下 chromium 渲染进程偶发被杀，每个场景组用独立浏览器实例。
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; if (!QUIET) console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, extra === undefined ? '' : JSON.stringify(extra)); }
}

const USER = { id: 'e2e', username: 'e2e-dm', role: 'dm', isAdmin: true };

// 块数 = 1 hat + select_target + save_dex + damage_fire + cast_end = 5
const SCRIPT_FLOW = {
  id: 'custom:probe-view',
  name: '探针-积木视图',
  description: 'P2 FlowView 只读渲染种子',
  category: 'custom',
  status: 'published',
  publishedVersion: 1,
  updatedAt: Date.now(),
  script: {
    hat: { kind: 'hat', id: 'cast_start', label: '施法开始', config: { autoChecks: { components: true, range: true, time: true } } },
    body: [
      { kind: 'step', nodeType: 'select_target', id: 'select_target', label: '选择目标', config: { mode: 'single', maxCount: 1 } },
      {
        kind: 'if', nodeType: 'saving_throw', id: 'save_dex', label: '敏捷豁免',
        config: { ability: 'dexterity', dc: '15' },
        onTrue: [{ kind: 'step', nodeType: 'apply_effect', id: 'damage_fire', label: '火焰伤害', config: { effectType: 'damage', value: '8d6', damageType: 'fire' } }],
        onFalse: [],
      },
      { kind: 'step', nodeType: 'cast_end', id: 'cast_end', label: '施法结束' },
    ],
  },
};

const GRAPH_FLOW = {
  id: 'custom:probe-legacy',
  name: '探针-旧图流程',
  description: 'P2 FlowView 图回退种子',
  category: 'custom',
  status: 'published',
  publishedVersion: 1,
  updatedAt: Date.now(),
  nodes: [
    { id: 'cast_start', type: 'cast_start', label: '施法开始', position: { x: 100, y: 100 }, config: { autoChecks: { components: true, range: true, time: true } } },
    { id: 'select_target', type: 'select_target', label: '选择目标', position: { x: 100, y: 250 }, config: { mode: 'single', maxCount: 1 } },
    { id: 'cast_end', type: 'cast_end', label: '施法结束', position: { x: 100, y: 400 }, config: {} },
  ],
  edges: [
    { id: 'e1', from: 'cast_start', to: 'select_target', trigger: 'on_complete' },
    { id: 'e2', from: 'select_target', to: 'cast_end', trigger: 'on_complete' },
  ],
};

async function openScenarioOnce(seedFlows, routeHandler) {
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] });
  const ctx = await browser.newContext();
  await ctx.addInitScript((u) => {
    localStorage.setItem('auth_token', 'e2e-fake-token');
    localStorage.setItem('auth_user', JSON.stringify(u));
  }, USER);
  if (seedFlows && seedFlows.length > 0) {
    // 种子先于应用脚本写入：页面内事后播种会被 fetchRemote 镜像回写竞态清掉
    await ctx.addInitScript((list) => {
      localStorage.setItem('dnd-flows', JSON.stringify(list));
    }, seedFlows);
  }
  if (routeHandler) await ctx.route('**/api/flows/**', routeHandler);
  await ctx.route('**/api/auth/me', r => r.fulfill({ json: { user: USER } }));
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  return { browser, ctx, page, close: () => browser.close() };
}

async function openScenario(seedFlows, routeHandler) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await openScenarioOnce(seedFlows, routeHandler);
    } catch (e) {
      if (attempt >= 2) throw e;
      console.log(`(browser died at launch, retrying: ${e.message.split('\n')[0]})`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

// ===== A. 积木只读渲染 =====
async function runBrickView() {
  const s = await openScenario([SCRIPT_FLOW]);
  const { page, close } = s;
  try {
    await page.goto(`${BASE}/flow-editor/custom%3Aprobe-view/view`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // 等 flow 数据渲染完成（dev 冷启动首个 transform 可能拖慢首帧）
    await page.waitForSelector('[data-node-id]', { timeout: 10000 });

    const tabBrick = await page.getByText('积木图').first().isVisible().catch(() => false);
    check('A1 积木 tab 标签', tabBrick);
    const stat = await page.getByText('5 积木块').first().isVisible().catch(() => false);
    check('A2 头部块数统计=5', stat);
    const legacyStat = await page.getByText(/节点 · .*连线/).first().isVisible().catch(() => false);
    check('A2 无旧图统计文案', !legacyStat);

    const blocks = await page.locator('[data-node-id]').count();
    check('A3 块卡片数=5（含帽子）', blocks === 5, { blocks });
    const slots = await page.locator('[data-slot-key]').count();
    check('A3 插槽渲染', slots > 0, { slots });
    const cLabelTrue = await page.getByText('通过', { exact: true }).first().isVisible().catch(() => false);
    const cLabelFalse = await page.getByText('未通过', { exact: true }).first().isVisible().catch(() => false);
    check('A4 C 形插槽标签', cLabelTrue && cLabelFalse);

    const delButtons = await page.locator('[data-node-id] button').count();
    check('A5 只读无删除钮', delButtons === 0, { delButtons });
    const palette = await page.locator('.node-card').count();
    check('A5 只读无调色板', palette === 0, { palette });
  } finally { close(); }
}

// ===== B. 无 script 回退图视图 =====
async function runGraphFallback() {
  const s = await openScenario([GRAPH_FLOW]);
  const { page, close } = s;
  try {
    await page.goto(`${BASE}/flow-editor/custom%3Aprobe-legacy/view`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('[data-node-id]', { timeout: 10000 });

    const tabGraph = await page.getByText('结构图').first().isVisible().catch(() => false);
    check('B1 结构图 tab 回退', tabGraph);
    const stat = await page.getByText('3 节点 · 2 连线').first().isVisible().catch(() => false);
    check('B1 节点连线统计', stat);
    const tabBrick = await page.getByText('积木图').first().isVisible().catch(() => false);
    check('B2 无积木 tab 文案', !tabBrick);
  } finally { close(); }
}

// ===== C. import 编译桥（script-only JSON 直入发布管线） =====
async function runImportBridge() {
  // 拦截 PUT /api/flows/*：无后端环境下放行 publish，聚焦编译桥本身
  const putHandler = (route) => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({ json: { publishedVersion: 2, publishedAt: 1700000000 } });
    }
    return route.continue();
  };
  const s = await openScenario([], putHandler);
  const { page, close } = s;
  try {
    // /login 是公开路由：应用脚本可用（vite 模块可 import），且不触发流程列表的远程拉取
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(500);

    const scriptOnly = { ...SCRIPT_FLOW, id: 'custom:probe-import', name: '探针-编译桥' };
    const out = await page.evaluate(async (json) => {
      const store = (await import('/src/data/flowStore.ts')).default;
      try {
        const res = await store.import(json);
        if (!res) return { ok: false, reason: 'import returned undefined' };
        return {
          ok: true,
          nodeCount: res.nodes.length,
          edgeCount: res.edges.length,
          allPositioned: res.nodes.every(n => n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number'),
          failEdgeTo: res.edges.find(e => e.from === 'save_dex' && e.trigger === 'on_failure')?.to ?? null,
          successEdgeTo: res.edges.find(e => e.from === 'save_dex' && e.trigger === 'on_success')?.to ?? null,
          hatEdge: res.edges.find(e => e.from === 'cast_start')?.trigger ?? null,
          status: res.status,
        };
      } catch (e) {
        return { ok: false, reason: String((e && e.message) || e) };
      }
    }, JSON.stringify(scriptOnly));

    check('C1 import 成功', out.ok === true, out);
    check('C2 编译节点数=5', out.nodeCount === 5, out);
    check('C3 编译边数=5', out.edgeCount === 5, out);
    check('C4 全节点有布局坐标', out.allPositioned === true, out);
    check('C5 满足体边 on_success→damage_fire', out.successEdgeTo === 'damage_fire', out);
    check('C6 空否则体边 on_failure→汇合点 cast_end', out.failEdgeTo === 'cast_end', out);
    check('C7 帽子起链 on_complete', out.hatEdge === 'on_complete', out);
    check('C8 发布状态落账', out.status === 'published', out);

    // 反例：缺 description 仍被门禁拦截（编译桥先补图、校验后拦截，错误信息不漂移）
    const bad = await page.evaluate(async (json) => {
      const store = (await import('/src/data/flowStore.ts')).default;
      try {
        const res = await store.import(json);
        return { rejected: !!res, reason: res ? 'unexpectedly imported' : 'undefined' };
      } catch (e) {
        return { rejected: true, reason: String((e && e.message) || e) };
      }
    }, JSON.stringify({ ...scriptOnly, description: '' }));
    check('C9 缺 description 被拒', bad.rejected === true, bad);
  } finally { close(); }
}

(async () => {
  await runBrickView();
  await runGraphFallback();
  await runImportBridge();
  console.log(QUIET ? '' : '---');
  console.log(`TOTAL: ${pass + fail} | PASS: ${pass} | FAIL: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE FATAL:', e); process.exit(2); });
