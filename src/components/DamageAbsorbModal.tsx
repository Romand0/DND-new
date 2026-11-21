// damage_modifier 反应直连：伤害结算前填吸收量（线下裁定，引擎零暗骰）。
// 确认后吸收量累计进本次伤害结算（absorbedDamage），队列清空后按减后值落 HP。
import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  definitionName: string;
  targetName: string;
  amount: number;
  damageType?: string;
  eventLabel?: string;
  onConfirm: (absorb: number) => void;
  onSkip: () => void;
}

export default function DamageAbsorbModal({
  definitionName, targetName, amount, damageType, eventLabel, onConfirm, onSkip,
}: Props) {
  const [absorbText, setAbsorbText] = useState('');

  const parsed = Number.parseInt(absorbText, 10);
  const absorb = Number.isNaN(parsed) || parsed < 0 ? null : Math.min(parsed, amount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="damage-absorb-modal">
      <div className="relative w-full max-w-sm rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
        <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light">
          <h3 className="font-bold text-sm dark:text-text-dark light:text-text-light">
            {definitionName}（反应）
          </h3>
          <button
            onClick={onSkip}
            className="p-1 rounded hover:bg-danger/10 text-danger transition-colors"
            data-testid="damage-absorb-skip"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs space-y-1 dark:text-text-dark/70 light:text-text-light/70">
            <p>{eventLabel ?? `${targetName} 受到 ${amount} 点${damageType ?? ''}伤害`}</p>
            <p>放弃则保留反应次数；吸收量在本次伤害结算中扣减。</p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 dark:text-text-dark light:text-text-light">
              吸收量（0–{amount}，线下裁定）
            </label>
            <input
              type="number"
              min={0}
              max={amount}
              value={absorbText}
              onChange={(e) => setAbsorbText(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-bg-dark/50 dark:border-border-dark dark:text-text-dark light:bg-bg-light/50 light:border-border-light light:text-text-light"
              placeholder="0"
              data-testid="damage-absorb-input"
            />
          </div>
        </div>

        <div className="flex gap-2 p-3 border-t dark:border-border-dark light:border-border-light">
          <button
            onClick={() => onSkip()}
            className="flex-1 py-2 rounded-lg text-sm border transition-colors dark:border-border-dark dark:text-text-dark/80 light:border-border-light light:text-text-light/80 hover:bg-black/5 dark:hover:bg-white/5"
            data-testid="damage-absorb-skip-btn"
          >
            放弃（保留反应）
          </button>
          <button
            onClick={() => absorb != null && onConfirm(absorb)}
            disabled={absorb == null}
            className="flex-1 py-2 rounded-lg text-sm bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="damage-absorb-confirm"
          >
            确认吸收
          </button>
        </div>
      </div>
    </div>
  );
}
