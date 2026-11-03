import { useMemo, useState } from 'react';
import type { Combatant } from '@/types/combat';
import type { Bearing, GridPos } from '@/data/battleGeometry';
import { bearing8, bearingDelta, oppositeBearing, BEARING_LABELS } from '@/data/battleGeometry';
import type { ForcedMoveRequest } from '@/hooks/combat/useForcedMove';
import { useNumberInput } from '@/hooks/useInput';

interface Props {
  target: Combatant;
  /** 可选参照棋子（含目标自身以外的全部参战者） */
  candidates: Combatant[];
  combatantPositions: Record<string, GridPos | null | undefined>;
  defaultOriginId: string | null;
  onConfirm: (req: ForcedMoveRequest) => void;
  onClose: () => void;
}

/** mini 规避格点选网格半径：以目标为中心的局部窗口 */
const MINI_RADIUS = 3;

export default function ForcedMoveDialog({ target, candidates, combatantPositions, defaultOriginId, onConfirm, onClose }: Props) {
  const [originId, setOriginId] = useState<string>(defaultOriginId || candidates[0]?.id || '');
  const [directionMode, setDirectionMode] = useState<'away' | 'toward'>('away');
  const [avoidCells, setAvoidCells] = useState<Set<string>>(new Set());
  const distanceInput = useNumberInput(1, { fallback: 1 });

  const targetPos = combatantPositions[target.id] ?? null;
  const originPos = combatantPositions[originId] ?? null;

  // 方位裁决：目标相对参照 → 远离取反扇区（R1.3/R1.4）
  const relativeBearing: Bearing = targetPos && originPos ? bearing8(originPos, targetPos) : 'same';
  const moveBearing: Bearing = directionMode === 'away' ? oppositeBearing(relativeBearing) : relativeBearing;
  const sameCell = relativeBearing === 'same';
  const incapacitated = target.isUnconscious || target.isDead || target.isIncapacitated;
  const distance = distanceInput.value ?? 0;
  const canConfirm = !!targetPos && !sameCell && !incapacitated && distance >= 1;

  const moveDelta = bearingDelta(moveBearing);

  const handleToggleAvoid = (col: number, row: number) => {
    const key = `${col},${row}`;
    setAvoidCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const miniCells = useMemo(() => {
    if (!targetPos) return [];
    const cells: { col: number; row: number }[] = [];
    for (let dc = -MINI_RADIUS; dc <= MINI_RADIUS; dc++) {
      for (let dr = -MINI_RADIUS; dr <= MINI_RADIUS; dr++) {
        cells.push({ col: targetPos.col + dc, row: targetPos.row + dr });
      }
    }
    return cells;
  }, [targetPos]);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      targetId: target.id,
      bearing: moveBearing,
      distanceCells: distance,
      avoidCells: [...avoidCells],
      originId,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-bg-dark rounded-lg border dark:border-border-dark light:border-border-light w-full max-w-md relative flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b dark:border-border-dark light:border-border-light flex items-center justify-between shrink-0">
          <span className="text-sm font-medium dark:text-text-dark light:text-text-light">
            强制位移：{target.name}
          </span>
          <button onClick={onClose} className="p-1 rounded hover:bg-danger/10 text-danger transition-colors" title="关闭">
            <span className="text-sm">✕</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {incapacitated && (
            <div className="rounded bg-danger/10 p-2 text-xs text-danger">
              目标处于{target.isDead ? '死亡' : target.isUnconscious ? '昏迷' : '失能'}状态，无法强制位移
            </div>
          )}

          <div>
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">参照棋子（方位基准）</div>
            <select
              value={originId}
              onChange={(e) => setOriginId(e.target.value)}
              className="w-full text-sm rounded border px-2 py-1.5 bg-transparent dark:bg-bg-dark-2 dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
            >
              {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">方向裁决</div>
            <div className="flex gap-2">
              <button
                onClick={() => setDirectionMode('away')}
                className={`flex-1 py-1.5 text-xs rounded transition-colors ${directionMode === 'away' ? 'bg-primary/20 text-primary' : 'dark:bg-bg-dark-2 light:bg-gray-100 dark:text-text-dark light:text-text-light'}`}
              >远离参照</button>
              <button
                onClick={() => setDirectionMode('toward')}
                className={`flex-1 py-1.5 text-xs rounded transition-colors ${directionMode === 'toward' ? 'bg-primary/20 text-primary' : 'dark:bg-bg-dark-2 light:bg-gray-100 dark:text-text-dark light:text-text-light'}`}
              >朝向参照</button>
            </div>
          </div>

          <div>
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">位移距离（格，1 格 = 5 尺）</div>
            <input
              type="number"
              value={distanceInput.text}
              onChange={(e) => distanceInput.onChange(e.target.value)}
              onBlur={distanceInput.onBlur}
              className="w-full text-sm rounded border px-2 py-1.5 bg-transparent dark:bg-bg-dark-2 dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
            />
          </div>

          <div className="rounded bg-primary/5 p-2 text-xs dark:text-text-dark light:text-text-light">
            {sameCell || !targetPos || !originPos ? (
              <span className="text-warning">参照与目标同格或未上沙盘，方向无定义</span>
            ) : (
              <span>
                目标位于参照<span className="font-medium">{BEARING_LABELS[relativeBearing]}</span>方，
                将向<span className="font-medium">{BEARING_LABELS[moveBearing]}</span>
                方向{directionMode === 'away' ? '推离' : '推近'}至多 {distance} 格
                （每步约 ({moveDelta.dc >= 0 ? '+' : ''}{moveDelta.dc}, {moveDelta.dr >= 0 ? '+' : ''}{moveDelta.dr})），
                途中自动绕开禁行格并保持方向不变
              </span>
            )}
          </div>

          <div>
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">
              本次规避格（点选加入/移出；边界墙与棋子占用格自动禁行，无需点选）
            </div>
            <div className="inline-block">
              {miniCells.length > 0 && (
                <div className="grid" style={{ gridTemplateColumns: `repeat(${MINI_RADIUS * 2 + 1}, 1.25rem)` }}>
                  {miniCells.map(({ col, row }) => {
                    const isTarget = col === targetPos?.col && row === targetPos?.row;
                    const key = `${col},${row}`;
                    const isAvoid = avoidCells.has(key);
                    return (
                      <button
                        key={key}
                        onClick={() => handleToggleAvoid(col, row)}
                        title={`${col},${row}`}
                        className={`w-5 h-5 border text-[9px] leading-none transition-colors ${
                          isTarget
                            ? 'bg-primary/40 border-primary dark:text-text-dark light:text-text-light'
                            : isAvoid
                              ? 'bg-danger/40 border-danger'
                              : 'border-gray-300 dark:border-border-dark light:border-border-light hover:bg-primary/10'
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mt-1">
              中心高亮格 = 目标当前位置
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-3 border-t dark:border-border-dark light:border-border-light shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 text-xs rounded dark:bg-bg-dark-2 light:bg-gray-100 dark:text-text-dark light:text-text-light"
          >取消</button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`flex-1 py-1.5 text-xs rounded transition-colors ${canConfirm ? 'bg-primary text-white hover:bg-primary/90' : 'bg-gray-300 dark:bg-bg-dark-2 dark:text-text-dark-muted light:text-text-light-muted cursor-not-allowed'}`}
          >确认位移</button>
        </div>
      </div>
    </div>
  );
}
