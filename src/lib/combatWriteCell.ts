// 先攻表格「写回格」解析与单条记录撤销：
// - 手动记录可显式指定 DM 点选的历史格，未指定或越界时回退到当前回合/攻击者列
// - 撤销仅回退该条记录本身（播放格文本/DM 明细或模拟日志），不回退 HP
// 全部为纯函数，便于探针验证。
import type { CombatRecord, OperationLogEntry, RoundAction } from '@/types/combat';

export type WriteCell = { round: number; combatantId: string };

export type RecordUndoEntry =
  | { kind: 'playback'; recordId: string; round: number; combatantId: string; prevCell: string; prevDmCell: string }
  | { kind: 'log'; recordId: string; logId: string };

/**
 * 选择记录写入的先攻表格格。
 * @param override DM 点选的格（round<0 表示仅选主体未选回合，如模拟模式主体选择器）
 * @param fallback 未指定时的回退格（当前回合或最后一轮）
 * @param roundCount 当前已存在的轮次数量
 */
export function resolveRecordWriteCell(
  override: WriteCell | null | undefined,
  fallback: WriteCell | null,
  roundCount: number,
): WriteCell | null {
  if (override && override.round >= 0 && override.round < roundCount) return override;
  return fallback;
}

/** 播放模式写入前：捕获目标格当前文本（含 DM 明细平行格） */
export function buildPlaybackUndoEntry(
  recordId: string,
  cell: WriteCell,
  latest: CombatRecord | null,
): RecordUndoEntry {
  return {
    kind: 'playback',
    recordId,
    round: cell.round,
    combatantId: cell.combatantId,
    prevCell: latest?.rounds?.[cell.round]?.[cell.combatantId] ?? '',
    prevDmCell: latest?.roundsDm?.[cell.round]?.[cell.combatantId] ?? '',
  };
}

/** 播放模式撤销：还原目标格文本（rounds + roundsDm 平行稀疏） */
export function applyPlaybackUndo(
  latest: CombatRecord,
  entry: Extract<RecordUndoEntry, { kind: 'playback' }>,
): { rounds: RoundAction[]; roundsDm: RoundAction[] } {
  const rounds = [...latest.rounds];
  rounds[entry.round] = { ...rounds[entry.round], [entry.combatantId]: entry.prevCell };
  const dm = [...(latest.roundsDm ?? [])];
  if (dm[entry.round]) {
    dm[entry.round] = { ...dm[entry.round], [entry.combatantId]: entry.prevDmCell };
  }
  return { rounds, roundsDm: dm };
}

/** 日志模式撤销：移除指定日志条目（按 id 幂等） */
export function applyLogUndo(
  latest: CombatRecord,
  logId: string,
): OperationLogEntry[] {
  return (latest.operationLog ?? []).filter(l => l.id !== logId);
}
