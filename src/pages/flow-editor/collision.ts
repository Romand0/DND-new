import { SpatialGrid } from '@/utils/spatialGrid';
import type { FlowNodeDef } from '@/types/flow';
import { NODE_H, NODE_W } from './constants';

// 当前生效的空间索引（组件在 flow.nodes 变化时同步），供模块级 nodesOverlap 做候选筛选
let activeSpatialGrid: SpatialGrid | null = null;

export function nodesOverlap(a: FlowNodeDef, b: FlowNodeDef, cardWidth: number): boolean {
  if (a.id === b.id) return false;
  // 空间索引候选筛选：b 不在候选集中则必不重叠（精确 AABB 检测在下方）
  if (activeSpatialGrid) {
    const candidates = activeSpatialGrid.queryCandidates(a.position.x, a.position.y, cardWidth, NODE_H);
    if (!candidates.some(c => c.id === b.id)) return false;
  }
  return (
    a.position.x < b.position.x + cardWidth &&
    a.position.x + cardWidth > b.position.x &&
    a.position.y < b.position.y + NODE_H &&
    a.position.y + NODE_H > b.position.y
  );
}

// 智能退避策略：对每个重叠节点计算推离向量（选重叠量最小的轴、方向远离对方），
// 按位移平方和排序取最小推离向量作为最终落位
export function findNonOverlappingPositionV2(
  node: FlowNodeDef,
  others: FlowNodeDef[],
  cardW: number,
  cardH: number,
  grid: SpatialGrid,
  scale: number,
): { x: number; y: number } {
  const step = 30 / scale;
  const candidates = grid.queryCandidates(node.position.x, node.position.y, cardW, cardH)
    .filter(o => o.id !== node.id);

  // 对每个重叠节点计算推离向量
  const pushVectors: { x: number; y: number }[] = [];
  for (const o of candidates) {
    const overlapX = Math.min(node.position.x + cardW, o.position.x + cardW) - Math.max(node.position.x, o.position.x);
    const overlapY = Math.min(node.position.y + cardH, o.position.y + cardH) - Math.max(node.position.y, o.position.y);
    if (overlapX <= 0 || overlapY <= 0) continue;
    if (overlapX <= overlapY) {
      const dir = node.position.x < o.position.x ? -1 : 1;
      pushVectors.push({ x: dir * overlapX, y: 0 });
    } else {
      const dir = node.position.y < o.position.y ? -1 : 1;
      pushVectors.push({ x: 0, y: dir * overlapY });
    }
  }

  if (pushVectors.length === 0) {
    return { x: node.position.x, y: node.position.y };
  }

  // 候选退避点：推离向量 + 四轴向 step 递增，位移平方和越小越优先
  const seen = new Set<string>();
  const attempts: { x: number; y: number; cost: number }[] = [];
  const addAttempt = (vx: number, vy: number) => {
    const x = Math.max(0, node.position.x + vx);
    const y = Math.max(0, node.position.y + vy);
    const k = `${x},${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    const stillOverlap = others.some(o => (
      x < o.position.x + cardW && x + cardW > o.position.x &&
      y < o.position.y + cardH && y + cardH > o.position.y
    ));
    const dx = x - node.position.x;
    const dy = y - node.position.y;
    attempts.push({ x, y, cost: stillOverlap ? Infinity : dx * dx + dy * dy });
  };

  for (const v of pushVectors) addAttempt(v.x, v.y);
  for (let d = 1; d <= 3; d++) {
    addAttempt(step * d, 0);
    addAttempt(-step * d, 0);
    addAttempt(0, step * d);
    addAttempt(0, -step * d);
  }

  attempts.sort((p, q) => p.cost - q.cost);
  const best = attempts.find(a => a.cost !== Infinity);
  return best ? { x: best.x, y: best.y } : { x: node.position.x, y: node.position.y };
}

// 供外部更新空间索引的函数
export function setActiveSpatialGrid(grid: SpatialGrid | null) {
  activeSpatialGrid = grid;
}