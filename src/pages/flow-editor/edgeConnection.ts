/**
 * 连线端点连接逻辑模块
 * 
 * 实现智能边端点选择：根据上下游卡片相对位置，
 * 选择四条边上的居中位置作为连线端点，避免连线被卡片遮挡
 */

import type { FlowEdgeDef, FlowNodeDef } from '@/types/flow';
import { NODE_W, NODE_H } from './constants';

/**
 * 边端点位置枚举
 */
export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * 边端点坐标
 */
export interface EdgeEndpoint {
  x: number;
  y: number;
  side: EdgeSide;
}

/**
 * 计算两个节点之间的相对方向，用于选择合适的边端点
 */
function getNodeDirection(fromNode: FlowNodeDef, toNode: FlowNodeDef): {
  horizontal: 'left' | 'right';
  vertical: 'top' | 'bottom';
  dx: number;
  dy: number;
  distance: number;
} {
  const dx = toNode.position.x - fromNode.position.x;
  const dy = toNode.position.y - fromNode.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  return {
    horizontal: dx > 0 ? 'right' : 'left',
    vertical: dy > 0 ? 'bottom' : 'top',
    dx,
    dy,
    distance
  };
}

/**
 * 根据节点相对位置选择最佳的边端点
 */
function selectOptimalEdgeSide(
  node: FlowNodeDef,
  isFromNode: boolean,
  otherNode: FlowNodeDef
): EdgeSide {
  const direction = getNodeDirection(isFromNode ? node : otherNode, isFromNode ? otherNode : node);
  
  // 根据实际距离比例选择最佳边
  if (Math.abs(direction.dx) > Math.abs(direction.dy)) {
    // 水平距离更大，选择左右边
    return direction.horizontal === 'right' ? 'right' : 'left';
  } else {
    // 垂直距离更大，选择上下边
    return direction.vertical === 'bottom' ? 'bottom' : 'top';
  }
}

/**
 * 计算节点指定边的中心点坐标
 */
function getEdgeCenter(node: FlowNodeDef, side: EdgeSide, size?: {w: number, h: number}): { x: number; y: number } {
  const { x, y } = node.position;
  const w = size?.w || NODE_W;
  const h = size?.h || NODE_H;
  const offset = 2; // 向外推 ~2px 避开 border-2
  
  switch (side) {
    case 'top':
      return { x: x + w / 2, y: y - offset };
    case 'right':
      return { x: x + w + offset, y: y + h / 2 };
    case 'bottom':
      return { x: x + w / 2, y: y + h + offset };
    case 'left':
      return { x: x - offset, y: y + h / 2 };
  }
}
}

/**
 * 获取连线的两个端点（智能选择边端点）
 */
export function getSmartEdgeEndpoints(edge: FlowEdgeDef, nodes: FlowNodeDef[], nodeSizes?: Map<string, {w: number, h: number}>): {
  from: EdgeEndpoint;
  to: EdgeEndpoint;
} | null {
  const fromNode = nodes.find(n => n.id === edge.from);
  const toNode = nodes.find(n => n.id === edge.to);
  
  if (!fromNode || !toNode) return null;

  // 一次决策相向配对的边端点
  const dx = toNode.position.x - fromNode.position.x;
  const dy = toNode.position.y - fromNode.position.y;
  let fromSide, toSide;
  
  if (Math.abs(dx) >= Math.abs(dy)) {
    // 水平主导：相向左右配对
    fromSide = dx > 0 ? 'right' : 'left';
    toSide   = dx > 0 ? 'left'  : 'right';
  } else {
    // 垂直主导：相向上下配对
    fromSide = dy > 0 ? 'bottom' : 'top';
    toSide   = dy > 0 ? 'top'    : 'bottom';
  }

  // 获取端点坐标（使用真实节点尺寸）
  const fromSize = nodeSizes?.get(edge.from) || { w: NODE_W, h: NODE_H };
  const toSize = nodeSizes?.get(edge.to) || { w: NODE_W, h: NODE_H };
  const fromPoint = getEdgeCenter(fromNode, fromSide, fromSize);
  const toPoint = getEdgeCenter(toNode, toSide, toSize);

  return {
    from: { ...fromPoint, side: fromSide },
    to: { ...toPoint, side: toSide }
  };
}

/**
 * 边曲线接口
 */
export interface EdgeCurve {
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  c1: { x: number; y: number };  // 第一个控制点
  c2: { x: number; y: number };  // 第二个控制点
}

/**
 * 构建边曲线（三次贝塞尔）
 */
function buildEdgeCurve(edge: FlowEdgeDef, nodes: FlowNodeDef[], nodeSizes?: Map<string, {w: number, h: number}>): EdgeCurve | null {
  const endpoints = getSmartEdgeEndpoints(edge, nodes, nodeSizes);
  if (!endpoints) return null;

  const { from, to } = endpoints;
  
  // 计算弯曲距离（根据节点间距，至少 40px）
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(40, Math.min(80, Math.abs(dx) * 0.35, Math.abs(dy) * 0.35));
  
  // 根据边的方向计算控制点
  let c1, c2;
  
  if (from.side === 'right') {
    c1 = { x: from.x + dist, y: from.y };
  } else if (from.side === 'left') {
    c1 = { x: from.x - dist, y: from.y };
  } else if (from.side === 'bottom') {
    c1 = { x: from.x, y: from.y + dist };
  } else { // top
    c1 = { x: from.x, y: from.y - dist };
  }
  
  if (to.side === 'right') {
    c2 = { x: to.x + dist, y: to.y };
  } else if (to.side === 'left') {
    c2 = { x: to.x - dist, y: to.y };
  } else if (to.side === 'bottom') {
    c2 = { x: to.x, y: to.y + dist };
  } else { // top
    c2 = { x: to.x, y: to.y - dist };
  }
  
  return { from, to, c1, c2 };
}

