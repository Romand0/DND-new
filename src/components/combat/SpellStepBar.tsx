// 施法步骤进度条 —— 单弹窗内一次聚焦一步的进度指示（R1.4）
import { Check, X, AlertTriangle } from 'lucide-react';
import type { CastStepState } from '@/hooks/combat/useCastSteps';

const STEP_LABELS: Record<string, string> = {
  cast_start: '前置检查',
  select_target: '目标确认',
  attack_roll: '法术攻击',
  saving_throw: '豁免检定',
  apply_effect: '效果结算',
  cast_end: '收尾',
};

export default function SpellStepBar({ steps }: { steps: readonly CastStepState[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
      {steps.map((step, i) => {
        const done = step.status !== 'pending' && step.status !== 'active';
        const active = step.status === 'active';
        const label = STEP_LABELS[step.type] ?? step.type;
        return (
          <div key={i} className="flex items-center gap-1 shrink-0">
            {i > 0 && <div className={`w-3 h-px ${done ? 'bg-primary/60' : 'dark:bg-border-dark light:bg-border-light'}`} />}
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary text-white font-medium'
                  : step.status === 'success'
                  ? 'bg-green-500/15 text-green-500'
                  : step.status === 'partial'
                  ? 'bg-amber-500/15 text-amber-400'
                  : step.status === 'failure'
                  ? 'bg-red-500/15 text-red-400'
                  : 'dark:text-text-dark-muted light:text-text-light-muted'
              }`}
              title={step.message}
            >
              {step.status === 'success' && <Check className="w-3 h-3" />}
              {step.status === 'partial' && <AlertTriangle className="w-3 h-3" />}
              {step.status === 'failure' && <X className="w-3 h-3" />}
              <span>{label}</span>
              {!done && !active && <span className="opacity-50">·</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
