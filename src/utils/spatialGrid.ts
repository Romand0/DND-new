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
  private batchMode: boolean = false;
  private batchOperations: Array<{ type: 'add' | 'remove' | 'update', node: SpatialGridNode }> = [];
  private cache: Map<string, { nodes: SpatialGridNode[], timestamp: number }> = new Map();
  private cacheTimeout: number = 5000; // 5秒缓存过期
  private minCellSize: number = 50;
  private maxCellSize: number = 200;
  private adaptiveCellSize: boolean = true;

  constructor(cellSize: number = 100, adaptiveCellSize: boolean = true) {
    this.cellSize = Math.max(this.minCellSize, Math.min(this.maxCellSize, cellSize));
    this.adaptiveCellSize = adaptiveCellSize;
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
    * 批量模式开始 - 用于优化大量节点的添加操作
    */
  startBatch(): void {
    this.batchMode = true;
    this.batchOperations = [];
  }

  /**
    * 批量模式结束 - 执行所有批量操作
    */
  endBatch(): void {
    if (!this.batchMode) return;
    
    this.batchMode = false;
    
    // 优化：先收集所有操作，然后批量处理
    const adds: SpatialGridNode[] = [];
    const removes: string[] = [];
    const updates: { id: string, node: SpatialGridNode }[] = [];
    
    for (const op of this.batchOperations) {
      if (op.type === 'add') {
        adds.push(op.node);
      } else if (op.type === 'remove') {
        removes.push(op.node.id);
      } else if (op.type === 'update') {
        updates.push({ id: op.node.id, node: op.node });
      }
    }
    
    // 批量移除
    for (const nodeId of removes) {
      this.removeNodeInternal(nodeId);
    }
    
    // 批量添加
    for (const node of adds) {
      this.addNodeInternal(node);
    }
    
    // 批量更新
    for (const update of updates) {
      this.removeNodeInternal(update.id);
      this.addNodeInternal(update.node);
    }
    
    this.batchOperations = [];
    this.clearCache();
    
    // 动态调整网格大小
    if (this.adaptiveCellSize) {
      this.adaptCellSize();
    }
  }

  /**
    * 添加节点到空间索引
    */
  addNode(node: SpatialGridNode): void {
    if (this.batchMode) {
      this.batchOperations.push({ type: 'add', node });
      return;
    }
    this.addNodeInternal(node);
  }

  /**
    * 内部添加节点方法
    */
  private addNodeInternal(node: SpatialGridNode): void {
    // 如果节点已存在，先移除
    if (this.nodes.has(node.id)) {
      this.removeNodeInternal(node.id);
    }

    this.nodes.set(node.id, node);
    const cells = this.getNodeGridCells(node);
    
    for (const cell of cells) {
      if (!this.grid.has(cell)) {
        this.grid.set(cell, []);
      }
      this.grid.get(cell)!.push(node);
    }
    
    this.clearCache();
  }

  /**
    * 移除节点
    */
  removeNode(nodeId: string): void {
    if (this.batchMode) {
      const node = this.nodes.get(nodeId);
      if (node) {
        this.batchOperations.push({ type: 'remove', node });
      }
      return;
    }
    this.removeNodeInternal(nodeId);
  }

  /**
    * 内部移除节点方法
    */
  private removeNodeInternal(nodeId: string): void {
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
    
    this.clearCache();
  }

  /**
    * 更新节点位置
    */
  updateNode(nodeId: string, x: number, y: number): void {
    if (this.batchMode) {
      const node = this.nodes.get(nodeId);
      if (node) {
        const newNode = { ...node, x, y };
        this.batchOperations.push({ type: 'update', node: newNode });
      }
      return;
    }
    
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const newNode = { ...node, x, y };
    this.removeNodeInternal(nodeId);
    this.addNodeInternal(newNode);
  }

  /**
    * 缓存机制 - 获取区域内的节点（带缓存）
    */
  private getNodesInRegionCached(
    x: number, 
    y: number, 
    width: number, 
    height: number
  ): SpatialGridNode[] {
    const cacheKey = `${x},${y},${width},${height}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.nodes;
    }
    
    const nodes = this.getNodesInRegionInternal(x, y, width, height);
    
    // 缓存结果
    this.cache.set(cacheKey, {
      nodes: nodes,
      timestamp: Date.now()
    });
    
    return nodes;
  }

  /**
    * 内部获取区域节点方法
    */
  private getNodesInRegionInternal(
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
    * 清空缓存
    */
  private clearCache(): void {
    this.cache.clear();
  }

  /**
    * 动态调整网格大小
    */
  private adaptCellSize(): void {
    const nodeCount = this.nodes.size;
    if (nodeCount === 0) return;

    // 根据节点数量动态调整网格大小
    let newCellSize = this.cellSize;
    
    if (nodeCount < 10) {
      newCellSize = 150; // 较少节点，使用较大网格
    } else if (nodeCount < 50) {
      newCellSize = 100; // 中等节点数量，标准网格
    } else if (nodeCount < 200) {
      newCellSize = 75; // 较多节点，使用较小网格
    } else {
      newCellSize = 50; // 大量节点，使用小网格提高精度
    }
    
    // 限制在合理范围内
    newCellSize = Math.max(this.minCellSize, Math.min(this.maxCellSize, newCellSize));
    
    // 如果网格大小变化较大，重建索引
    if (Math.abs(newCellSize - this.cellSize) > 20) {
      this.rebuildGrid(newCellSize);
    }
  }

  /**
    * 重建网格索引
    */
  private rebuildGrid(newCellSize?: number): void {
    const oldCellSize = this.cellSize;
    this.cellSize = newCellSize || this.cellSize;
    
    // 保存所有节点
    const allNodes = Array.from(this.nodes.values());
    
    // 清空网格
    this.grid.clear();
    
    // 重新添加所有节点
    for (const node of allNodes) {
      this.addNodeInternal(node);
    }
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
    return this.getNodesInRegionCached(x, y, width, height);
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
    const nodes = this.getNodesInRegionCached(x, y, width, height);
    
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
    * 获取性能统计信息
    */
  getStats(): {
    nodeCount: number;
    cellCount: number;
    cacheSize: number;
    cellSize: number;
    avgNodesPerCell: number;
  } {
    const cellCount = this.grid.size;
    const nodeCount = this.nodes.size;
    const cacheSize = this.cache.size;
    const avgNodesPerCell = cellCount > 0 ? nodeCount / cellCount : 0;
    
    return {
      nodeCount,
      cellCount,
      cacheSize,
      cellSize: this.cellSize,
      avgNodesPerCell: Math.round(avgNodesPerCell * 100) / 100
    };
  }

  /**
    * 清理过期缓存
    */
  cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  /**
    * 强制清空所有缓存
    */
  forceClearCache(): void {
    this.cache.clear();
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
 * 使用空间索引优化的防重叠查找函数（增强版）
 */
export function findNonOverlappingPositionWithGrid(
  node: SpatialGridNode,
  allNodes: SpatialGridNode[],
  grid: SpatialGrid,
  searchRadius: number = 40,
  maxAttempts: number = 20
): { x: number; y: number } {
  const startTime = performance.now();
  
  // 使用批量操作优化初始化
  grid.startBatch();
  try {
    for (const n of allNodes) {
      if (n.id !== node.id) {
        grid.addNode(n);
      }
    }
  } finally {
    grid.endBatch();
  }

  const originalPos = { x: node.x, y: node.y };
  
  // 优化搜索策略：多阶段搜索
  const result = findPositionWithMultiStageSearch(node, grid, originalPos, searchRadius, maxAttempts);
  
  const endTime = performance.now();
  const searchTime = endTime - startTime;
  
  // 如果搜索时间过长，记录性能警告
  if (searchTime > 100) {
    console.warn(`防重叠搜索耗时过长: ${searchTime.toFixed(2)}ms`);
  }
  
  return result;
}

/**
 * 多阶段搜索策略
 */
function findPositionWithMultiStageSearch(
  node: SpatialGridNode,
  grid: SpatialGrid,
  originalPos: { x: number; y: number },
  searchRadius: number,
  maxAttempts: number
): { x: number; y: number } {
  // 第一阶段：近距离快速搜索（优先考虑用户期望位置附近）
  const result = findPositionInNearbyRegion(node, grid, originalPos, searchRadius, Math.min(maxAttempts, 8));
  if (result) return result;
  
  // 第二阶段：螺旋搜索（比简单的右侧→下方更智能）
  const spiralResult = findPositionWithSpiralSearch(node, grid, originalPos, searchRadius, maxAttempts);
  if (spiralResult) return spiralResult;
  
  // 第三阶段：网格化搜索（在大规模节点时更有效）
  const gridResult = findPositionWithGridSearch(node, grid, originalPos, searchRadius, maxAttempts);
  if (gridResult) return gridResult;
  
  // 如果所有搜索都失败，回退到原始算法
  return findNonOverlappingPositionFallback(node, grid.getNodesInRegion(0, 0, 2000, 2000), node.width, searchRadius, maxAttempts);
}

/**
 * 近距离快速搜索
 */
function findPositionInNearbyRegion(
  node: SpatialGridNode,
  grid: SpatialGrid,
  originalPos: { x: number; y: number },
  searchRadius: number,
  maxAttempts: number
): { x: number; y: number } | null {
  // 在原始位置周围进行小范围搜索
  const directions = [
    { dx: 0, dy: 0 },      // 原始位置
    { dx: searchRadius, dy: 0 },     // 右
    { dx: 0, dy: searchRadius },     // 下
    { dx: -searchRadius, dy: 0 },    // 左
    { dx: 0, dy: -searchRadius },    // 上
    { dx: searchRadius, dy: searchRadius },  // 右下
    { dx: -searchRadius, dy: searchRadius }, // 左下
    { dx: searchRadius, dy: -searchRadius }, // 右上
    { dx: -searchRadius, dy: -searchRadius }, // 左上
  ];

  for (const dir of directions) {
    const testX = originalPos.x + dir.dx;
    const testY = originalPos.y + dir.dy;
    
    if (!grid.checkOverlap(testX, testY, node.width, node.height, node.id)) {
      return { x: testX, y: testY };
    }
  }
  
  return null;
}

/**
 * 螺旋搜索
 */
function findPositionWithSpiralSearch(
  node: SpatialGridNode,
  grid: SpatialGrid,
  originalPos: { x: number; y: number },
  searchRadius: number,
  maxAttempts: number
): { x: number; y: number } | null {
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
  
  return null;
}

/**
 * 网格化搜索（在大规模节点时更有效）
 */
function findPositionWithGridSearch(
  node: SpatialGridNode,
  grid: SpatialGrid,
  originalPos: { x: number; y: number },
  searchRadius: number,
  maxAttempts: number
): { x: number; y: number } | null {
  const gridSize = searchRadius * 2;
  const gridRange = Math.ceil(Math.sqrt(maxAttempts));
  
  for (let dx = -gridRange; dx <= gridRange; dx++) {
    for (let dy = -gridRange; dy <= gridRange; dy++) {
      if (dx === 0 && dy === 0) continue; // 跳过原始位置
      
      const testX = originalPos.x + dx * gridSize;
      const testY = originalPos.y + dy * gridSize;
      
      if (!grid.checkOverlap(testX, testY, node.width, node.height, node.id)) {
        return { x: testX, y: testY };
      }
    }
  }
  
  return null;
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