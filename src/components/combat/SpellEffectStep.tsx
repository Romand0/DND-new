// 效果结算步骤（apply_effect）—— 效果骰池 + 计算 / 跳过效果出口（R5）
// HP 预览与倒地决定在收尾步骤；本步只产出最终数值。
// 无检定场景（checkType==='none'）时开放伤害/治疗选择；检定通过场景固定伤害。
import { Fragment, useEffect, useMemo, type ReactNode } from 'react';
import { Dices, Calculator, SkipForward } from 'lucide-react';
import { rollDice } from '@/data/diceService';

export type SpellEffectType = 'damage' | 'heal';

// 解析骰子表达式，如 "8d6"、"2d8+3"、"1d4"（自 CombatSpellModal 迁入）
export function parseDice(expr: string): { count: number; sides: number; bonus: number } {
  const result = { count: 1, sides: 0, bonus: 0 };
  if (!expr) return result;
  const plusIdx = expr.indexOf('+');
  let dicePart = expr;
  let bonusPart = '';
  if (plusIdx !== -1) {
    dicePart = expr.substring(0, plusIdx).trim();
    bonusPart = expr.substring(plusIdx + 1).trim();
  } else {
    dicePart = expr.trim();
  }
  if (bonusPart) {
    const b = parseInt(bonusPart, 10);
    if (!isNaN(b)) result.bonus = b;
  }
  const dIdx = dicePart.toLowerCase().indexOf('d');
  if (dIdx === -1) {
    const flat = parseInt(dicePart, 10);
    if (!isNaN(flat)) {
      result.bonus += flat;
      result.count = 0;
    }
    return result;
  }
  const countStr = dicePart.substring(0, dIdx).trim();
  const sidesStr = dicePart.substring(dIdx + 1).trim();
  if (countStr) {
    const c = parseInt(countStr, 10);
    if (!isNaN(c) && c > 0) result.count = c;
  }
  if (sidesStr) {
    const s = parseInt(sidesStr, 10);
    if (!isNaN(s) && s > 0) result.sides = s;
  }
  return result;
}

// 法术描述中的骰子表达式高亮（供宿主法术卡片复用）
export function renderSpellDice(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\d+)d(4|6|8|10|12|20)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    parts.push(
      <span key={key++} className="inline-flex items-baseline mx-0.5">
        <span className="text-primary font-bold">{match[1]}</span>
        <span className="px-1 py-0 mx-0.5 rounded bg-accent/20 text-accent font-mono font-semibold">d{match[2]}</span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts;
}

interface Props {
  effectType: SpellEffectType;
  /** 无检定场景开放效果类型切换（敌方=伤害 / 友方=治疗） */
  allowEffectTypeChoice: boolean;
  sameTeam: boolean;
  diceExpr: string;
  effectDiceValues: string[];
  calculated: number | null;
  onEffectTypeChange: (t: SpellEffectType) => void;
  onDiceExprChange: (expr: string) => void;
  onEffectDieChange: (idx: number, val: string) => void;
  /** 表达式变化导致骰数变化时重置整个骰池 */
  onDicePoolReset: () => void;
  onRollDice: () => void;
  onCalc: () => void;
  /** 确认结算：amount 必须已算出 */
  onConfirm: (amount: number) => void;
  /** 跳过效果（纯 buff / 无效果法术）：amount 记 0 */
  onSkip: () => void;
}

