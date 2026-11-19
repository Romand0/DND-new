import type { FlowDefinition, FlowEdgeDef, FlowNodeDef } from '@/types/flow';
import { BLOCK_SHAPE_REGISTRY } from '@/types/flowScript';
import type { CBlockTriggerPair, FlowScript, MigrationResult, MigrationWarning, ScriptBlock, ScriptIf, ScriptStep } from '@/types/flowScript';

// ======================
// 图 → 脚本树迁移器
// ======================
//
// 把 nodes/edges 自由图转换为嵌套积木树。正确性判据：树的展开执行序
// ≡ 原图 executeFlow 的 DFS(visited) 执行序（flowCompiler 每节点至多执行一次）。
//
// 核心机制：C 形块展开前先只读探测（probe）两条分支链，求首个公共节点
// 作为汇合点（join）；真展开（expand）时链碰到 join 即停止，使公共尾自然
// 提升为 C 块之后的父序列块。缺此机制时汇合点会被首条分支吸进体内，
// 另一条分支的汇合路径在树中丢失，行为不等价。
//
// 退化规则（design.md）：
// - 回流边（目标在当前 DFS 路径上）：丢弃，行为等价（visited 本就跳过）
// - 孤儿节点/多入口子图：丢弃，行为等价（不可达，不参与执行）
// - 检定/条件块无分流边仅 on_complete：按堆叠块处理（fireball 真实数据即此形态）
// - on_partial 出边 / 歧义多条匹配边 / 堆叠块非 on_complete 续链：告警丢弃或降级，可能损失行为
// - 不对称汇合（双分支链无公共节点）：贪心延续存在侧，lossless=false

interface MigrateCtx {
  nodeById: Map<string, FlowNodeDef>;
  outEdges: Map<string, FlowEdgeDef[]>;
  warnings: MigrationWarning[];
  /** 全局已展开节点（对齐 executeFlow 的 visited：每节点至多展开一次） */
  visited: Set<string>;
  /** 当前 DFS 展开路径：回流判定依据 */
  chainPath: Set<string>;
}

interface ChainResult {
  blocks: ScriptBlock[];
  /** 链终止时碰到的外部节点（汇合点候选或回流目标）；自然终止为 null */
  join: string | null;
}

interface ProbeResult {
  /** 探测沿途节点（保序，不含 join 终点） */
  nodes: string[];
  /** 探测终止节点：已展开节点 / stopAt / 回流目标 / null */
  join: string | null;
}

function warn(ctx: MigrateCtx, warning: MigrationWarning): void {
  ctx.warnings.push(warning);
}

/** 判定节点能否按 C 形展开：形状注册为 'c' 且存在至少一条分流出边 */
function resolveCShape(node: FlowNodeDef, outEdges: FlowEdgeDef[]): CBlockTriggerPair | null {
  const meta = BLOCK_SHAPE_REGISTRY[node.type];
  if (!meta || meta.shape !== 'c' || !meta.cPair) return null;
  const hasTrue = outEdges.some(e => e.trigger === meta.cPair!.trueTrigger);
  const hasFalse = outEdges.some(e => e.trigger === meta.cPair!.falseTrigger);
  return hasTrue || hasFalse ? meta.cPair : null;
}

/** 续链出边选择：on_complete 优先（多条取首条），降级取首条其他匹配边 */
function pickNextEdge(node: FlowNodeDef, outEdges: FlowEdgeDef[], ctx: MigrateCtx): string | null {
  const completes = outEdges.filter(e => e.trigger === 'on_complete');
  const next = completes[0] ?? outEdges[0];
  for (const e of completes.slice(1)) {
    if (ctx.chainPath.has(e.to) || (ctx.visited.has(e.to) && e.to !== next?.to)) {
      // 回流/汇合到已展开节点：原运行时 visited 跳过，行为等价
      warn(ctx, { kind: 'back_edge', nodeId: node.id, message: `${node.label} 的续链边回流到 ${e.to}，已丢弃（原运行时该边不生效）` });
    } else {
      warn(ctx, { kind: 'dropped_edge', nodeId: node.id, message: `${node.label} 存在多条 on_complete 出边（→ ${e.to}），已保留首条` });
    }
  }
  if (!next) return null;
  if (completes.length === 0 && outEdges.length > 0) {
    warn(ctx, { kind: 'dropped_edge', nodeId: node.id, message: `${node.label}（${node.type}）的续链出边为 ${next.trigger} → ${next.to}，树模型按无条件顺序执行，行为可能变化` });
  }
  return next.to;
}

