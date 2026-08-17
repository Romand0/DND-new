// 空间索引优化工具类
// 用于快速检测节点重叠，提升防重叠算法性能

import type { FlowNodeDef } from '@/types/flow';

export interface SpatialGridNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class SpatialGrid {
  private grid: Map<string, SpatialGridNode[]> = new Map();
  private cellSize: number;
  private nodes: Map<string, SpatialGridNode> = new Map();

  constructor(cellSize: number = 100) {
    this.cellSize = cellSize;
  }

  /**
   * 获取网格坐标键
   */
  private getGridKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  /**
   * 获取节点占据的所有网格单元
   */
  private getNodeGridCells(node: SpatialGridNode): string[] {
    const startX = Math.floor(node.x / this.cellSize);
    const endX = Math.floor((node.x + node.width) / this.cellSize);
    const startY = Math.floor(node.y / this.cellSize);
    const endY = Math.floor((node.y + node.height) / this.cellSize);

    const cells: string[] = [];
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        cells.push(`${x},${y}`);
      }
    }
    return cells;
  }

  /**
   * 添加节点到空间索引
   */
  addNode(node: SpatialGridNode): void {
    // 如果节点已存在，先移除
    if (this.nodes.has(node.id)) {
      this.removeNode(node.id);
    }

    this.nodes.set(node.id, node);
    const cells = this.getNodeGridCells(node);
    
    for (const cell of cells) {
      if (!this.grid.has(cell)) {
        this.grid.set(cell, []);
      }
      this.grid.get(cell)!.push(node);
    }
  }

  /**
   * 移除节点
   */
  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    this.nodes.delete(nodeId);
    const cells = this.getNodeGridCells(node);
    
    for (const cell of cells) {
      const cellNodes = this.grid.get(cell);
      if (cellNodes) {
        const index = cellNodes.findIndex(n => n.id === nodeId);
        if (index !== -1) {
          cellNodes.splice(index, 1);
        }
        // 如果单元格为空，删除该单元格
        if (cellNodes.length === 0) {
          this.grid.delete(cell);
        }
      }
    }
  }

  /**
   * 更新节点位置
   */
  updateNode(nodeId: string, x: number, y: number): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const newNode = { ...node, x, y };
    this.removeNode(nodeId);
    this.addNode(newNode);
  }

  /**
   * 获取指定区域内的所有节点
   */
  getNodesInRegion(
    x: number, 
    y: number, 
    width: number, 
    height: number
  ): SpatialGridNode[] {
    const startX = Math.floor(x / this.cellSize);
    const endX = Math.floor((x + width) / this.cellSize);
    const startY = Math.floor(y / this.cellSize);
    const endY = Math.floor((y + height) / this.cellSize);

    const uniqueNodes = new Set<SpatialGridNode>();
    
    for (let gx = startX; gx <= endX; gx++) {
      for (let gy = startY; gy <= endY; gy++) {
        const cellKey = `${gx},${gy}`;
        const cellNodes = this.grid.get(cellKey);
        if (cellNodes) {
          for (const node of cellNodes) {
            uniqueNodes.add(node);
          }
        }
      }
    }

    return Array.from(uniqueNodes);
  }

  /**
   * 检查指定位置是否与现有节点重叠
   */
  checkOverlap(
    x: number, 
    y: number, 
    width: number, 
    height: number,
    excludeId?: string
  ): boolean {
    const nodes = this.getNodesInRegion(x, y, width, height);
    
    for (const node of nodes) {
      if (node.id === excludeId) continue;
      
      if (this.nodesOverlap(
        { x, y, width, height },
        node
      )) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 矩形重叠检测
   */
  private nodesOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: SpatialGridNode
  ): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  /**
   * 清空所有数据
   */
  clear(): void {
    this.grid.clear();
    this.nodes.clear();
  }

  /**
   * 获取当前索引的节点数量
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * 获取网格单元数量
   */
  getCellCount(): number {
    return this.grid.size;
  }
}

/**
 * 使用空间索引优化的防重叠查找函数
 */
