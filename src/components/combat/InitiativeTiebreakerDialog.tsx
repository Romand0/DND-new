import { GripVertical, X } from 'lucide-react';
import type { Combatant } from '@/types/combat';
import { characterStore } from '@/data/characterStore';

interface Props {
  open: boolean;
  tiedOrder: Combatant[];
  cardRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  draggingIndex: number | null;
  onDragStart: (e: React.PointerEvent, index: number) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function InitiativeTiebreakerDialog(props: Props) {
  const {
    open, tiedOrder, cardRefs, draggingIndex,
    onDragStart, onDragMove, onDragEnd, onConfirm, onClose,
  } = props;

  if (!open) return null;

  const initiative = tiedOrder[0]?.initiative ?? '-';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">先攻平局</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-4">
          以下参战者先攻相同（{initiative}），长按拖动调整行动顺序
        </p>
        <div
          className="space-y-2 max-h-[60vh] overflow-y-auto touch-none select-none"
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          {tiedOrder.map((c, index) => {
            const pc = c.characterId ? characterStore.get(c.characterId) : null;
            const race = pc?.race;
            const cls = pc?.class;
            return (
              <div
                key={c.id}
                ref={(el) => { cardRefs.current[index] = el; }}
                onPointerDown={(e) => onDragStart(e, index)}
                className={`flex items-center gap-2 p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-shadow ${
                  draggingIndex === index
                    ? 'border-primary shadow-lg scale-[1.02] opacity-90'
                    : 'dark:border-border-dark light:border-border-light'
                } dark:bg-bg-dark light:bg-bg-light-2`}
                style={{ touchAction: 'none' }}
              >
                <GripVertical className="w-4 h-4 opacity-40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate dark:text-text-dark light:text-text-light">
                    {c.name}
                  </div>
                  <div className="text-xs opacity-60 truncate">
                    {c.isPc
                      ? [race, cls].filter(Boolean).join(' · ') || '玩家角色'
                      : 'NPC'}
                  </div>
                </div>
                <div className="text-xs font-bold text-primary shrink-0">#{index + 1}</div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
          >
            确认顺序
          </button>
        </div>
      </div>
    </div>
  );
}
