import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { ManualMode, AdvantageReason } from '@/types/combat';

interface Props {
  /** 当前手动模式 */
  manualMode: ManualMode;
  /** 手动模式变更回调 */
  onChange: (m: ManualMode) => void;
  /** 最终检定模式（合并手动+自动后） */
  mode: 'none' | 'advantage' | 'disadvantage';
  /** 自动检测的原因列表（来自 advantageRules.resolveRollMode） */
  reasons: AdvantageReason[];
  /** 菜单展开时的额外回调（用于重置骰子等），可选 */
  onModeChange?: (m: ManualMode) => void;
}

export default function AdvDisadvToggle({ manualMode, onChange, mode, reasons, onModeChange }: Props) {
  const [showMenu, setShowMenu] = useState(false);

  const handleSelect = (m: ManualMode) => {
    onChange(m);
    onModeChange?.(m);
    setShowMenu(false);
  };

  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={() => setShowMenu(v => !v)}
        className={`p-1 rounded transition-colors ${
          showMenu || manualMode !== 'none'
            ? 'bg-primary/20 text-primary'
            : 'dark:text-text-dark-muted light:text-text-light-muted hover:bg-white/10'
        }`}
        title="手动决定优/劣势"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {manualMode !== 'none' && (
        <span className="text-xs text-primary">
          {manualMode === 'advantage' ? '优势（取高）' : '劣势（取低）'}
        </span>
      )}
      {showMenu && (
        <div className="absolute right-0 top-9 z-10 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light shadow-xl py-1 w-28">
          {(['none', 'advantage', 'disadvantage'] as const).map(m => (
            <button
              key={m}
              onClick={() => handleSelect(m)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 ${
                manualMode === m
                  ? 'text-primary font-medium'
                  : 'dark:text-text-dark light:text-text-light'
              }`}
            >
              {m === 'none' ? '正常' : m === 'advantage' ? '优势' : '劣势'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