export function findNonOverlappingPositionWithGrid(
  node: SpatialGridNode,
  allNodes: SpatialGridNode[],
  grid: SpatialGrid,
  searchRadius: number = 40,
  maxAttempts: number = 20
): { x: number; y: number } {
  // 初始化空间索引
  grid.clear();
  for (const n of allNodes) {
    if (n.id !== node.id) {
      grid.addNode(n);
    }
  }

  const originalPos = { x: node.x, y: node.y };
  
  // 第一阶段：螺旋搜索（比简单的右侧→下方更智能）
  const directions = [
    { dx: searchRadius, dy: 0 },    // 右
    { dx: 0, dy: searchRadius },     // 下
    { dx: -searchRadius, dy: 0 },   // 左
    { dx: 0, dy: -searchRadius },   // 上
  ];

  for (let ring = 1; ring <= Math.ceil(maxAttempts / 4); ring++) {
    for (let dirIndex = 0; dirIndex < directions.length; dirIndex++) {
      const dir = directions[dirIndex];
      const distance = ring * searchRadius;
      
      // 对角线方向
      if (dirIndex === 0) { // 右
        for (let i = 1; i <= ring; i++) {
          const testX = originalPos.x + distance;
          const testY = originalPos.y + (i - ring / 2) * searchRadius;
          
          if (!grid.checkOverlap(testX, testY, node.width, node.height, node.id)) {
            return { x: testX, y: testY };
          }
        }
      } else if (dirIndex === 1) { // 下
        for (let i = 1; i <= ring; i++) {
          const testX = originalPos.x + (i - ring / 2) * searchRadius;
          const testY = originalPos.y + distance;
          
          if (!grid.checkOverlap(testX, testY, node.width, node.height, node.id)) {
            return { x: testX, y: testY };
          }
        }
      } else if (dirIndex === 2) { // 左
        for (let i = 1; i <= ring; i++) {
          const testX = originalPos.x - distance;
          const testY = originalPos.y + (i - ring / 2) * searchRadius;
          
          if (!grid.checkOverlap(testX, testY, node.width, node.height, node.id)) {
            return { x: testX, y: testY };
          }
        }
      } else if (dirIndex === 3) { // 上
        for (let i = 1; i <= ring; i++) {
          const testX = originalPos.x + (i - ring / 2) * searchRadius;
          const testY = originalPos.y - distance;
          
          if (!grid.checkOverlap(testX, testY, node.width, node.height, node.id)) {
            return { x: testX, y: testY };
          }
        }
      }
    }
  }

  // 如果螺旋搜索失败，回退到原始算法
  return findNonOverlappingPositionFallback(node, allNodes, node.width, searchRadius, maxAttempts);
}

/**
 * 回退到原始防重叠算法
 */
function findNonOverlappingPositionFallback(
  node: SpatialGridNode,
  allNodes: SpatialGridNode[],
  cardWidth: number,
  dx = 40,
  maxAttempts = 20,
): { x: number; y: number } {
  let pos = { x: node.x, y: node.y };
  
  // 水平搜索
  for (let i = 0; i < maxAttempts; i++) {
    const testNode = { ...node, position: pos };
    const hasOverlap = allNodes.some(other => 
      other.id !== node.id && nodesOverlap(testNode, other, cardWidth)
    );
    if (!hasOverlap) return pos;
    pos = { x: pos.x + dx, y: pos.y };
  }
  
  // 垂直搜索
  pos = { x: node.x, y: node.y + dx };
  for (let i = 0; i < maxAttempts; i++) {
    const testNode = { ...node, position: pos };
    const hasOverlap = allNodes.some(other => 
      other.id !== node.id && nodesOverlap(testNode, other, cardWidth)
    );
    if (!hasOverlap) return pos;
    pos = { x: pos.x, y: pos.y + dx };
  }
  
  return pos;
}

/**
 * 矩形重叠检测（兼容原函数）
 */
function nodesOverlap(
  a: SpatialGridNode,
  b: SpatialGridNode,
  cardWidth: number
): boolean {
  return (
    a.id !== b.id &&
    a.x < b.x + cardWidth &&
    a.x + cardWidth > b.x &&
    a.y < b.y + 56 && // NODE_H = 56
    a.y + 56 > b.y
  );
}