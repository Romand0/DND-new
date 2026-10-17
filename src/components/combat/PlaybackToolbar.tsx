import { Play, PlayCircle, ArrowLeft } from 'lucide-react';

interface Props {
  mode: 'simulation' | 'playback';
  playbackStarted: boolean;
  playbackPaused: boolean;
  onModeChange: (mode: 'simulation' | 'playback') => void;
  onRestartPlayback: () => void;
  onPausePlayback: () => void;
  onResumePlayback: () => void;
  onExitPlayback: () => void;
}

export default function PlaybackToolbar(props: Props) {
  const {
    mode, playbackStarted, playbackPaused,
    onModeChange, onRestartPlayback, onPausePlayback, onResumePlayback, onExitPlayback,
  } = props;

  return (
    <>
      {/* ✅ 模式切换栏 —— 模拟模式 / 放映模式 + 从头播放按钮 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light w-fit">
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
        {/* 从头播放：放映模式下显示 */}
        {mode === 'playback' && (
          <button
            onClick={onRestartPlayback}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/30"
            title="从头开始放映（将清空所有回合记录并从第一格开始）"
          >
            <Play className="w-3 h-3" />
            从头播放
          </button>
        )}
      </div>

      {/* ✅ 右上角按钮组：暂停/恢复放映 + 退出放映（悬浮按钮，统一风格） */}
      {mode === 'playback' && (
        <div className="fixed top-20 right-6 z-40 flex flex-col gap-2 items-end">
          {/* 暂停放映 / 恢复放映：仅放映已开始时显示 */}
          {playbackStarted && (
            playbackPaused ? (
              <button
                onClick={onResumePlayback}
                className="px-3 py-2 rounded-lg bg-green-500/10 backdrop-blur border border-green-500/50 text-green-500 hover:bg-green-500/20 transition-colors text-sm flex items-center gap-1"
                title="恢复放映，回到暂停前的回合"
                type="button"
              >
                <PlayCircle className="w-4 h-4" />
                恢复放映
              </button>
            ) : (
              <button
                onClick={onPausePlayback}
                className="px-3 py-2 rounded-lg bg-amber-500/10 backdrop-blur border border-amber-500/50 text-amber-500 hover:bg-amber-500/20 transition-colors text-sm flex items-center gap-1.5"
                title="暂停放映，临时脱离回合进行全局编辑"
                type="button"
              >
                <span className="leading-none" aria-hidden="true">⏸</span>
                暂停放映
              </button>
            )
          )}
          {/* 退出放映 */}
          <button
            onClick={onExitPlayback}
            className="px-3 py-2 rounded-lg bg-card-dark/80 backdrop-blur border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/10 transition-colors flex items-center gap-1"
            title="退出放映模式"
            type="button"
          >
            <ArrowLeft className="w-4 h-4" />
            退出放映
          </button>
        </div>
      )}
    </>
  );
}
