// 资源消耗步骤（consume_slot）—— 决定用卷轴还是法术位，法术位可选施放环级
// 副作用延迟原则：本步骤只记录决策（data），扣位/消耗卷轴在收尾确认时统一应用。
import { useState } from 'react';
import { Check, ScrollText, Sparkles, AlertTriangle } from 'lucide-react';
import type { Spell } from '@/types/spell';

export interface ScrollOption {
  childId: string;
  name: string;
  level: number;
}

export interface SlotOption {
  /** 环级数字（1-9） */
  level: number;
  used: number;
  max: number;
}

interface Props {
  spell: Spell;
  /** 背包中与该法术匹配的卷轴（可能多张） */
  scrolls: ScrollOption[];
  /** 角色是否已习得该法术（未习得只能走卷轴） */
  isLearned: boolean;
  /** 角色当前可用的法术位（used < max 且环级 >= 法术基础环级） */
  usableSlots: SlotOption[];
  onConfirm: (message: string, data: Record<string, unknown>) => void;
  onForce: (message: string, data: Record<string, unknown>) => void;
}

/**
 * 消耗方式决策：
 * - 有卷轴：可选「使用卷轴」（施放后消耗，不占法术位）
 * - 已习得且可用环位充足：可选「消耗法术位」，环级从法术基础环级到角色持有的最高可用环级
 * - 两者都有：DM 自由选择；未习得或仅有卷轴时锁定卷轴
 * - 都没有：仅强制施放出口（记 partial）
 */
export default function SpellConsumeStep({
  spell, scrolls, isLearned, usableSlots, onConfirm, onForce,
}: Props) {
  const initialMethod: 'slot' | 'scroll' | null = (() => {
    if (scrolls.length > 0 && (!isLearned || usableSlots.length === 0)) return 'scroll';
    if (isLearned && usableSlots.length > 0) return 'slot';
    if (scrolls.length > 0) return 'scroll';
    return null;
  })();

  const [method, setMethod] = useState<'slot' | 'scroll' | null>(initialMethod);
  const [slotLevel, setSlotLevel] = useState<number>(usableSlots[0]?.level ?? spell.level);
  const [scrollIdx, setScrollIdx] = useState(0);

  const selectedScroll = scrolls[scrollIdx];
  const selectedSlot = usableSlots.find(s => s.level === slotLevel);
  const higherCast = method === 'slot' && slotLevel > spell.level;

  const handleConfirm = () => {
    if (method === 'scroll' && selectedScroll) {
      onConfirm(
        `使用卷轴「${selectedScroll.name}」（${selectedScroll.level} 环）施放，消耗该卷轴`,
        { method: 'scroll', scrollChildId: selectedScroll.childId, scrollName: selectedScroll.name, scrollLevel: selectedScroll.level },
      );
      return;
    }
    if (method === 'slot' && selectedSlot) {
      onConfirm(
        `消耗 ${slotLevel} 环法术位（可用 ${selectedSlot.max - selectedSlot.used} → ${selectedSlot.max - selectedSlot.used - 1}/${selectedSlot.max}）`,
        { method: 'slot', slotLevel, levelKey: `level${slotLevel}` },
      );
    }
  };

  const noResource = method === null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-3 space-y-2.5">
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          资源消耗 — {spell.level === 0 ? '戏法无需法术位' : `基础 ${spell.level} 环`}
        </div>

        {/* 卷轴选项 */}
        {scrolls.length > 0 && (
          <div
            onClick={() => setMethod('scroll')}
            className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${
              method === 'scroll'
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'dark:border-border-dark/60 light:border-border-light/60 hover:border-primary/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-medium dark:text-text-dark light:text-text-light">使用卷轴</span>
              {!isLearned && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">仅卷轴</span>
              )}
              {method === 'scroll' && <Check className="w-4 h-4 text-primary ml-auto" />}
            </div>
            {scrolls.length === 1 ? (
              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                {selectedScroll?.name} · {selectedScroll?.level} 环 · 施放后消耗
              </div>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {scrolls.map((s, i) => (
                  <button
                    key={s.childId}
                    onClick={(e) => { e.stopPropagation(); setScrollIdx(i); setMethod('scroll'); }}
                    className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                      i === scrollIdx
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'dark:border-border-dark/60 light:border-border-light/60 dark:text-text-dark-muted light:text-text-light-muted'
                    }`}
                  >
                    {s.name} · {s.level} 环
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 法术位选项 */}
        {isLearned && usableSlots.length > 0 && (
          <div
            onClick={() => setMethod('slot')}
            className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${
              method === 'slot'
                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                : 'dark:border-border-dark/60 light:border-border-light/60 hover:border-primary/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium dark:text-text-dark light:text-text-light">消耗法术位</span>
              {method === 'slot' && <Check className="w-4 h-4 text-primary ml-auto" />}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {usableSlots.map(s => (
                <button
                  key={s.level}
                  onClick={(e) => { e.stopPropagation(); setSlotLevel(s.level); setMethod('slot'); }}
                  title="可用 / 总量"
                  className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                    method === 'slot' && slotLevel === s.level
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'dark:border-border-dark/60 light:border-border-light/60 dark:text-text-dark-muted light:text-text-light-muted'
                  }`}
                >
                  {s.level} 环（{s.max - s.used}/{s.max}）
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 升环提示 */}
        {higherCast && (
          <div className="text-xs text-purple-400">
            以 {slotLevel} 环施放（升环）{spell.heightenedEffect ? `：${spell.heightenedEffect}` : ''}
          </div>
        )}

        {noResource && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-sm text-amber-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              没有可用资源：角色未持有该法术的卷轴，且无可用的 {spell.level} 环及以上法术位。
            </span>
          </div>
        )}
      </div>

      {noResource ? (
        <button
          onClick={() => onForce('无可用资源，强制施放（不消耗法术位/卷轴）', { method: 'none' })}
          className="w-full py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
        >
          强制施放（记为部分通过并继续）
        </button>
      ) : (
        <button
          onClick={handleConfirm}
          className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          确认消耗
        </button>
      )}
    </div>
  );
}
