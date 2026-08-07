import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  round: number;
  combatantName: string;
  onRewind: () => void;
  onClose: () => void;
}

export default function RewindDialog(props: Props) {
  const { open, round, combatantName, onRewind, onClose } = props;
  const [firstClickDone, setFirstClickDone] = useState(false);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-xl p-5 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">回溯回合</h3>
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
              第 {round + 1} 轮 · {combatantName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-4">
          <div className="text-sm font-semibold text-amber-500 mb-1">⚠️ 此操作具有破坏性</div>
          <ul className="text-xs text-amber-400/90 space-y-1 list-disc pl-4">
            <li>当前回合格以及之后所有先攻表格格子的内容将被清空</li>
            <li>所有参战者的生命值、昏迷/死亡状态将还原到此回合开始时的快照</li>
            <li>战斗沙盘上所有棋子的位置将被还原</li>
            <li>后续自动新增的轮次也将一并删除</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          {!firstClickDone ? (
            <button
              type="button"
              onClick={() => setFirstClickDone(true)}
              className="w-full px-4 py-3 rounded-lg text-white text-sm font-medium transition-all bg-danger hover:bg-danger/90"
            >
              我已了解，请继续（再次点击确认回溯）
            </button>
          ) : (
            <button
              type="button"
              onClick={onRewind}
              className="w-full px-4 py-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-all ring-2 ring-amber-400 animate-pulse"
            >
              🔴 再次点击以确认回溯到此回合
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
