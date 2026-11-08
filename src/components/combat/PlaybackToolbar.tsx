import { Play } from 'lucide-react';

interface Props {
  mode: 'simulation' | 'playback';
  playbackStarted: boolean;
  onModeChange: (mode: 'simulation' | 'playback') => void;
  onRestartPlayback: () => void;
}

// 战斗模式切换栏：模拟/放映切换 + 从头播放。
// 放映中点「模拟模式」走 handleModeChange 的退出确认弹窗（保存/丢弃），
// 暂停/恢复与放映状态承载在主列的放映状态卡片，此处不再挂悬浮按钮。
export default function PlaybackToolbar(props: Props) {
  const { mode, playbackStarted, onModeChange, onRestartPlayback } = props;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light w-fit">
      <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">
        战斗模式
      </span>
      <div className="flex rounded-lg border dark:border-border-dark light:border-border-light overflow-hidden">
        <button
          onClick={() => onModeChange('simulation')}
          className={`px-3 py-1.5 text-xs transition-colors ${
            mode === 'simulation'
              ? 'bg-primary text-white'
              : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
          }`}
          title={mode === 'playback' ? '退出放映并切回模拟模式（将弹出保存/丢弃确认）' : undefined}
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
  );
}
