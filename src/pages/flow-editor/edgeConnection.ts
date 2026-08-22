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
  distance: number;
} {
  const dx = toNode.position.x - fromNode.position.x;
  const dy = toNode.position.y - fromNode.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  return {
    horizontal: dx > 0 ? 'right' : 'left',
    vertical: dy > 0 ? 'bottom' : 'top',
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
  
  // 优先选择较远的方向
  if (Math.abs(direction.horizontal) > Math.abs(direction.vertical)) {
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
function getEdgeCenter(node: FlowNodeDef, side: EdgeSide): { x: number; y: number } {
  const { x, y } = node.position;
  
  switch (side) {
    case 'top':
      return { x: x + NODE_W / 2, y: y };
    case 'right':
      return { x: x + NODE_W, y: y + NODE_H / 2 };
    case 'bottom':
      return { x: x + NODE_W / 2, y: y + NODE_H };
    case 'left':
      return { x: x, y: y + NODE_H / 2 };
  }
}

/**
 * 获取连线的两个端点（智能选择边端点）
 */
export function getSmartEdgeEndpoints(edge: FlowEdgeDef, nodes: FlowNodeDef[]): {
  from: EdgeEndpoint;
  to: EdgeEndpoint;
} | null {
  const fromNode = nodes.find(n => n.id === edge.from);
  const toNode = nodes.find(n => n.id === edge.to);
  
  if (!fromNode || !toNode) return null;

  // 选择最佳的边端点
  const fromSide = selectOptimalEdgeSide(fromNode, true, toNode);
  const toSide = selectOptimalEdgeSide(toNode, false, fromNode);

  // 获取端点坐标
  const fromPoint = getEdgeCenter(fromNode, fromSide);
  const toPoint = getEdgeCenter(toNode, toSide);

  return {
    from: { ...fromPoint, side: fromSide },
    to: { ...toPoint, side: toSide }
  };
}

/**
 * 计算智能连线路径（使用边端点）
 */
export function getSmartEdgePath(edge: FlowEdgeDef, nodes: FlowNodeDef[]): string | null {
  const endpoints = getSmartEdgeEndpoints(edge, nodes);
  if (!endpoints) return null;

  const { from, to } = endpoints;
  
  // 使用贝塞尔曲线创建更自然的连线
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  
  // 根据边的方向控制曲线弯曲程度
  let controlOffsetX = 0;
  let controlOffsetY = 0;
  
  if (from.side === 'top' || from.side === 'bottom') {
    controlOffsetX = dx * 0.3;
  } else {
    controlOffsetY = dy * 0.3;
  }
  
  // 创建二次贝塞尔曲线
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  
  return `M ${from.x} ${from.y} Q ${midX + controlOffsetX} ${midY + controlOffsetY}, ${to.x} ${to.y}`;
}

/**
 * 计算箭头位置（使用边端点）
 */
export function getSmartArrowPos(edge: FlowEdgeDef, nodes: FlowNodeDef[]): string {
  const endpoints = getSmartEdgeEndpoints(edge, nodes);
  if (!endpoints) return '0,0';
  
  const { from, to } = endpoints;
  
  // 计算箭头在线条上的位置（靠近目标端点）
  const t = 0.7;
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  
  // 计算角度
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
  
  return `${x},${y} rotate(${angle})`;
}

/**
 * 计算标签位置（使用边端点）
 */
export function getSmartLabelPos(edge: FlowEdgeDef, nodes: FlowNodeDef[]): { x: number; y: number } {
  const endpoints = getSmartEdgeEndpoints(edge, nodes);
  if (!endpoints) return { x: 0, y: 0 };
  
  const { from, to } = endpoints;
  
  // 标签放在连线中点附近
  const x = (from.x + to.x) / 2;
  const y = (from.y + to.y) / 2 - 15; // 稍微上移避免与连线重叠
  
  return { x, y };
}

/**
 * 生成连线的装饰性采样点（用于箭头等装饰）
 */
export function sampleSmartEdgeToPolyline(
  from: EdgeEndpoint,
  to: EdgeEndpoint,
  spacing: number = 16
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < spacing) return `M${from.x},${from.y} L${to.x},${to.y}`;
  
  const steps = Math.max(2, Math.round(dist / spacing));
  const parts: string[] = [];
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    parts.push(i === 0 ? `M${px},${py}` : `L${px},${py}`);
  }
  
  return parts.join(' ');
}

/**
 * 获取连线的装饰性端点（用于调试和可视化）
 */
export function getSmartEdgeDecoratedEndpoints(edge: FlowEdgeDef, nodes: FlowNodeDef[]) {
  const endpoints = getSmartEdgeEndpoints(edge, nodes);
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