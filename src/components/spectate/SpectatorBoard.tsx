// 玩家观战棋盘：渲染 DM 广播的沙盘投影（棋子/物品/墙体/地形区域）
// 自己的参战者棋子可拖拽声明移动（仅生成 move op，DM 端审核/落库后经 delta 回显）
// 无长按/双指缩放链（DM 端 Battleground 的复杂触摸交互在玩家端刻意省略）；格子三档缩放
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ZoomIn, ZoomOut, Package } from 'lucide-react';
import { GRID_PRESETS } from '@/types/battleground';
import type { BoardProjection, CombatRosterEntry } from '@/types/realtime';

const CELL_SIZES = [14, 18, 24];

interface DragState {
  combatantId: string;
  /** 指针相对棋子左上角的偏移（px，棋盘坐标系） */
  dx: number;
  dy: number;
  /** 指针当前位置（px，棋盘坐标系） */
  x: number;
  y: number;
}

export default function SpectatorBoard({
  board,
  roster,
  currentCombatantId,
  movableIds,
  onMoveToken,
}: {
  board: BoardProjection;
  roster: CombatRosterEntry[];
  currentCombatantId: string | null;
  /** 可拖拽的参战者 ID（玩家自己的 PC）；空/缺省 = 全只读 */
  movableIds?: string[];
  onMoveToken?: (combatantId: string, to: { col: number; row: number }) => void;
}) {
  const [cellIdx, setCellIdx] = useState(1);
  const cell = CELL_SIZES[cellIdx];
  const preset = GRID_PRESETS[board.size];
  const width = preset.cols * cell;
  const height = preset.rows * cell;
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const movableSet = new Set(movableIds ?? []);
  const canDrag = movableSet.size > 0 && !!onMoveToken;

  const byId = new Map(roster.map((r) => [r.id, r]));
  const paintedSet = new Set(board.painted);

  // 同格多区域：DM 侧第一层填色、第二层 2px 内描边
  const zoneCellMap = new Map<string, typeof board.zones>();
  for (const z of board.zones) {
    for (const key of z.cells) {
      const arr = zoneCellMap.get(key) ?? [];
      arr.push(z);
      zoneCellMap.set(key, arr);
    }
  }

  return (
    <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold dark:text-text-dark light:text-text-light">沙盘</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCellIdx((i) => Math.max(0, i - 1))}
            disabled={cellIdx === 0}
            className="p-1.5 rounded-lg border dark:border-border-dark light:border-border-light disabled:opacity-30"
          >
            <ZoomOut className="w-4 h-4 dark:text-text-dark light:text-text-light" />
          </button>
          <button
            onClick={() => setCellIdx((i) => Math.min(CELL_SIZES.length - 1, i + 1))}
            disabled={cellIdx === CELL_SIZES.length - 1}
            className="p-1.5 rounded-lg border dark:border-border-dark light:border-border-light disabled:opacity-30"
          >
            <ZoomIn className="w-4 h-4 dark:text-text-dark light:text-text-light" />
          </button>
        </div>
      </div>

      <div className="overflow-auto max-h-[60vh] rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light-2">
        <div ref={boardRef} className="relative shrink-0" style={{ width, height }}>
          {/* 网格线：双层 overlay 随主题切换（对齐 DM 格线色 border-dark/40 / border-light/40） */}
          <div
            className="absolute inset-0 pointer-events-none hidden dark:block"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(42,42,74,0.55) 1px, transparent 1px), linear-gradient(to bottom, rgba(42,42,74,0.55) 1px, transparent 1px)',
              backgroundSize: `${cell}px ${cell}px`,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none block dark:hidden"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(212,197,184,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(212,197,184,0.5) 1px, transparent 1px)',
              backgroundSize: `${cell}px ${cell}px`,
            }}
          />

          {/* 边界墙（DM 涂白格子） */}
          {[...paintedSet].map((key) => {
            const [c, r] = key.split(',').map(Number);
            return (
              <div
                key={key}
                className="absolute bg-white dark:bg-white/90"
                style={{ left: c * cell, top: r * cell, width: cell, height: cell }}
              />
            );
          })}

          {/* 地形区域：第一层填色 + 第二层内描边 */}
          {[...zoneCellMap.entries()].map(([key, zones]) => {
            const [c, r] = key.split(',').map(Number);
            return (
              <div
                key={key}
                title={zones.map((z) => z.label).filter(Boolean).join(' / ')}
                className="absolute pointer-events-none"
                style={{
                  left: c * cell,
                  top: r * cell,
                  width: cell,
                  height: cell,
                  background: zones[0].color,
                  boxShadow: zones.length > 1 ? `inset 0 0 0 2px ${zones[1].color}` : undefined,
                }}
              />
            );
          })}

          {/* 掉落物品：琥珀圆角方块 + 白色包裹图标（对齐 DM token） */}
          {board.items.map((it) => (
            <div
              key={it.id}
              title={it.name}
              className="absolute rounded-lg flex items-center justify-center bg-amber-600/80"
              style={{ left: it.col * cell + 4, top: it.row * cell + 4, width: cell - 8, height: cell - 8 }}
            >
              <Package style={{ width: Math.max(8, cell * 0.45), height: Math.max(8, cell * 0.45) }} className="text-white" />
            </div>
          ))}

          {/* 拖拽落点预览格 */}
          {drag && (() => {
            const col = Math.min(preset.cols - 1, Math.max(0, Math.round((drag.x - drag.dx - 3) / cell)));
            const row = Math.min(preset.rows - 1, Math.max(0, Math.round((drag.y - drag.dy - 3) / cell)));
            return (
              <div
                className="absolute bg-green-400/40 border-2 border-green-500 pointer-events-none z-20"
                style={{ left: col * cell, top: row * cell, width: cell, height: cell }}
              />
            );
          })()}

          {/* 参战者棋子：圆形首字，状态样式与 DM 侧一致；自己的 PC 可拖拽声明移动 */}
          {board.tokens.map((t) => {
            const r = byId.get(t.combatantId);
            if (!r) return null;
            const isCurrent = currentCombatantId === t.combatantId;
            const droppable = canDrag && movableSet.has(t.combatantId) && !r.dead && !r.downed;
            const dragging = drag?.combatantId === t.combatantId;
            const restLeft = t.col * cell + 3;
            const restTop = t.row * cell + 3;
            const dragLeft = dragging && drag ? drag.x - drag.dx : restLeft;
            const dragTop = dragging && drag ? drag.y - drag.dy : restTop;
            const grab = (e: ReactPointerEvent<HTMLDivElement>) => {
              const rect = boardRef.current?.getBoundingClientRect();
              if (!rect) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({
                combatantId: t.combatantId,
                dx: e.clientX - rect.left - restLeft,
                dy: e.clientY - rect.top - restTop,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            };
            const track = (e: ReactPointerEvent<HTMLDivElement>) => {
              if (!drag || drag.combatantId !== t.combatantId) return;
              const rect = boardRef.current?.getBoundingClientRect();
              if (!rect) return;
              setDrag({ ...drag, x: e.clientX - rect.left, y: e.clientY - rect.top });
            };
            const drop = () => {
              if (!drag || drag.combatantId !== t.combatantId) return;
              const col = Math.min(preset.cols - 1, Math.max(0, Math.round((drag.x - drag.dx - 3) / cell)));
              const row = Math.min(preset.rows - 1, Math.max(0, Math.round((drag.y - drag.dy - 3) / cell)));
              setDrag(null);
              if ((col !== t.col || row !== t.row) && onMoveToken) {
                onMoveToken(t.combatantId, { col, row });
              }
            };
            return (
              <div
                key={t.combatantId}
                title={`${r.name}（HP ${r.hp}/${r.maxHp}）`}
                className={`absolute rounded-full flex items-center justify-center font-bold text-white leading-none transition-all select-none z-10 ${
                  r.dead || r.downed ? 'bg-gray-500' : r.isPc ? 'bg-info' : 'bg-danger'
                } ${r.dead || r.downed ? 'opacity-60' : ''} ${
                  r.incapacitated ? 'opacity-50 ring-2 ring-purple-400' : ''
                } ${isCurrent ? 'ring-4 ring-yellow-300 animate-pulse scale-110 shadow-lg shadow-yellow-400/50' : ''} ${
                  droppable ? 'cursor-grab active:cursor-grabbing' : ''
                } ${dragging ? 'scale-110 shadow-xl' : ''}`}
                style={{
                  left: dragLeft,
                  top: dragTop,
                  width: cell - 6,
                  height: cell - 6,
                  fontSize: cell > 22 ? 11 : 9,
                  touchAction: 'none',
                }}
                onPointerDown={droppable ? grab : undefined}
                onPointerMove={droppable ? track : undefined}
                onPointerUp={droppable ? drop : undefined}
                onPointerCancel={droppable ? () => setDrag(null) : undefined}
              >
                {r.name.slice(0, 1)}
                {/* 死亡：红叉叠加 */}
                {r.dead && (
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 100 100"
                    style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))' }}
                  >
                    <line x1="15" y1="15" x2="85" y2="85" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" />
                    <line x1="85" y1="15" x2="15" y2="85" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs dark:text-text-dark-muted light:text-text-light-muted flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-info inline-block" />玩家角色</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-danger inline-block" />NPC</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-600/80 inline-block" />掉落物</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" />昏迷/死亡</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-neutral-400 ring-2 ring-yellow-300 inline-block" />当前行动</span>
      </div>
    </div>
  );
}
