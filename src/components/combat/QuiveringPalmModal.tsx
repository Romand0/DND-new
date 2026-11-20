// 渗透劲引爆弹窗（散打宗 17 级延迟引爆结算）：埋劲标记在目标身上时，DM 点击施劲者
// 「渗透劲」按钮打开本弹窗。豁免 d20 由目标线下掷骰后 DM 手填（引擎零暗骰）：
// 失败 → 目标生命归 0（按当前 HP 全额伤害落地，走既有抗性/昏迷管线）；
// 成功 → 目标受 10d10 暗蚀（总量手填）；无害终止 → 解除标记零消耗。
// 动作消耗（引爆 1 动作）与标记解除在确认回调时由宿主落地，取消不损失。
import { useState } from 'react';
import { X, Zap } from 'lucide-react';

interface Props {
  attackerName: string;
  targetName: string;
  dc: number;
  damageDice: string;
  damageType: string;
  onConfirm: (payload: { saveResult: 'success' | 'fail' | 'harmless'; damage?: number; saveRoll?: number }) => void;
  onClose: () => void;
}

export default function QuiveringPalmModal({ attackerName, targetName, dc, damageDice, damageType, onConfirm, onClose }: Props) {
  const [roll, setRoll] = useState<number | null>(null);
  const [damage, setDamage] = useState<number | null>(null);

  const failed = roll != null && roll < dc;
  const succeeded = roll != null && roll >= dc;
  const failReady = failed && damage == null;
  const successReady = succeeded && damage != null && damage >= 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        data-testid="quivering-palm-modal"
        className="w-full max-w-md rounded-xl p-4 space-y-3 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light flex items-center gap-1.5">
            <Zap className="w-5 h-5 text-accent" /> 渗透劲·引爆
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" data-testid="quivering-close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted leading-5">
          {attackerName} 使用动作终结 {targetName} 体内埋藏的劲力。
          目标进行体质豁免（DC {dc}，线下掷骰后填入结果）：失败生命归 0，成功受 {damageDice} {damageType}伤害。
        </p>
        <div>
          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">体质豁免 d20 结果（0-20，0 = 未填）</div>
          <input
            data-testid="quivering-save-input"
            type="number"
            min={0}
            max={20}
            value={roll ?? ''}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setRoll(Number.isNaN(v) || v < 0 || v > 20 ? null : v);
            }}
            className="w-full px-2 py-1.5 rounded border dark:bg-bg-dark-2 light:bg-white dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light text-sm"
            placeholder="填入线下 d20 结果"
          />
          {roll != null && (
            <div className={`text-xs mt-1 ${failed ? 'text-danger' : 'text-accent'}`}>
              {failed ? `豁免失败（${roll} < ${dc}）：目标生命归 0` : `豁免成功（${roll} ≥ ${dc}）：受 ${damageDice} ${damageType}伤害`}
            </div>
          )}
        </div>
        {succeeded && (
          <div>
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">{damageDice} {damageType}总量（线下掷骰后填入合计）</div>
            <input
              data-testid="quivering-damage-input"
              type="number"
              min={0}
              value={damage ?? ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDamage(Number.isNaN(v) || v < 0 ? null : v);
              }}
              className="w-full px-2 py-1.5 rounded border dark:bg-bg-dark-2 light:bg-white dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light text-sm"
              placeholder="填入线下伤害合计"
            />
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="quivering-confirm"
            disabled={!failReady && !successReady}
            onClick={() => onConfirm({ saveResult: failed ? 'fail' : 'success', ...(successReady ? { damage } : {}), ...(roll != null ? { saveRoll: roll } : {}) })}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              failReady || successReady
                ? 'bg-danger text-white hover:opacity-90'
                : 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
            }`}
          >
            {failed ? '确认引爆（生命归 0）' : '确认结算伤害'}
          </button>
          <button
            type="button"
            data-testid="quivering-harmless"
            onClick={() => onConfirm({ saveResult: 'harmless' })}
            className="px-3 py-2 rounded-lg text-sm border transition-colors dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:border-primary hover:text-primary"
          >
            无害终止
          </button>
        </div>
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          无害终止解除劲力标记且不消耗动作；引爆/伤害结算消耗 {attackerName} 1 个动作。
        </p>
      </div>
    </div>
  );
}
