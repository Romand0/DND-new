import { useCallback } from 'react';
import type { GridPos } from '@/data/battleGeometry';
import { planForcedMovePath } from '@/data/battleGeometry';
import battlegroundStore from '@/data/battlegroundStore';
import type { CombatRecord } from '@/types/combat';

export interface ForcedMoveRequest {
  targetId: string;
  /** 位移主方向（已裁决远离/朝向后；'same' = no-op） */
  bearing: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'same';
  distanceCells: number;
  /** 本次规避格集合（随单次位移生效，调用栈内释放，R5.4） */
  avoidCells?: string[];
  /** 参照棋子 id，仅供战斗日志记录 */
  originId?: string | null;
}

export interface ForcedMoveResult {
  path: GridPos[];
  truncated: boolean;
  finalPos: GridPos;
}

export function gridBounds(size: string): { cols: number; rows: number } {
  // 与 useThrownDrop.ts 同款网格参数（small 12×18 / medium 24×36 / large 36×54）
  if (size === 'small') return { cols: 12, rows: 18 };
  if (size === 'large') return { cols: 36, rows: 54 };
  return { cols: 24, rows: 36 };
}

export function useForcedMove(recordId: string | null) {
  /**
   * 执行强制位移：组装禁行集 → 绕行规划 → 落位。
   * 消耗目标移动力恒为 0（design.md P7，调 onConsumeMovement）；
   * 落位走 battlegroundStore.placeToken，天然进入移动历史与放映快照（R2.4）。
   * @returns null = 沙盘记录缺失或目标未上沙盘；否则返回规划与落位结果
   */
  const executeForcedMove = useCallback(
    (
      record: CombatRecord | null,
      req: ForcedMoveRequest,
    ): ForcedMoveResult | null => {
      if (!recordId || !record) return null;
      const bg = battlegroundStore.get(recordId);
      if (!bg) return null;
      const targetToken = bg.tokens.find(t => t.combatantId === req.targetId);
      if (!targetToken) return null;

      const bounds = gridBounds(bg.size);
      const paintedSet = new Set(bg.paintedCells ?? []);
      const avoidSet = new Set(req.avoidCells ?? []);
      // 持续地形区（火堆/陷坑等）视为「明显危险的地域」：强制位移一律禁行（D&D 5e 推离规则）
      const zoneSet = new Set((bg.zones ?? []).flatMap(z => z.cells ?? []));
      // 禁行集三源合并（design.md）：边界墙 ∪ 规避区 ∪ 其他棋子占用（排除被位移者自身）
      const occupied = new Set(
        bg.tokens.filter(t => t.combatantId !== req.targetId).map(t => `${t.col},${t.row}`),
      );
      const isBlocked = (col: number, row: number): boolean => {
        const key = `${col},${row}`;
        return paintedSet.has(key) || avoidSet.has(key) || occupied.has(key) || zoneSet.has(key);
      };

      const plan = planForcedMovePath({
        start: { col: targetToken.col, row: targetToken.row },
        bearing: req.bearing,
        maxCells: req.distanceCells,
        bounds,
        isBlocked,
      });

      const finalPos: GridPos =
        plan.path.length > 0 ? plan.path[plan.path.length - 1] : { col: targetToken.col, row: targetToken.row };
      if (finalPos.col !== targetToken.col || finalPos.row !== targetToken.row) {
        battlegroundStore.placeToken(recordId, { combatantId: req.targetId, col: finalPos.col, row: finalPos.row });
      }
      return { path: plan.path, truncated: plan.truncated, finalPos };
    },
    [recordId],
  );

  return { executeForcedMove };
}
