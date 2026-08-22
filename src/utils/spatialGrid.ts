// 空间索引（均匀网格）：按 CELL_SIZE 方格划分节点，碰撞检测前先取邻近 9 格的候选，再做精确 AABB 检测
import type { FlowNodeDef } from '../types/flow';

export const CELL_SIZE = 300;

export class SpatialGrid {
  private cells: Map<string, FlowNodeDef[]> = new Map();

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  rebuild(nodes: FlowNodeDef[]): void {
    this.cells.clear();
    for (const n of nodes) {
      const cx = Math.floor(n.position.x / CELL_SIZE);
      const cy = Math.floor(n.position.y / CELL_SIZE);
      const k = this.key(cx, cy);
      const bucket = this.cells.get(k);
      if (bucket) {
        bucket.push(n);
      } else {
        this.cells.set(k, [n]);
      }
    }
  }

  // 查询与区域 [x, x+w] × [y, y+h] 外扩一格后的所有候选节点（节点尺寸 ≤ CELL_SIZE 时即邻近 9 格）
  queryCandidates(x: number, y: number, w: number, h: number): FlowNodeDef[] {
    const minX = Math.floor((x - CELL_SIZE) / CELL_SIZE);
    const minY = Math.floor((y - CELL_SIZE) / CELL_SIZE);
    const maxX = Math.floor((x + w + CELL_SIZE) / CELL_SIZE);
    const maxY = Math.floor((y + h + CELL_SIZE) / CELL_SIZE);
    const seen = new Set<string>();
    const out: FlowNodeDef[] = [];
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const n of bucket) {
          if (seen.has(n.id)) continue;
          seen.add(n.id);
          out.push(n);
        }
      }
    }
    return out;
  }
}
