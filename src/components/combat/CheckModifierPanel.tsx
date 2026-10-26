// 检定奖惩面板 —— 展示本次检定命中的奖惩条目（强制项 / 可选项开关 / 骰值输入）
// 由 CombatAttackModal 与 SpellCheckStep 共用；纯展示 + 受控回调，不含引擎逻辑。
import { Dices } from 'lucide-react';
import type { CheckModifierHit, CheckModifierResult } from '@/types/combat';
import { formatDice, diceMaxValue } from '@/data/checkModifierRules';

interface Props {
  result: CheckModifierResult;
  /** 可选奖惩的启用状态（sourceKey → boolean） */
  enabledKeys: Set<string>;
  onToggle: (sourceKey: string, enabled: boolean) => void;
  /** 已掷骰值（sourceKey → number[]）；强制项也需要掷骰，故强制项也渲染输入框 */
  rolledValues: Record<string, string[]>;
  onRolledChange: (sourceKey: string, values: string[]) => void;
  /** 一次性自动掷骰（全部已启用且带骰的条目） */
  onRollAll?: () => void;
  /** 只读模式（结算后回显）：不渲染开关/输入，仅列出结果 */
  readonly?: boolean;
}

function modeLabel(hit: CheckModifierHit): string {
  return hit.mode === 'penalty' ? '惩罚' : '奖励';
}

function modeColor(hit: CheckModifierHit): string {
  return hit.mode === 'penalty' ? 'text-amber-400' : 'text-emerald-400';
}

export default function CheckModifierPanel({
  result, enabledKeys, onToggle, rolledValues, onRolledChange, onRollAll, readonly,
}: Props) {
  if (result.hits.length === 0) return null;

  const hasDiceInput = result.hits.some(h => h.enabled && h.dice.count > 0 && h.dice.sides > 0);

  return (
    <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium dark:text-text-dark light:text-text-light">
          检定奖惩
          <span className="ml-1 font-normal dark:text-text-dark-muted light:text-text-light-muted">
            （{result.hits.length} 项{result.hasForced ? '，含强制' : ''}）
          </span>
        </span>
        {!readonly && hasDiceInput && onRollAll && (
          <button
            onClick={onRollAll}
            className="px-2 py-1 rounded bg-primary/10 text-primary text-[11px] flex items-center gap-1 hover:bg-primary/20 transition-colors"
            title="为所有已启用的奖惩一次性掷骰"
          >
            <Dices className="w-3 h-3" />
            全部掷骰
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {result.hits.map(hit => {
          const enabled = hit.enabled;
          const needsDice = hit.dice.count > 0 && hit.dice.sides > 0;
          const values = rolledValues[hit.sourceKey] ?? [];
          return (
            <div
              key={hit.sourceKey}
              className={`rounded p-1.5 text-xs flex flex-wrap items-center gap-1.5 ${
                enabled ? 'bg-white/5' : 'bg-transparent opacity-60'
              }`}
            >
              {/* 强制标记 / 可选开关 */}
              {hit.forced ? (
                <span className="px-1 py-0.5 rounded bg-primary/15 text-primary text-[10px] shrink-0">强制</span>
              ) : (
                <button
                  onClick={() => onToggle(hit.sourceKey, !enabled)}
                  disabled={readonly}
                  className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 transition-colors ${
                    enabled
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted light:text-text-light-muted'
                  } disabled:opacity-50`}
                  title={enabled ? '点击关闭本次奖惩' : '点击启用本次奖惩'}
                >
                  {enabled ? '已启用' : '未使用'}
                </button>
              )}

              <span className={`font-medium shrink-0 ${modeColor(hit)}`}>{modeLabel(hit)}</span>
              <span className="dark:text-text-dark light:text-text-light">{hit.label}</span>
              {hit.fromName && (
                <span className="dark:text-text-dark-muted light:text-text-light-muted">（来自 {hit.fromName}）</span>
              )}
              <span className="dark:text-text-dark-muted light:text-text-light-muted">
                {formatDice(hit.dice)}
                {hit.mode === 'penalty' ? `（最多 -${Math.abs(diceMaxValue(hit.dice, hit.mode))}）` : `（最多 +${diceMaxValue(hit.dice, hit.mode)}）`}
              </span>
              {typeof hit.remainingUses === 'number' && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-violet-500/15 text-violet-300">
                  剩余 {hit.remainingUses} 次
                </span>
              )}

              {/* 骰值输入：强制项即使不可开关也需要掷骰 */}
              {needsDice && enabled && (
                <span className="flex items-center gap-1 ml-auto">
                  {Array.from({ length: hit.dice.count }).map((_, i) => (
                    <input
                      key={i}
                      type="number"
                      min={1}
                      max={hit.dice.sides}
                      value={values[i] ?? ''}
                      disabled={readonly}
                      onChange={e => {
                        const next = [...Array(hit.dice.count)].map((_, j) => values[j] ?? '');
                        next[i] = e.target.value;
                        onRolledChange(hit.sourceKey, next);
                      }}
                      placeholder={`1-${hit.dice.sides}`}
                      className="w-12 px-1 py-0.5 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center text-[11px]"
                    />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {result.hasOptional && !readonly && (
        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
          可选项默认不启用，点击「未使用」可主动消耗
        </div>
      )}
    </div>
  );
}
