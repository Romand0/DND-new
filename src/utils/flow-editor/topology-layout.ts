// 流程查看模式的拓扑派生布局
// 与 ensureNodePositions 的本质区别：纯函数，不读取也不写回 flow 的 position。
// 坐标完全由图结构（rank 分层）派生，仅用于只读渲染。

import type { FlowDefinition, FlowNodeDef, FlowEdgeDef } from '@/types/flow';
import { NODE_W, NODE_H } from './constants';

/** 带派生坐标的节点（position 必定存在） */
export interface TopologyNode extends FlowNodeDef {
  position: { x: number; y: number };
}

export interface TopologyLayout {
  /** 已按拓扑层级派生坐标的节点副本 */
  nodes: TopologyNode[];
  edges: FlowEdgeDef[];
  /** 派生画布尺寸 */
  width: number;
  height: number;
  /** 每层的节点 ID 列表（rank 从小到大） */
  ranks: string[][];
}

export interface TopologyLayoutOptions {
  /** 层间竖直间距 */
  rankGap?: number;
  /** 同层节点水平间距 */
  nodeGap?: number;
  /** 画布内边距 */
  padding?: number;
}

/**
 * 计算节点的拓扑层级（rank）：入口节点为第 0 层，按最长路径递推。
 * - 忽略自环与悬空边
 * - 有环时未解析的节点降级到 maxRank + 1
 * - 完全孤立的节点（无任何边）统一放到最后一层
 * 返回值只读，不修改入参。
 */
export function computeRanks(flow: FlowDefinition): string[][] {
  const nodeIds = flow.nodes.map(n => n.id);
  const idSet = new Set(nodeIds);

  // 只保留两端都存在且非自环的边
  const edges = flow.edges.filter(
    e => idSet.has(e.from) && idSet.has(e.to) && e.from !== e.to
  );

  // 参与连边的节点 vs 孤立节点
  const connected = new Set<string>();
  edges.forEach(e => { connected.add(e.from); connected.add(e.to); });
  const graphNodes = nodeIds.filter(id => connected.has(id));
  const isolatedNodes = nodeIds.filter(id => !connected.has(id));

  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  graphNodes.forEach(id => { adj.set(id, []); indeg.set(id, 0); });
  edges.forEach(e => {
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  });

  const rank = new Map<string, number>();
  const queue: string[] = [];
  graphNodes.forEach(id => {
    if ((indeg.get(id) || 0) === 0) {
      rank.set(id, 0);
      queue.push(id);
    }
  });

  // Kahn 拓扑排序 + 最长路径分层
  const indegWork = new Map(indeg);
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const base = rank.get(id) ?? 0;
    for (const next of adj.get(id) || []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, base + 1));
      indegWork.set(next, (indegWork.get(next) || 0) - 1);
      if (indegWork.get(next) === 0) queue.push(next);
    }
  }

  // 环中未解析的节点：放到已解析前驱之后，否则统一降级到末层
  let maxRank = 0;
  rank.forEach(v => { maxRank = Math.max(maxRank, v); });
  const unresolved = graphNodes.filter(id => !rank.has(id));
  if (unresolved.length > 0) {
    unresolved.forEach(id => {
      const predRanks = edges
        .filter(e => e.to === id && rank.has(e.from))
        .map(e => rank.get(e.from)!);
      rank.set(id, predRanks.length ? Math.max(...predRanks) + 1 : maxRank + 1);
    });
    rank.forEach(v => { maxRank = Math.max(maxRank, v); });
  }

  const ranks: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  graphNodes.forEach(id => { ranks[rank.get(id)!].push(id); });

  // 孤立节点单独成层，放在最后
  if (isolatedNodes.length > 0) ranks.push(isolatedNodes);

  return ranks;
}

/**
 * 按拓扑层级派生布局：每层一行（y = rank），行内水平排列，整行居中。
 * 纯函数，返回全新节点数组，绝不修改入参 flow。
 */
export function layoutTopology(
  flow: FlowDefinition,
  options: TopologyLayoutOptions = {}
): TopologyLayout {
  const { rankGap = 96, nodeGap = 48, padding = 48 } = options;

  const ranks = computeRanks(flow);
  const nodeMap = new Map(flow.nodes.map(n => [n.id, n]));

  const rankWidths = ranks.map(
    r => r.length * NODE_W + Math.max(0, r.length - 1) * nodeGap
  );
  const maxRowWidth = Math.max(NODE_W, ...rankWidths);

  const positions = new Map<string, { x: number; y: number }>();
  ranks.forEach((ids, r) => {
    const rowWidth = rankWidths[r];
    let x = padding + (maxRowWidth - rowWidth) / 2;
    const y = padding + r * (NODE_H + rankGap);
    ids.forEach(id => {
      positions.set(id, { x, y });
      x += NODE_W + nodeGap;
    });
  });

  const nodes: TopologyNode[] = flow.nodes.map(n => ({
    ...n,
    position: positions.get(n.id) ?? { x: padding, y: padding },
  }));

  const rankCount = Math.max(1, ranks.length);
  const width = maxRowWidth + padding * 2;
  const height = padding * 2 + rankCount * NODE_H + Math.max(0, rankCount - 1) * rankGap;

  return { nodes, edges: flow.edges, width, height, ranks };
}
