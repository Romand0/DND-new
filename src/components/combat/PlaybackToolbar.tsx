interface Props {
  playbackStarted: boolean;
  onStartPlayback: () => void;
  onConfirmEndTurn: () => void;
  currentTurnText: string;
  onExitPlayback: () => void;
  onRewind: () => void;
  onOpenManual: () => void;
}

export default function PlaybackToolbar(props: Props) {
  const {
    playbackStarted, onStartPlayback, onConfirmEndTurn,
    currentTurnText, onExitPlayback, onRewind, onOpenManual,
  } = props;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40">
      <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">🎬 放映模式</span>
      {!playbackStarted ? (
        <button
          onClick={onStartPlayback}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700"
        >▶️ 开始放映</button>
      ) : (
        <>
          <span className="text-sm font-medium text-indigo-800 dark:text-indigo-100">
            当前回合：{currentTurnText}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={onOpenManual}
              className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-gray-800 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
            >✍️ 手动记录</button>
            <button
              onClick={onRewind}
              className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-sm text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-gray-800 dark:text-orange-200 dark:hover:bg-orange-900/30"
            >⏪ 回滚回合</button>
            <button
              onClick={onConfirmEndTurn}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700"
            >➡️ 结束回合</button>
          </div>
        </>
      )}
      <button
        onClick={onExitPlayback}
        className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >退出放映</button>
    </div>
  );
}
