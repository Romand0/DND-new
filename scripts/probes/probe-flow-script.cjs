// P0 探针：脚本树迁移器/编译器对拍 + fireball 黄金对照（spec: scratch-block-flow-editor）
// 依赖 dev server（默认 5174）；用法：BASE_URL=http://localhost:5174 node scripts/probes/probe-flow-script.cjs
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

async function main() {
  const fireballPath = path.resolve(__dirname, '../../data/flows/fireball.flow.json');
  const fireballJson = JSON.parse(fs.readFileSync(fireballPath, 'utf8'));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const out = await page.evaluate(async (fireballJson) => {
    const mig = await import('/src/lib/flowScriptMigrate.ts');
    const com = await import('/src/lib/flowScriptCompile.ts');
    const { FlowCompiler } = await import('/src/lib/flowCompiler.ts');
    const { validateForPublish } = await import('/src/utils/flow-editor/validation.ts');

    let edgeSeq = 0;
    const mkNode = (id, type, label, config = {}) => ({ id, type, label, config });
    const E = (from, to, trigger) => ({ id: `e${edgeSeq++}_${from}_${to}`, from, to, trigger });
    const mkFlow = (nodes, edges) => ({ id: 'probe:flow', name: 'probe', nodes, edges });

    const compiler = new FlowCompiler();
    // 确定性骰源：检定恒 4，效果骰组恒 3 —— 同一骰源喂两图，status 可对照
    const diceSource = async (req) => (req.count ? Array(req.count).fill(3) : 4);

    async function runLog(flow, state) {
      const ctx = {
        casterId: 'c1', targets: [], results: new Map(),
        stateSnapshot: state, log: [],
        combatants: { c1: { id: 'c1', name: 'dummy', hp: 30 } },
      };
      await compiler.executeFlow(flow, ctx, diceSource);
      return ctx.log.map(l => `${l.nodeId}:${l.status}`);
    }

    // 黄金对照：原图执行 vs 迁移→编译图执行，日志逐条比对
    async function golden(flow, state) {
      const logA = await runLog(flow, state);
      const m = mig.migrateGraphToScript(flow);
      if (!m.script) return { logA, m, logB: null };
      const compiled = { ...flow, ...com.compileScriptToGraph(m.script) };
      const logB = await runLog(compiled, state);
      return { logA, m, logB };
    }

    const out = {};

    // ===== S1 线性链（全 on_complete） =====
    {
      const flow = mkFlow(
        [mkNode('cast_start', 'cast_start', '施法开始'), mkNode('A', 'apply_effect', '效果A', { effectType: 'damage', value: '1d4' }), mkNode('cast_end', 'cast_end', '结束')],
        [E('cast_start', 'A', 'on_complete'), E('A', 'cast_end', 'on_complete')]
      );
      const g = await golden(flow, {});
      out.s1 = { warnings: g.m.warnings, lossless: g.m.lossless, logA: g.logA, logB: g.logB };
    }

    // ===== S2 单层 C + 汇合提升（两分支汇聚 J，J→cast_end） =====
    {
      const flow = mkFlow(
        [
          mkNode('cast_start', 'cast_start', '开始'),
          mkNode('cond', 'condition_branch', '条件', { condition: 'state.x' }),
          mkNode('A', 'apply_effect', '满足效果', { effectType: 'damage', value: '1d4' }),
          mkNode('B', 'apply_effect', '否则效果', { effectType: 'heal', value: '1d4' }),
          mkNode('J', 'apply_effect', '公共尾', { effectType: 'damage', value: '1d4' }),
          mkNode('cast_end', 'cast_end', '结束'),
        ],
        [
          E('cast_start', 'cond', 'on_complete'),
          E('cond', 'A', 'on_true'), E('A', 'J', 'on_complete'),
          E('cond', 'B', 'on_false'), E('B', 'J', 'on_complete'),
          E('J', 'cast_end', 'on_complete'),
        ]
      );
      const gTrue = await golden(flow, { x: true });
      const gFalse = await golden(flow, { x: false });
      out.s2 = {
        warnings: gTrue.m.warnings, lossless: gTrue.m.lossless,
        treeShape: gTrue.m.script?.body.map(b => b.kind + ':' + b.id + (b.kind === 'if' ? `(${b.onTrue.map(x => x.id)}|${b.onFalse.map(x => x.id)})` : '')),
        logTrue: { a: gTrue.logA, b: gTrue.logB }, logFalse: { a: gFalse.logA, b: gFalse.logB },
      };
    }

    // ===== S3 嵌套 C（C1 满足体内含 C2） =====
    {
      const flow = mkFlow(
        [
          mkNode('cast_start', 'cast_start', '开始'),
          mkNode('c1', 'condition_branch', '外层', { condition: 'state.x' }),
          mkNode('A', 'apply_effect', '外满足', { effectType: 'damage', value: '1d4' }),
          mkNode('c2', 'condition_branch', '内层', { condition: 'state.y' }),
          mkNode('A2', 'apply_effect', '内满足', { effectType: 'damage', value: '1d4' }),
          mkNode('B2', 'apply_effect', '内否则', { effectType: 'heal', value: '1d4' }),
          mkNode('B', 'apply_effect', '外否则', { effectType: 'heal', value: '1d4' }),
          mkNode('cast_end', 'cast_end', '结束'),
        ],
        [
          E('cast_start', 'c1', 'on_complete'),
          E('c1', 'A', 'on_true'), E('A', 'c2', 'on_complete'),
          E('c2', 'A2', 'on_true'), E('c2', 'B2', 'on_false'), E('A2', 'cast_end', 'on_complete'), E('B2', 'cast_end', 'on_complete'),
          E('c1', 'B', 'on_false'), E('B', 'cast_end', 'on_complete'),
        ]
      );
      const combos = [
        ['tt', { x: true, y: true }], ['tf', { x: true, y: false }], ['f', { x: false, y: true }],
      ];
      const runs = [];
      for (const [name, state] of combos) {
        const g = await golden(flow, state);
        runs.push({ name, a: g.logA, b: g.logB });
      }
      out.s3 = { warnings: runs[0].a && mig.migrateGraphToScript(flow).warnings, runs };
    }

    // ===== S4 空体（on_false 缺失 → 否则体为空） =====
    {
      const flow = mkFlow(
        [
          mkNode('cast_start', 'cast_start', '开始'),
          mkNode('cond', 'condition_branch', '条件', { condition: 'state.x' }),
          mkNode('A', 'apply_effect', '满足效果', { effectType: 'damage', value: '1d4' }),
          mkNode('cast_end', 'cast_end', '结束'),
        ],
        [E('cast_start', 'cond', 'on_complete'), E('cond', 'A', 'on_true'), E('A', 'cast_end', 'on_complete')]
      );
      const g = await golden(flow, { x: true });
      const gF = await golden(flow, { x: false });
      out.s4 = {
        warnings: g.m.warnings,
        onFalseEmpty: g.m.script?.body[0]?.onFalse?.length === 0,
        logTrue: { a: g.logA, b: g.logB }, logFalse: { a: gF.logA, b: gF.logB },
      };
    }

    // ===== S5 检定块退化（saving_throw 无分流边仅 on_complete，fireball 形态） =====
    {
      const flow = mkFlow(
        [
          mkNode('cast_start', 'cast_start', '开始'),
          mkNode('save', 'saving_throw', '豁免', { ability: 'dexterity', dc: 10 }),
          mkNode('cast_end', 'cast_end', '结束'),
        ],
        [E('cast_start', 'save', 'on_complete'), E('save', 'cast_end', 'on_complete')]
      );
      const g = await golden(flow, {});
      out.s5 = { warnings: g.m.warnings, lossless: g.m.lossless, logA: g.logA, logB: g.logB };
    }

    // ===== S6 回流边（B→cast_start） =====
    {
      const flow = mkFlow(
        [
          mkNode('cast_start', 'cast_start', '开始'),
          mkNode('A', 'apply_effect', '效果', { effectType: 'damage', value: '1d4' }),
          mkNode('cast_end', 'cast_end', '结束'),
        ],
        [E('cast_start', 'A', 'on_complete'), E('A', 'cast_end', 'on_complete'), E('A', 'cast_start', 'on_complete')]
      );
      const g = await golden(flow, {});
      out.s6 = { warnings: g.m.warnings, lossless: g.m.lossless, logA: g.logA, logB: g.logB };
    }

    // ===== S7 孤儿节点 =====
    {
      const flow = mkFlow(
        [
          mkNode('cast_start', 'cast_start', '开始'),
          mkNode('cast_end', 'cast_end', '结束'),
          mkNode('ghost', 'apply_effect', '孤儿', { effectType: 'damage', value: '1d4' }),
        ],
        [E('cast_start', 'cast_end', 'on_complete')]
      );
      const m = mig.migrateGraphToScript(flow);
      out.s7 = { warnings: m.warnings, lossless: m.lossless };
    }

    // ===== S8 on_partial 出边丢弃 =====
    {
      const flow = mkFlow(
        [
          mkNode('cast_start', 'cast_start', '开始'),
          mkNode('cond', 'condition_branch', '条件', { condition: 'state.x' }),
          mkNode('A', 'apply_effect', '满足效果', { effectType: 'damage', value: '1d4' }),
          mkNode('B', 'apply_effect', '否则效果', { effectType: 'heal', value: '1d4' }),
          mkNode('P', 'apply_effect', '半伤效果', { effectType: 'damage', value: '1d4' }),
          mkNode('cast_end', 'cast_end', '结束'),
        ],
        [
          E('cast_start', 'cond', 'on_complete'),
          E('cond', 'A', 'on_true'), E('A', 'cast_end', 'on_complete'),
          E('cond', 'B', 'on_false'), E('B', 'cast_end', 'on_complete'),
          E('cond', 'P', 'on_partial'),
        ]
      );
      const g = await golden(flow, { x: true });
      out.s8 = { warnings: g.m.warnings, lossless: g.m.lossless, logA: g.logA, logB: g.logB };
    }

    // ===== S9 不对称汇合（两分支链终止于不同已展开节点） =====
    {
      const flow = mkFlow(
        [
          mkNode('cast_start', 'cast_start', '开始'),
          mkNode('X', 'apply_effect', '主链X', { effectType: 'damage', value: '1d4' }),
          mkNode('Y', 'apply_effect', '主链Y', { effectType: 'heal', value: '1d4' }),
          mkNode('cond', 'condition_branch', '条件', { condition: 'state.x' }),
          mkNode('A', 'apply_effect', '满足效果', { effectType: 'damage', value: '1d4' }),
          mkNode('B', 'apply_effect', '否则效果', { effectType: 'heal', value: '1d4' }),
          mkNode('cast_end', 'cast_end', '结束'),
        ],
        [
          E('cast_start', 'X', 'on_complete'), E('X', 'Y', 'on_complete'), E('Y', 'cond', 'on_complete'),
          E('cond', 'A', 'on_true'), E('A', 'X', 'on_complete'),
          E('cond', 'B', 'on_false'), E('B', 'Y', 'on_complete'),
        ]
      );
      const gT = await golden(flow, { x: true });
      const gF = await golden(flow, { x: false });
      out.s9 = {
        warnings: gT.m.warnings, lossless: gT.m.lossless,
        logTrue: { a: gT.logA, b: gT.logB }, logFalse: { a: gF.logA, b: gF.logB },
      };
    }

    // ===== S10 fireball 种子黄金对照 =====
    {
      const g = await golden(fireballJson, {});
      out.s10 = { warnings: g.m.warnings, lossless: g.m.lossless, logA: g.logA, logB: g.logB };
    }

    // ===== T4 校验分流 =====
    {
      const scriptFlow = {
        id: 'probe:script', name: 'script', nodes: [], edges: [],
        script: {
          hat: { kind: 'hat', id: 'cast_start', label: '开始' },
          body: [{
            kind: 'if', nodeType: 'condition_branch', id: 'cond', label: '条件', condition: 'state.x',
            onTrue: [], onFalse: [], config: { condition: 'state.x' },
          }],
        },
      };
      const okScript = validateForPublish(scriptFlow);
      const badScriptFlow = JSON.parse(JSON.stringify(scriptFlow));
      badScriptFlow.script.body[0].config = {};   // 条件缺失
      badScriptFlow.script.body[0].condition = '';
      const badScript = validateForPublish(badScriptFlow);
      // 旧图流程（无 script）仍走旧校验：空流程报「流程为空」
      const oldGraphFlow = mkFlow([], []);
      const oldGraph = validateForPublish(oldGraphFlow);
      out.t4 = {
        scriptValid: okScript.valid,
        scriptErrorCaptured: !badScript.valid && (badScript.details?.length ?? 0) > 0,
        oldGraphStillChecked: !oldGraph.valid,
      };
    }

    return out;
  }, fireballJson);

  await browser.close();

  // ===== 断言 =====
  const logsEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  check('S1 线性链无损', out.s1.lossless === true && out.s1.warnings.length === 0, out.s1);
  check('S1 线性链黄金对照', logsEq(out.s1.logA, out.s1.logB), out.s1);

  check('S2 汇合提升为父序列', Array.isArray(out.s2.treeShape) && out.s2.treeShape.some(s => s.startsWith('if:cond')), out.s2.treeShape);
  check('S2 无损', out.s2.lossless === true, out.s2.warnings);
  check('S2 true 黄金对照', logsEq(out.s2.logTrue.a, out.s2.logTrue.b), out.s2.logTrue);
  check('S2 false 黄金对照', logsEq(out.s2.logFalse.a, out.s2.logFalse.b), out.s2.logFalse);

  check('S3 嵌套 C 三态黄金对照', out.s3.runs.every(r => logsEq(r.a, r.b)), out.s3.runs);
  check('S3 无损', migCheck(out.s3), out.s3);

  check('S4 否则体为空', out.s4.onFalseEmpty === true, out.s4);
  check('S4 true 黄金对照', logsEq(out.s4.logTrue.a, out.s4.logTrue.b), out.s4.logTrue);
  check('S4 false 黄金对照', logsEq(out.s4.logFalse.a, out.s4.logFalse.b), out.s4.logFalse);

  check('S5 检定退化无损', out.s5.lossless === true && out.s5.warnings.length === 0, out.s5);
  check('S5 黄金对照', logsEq(out.s5.logA, out.s5.logB), out.s5);

  check('S6 回流告警 back_edge', out.s6.warnings.some(w => w.kind === 'back_edge'), out.s6.warnings);
  check('S6 黄金对照（回流丢弃等价）', logsEq(out.s6.logA, out.s6.logB), out.s6);

  check('S7 孤儿告警 orphan', out.s7.warnings.some(w => w.kind === 'orphan'), out.s7.warnings);

  check('S8 on_partial 告警丢弃', out.s8.warnings.some(w => w.kind === 'dropped_edge' && (w.message || '').includes('on_partial')), out.s8.warnings);
  check('S8 黄金对照', logsEq(out.s8.logA, out.s8.logB), out.s8);

  check('S9 不对称汇合告警', out.s9.warnings.some(w => w.kind === 'asymmetric_join'), out.s9.warnings);
  check('S9 true 黄金对照', logsEq(out.s9.logTrue.a, out.s9.logTrue.b), out.s9.logTrue);
  check('S9 false 黄金对照', logsEq(out.s9.logFalse.a, out.s9.logFalse.b), out.s9.logFalse);

  check('S10 fireball 无损迁移', out.s10.lossless === true && out.s10.warnings.length === 0, out.s10.warnings);
  check('S10 fireball 黄金对照', logsEq(out.s10.logA, out.s10.logB), out.s10);

  check('T4 脚本校验放行合法树', out.t4.scriptValid === true, out.t4);
  check('T4 脚本校验捕获配置缺失', out.t4.scriptErrorCaptured === true, out.t4);
  check('T4 旧图流程仍走旧校验', out.t4.oldGraphStillChecked === true, out.t4);

  function migCheck(s3) {
    const w = s3.warnings || [];
    return w.filter(x => x.kind === 'asymmetric_join' || x.kind === 'dropped_edge').length === 0;
  }

  console.log(`\nTOTAL: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('PROBE ERROR:', e); process.exit(1); });
