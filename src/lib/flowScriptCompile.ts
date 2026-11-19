import type { FlowDefinition, FlowEdgeDef, FlowNodeDef } from '@/types/flow';
import { BLOCK_SHAPE_REGISTRY } from '@/types/flowScript';
import type { FlowScript, ScriptBlock } from '@/types/flowScript';

// ======================
// 脚本树 → 图编译器
// ======================
//
// 发布时把编辑器唯一读写格式（脚本树）编译为 nodes/edges 图，供云端 D1 与
// flowCompiler.executeFlow 消费（编译桥接，运行时零改动）。
//
// 编译不变量：
// - 块 id 沿用为节点 id（执行日志 nodeId 可对照）
// - 序列推进边一律 on_complete；C 形双体边用 BLOCK_SHAPE_REGISTRY 的 trigger 对
// - 汇合点 = C 块在父序列中的下一个块，逐级上溯至根序列；根尾无后续 → 空/终结
//   路径无出边（原图无匹配出边 = 执行自然结束，行为一致）
// - 产物自保证：引用完整、无自环、无重复边、无孤立节点（hat 起链全覆盖）

interface CompileCtx {
  nodes: FlowNodeDef[];
  edges: FlowEdgeDef[];
  edgeSeq: number;
}

function pushNode(ctx: CompileCtx, id: string, nodeType: string, label: string, config: Record<string, any> | undefined, notes: string | undefined): void {
  ctx.nodes.push({
    id,
    type: nodeType as FlowNodeDef['type'],
    label: label || nodeType,
    config: config ? { ...config } : undefined,
    notes,
  });
}

function addEdge(ctx: CompileCtx, from: string, to: string, trigger: FlowEdgeDef['trigger']): void {
  if (from === to) return; // 防御式：树模型不可能产生自环
  const id = `edge_${ctx.edgeSeq++}_${from}_${to}`;
  ctx.edges.push({ id, from, to, trigger });
}

/**
 * 编译一个序列（根 body 或 C 形分支体）。
 * tail：控制流走完本序列后的去处 id（null = 悬空，出口交由调用方）。
 * 返回 entryId（首块 id，供上游连边）与 exits（尾处理后的出口，tail 存在时即 [tail]）。
 */
function compileSequence(blocks: ScriptBlock[], tail: string | null, ctx: CompileCtx): { entryId: string | null; exits: string[] } {
  if (blocks.length === 0) {
    return { entryId: null, exits: tail ? [tail] : [] };
  }

  let entryId: string | null = null;
  let prevExits: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    // C 形汇合点 = 本序列中 C 块的下一个块；末块则上溯到 tail（递归天然实现逐级上溯）
    const join = i + 1 < blocks.length ? blocks[i + 1].id : tail;

    pushNode(ctx, b.id, b.nodeType, b.label, b.config, b.notes);
    if (entryId === null) entryId = b.id;
    for (const e of prevExits) {
      if (e !== b.id) addEdge(ctx, e, b.id, 'on_complete');
    }

    if (b.kind === 'if') {
      const tBody = compileSequence(b.onTrue, join, ctx);
      const fBody = compileSequence(b.onFalse, join, ctx);
      const pair = BLOCK_SHAPE_REGISTRY[b.nodeType]?.cPair;
      if (pair) {
        // 空体直连汇合点：对应原图「该结果路径继续走后续」
        if (tBody.entryId) addEdge(ctx, b.id, tBody.entryId, pair.trueTrigger);
        else if (join) addEdge(ctx, b.id, join, pair.trueTrigger);
        if (fBody.entryId) addEdge(ctx, b.id, fBody.entryId, pair.falseTrigger);
        else if (join) addEdge(ctx, b.id, join, pair.falseTrigger);
      }
      // C 块出口：join 存在时控制流必经 join（空体直连 / 体尾由递归连边）；
      // join 为 null 时出口是两侧体的悬空尾
      prevExits = join ? [join] : [...tBody.exits, ...fBody.exits];
    } else {
      prevExits = [b.id];
    }
  }

  // 尾处理：序列走完连边到 tail
  if (tail) {
    for (const e of prevExits) {
      if (e !== tail) addEdge(ctx, e, tail, 'on_complete');
    }
    prevExits = [tail];
  }

  return { entryId, exits: prevExits };
}

/**
 * 脚本树 → 图编译主入口。产出的图在相同 FlowExecutionContext 下与树展开执行序一致。
 * condition_branch 的条件表达式：ScriptIf.condition 为准，config.condition 缺失时回填（迁移器双写前的防御）。
 */
export function compileScriptToGraph(script: FlowScript): Pick<FlowDefinition, 'nodes' | 'edges'> {
  const ctx: CompileCtx = { nodes: [], edges: [], edgeSeq: 0 };

  // 条件归一：确保 condition_branch 的 config.condition 与顶层 condition 一致
  const normalize = (blocks: ScriptBlock[]): void => {
    for (const b of blocks) {
      if (b.kind === 'if') {
        if (b.nodeType === 'condition_branch' && b.condition && (b.config?.condition === undefined)) {
          b.config = { ...(b.config ?? {}), condition: b.condition };
        }
        normalize(b.onTrue);
        normalize(b.onFalse);
      }
    }
  };
  normalize(script.body);

  const body = compileSequence(script.body, null, ctx);

  pushNode(ctx, script.hat.id, 'cast_start', script.hat.label, script.hat.config, script.hat.notes);
  if (body.entryId) addEdge(ctx, script.hat.id, body.entryId, 'on_complete');

  return { nodes: ctx.nodes, edges: ctx.edges };
}