/** 只读探测：沿链走一遍（镜像 expandChain 结构），求分支可达节点集与终止点。不改任何 ctx 状态 */
function probeChain(startId: string | undefined, ctx: MigrateCtx, stopAt: string | null, probed: Set<string>): ProbeResult {
  if (!startId) return { nodes: [], join: null };
  const nodes: string[] = [];
  let cur: string | null = startId;

  while (cur) {
    if (cur === stopAt) return { nodes, join: cur };
    if (ctx.chainPath.has(cur) || ctx.visited.has(cur) || probed.has(cur)) return { nodes, join: cur };
    const node = ctx.nodeById.get(cur);
    if (!node) return { nodes, join: null };
    nodes.push(cur);
    probed.add(cur);

    const outEdges = ctx.outEdges.get(cur) ?? [];
    const cPair = resolveCShape(node, outEdges);
    if (cPair) {
      const t = probeChain(outEdges.find(e => e.trigger === cPair.trueTrigger)?.to, ctx, stopAt, probed);
      const f = probeChain(outEdges.find(e => e.trigger === cPair.falseTrigger)?.to, ctx, stopAt, probed);
      // 嵌套 C 的可达集 = 本体 + 两侧分支可达的并；终止点沿用与 expand 相同的提升规则
      nodes.push(...t.nodes, ...f.nodes);
      let join: string | null;
      if (t.join && f.join && t.join !== f.join) {
        join = t.join;
      } else {
        join = t.join ?? f.join ?? null;
      }
      if (!join) return { nodes, join: null };
      cur = join;
      continue;
    }

    cur = pickNextEdge(node, outEdges, ctx);
  }

  return { nodes, join: null };
}

/** 分支体递归：与主链同一展开实现 */
function collectBranch(startId: string | undefined, ctx: MigrateCtx, stopAt: string | null): ChainResult {
  if (!startId) return { blocks: [], join: null };
  return expandChain(startId, ctx, stopAt);
}

/** 分支 join 解读：chainPath 上的节点是回流（告警丢弃）；其余是汇合点候选 */
function resolveJoin(join: string | null, ctx: MigrateCtx, cNode: FlowNodeDef, branchLabel: string): string | null {
  if (!join) return null;
  if (ctx.chainPath.has(join)) {
    warn(ctx, { kind: 'back_edge', nodeId: cNode.id, message: `${cNode.label} 的${branchLabel}分支回流到路径上的节点 ${join}，已丢弃（原运行时该边不生效）` });
    return null;
  }
  return join;
}

/**
 * 从 startId 沿出边展开一条链。
 * stopAt：C 形汇合点，链碰到即停止（不展开，交由父序列继续）。
 * 终止情形：到达 stopAt / 无出边（join=null）/ 目标已在 visited/chainPath（join=该节点）。
 */
