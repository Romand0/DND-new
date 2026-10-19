// 目标确认步骤（select_target）—— 切比雪夫距离检算 + 射程门禁 + 目标更换（R4）
import { useMemo } from 'react';
import { Check, X, AlertTriangle, Repeat } from 'lucide-react';
import type { Combatant } from '@/types/combat';
import type { Spell } from '@/types/spell';
import { parseSpellRange } from '@/utils/spellRange';

interface Props {
  spell: Spell;
  caster: Combatant;
  target: Combatant;
  combatants: Combatant[];
  combatantPositions?: Record<string, { col: number; row: number } | null | undefined> | null;
  onSelectTarget: (combatant: Combatant) => void;
  onConfirm: (message: string, data: Record<string, unknown>) => void;
  onForce: (message: string, data: Record<string, unknown>) => void;
}

export default function SpellTargetStep({
  spell, caster, target, combatants, combatantPositions, onSelectTarget, onConfirm, onForce,
}: Props) {
  const range = parseSpellRange(spell.range);

  // 切比雪夫距离（5 尺/格，AGENTS.md 距离约定）
  const distance = useMemo(() => {
    const from = combatantPositions?.[caster.id];
    const to = combatantPositions?.[target.id];
    if (!from || !to) return null; // 任一未放置 → skipped
    return Math.max(Math.abs(from.col - to.col), Math.abs(from.row - to.row)) * 5;
  }, [combatantPositions, caster.id, target.id]);

  const outOfRange = distance !== null && range.feet !== null && distance > range.feet;
  const sameTarget = target.id === caster.id;

  const detail = distance === null
    ? { pass: true, text: '任一方未放置在沙盘上，距离未知（跳过校验）' }
    : range.feet === null
    ? { pass: true, text: `距离 ${distance} 尺，特殊射程「${range.label}」按原文裁决` }
    : { pass: !outOfRange, text: `距离 ${distance} 尺 vs 射程 ${range.feet} 尺${outOfRange ? '，超出射程' : '，在射程内'}` };

  const data: Record<string, unknown> = {
    targetId: target.id,
    targetName: target.name,
    distanceFeet: distance,
    rangeFeet: range.feet,
    rangeRaw: range.label,
    skipped: distance === null,
  };

  const confirmMessage = distance === null
    ? `目标 ${target.name}（距离未知，跳过校验）`
    : `目标 ${target.name}（${detail.text}）`;

  return (
    <div className="space-y-3">
      {/* 当前目标与距离 */}
      <div className={`rounded-lg border p-3 space-y-1.5 ${
        detail.pass
          ? 'dark:border-border-dark light:border-border-light'
          : 'border-amber-500/40 bg-amber-500/5'
      }`}>
        <div className="flex items-center justify-between text-sm">
          <span className="dark:text-text-dark-muted light:text-text-light-muted">目标</span>
          <span className="font-medium dark:text-text-dark light:text-text-light">
            {target.name}
            {sameTarget && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">自身</span>}
          </span>
        </div>
        <div className="flex items-start gap-2 text-sm">
          {detail.pass ? (
            <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
          ) : (
            <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <span className={detail.pass ? 'dark:text-text-dark light:text-text-light' : 'text-red-400'}>
            {detail.text}
          </span>
        </div>
      </div>

      {/* 更换目标 */}
      <details className="rounded-lg border dark:border-border-dark light:border-border-light">
        <summary className="px-3 py-2 text-xs dark:text-text-dark-muted light:text-text-light-muted cursor-pointer flex items-center gap-1.5 select-none">
          <Repeat className="w-3.5 h-3.5" />
          更换目标
        </summary>
        <div className="px-3 pb-2.5 max-h-40 overflow-y-auto space-y-1">
          {combatants.filter(c => !c.isDead).map(c => (
            <button
              key={c.id}
              onClick={() => onSelectTarget(c)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors ${
                c.id === target.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'dark:text-text-dark light:text-text-light hover:bg-primary/5'
              }`}
            >
              {c.name}
              {c.id === caster.id && <span className="text-[10px] ml-1.5 opacity-60">（施法者）</span>}
            </button>
          ))}
        </div>
      </details>

      {detail.pass ? (
        <button
          onClick={() => onConfirm(confirmMessage, data)}
          className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
        >
          目标确认，进入检定
        </button>
      ) : (
        <>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>目标超出法术射程，按规则无法施放。可更换目标、靠近后重试，或强制施放。</span>
          </div>
          <button
            onClick={() => onForce(`强制施放（超出射程：${detail.text}）`, data)}
            className="w-full py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
          >
            强制施放（记为部分通过并继续）
          </button>
        </>
      )}
    </div>
  );
}