export default function SpellEffectStep({
  effectType, allowEffectTypeChoice, sameTeam, diceExpr, effectDiceValues, calculated,
  onEffectTypeChange, onDiceExprChange, onEffectDieChange, onDicePoolReset, onRollDice, onCalc, onConfirm, onSkip,
}: Props) {
  const parsedEffect = useMemo(() => parseDice(diceExpr), [diceExpr]);

  // 表达式变化导致骰数变化时清空输入（宿主状态承接）
  useEffect(() => {
    if (parsedEffect.count > 0 && effectDiceValues.length !== parsedEffect.count) {
      onDicePoolReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedEffect.count, parsedEffect.sides]);

  const total = useMemo(() => {
    let sum = parsedEffect.bonus;
    for (const v of effectDiceValues) {
      const n = parseInt(v, 10);
      if (!isNaN(n)) sum += n;
    }
    return sum;
  }, [parsedEffect.bonus, effectDiceValues]);

  const canConfirm = calculated !== null;

  return (
    <div className="space-y-3">
      {/* 效果类型选择（仅无检定场景） */}
      {allowEffectTypeChoice && (
        <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5">
          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5">效果类型</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onEffectTypeChange('damage')}
              disabled={sameTeam}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                effectType === 'damage' ? 'bg-danger text-white ring-2 ring-danger' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-danger/10'
              }`}
              title={sameTeam ? '友方不能骰伤害' : ''}
            >
              伤害
            </button>
            <button
              onClick={() => onEffectTypeChange('heal')}
              disabled={!sameTeam}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                effectType === 'heal' ? 'bg-green-500 text-white ring-2 ring-green-500' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-green-500/10'
              }`}
              title={!sameTeam ? '敌方不能骰治疗' : ''}
            >
              治疗
            </button>
          </div>
          <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mt-1.5">
            {sameTeam ? '友方目标：仅可骰治疗' : '敌方目标：仅可骰伤害'}
          </div>
        </div>
      )}

      {/* 骰子表达式输入 */}
      <div>
        <label className="text-sm font-medium dark:text-text-dark light:text-text-light block mb-1.5">
          {effectType === 'damage' ? '伤害' : '治疗'}骰表达式
        </label>
        <input
          type="text"
          value={diceExpr}
          onChange={(e) => onDiceExprChange(e.target.value)}
          placeholder="如 8d6、2d8+3"
          className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
        />
        {parsedEffect.count > 0 && (
          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
            解析为：{parsedEffect.count}d{parsedEffect.sides}{parsedEffect.bonus !== 0 && ` + ${parsedEffect.bonus}`}
          </div>
        )}
      </div>

      {/* 各骰子输入 */}
      {parsedEffect.count > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium dark:text-text-dark light:text-text-light">
              输入各 d{parsedEffect.sides} 结果
            </label>
            <button
              onDoubleClick={onRollDice}
              className="px-2.5 py-1 rounded-lg bg-primary text-white flex items-center gap-1 hover:bg-primary/90 active:scale-90 transition-all text-xs shrink-0 select-none"
              title="双击摇骰"
            >
              <Dices className="w-3.5 h-3.5" />
              <span>摇骰</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {effectDiceValues.map((v, i) => (
              <Fragment key={i}>
                <input
                  type="number"
                  min={1}
                  max={parsedEffect.sides}
                  value={v}
                  onChange={(e) => onEffectDieChange(i, e.target.value)}
                  placeholder={`d${parsedEffect.sides}`}
                  className="w-16 px-2 py-1.5 text-center rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                />
                {i < effectDiceValues.length - 1 && <span className="dark:text-text-dark-muted light:text-text-light-muted">+</span>}
              </Fragment>
            ))}
            {parsedEffect.bonus !== 0 && (
              <>
                {parsedEffect.count > 0 && <span className="dark:text-text-dark-muted light:text-text-light-muted">+</span>}
                <span className="px-2 py-1.5 text-sm font-medium text-primary rounded-lg bg-primary/10">{parsedEffect.bonus}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 计算按钮 */}
      <button
        onClick={onCalc}
        disabled={parsedEffect.count === 0 || parsedEffect.sides === 0}
        className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Calculator className="w-4 h-4" />
        计算{effectType === 'damage' ? '伤害' : '治疗量'}
      </button>

      {/* 结果预览 */}
      {calculated !== null && (
        <div className={`rounded-lg p-3 text-center animate-in fade-in slide-in-from-bottom duration-200 ${
          effectType === 'damage' ? 'bg-danger/10' : 'bg-green-500/10'
        }`}>
          <div className={`text-lg font-bold ${effectType === 'damage' ? 'text-danger' : 'text-green-500'}`}>{calculated}</div>
          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
            {effectType === 'damage' ? '点伤害' : '点生命值'}（合计 {total}，已按表达式加值）
          </div>
        </div>
      )}

      {/* 确认 / 跳过 */}
      <div className="flex gap-2">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light font-medium hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5"
          title="纯增益/无效果法术：数值记 0 并进入收尾"
        >
          <SkipForward className="w-4 h-4" />
          跳过效果(0)
        </button>
        <button
          onClick={() => onConfirm(calculated ?? 0)}
          disabled={!canConfirm}
          className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
            canConfirm ? 'bg-primary text-white hover:bg-primary/90' : 'bg-gray-400/60 text-white/70 cursor-not-allowed'
          }`}
        >
          确认结算
        </button>
      </div>
    </div>
  );
}
