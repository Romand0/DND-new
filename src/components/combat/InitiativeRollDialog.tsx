import { X } from 'lucide-react';
import type { Character } from '@/types/character';

interface Props {
  open: boolean;
  selectedPc: Character | null;
  d20Input: string;
  onD20Change: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function InitiativeRollDialog(props: Props) {
  const { open, selectedPc, d20Input, onD20Change, onConfirm, onClose } = props;

  if (!open || !selectedPc) return null;

  const dexMod = selectedPc.abilities?.dexterity?.modifier ?? 0;
  const d20Value = parseInt(d20Input, 10);
  const total = isNaN(d20Value) ? null : d20Value + dexMod;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">先攻投掷</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium dark:text-text-dark light:text-text-light mb-1">
              {selectedPc.name}
            </div>
            <div className="text-xs opacity-60">
              敏捷调整值：
              <span className="text-primary font-bold ml-1">
                {dexMod >= 0 ? `+${dexMod}` : dexMod}
              </span>
            </div>
          </div>
          <div>
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5 block">
              输入 d20 结果（1-20）
            </label>
            <input
              type="number"
              min={1}
              max={20}
              autoFocus
              value={d20Input}
              onChange={(e) => onD20Change(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape') onClose();
              }}
              className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary transition-colors"
              placeholder="例如 12"
            />
          </div>
          <div className="flex items-center justify-between py-3 px-4 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
            <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              先攻总值
            </div>
            <div className="text-2xl font-bold dark:text-text-dark light:text-text-light">
              {total === null ? '-' : total}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              disabled={total === null}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              确认加入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
