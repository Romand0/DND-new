import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  /** 骰模板提示（'2d6'）：显示给玩家作为线下掷骰格式 */
  diceText: string;
  /** 附加上下文说明（朝向/范围等） */
  hint?: string;
  /** 合法点数区间（NdM → [n, n*m]）；diceText 无骰式时为 null 不校验 */
  min?: number;
  max?: number;
  confirmLabel?: string;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

/** 通用线下骰填值弹窗：按骰模板提示玩家线下掷骰并填入结果（引擎零暗骰口径）。
 *  与 HealRollModal/CombatDamageModal「输入各骰结果」同惯例；确认回调由宿主扣资源。 */
export default function DiceInputModal({ title, diceText, hint, min, max, confirmLabel = '确认', onConfirm, onClose }: Props) {
  const [value, setValue] = useState('');
  const parsed = parseInt(value, 10);
  const hasRange = min != null && max != null && max >= min;
  const valid = value !== '' && !isNaN(parsed) && (!hasRange || (parsed >= min! && parsed <= max!));

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="rounded-xl w-full max-w-xs p-4 space-y-3 dark:bg-bg-dark-2 light:bg-bg-light" onClick={(e) => e.stopPropagation()} data-testid="dice-input-modal">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium dark:text-text-dark light:text-text-light">{title}</span>
          <button onClick={onClose} className="ml-auto p-1 rounded dark:hover:bg-bg-dark light:hover:bg-bg-light-3 dark:text-text-dark-muted light:text-text-light-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="text-xs leading-5 dark:text-text-dark-muted light:text-text-light-muted">
          请线下掷 {diceText}，填入点数合计{hasRange ? `（${min}~${max}）` : ''}
          {hint ? <div className="mt-1">{hint}</div> : null}
        </div>
        <input
          type="number"
          autoFocus
          data-testid="dice-input-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid) onConfirm(parsed); }}
          placeholder={`掷 ${diceText} 的点数合计`}
          className="w-full px-3 py-2 text-sm rounded-lg border dark:bg-bg-dark dark:border-border-dark dark:text-text-dark light:bg-bg-light-2 light:border-border-light light:text-text-light focus:outline-none focus:border-primary"
        />
        <button
          onClick={() => valid && onConfirm(parsed)}
          disabled={!valid}
          className="w-full py-2 text-sm rounded-lg bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
