import { RotateCcw, SkipForward } from 'lucide-react';

// 战斗资源悬浮面板（左下角仿显示屏）：动作 / 附赠动作 / 移动力。
// DM 端读本地战斗记录，玩家端读观战投影——两边共用同一视觉与语义，避免各写一套。
interface Props {
  /** 剩余动作数（active 为 false 时显示 ∞） */
  actions: number;
  /** 剩余附赠动作数（active 为 false 时显示 ∞） */
  bonusActions: number;
  /** 剩余移动力（尺）；null = 不追踪（速度 0） */
  remainingMovement: number | null;
  /** 本回合总移动力（尺） */
  totalSpeed: number;
  /** 资源是否生效（放映进行中 / 资源消耗模式）；false 时动作显示 ∞、移动力显示总量 */
  active: boolean;
  /** 显示「完成回合」按钮（DM 放映模式） */
  showEndTurn?: boolean;
  onEndTurn?: () => void;
  /** 显示「恢复」按钮（资源消耗模式手动重置动作/移动力） */
  showRestore?: boolean;
  onRestore?: () => void;
}

export default function CombatResourceHud({
  actions,
  bonusActions,
  remainingMovement,
  totalSpeed,
  active,
  showEndTurn = false,
  onEndTurn,
  showRestore = false,
  onRestore,
}: Props) {
  const actionText = active ? `${Math.max(0, actions)}` : '∞';
  const bonusText = active ? `${Math.max(0, bonusActions)}` : '∞';
  const moveText = totalSpeed > 0 ? (active ? `${remainingMovement ?? 0}/${totalSpeed}` : `${totalSpeed}`) : '—';
  const labelCls = (isZero: boolean) => (active ? (isZero ? 'text-red-400' : 'text-white') : 'text-indigo-300/60');

  return (
    <div className="fixed bottom-6 left-6 z-30 flex items-center gap-3 px-4 py-3 rounded-lg backdrop-blur shadow-lg border border-indigo-400/20 bg-indigo-950/90 font-mono max-w-[calc(100vw-3rem)]">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-indigo-300/50 tracking-wider">ACT</span>
        <span className={`text-sm font-bold ${labelCls(actions <= 0)}`}>{actionText}</span>
      </div>
      <span className="text-indigo-400/30">|</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-indigo-300/50 tracking-wider">BON</span>
        <span className={`text-sm font-bold ${labelCls(bonusActions <= 0)}`}>{bonusText}</span>
      </div>
      <span className="text-indigo-400/30">|</span>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-indigo-300/50 tracking-wider">MOV</span>
        <span className={`text-sm font-bold ${labelCls((remainingMovement ?? 0) <= 0)}`}>{moveText}</span>
        <span className="text-[10px] text-indigo-300/50">ft</span>
      </div>
      {showRestore && (
        <>
          <span className="text-indigo-400/30">|</span>
          <button
            onClick={onRestore}
            className="px-2.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors flex items-center gap-1 whitespace-nowrap"
            title="恢复该人偶的动作/附赠动作/移动力（资源消耗模式无回合推进，需手动重置）"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            恢复
          </button>
        </>
      )}
      {showEndTurn && (
        <>
          <span className="text-indigo-400/30">|</span>
          <button
            onClick={onEndTurn}
            className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors flex items-center gap-1 whitespace-nowrap"
            title="完成当前回合，进入下一个"
          >
            <SkipForward className="w-3.5 h-3.5" />
            完成回合
          </button>
        </>
      )}
    </div>
  );
}
