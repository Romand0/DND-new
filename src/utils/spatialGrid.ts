// 空间索引工具 - 用于优化节点碰撞检测性能
const CELL_SIZE = 300;

export class SpatialGrid {
  private cells: Map<string, FlowNodeDef[]> = new Map();

  private key(x: number, y: number): string {
    const cellX = Math.floor(x / CELL_SIZE);
    const cellY = Math.floor(y / CELL_SIZE);
    return `${cellX},${cellY}`;
  }

  rebuild(nodes: FlowNodeDef[]): void {
    this.cells.clear();
    
    for (const node of nodes) {
      const cellKey = this.key(node.position.x, node.position.y);
      if (!this.cells.has(cellKey)) {
        this.cells.set(cellKey, []);
      }
      this.cells.get(cellKey)!.push(node);
    }
  }

  queryCandidates(x: number, y: number, w: number, h: number): FlowNodeDef[] {
    const candidates: FlowNodeDef[] = [];
    
    // 计算查询区域覆盖的网格范围
    const minX = Math.floor((x - w) / CELL_SIZE);
    const maxX = Math.floor((x + w) / CELL_SIZE);
    const minY = Math.floor((y - h) / CELL_SIZE);
    const maxY = Math.floor((y + h) / CELL_SIZE);
    
    // 查询邻近 9 格
    for (let cellX = minX; cellX <= maxX; cellX++) {
      for (let cellY = minY; cellY <= maxY; cellY++) {
        const cellKey = `${cellX},${cellY}`;
        const nodesInCell = this.cells.get(cellKey);
        if (nodesInCell) {
          candidates.push(...nodesInCell);
        }
      }
    }
    
    return candidates;
  }
}