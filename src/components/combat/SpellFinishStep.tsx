// 收尾步骤（cast_end）—— HP 预览 + NPC 致命伤害倒地决定 + 全轨迹审计 + 确认施放（R6/R7）
// 副作用唯一出口：确认时宿主才应用 HP/动作/先攻表格并写入 castLogs。
import { useMemo, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import type { Combatant } from '@/types/combat';
import type { CastStepState } from '@/hooks/combat/useCastSteps';
import type { SpellCheckType } from './SpellCheckStep';
import type { SpellEffectType } from './SpellEffectStep';

const STEP_LABELS: Record<string, string> = {
  cast_start: '前置检查',
  select_target: '目标确认',
  attack_roll: '法术攻击',
  saving_throw: '豁免检定',
  apply_effect: '效果结算',
  cast_end: '收尾',
};

const STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  success: { text: '通过', cls: 'bg-green-500/15 text-green-500' },
  partial: { text: '强制', cls: 'bg-amber-500/15 text-amber-400' },
  failure: { text: '未过', cls: 'bg-red-500/15 text-red-400' },
};

interface Props {
  spellName: string;
  castingTime?: string;
  caster: Combatant;
  target: Combatant;
  checkType: SpellCheckType;
  checkSuccess: boolean;
  checkSummary?: string;
  effectType: SpellEffectType;
  amount: number;
  steps: readonly CastStepState[];
  onConfirm: (result: { newHp: number; status?: 'unconscious' | 'dead' }) => void;
}

export default function SpellFinishStep({
  spellName, castingTime, caster, target, checkType, checkSuccess, checkSummary,
  effectType, amount, steps, onConfirm,
}: Props) {
  // HP 预览（自 CombatSpellModal 迁入）
  const maxHp = target.maxHp ?? 0;
  const currentHp = target.currentHp ?? 0;
  const newHp = effectType === 'damage'
    ? Math.max(0, currentHp - amount)
    : Math.min(maxHp, currentHp + amount);
  const actualChange = effectType === 'damage' ? currentHp - newHp : newHp - currentHp;
  const isLethal = effectType === 'damage' && amount > 0 && amount >= currentHp && currentHp > 0;
  const needDownedDecision = isLethal && !target.isPc;
  const [downedStatus, setDownedStatus] = useState<'unconscious' | 'dead' | null>(null);

  const newHpPercent = maxHp > 0 ? (newHp / maxHp) * 100 : 0;
  const hpColor = newHp <= 0 ? 'bg-red-500' : newHpPercent > 50 ? 'bg-green-500' : newHpPercent > 25 ? 'bg-yellow-500' : 'bg-red-500';
  const changeColor = newHp <= 0 ? 'bg-red-500' : hpColor;

  // 全轨迹审计（已完成步骤 + 状态徽章）
  const audit = useMemo(() => steps.filter(s => s.status !== 'pending' && s.status !== 'active'), [steps]);

  const canConfirm = !needDownedDecision || downedStatus !== null;

  return (
    <div className="space-y-3">
      {/* 施法摘要 */}
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="dark:text-text-dark-muted light:text-text-light-muted">法术</span>
          <span className="font-medium dark:text-text-dark light:text-text-light">{spellName}</span>
        </div>
        {castingTime && (
          <div className="flex items-center justify-between">
            <span className="dark:text-text-dark-muted light:text-text-light-muted">施法时间</span>
            <span className="dark:text-text-dark light:text-text-light">{castingTime}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="dark:text-text-dark-muted light:text-text-light-muted">路径</span>
          <span className="dark:text-text-dark light:text-text-light">
            {caster.name} → {target.name}
            {checkType === 'none' ? '（无检定）' : checkSuccess ? '（检定通过）' : '（检定未过）'}
          </span>
        </div>
        {checkSummary && (
          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">{checkSummary}</div>
        )}
      </div>

      {/* 轨迹审计 */}
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 space-y-1">
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">施法轨迹</div>
        {audit.map((s, i) => {
          const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.success;
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ${badge.cls}`}>{badge.text}</span>
              <span className="dark:text-text-dark light:text-text-light shrink-0">{STEP_LABELS[s.type] ?? s.type}</span>
              <span className="dark:text-text-dark-muted light:text-text-light-muted truncate">{s.message}</span>
            </div>
          );
        })}
      </div>

      {/* 效果为 0 时的说明 */}
      {amount === 0 && (
        <div className="rounded-lg bg-primary/5 border dark:border-border-dark light:border-border-light p-3 text-sm dark:text-text-dark-muted light:text-text-light-muted">
          {checkType !== 'none' && !checkSuccess
            ? '检定未通过：本次施放无效果，仍消耗动作并在轨迹中留痕。'
            : '本次施放无数值效果（纯增益 / 跳过效果）。'}
        </div>
      )}

      {/* HP 影响 */}
      {amount > 0 && (
        <div className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 p-3">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="dark:text-text-dark-muted light:text-text-light-muted">{target.name} HP</span>
            <span className="font-medium dark:text-text-dark light:text-text-light">
              {currentHp} → {newHp}
              {actualChange > 0 && (
                <span className={`ml-1 ${effectType === 'damage' ? 'text-danger' : 'text-green-500'}`}>
                  {effectType === 'damage' ? '-' : '+'}{actualChange}
                </span>
              )}
            </span>
          </div>
          {maxHp > 0 && (
            <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex">
              <div className={`h-full ${hpColor} transition-all`} style={{ width: `${(newHp / maxHp) * 100}%` }} />
              <div className={`h-full ${changeColor} opacity-40 transition-all`} style={{ width: `${(actualChange / maxHp) * 100}%` }} />
            </div>
          )}
          <div className="flex justify-between text-xs mt-1">
            <span className="dark:text-text-dark-muted light:text-text-light-muted">最大 {maxHp}</span>
            {newHp <= 0 && <span className="text-red-500 font-medium">已倒下</span>}
          </div>
        </div>
      )}

      {/* NPC 致命伤害状态决定 */}
      {needDownedDecision && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <div className="text-sm font-medium text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            该 NPC 已倒下，请决定其状态
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDownedStatus('unconscious')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                downedStatus === 'unconscious' ? 'bg-amber-500 text-white ring-2 ring-amber-400' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-amber-500/10'
              }`}
            >
              昏迷
            </button>
            <button
              onClick={() => setDownedStatus('dead')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                downedStatus === 'dead' ? 'bg-red-500 text-white ring-2 ring-red-400' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-red-500/10'
              }`}
            >
              死亡
            </button>
          </div>
        </div>
      )}

      {/* 确认施放：唯一副作用出口 */}
      <button
        onClick={() => onConfirm({ newHp, status: needDownedDecision ? downedStatus! : undefined })}
        disabled={!canConfirm}
        className={`w-full py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
          canConfirm ? 'bg-primary text-white hover:bg-primary/90' : 'bg-gray-400/60 text-white/70 cursor-not-allowed'
        }`}
      >
        <Check className="w-4 h-4" />
        {needDownedDecision && !downedStatus ? '请先决定状态' : '确认施放'}
      </button>
    </div>
  );
}