/**
 * 沿曲线获取指定 t 值的点和角度
 */
function pointOnCurve(curve: EdgeCurve, t: number): { x: number; y: number; angle: number } {
  const { from, to, c1, c2 } = curve;
  
  // 三次贝塞尔公式：P(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  
  const x = mt3 * from.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t3 * to.x;
  const y = mt3 * from.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t3 * to.y;
  
  // 计算切线角度
  const dx = 3 * mt2 * (c1.x - from.x) + 6 * mt * t * (c2.x - c1.x) + 3 * t2 * (to.x - c2.x);
  const dy = 3 * mt2 * (c1.y - from.y) + 6 * mt * t * (c2.y - c1.y) + 3 * t2 * (to.y - c2.y);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  
  return { x, y, angle };
}

/**
 * 沿曲线采样为 polyline
 */
function sampleCurveToPolyline(curve: EdgeCurve, spacing: number = 16): string {
  const totalDist = Math.sqrt(
    Math.pow(curve.to.x - curve.from.x, 2) + 
    Math.pow(curve.to.y - curve.from.y, 2)
  );
  
  if (totalDist < spacing) {
    return `M${curve.from.x},${curve.from.y} L${curve.to.x},${curve.to.y}`;
  }
  
  const steps = Math.max(2, Math.round(totalDist / spacing));
  const points: string[] = [];
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = pointOnCurve(curve, t);
    points.push(i === 0 ? `M${point.x},${point.y}` : `L${point.x},${point.y}`);
  }
  
  return points.join(' ');
}

/**
 * 计算智能连线路径（使用边端点）
 */
export function getSmartEdgePath(edge: FlowEdgeDef, nodes: FlowNodeDef[], nodeSizes?: Map<string, {w: number, h: number}>): string | null {
  const curve = buildEdgeCurve(edge, nodes, nodeSizes);
  if (!curve) return null;

  // 三次贝塞尔曲线
  const { from, to, c1, c2 } = curve;
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
}

/**
 * 计算箭头位置（使用曲线）
 */
export function getSmartArrowPos(edge: FlowEdgeDef, nodes: FlowNodeDef[], nodeSizes?: Map<string, {w: number, h: number}>): string {
  const curve = buildEdgeCurve(edge, nodes, nodeSizes);
  if (!curve) return '0,0';
  
  // 在曲线上取 t=0.85 的点（靠近目标端点）
  const point = pointOnCurve(curve, 0.85);
  
  return `${point.x},${point.y} rotate(${point.angle})`;
}

/**
 * 计算标签位置（使用曲线）
 */
export function getSmartLabelPos(edge: FlowEdgeDef, nodes: FlowNodeDef[], nodeSizes?: Map<string, {w: number, h: number}>): string {
  const curve = buildEdgeCurve(edge, nodes, nodeSizes);
  if (!curve) return '0,0';
  
  // 在曲线上取 t=0.5 的点（曲线中点），然后向上偏移 12px
  const point = pointOnCurve(curve, 0.5);
  
  // 法线方向（切线的垂直方向，向上）
  const normalAngle = point.angle - 90;
  const normalX = point.x + Math.cos(normalAngle * Math.PI / 180) * 12;
  const normalY = point.y + Math.sin(normalAngle * Math.PI / 180) * 12;
  
  return `${normalX},${normalY}`;
}

/**
 * 生成连线的装饰性采样点（用于箭头等装饰） - 已弃用，使用 sampleCurveToPolyline
 */
export function sampleSmartEdgeToPolyline(
  from: EdgeEndpoint,
  to: EdgeEndpoint,
  spacing: number = 16
): string {
  // 创建临时曲线对象
  const curve: EdgeCurve = {
    from,
    to,
    c1: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
    c2: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  };
  return sampleCurveToPolyline(curve, spacing);
}

/**
 * 获取连线的装饰性端点（用于调试和可视化）
 */
export function getSmartEdgeDecoratedEndpoints(edge: FlowEdgeDef, nodes: FlowNodeDef[], nodeSizes?: Map<string, {w: number, h: number}>) {
  const endpoints = getSmartEdgeEndpoints(edge, nodes, nodeSizes);
  if (!endpoints) return null;
  
  return {
    from: {
      ...endpoints.from,
      // 添加装饰信息
      decoration: getEdgeDecoration(endpoints.from.side)
    },
    to: {
      ...endpoints.to,
      // 添加装饰信息
      decoration: getEdgeDecoration(endpoints.to.side)
    }
  };
}

/**
 * 获取边的装饰信息
 */
function getEdgeDecoration(side: EdgeSide): string {
  switch (side) {
    case 'top': return 'top-connector';
    case 'right': return 'right-connector';
    case 'bottom': return 'bottom-connector';
    case 'left': return 'left-connector';
  }
}