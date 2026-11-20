import { useState } from 'react';
import { X } from 'lucide-react';
import type { HealSpec } from '@/data/featureSpecs';

interface Props {
  featureName: string;
  spec: HealSpec;
  casterLevel: number;
  /** 确认回调：填入的线下骰结果（1d10 单骰填数字；NdM 多骰也汇总为合计值，与伤害弹窗「输入各骰结果」同口径） */
  onConfirm: (rolledDice: number) => void;
  onClose: () => void;
}

/** heal 骰值环节（线下骰口径）：按 spec 骰模板提示玩家线下掷骰并填入结果，确认后由引擎灌入结算。
 *  与 CombatDamageModal「输入各骰结果」同惯例；取消不消耗资源（资源在确认回调时扣）。 */
export default function HealRollModal({ featureName, spec, casterLevel, onConfirm, onClose }: Props) {
  const [rolled, setRolled] = useState('');
  const m = spec.dice?.match(/^(\d+)d(\d+)$/);
  const diceCount = m ? parseInt(m[1], 10) : 0;
  const diceSides = m ? parseInt(m[2], 10) : 0;

  const previewParts: string[] = [];
  if (spec.dice) previewParts.push(`${spec.dice}(线下骰)`);
  if (spec.flat) previewParts.push(`固定 ${spec.flat}`);
  if (spec.levelFactor) previewParts.push(`${spec.levelAttr ?? '等级'}×${spec.levelFactor}=${spec.levelFactor * Math.max(0, casterLevel)}`);

  const parsed = parseInt(rolled, 10);
  const valid = rolled !== '' && !isNaN(parsed) && parsed >= (diceCount || 1) && parsed <= diceCount * diceSides;
  const hint = diceCount > 0 ? `请线下掷 ${spec.dice}，填入点数合计（${diceCount * (diceSides || 0) ? `${diceCount}~${diceCount * diceSides}` : ''}）` : '无需掷骰';

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="rounded-xl w-full max-w-xs p-4 space-y-3 dark:bg-bg-dark-2 light:bg-bg-light" onClick={(e) => e.stopPropagation()} data-testid="heal-roll-modal">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium dark:text-text-dark light:text-text-light">掷骰 · {featureName}</span>
          <button onClick={onClose} className="ml-auto p-1 rounded dark:hover:bg-bg-dark light:hover:bg-bg-light-3 dark:text-text-dark-muted light:text-text-light-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="text-xs leading-5 dark:text-text-dark-muted light:text-text-light-muted">
          {hint}
          <div className="mt-1">结算组成：{previewParts.join(' + ') || '无'}</div>
        </div>
        {diceCount > 0 && (
          <input
            type="number"
            autoFocus
            data-testid="heal-roll-input"
            value={rolled}
            onChange={(e) => setRolled(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && valid) onConfirm(parsed); }}
            placeholder={`掷 ${spec.dice} 的点数合计`}
            className="w-full px-3 py-2 text-sm rounded-lg border dark:bg-bg-dark dark:border-border-dark dark:text-text-dark light:bg-bg-light-2 light:border-border-light light:text-text-light focus:outline-none focus:border-primary"
          />
        )}
        <button
          onClick={() => valid && onConfirm(parsed)}
          disabled={!valid}
          className="w-full py-2 text-sm rounded-lg bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          确认结算
        </button>
      </div>
    </div>
  );
}
