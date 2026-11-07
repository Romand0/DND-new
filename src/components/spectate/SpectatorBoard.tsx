// 玩家观战棋盘：只读渲染 DM 广播的沙盘投影（棋子/物品/墙体/地形区域）
// 无交互编辑；格子大小三档缩放；网格线用 linear-gradient 绘制避免上千个 DOM 格子
import { useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { GRID_PRESETS } from '@/types/battleground';
import type { BoardProjection, CombatRosterEntry } from '@/types/realtime';

const CELL_SIZES = [14, 18, 24];

export default function SpectatorBoard({
  board,
  roster,
  currentCombatantId,
}: {
  board: BoardProjection;
  roster: CombatRosterEntry[];
  currentCombatantId: string | null;
}) {
  const [cellIdx, setCellIdx] = useState(1);
  const cell = CELL_SIZES[cellIdx];
  const preset = GRID_PRESETS[board.size];
  const width = preset.cols * cell;
  const height = preset.rows * cell;

  const byId = new Map(roster.map((r) => [r.id, r]));
  const paintedSet = new Set(board.painted);

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

      <div className="overflow-auto max-h-[60vh] rounded-lg">
        <div
          className="relative shrink-0"
          style={{
            width,
            height,
            backgroundImage:
              'linear-gradient(to right, rgba(128,128,128,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,0.25) 1px, transparent 1px)',
            backgroundSize: `${cell}px ${cell}px`,
          }}
        >
          {/* 边界墙（涂白格子） */}
          {[...paintedSet].map((key) => {
            const [c, r] = key.split(',').map(Number);
            return (
              <div
                key={key}
                className="absolute bg-neutral-500/40"
                style={{ left: c * cell, top: r * cell, width: cell, height: cell }}
              />
            );
          })}

          {/* 地形区域 */}
          {board.zones.map((z) =>
            z.cells.map((key) => {
              const [c, r] = key.split(',').map(Number);
              return (
                <div
                  key={`${z.id}-${key}`}
                  title={z.label}
                  className="absolute"
                  style={{ left: c * cell, top: r * cell, width: cell, height: cell, background: z.color }}
                />
              );
            }),
          )}

          {/* 掉落物品 */}
          {board.items.map((it) => (
            <div
              key={it.id}
              title={it.name}
              className="absolute rounded-sm bg-amber-500/80 border border-amber-300"
              style={{ left: it.col * cell + cell * 0.25, top: it.row * cell + cell * 0.25, width: cell * 0.5, height: cell * 0.5 }}
            />
          ))}

          {/* 参战者棋子 */}
          {board.tokens.map((t) => {
            const r = byId.get(t.combatantId);
            if (!r) return null;
            const isCurrent = currentCombatantId === t.combatantId;
            const label = r.name.slice(0, 2);
            return (
              <div
                key={t.combatantId}
                title={`${r.name}（HP ${r.hp}/${r.maxHp}）`}
                className={`absolute rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                  r.dead
                    ? 'bg-neutral-700 text-neutral-400'
                    : r.isPc
                      ? 'bg-sky-500 text-white'
                      : 'bg-rose-500 text-white'
                } ${r.downed ? 'opacity-60' : ''} ${isCurrent ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-transparent' : ''}`}
                style={{
                  left: t.col * cell + cell * 0.08,
                  top: t.row * cell + cell * 0.08,
                  width: cell * 0.84,
                  height: cell * 0.84,
                  fontSize: Math.max(8, cell * 0.4),
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs dark:text-text-dark-muted light:text-text-light-muted flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />玩家角色</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />NPC</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />掉落物</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-amber-400 bg-neutral-400 inline-block" />当前行动</span>
      </div>
    </div>
  );
}
