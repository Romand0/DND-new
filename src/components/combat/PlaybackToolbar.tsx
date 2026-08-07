import { SkipForward, Pause } from 'lucide-react';

interface Props {
  mode: 'simulation' | 'playback';
  playbackStarted: boolean;
  currentTurnText: string;
  onModeChange: (mode: 'simulation' | 'playback') => void;
  onConfirmEndTurn: () => void;
  onExitPlayback: () => void;
}

export default function PlaybackToolbar(props: Props) {
  const {
    mode, playbackStarted, currentTurnText,
    onModeChange, onConfirmEndTurn, onExitPlayback,
  } = props;

  return (
    <>
      {/* 模式切换栏 —— 模拟模式 / 放映模式 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light">
        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">
          战斗模式
        </span>
        <div className="flex rounded-lg border dark:border-border-dark light:border-border-light overflow-hidden">
          <button
            onClick={() => onModeChange('simulation')}
            disabled={playbackStarted}
            className={`px-3 py-1.5 text-xs transition-colors ${
              mode === 'simulation'
                ? 'bg-primary text-white'
                : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            模拟模式
          </button>
          <button
            onClick={() => onModeChange('playback')}
            className={`px-3 py-1.5 text-xs transition-colors ${
              mode === 'playback'
                ? 'bg-primary text-white'
                : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
            }`}
          >
            放映模式
          </button>
        </div>
        {mode === 'playback' && (
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
            {currentTurnText}
          </span>
        )}
      </div>

      {/* 完成回合悬浮按钮 —— 放映模式已开始时显示 */}
      {mode === 'playback' && playbackStarted && (
        <button
          onClick={onConfirmEndTurn}
          className="fixed bottom-6 right-6 z-40 px-5 py-3 rounded-full bg-primary text-white font-medium shadow-2xl hover:bg-primary/90 transition-all hover:scale-105 flex items-center gap-2"
          title="完成当前回合，进入下一个"
        >
          <SkipForward className="w-5 h-5" />
          <span>完成回合</span>
        </button>
      )}

      {/* 退出放映按钮 —— 浮动在右上角（仅放映模式显示） */}
      {mode === 'playback' && (
        <button
          onClick={onExitPlayback}
          className="fixed top-20 right-6 z-40 px-3 py-2 rounded-lg bg-card-dark/80 backdrop-blur border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/10 transition-colors flex items-center gap-1"
          title="退出放映模式"
          type="button"
        >
          <Pause className="w-4 h-4" />
          退出放映
        </button>
      )}
    </>
  );
}
