import type { Combatant } from '@/types/combat';

interface Props {
  open: boolean;
  tiedOrder: Combatant[];
  cardRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  draggingIndex: number | null;
  onDragStart: (e: React.PointerEvent, index: number) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDragEnd: () => void;
  onChangeOrder: (next: Combatant[]) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function InitiativeTiebreakerDialog(props: Props) {
  const {
    open, tiedOrder, cardRefs, draggingIndex,
    onDragStart, onDragMove, onDragEnd, onChangeOrder,
    onConfirm, onClose,
  } = props;

  if (!open) return null;

  const initiative = tiedOrder[0]?.initiative ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">先攻平局排序</h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          有 {tiedOrder.length} 个参战者先攻值相同（先攻值：<span className="font-bold">{initiative}</span>），请上下拖动卡片决定出手顺序，从上到下为先。
        </p>
        <div
          className="mb-4 space-y-2"
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          {tiedOrder.map((c, idx) => (
            <div
              key={c.id}
              ref={(el) => { cardRefs.current[idx] = el; }}
              onPointerDown={(e) => onDragStart(e, idx)}
              className={`flex cursor-move items-center gap-3 rounded-lg border-2 p-3 transition ${
                draggingIndex === idx
                  ? 'border-blue-500 bg-blue-50 opacity-80 dark:bg-blue-900/30'
                  : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700'
              }`}
            >
              <span className="font-mono text-lg text-gray-500 dark:text-gray-300">{idx + 1}.</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
              <span className="ml-auto text-xs text-gray-500 dark:text-gray-300">
                {c.isPc ? '玩家' : '敌人'} 先攻：{c.initiative}
              </span>
            </div>
          ))}
        </div>
        <div className="mb-4 flex justify-center gap-2">
          <button
            onClick={() => {
              const arr = [...tiedOrder].reverse();
              onChangeOrder(arr);
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >↕ 反转顺序</button>
          <button
            onClick={() => {
              const arr = [...tiedOrder].sort((a, b) => a.name.localeCompare(b.name));
              onChangeOrder(arr);
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >A→Z 排序</button>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >取消</button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >确认顺序</button>
        </div>
      </div>
    </div>
  );
}
