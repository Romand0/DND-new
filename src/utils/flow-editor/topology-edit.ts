// 拓扑编辑的结构操作：只改节点顺序与边，不计算像素坐标。
// 坐标始终由 layoutTopology 派生，编辑结果保存时再经 tidyFlowLayout 归一化。

import type { FlowDefinition, FlowNodeDef, FlowEdgeDef } from '@/types/flow';
import { computeRanks } from './topology-layout';
import { TRIGGER_LABELS as TRIGGER_FALLBACK_LABELS } from './flow-outline';

let edgeSeq = 0;

function makeEdgeId(from: string, to: string): string {
  edgeSeq += 1;
  return `edge-${from}-${to}-${Date.now()}-${edgeSeq}`;
}

const COMPLETE_LABEL = '完成';

/** 追加一个孤立节点（不自动连边），供「先加节点再手动连接」的路径使用 */
export function appendIsolatedNode(flow: FlowDefinition, node: FlowNodeDef): FlowDefinition {
  return { ...flow, nodes: [...flow.nodes, node], updatedAt: Date.now() };
}

/**
 * 在父节点之后插入新节点并尽量保持链路顺序：
 * - 父节点是 cast_end：插到结束节点之前，原入边改接到新节点，新节点再连 cast_end。
 * - 父节点恰好一条出边：把该出边改接到新节点，新节点再按原触发时机连回原目标。
 * - 父节点无出边：新增一条 on_complete 边。
 * - 父节点有多条分支出边：无法判断应插在哪条分支后，改为追加孤立节点，
 *   由调用方提示用户手动连接。
 */
export function insertNodeAfter(
  flow: FlowDefinition,
  parentId: string,
  node: FlowNodeDef,
): FlowDefinition {
  const parent = flow.nodes.find(n => n.id === parentId);
  if (!parent) return appendIsolatedNode(flow, node);

  const nodes = [...flow.nodes];
  let edges: FlowEdgeDef[] = [...flow.edges];
  const parentIndex = nodes.findIndex(n => n.id === parentId);

  if (parent.type === 'cast_end') {
    edges = edges.map(e => (e.to === parentId ? { ...e, to: node.id } : e));
    edges.push({
      id: makeEdgeId(node.id, parentId),
      from: node.id,
      to: parentId,
      trigger: 'on_complete',
      label: COMPLETE_LABEL,
    });
    nodes.splice(parentIndex, 0, node);
    return { ...flow, nodes, edges, updatedAt: Date.now() };
  }

  const outgoing = edges.filter(e => e.from === parentId);
  if (outgoing.length > 1) return appendIsolatedNode(flow, node);

  if (outgoing.length === 1) {
    const original = outgoing[0];
    edges = edges.map(e => (e.id === original.id ? { ...e, to: node.id } : e));
    edges.push({
      id: makeEdgeId(node.id, original.to),
      from: node.id,
      to: original.to,
      trigger: original.trigger,
      label: original.label ?? TRIGGER_FALLBACK_LABELS[original.trigger] ?? '',
      condition: original.condition,
      dataMap: original.dataMap,
      config: original.config,
    });
  } else {
    edges.push({
      id: makeEdgeId(parentId, node.id),
      from: parentId,
      to: node.id,
      trigger: 'on_complete',
      label: COMPLETE_LABEL,
    });
  }

  nodes.splice(parentIndex + 1, 0, node);
  return { ...flow, nodes, edges, updatedAt: Date.now() };
}

/** 节点是否可自动后插（存在结束节点或出边不超过一条）。供调用方提前提示。 */
export function canInsertAfter(flow: FlowDefinition, parentId: string): boolean {
  const parent = flow.nodes.find(n => n.id === parentId);
  if (!parent) return false;
  if (parent.type === 'cast_end') return true;
  return flow.edges.filter(e => e.from === parentId).length <= 1;
}

/** 在所属拓扑层内左右移动节点：交换节点数组顺序，不触碰边 */
export function moveNodeWithinRank(
  flow: FlowDefinition,
  nodeId: string,
  direction: -1 | 1,
): FlowDefinition {
  const rank = computeRanks(flow).find(r => r.includes(nodeId));
  if (!rank) return flow;
  const current = rank.indexOf(nodeId);
  const targetId = rank[current + direction];
  if (!targetId) return flow;

  const nodes = [...flow.nodes];
  const a = nodes.findIndex(n => n.id === nodeId);
  const b = nodes.findIndex(n => n.id === targetId);
  if (a < 0 || b < 0) return flow;
  [nodes[a], nodes[b]] = [nodes[b], nodes[a]];
  return { ...flow, nodes, updatedAt: Date.now() };
}

/** 节点在所属层内是否还能向指定方向移动（供按钮禁用态） */
export function canMoveWithinRank(
  ranks: string[][],
  nodeId: string,
  direction: -1 | 1,
): boolean {
  const rank = ranks.find(r => r.includes(nodeId));
  if (!rank) return false;
  const index = rank.indexOf(nodeId);
  return index + direction >= 0 && index + direction < rank.length;
}