function expandChain(startId: string, ctx: MigrateCtx, stopAt: string | null): ChainResult {
  const blocks: ScriptBlock[] = [];
  let cur: string | null = startId;

  while (cur) {
    if (cur === stopAt) return { blocks, join: cur };
    // 目标已展开过：回流（在当前路径上）或汇合（兄弟分支已展开），停止本链
    if (ctx.chainPath.has(cur) || ctx.visited.has(cur)) {
      return { blocks, join: cur };
    }
    const node = ctx.nodeById.get(cur);
    if (!node) {
      // 悬空引用（边指向不存在的节点）：理论上被图校验拦截，防御式终止
      warn(ctx, { kind: 'dropped_edge', nodeId: cur, message: `边引用了不存在的节点 ${cur}，链在此终止` });
      return { blocks, join: null };
    }
    ctx.visited.add(cur);
    ctx.chainPath.add(cur);

    const outEdges = ctx.outEdges.get(cur) ?? [];
    const cPair = resolveCShape(node, outEdges);
    let branchJoin: string | null = null;

    if (cPair) {
      const trueEdge = outEdges.find(e => e.trigger === cPair.trueTrigger);
      const falseEdge = outEdges.find(e => e.trigger === cPair.falseTrigger);
      // C 形块混入的其他出边（on_complete/on_partial/on 另一组）告警丢弃
      for (const e of outEdges) {
        if (e !== trueEdge && e !== falseEdge) {
          warn(ctx, { kind: 'dropped_edge', nodeId: node.id, message: `${node.label}（${node.type}）的分流出边 ${e.trigger} → ${e.to} 无法映射为分支体，已丢弃` });
        }
      }

      // 探测两分支求汇合点：首个公共可达节点，或双方显式终止于同一已展开/stopAt 节点
      const probeTrue = probeChain(trueEdge?.to, ctx, stopAt, new Set());
      const probeFalse = probeChain(falseEdge?.to, ctx, stopAt, new Set());
      let join: string | null = null;
      for (const n of probeTrue.nodes) {
        if (probeFalse.nodes.includes(n)) { join = n; break; }
      }
      if (!join && probeTrue.join && probeTrue.join === probeFalse.join) {
        join = probeTrue.join;
      }

      // 分支递归（chainPath 此时含 C 块自身：体回流到 C 块会被 resolveJoin 拦截）
      const t = collectBranch(trueEdge?.to, ctx, join);
      const f = collectBranch(falseEdge?.to, ctx, join);

      // join 解读：在当前 DFS 路径上 → 回流丢弃；否则 → 汇合点候选
      const tj = resolveJoin(t.join, ctx, node, '满足');
      const fj = resolveJoin(f.join, ctx, node, '否则');

      const cBlock: ScriptIf = {
        kind: 'if',
        nodeType: node.type,
        id: node.id,
        label: node.label,
        condition: node.config?.condition,
        onTrue: t.blocks,
        onFalse: f.blocks,
        config: node.config,
        notes: node.notes,
      };
      blocks.push(cBlock);

      // 汇合点提升：两侧候选一致取之；仅一侧存在贪心延续（不对称 → 行为可能变化）；
      // 双侧 null → C 块即本链末尾
      if (tj && fj && tj !== fj) {
        warn(ctx, { kind: 'asymmetric_join', nodeId: node.id, message: `${node.label} 的两条分支链终止于不同节点（${tj} / ${fj}），无法提升公共尾，已按满足侧贪心延续` });
        branchJoin = tj;
      } else {
        branchJoin = tj ?? fj ?? null;
      }
    } else {
      // 堆叠块
      const step: ScriptStep = {
        kind: 'step',
        nodeType: node.type,
        id: node.id,
        label: node.label,
        config: node.config,
        notes: node.notes,
      };
      blocks.push(step);
      branchJoin = pickNextEdge(node, outEdges, ctx);
    }

    // 统一回溯当前节点，chainPath 只保留真正的 DFS 祖先路径
    ctx.chainPath.delete(node.id);

    cur = branchJoin;
  }

  return { blocks, join: null };
}

/**
 * 图 → 脚本树迁移主入口。
 * lossless=false 表示存在行为可能变化的损失项（asymmetric_join / dropped_edge），
 * 编辑器展示告警面板要求用户确认。
 */
export function migrateGraphToScript(flow: Pick<FlowDefinition, 'nodes' | 'edges'>): MigrationResult {
  const warnings: MigrationWarning[] = [];
  const nodeById = new Map((flow.nodes ?? []).map(n => [n.id, n]));
  const outEdges = new Map<string, FlowEdgeDef[]>();
  for (const edge of flow.edges ?? []) {
    const list = outEdges.get(edge.from) ?? [];
    list.push(edge);
    outEdges.set(edge.from, list);
  }

  const castStart = (flow.nodes ?? []).find(n => n.type === 'cast_start');
  if (!castStart) {
    return {
      script: null,
      warnings: [{ kind: 'no_cast_start', message: '流程缺少施法开始节点，无法迁移为脚本树' }],
      lossless: false,
    };
  }

  const ctx: MigrateCtx = { nodeById, outEdges, warnings, visited: new Set(), chainPath: new Set() };
  ctx.visited.add(castStart.id);
  ctx.chainPath.add(castStart.id);

  // cast_start 是 hat 块本体（不进 body）：主链从其续链节点开始展开。
  // chainPath 保留 cast_start，分支/主链回流到入口仍能被 back_edge 检查拦截。
  const firstNext = pickNextEdge(castStart, outEdges.get(castStart.id) ?? [], ctx);
  const { blocks, join } = firstNext ? expandChain(firstNext, ctx, null) : { blocks: [] as ScriptBlock[], join: null };

  // 根层 join：回流到根链上的节点（兄弟汇合在根层不可能出现）
  if (join && ctx.chainPath.has(join)) {
    warn(ctx, { kind: 'back_edge', nodeId: join, message: `主链回流到节点 ${join}，已丢弃（原运行时该边不生效）` });
  }

  // 孤儿节点 / 多入口子图：不可达，丢弃行为等价
  for (const node of nodeById.values()) {
    if (!ctx.visited.has(node.id)) {
      warn(ctx, { kind: 'orphan', nodeId: node.id, message: `节点「${node.label}」（${node.type}）从入口不可达，已丢弃` });
    }
  }

  const lossless = !warnings.some(w => w.kind === 'asymmetric_join' || w.kind === 'dropped_edge');

  return {
    script: { hat: { kind: 'hat', id: castStart.id, label: castStart.label, config: castStart.config, notes: castStart.notes }, body: blocks },
    warnings,
    lossless,
  };
}
