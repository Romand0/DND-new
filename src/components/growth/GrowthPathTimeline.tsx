import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import type { Character } from '@/types/character';
import type { CharacterOption } from '@/types/characterOption';
import type { GrowthMilestone } from '@/types/growthTask';
import { buildGrowthPath } from '@/lib/growthPath';

interface Props {
  character: Character;
  options: CharacterOption[];
}

function slotSummary(slots: Record<number, number> | undefined): string {
  if (!slots) return '';
  return Object.entries(slots)
    .map(([level, count]) => `${level}环×${count}`)
    .join('，');
}

function milestoneSummary(milestone: GrowthMilestone): string[] {
  const parts: string[] = [];
  for (const feature of milestone.classFeatures) parts.push(feature.name);
  for (const feature of milestone.subclassFeatures) parts.push(feature.name);
  if (milestone.subclassChoice) {
    parts.push(
      milestone.subclassChoice.required
        ? '选择子职业（必填）'
        : '子职业选择',
    );
  }
  if (milestone.abilityScoreImprovement) {
    parts.push(`属性值提升（${milestone.abilityScoreImprovement.modes.join(' 或 ')}）`);
  }
  const slots = slotSummary(milestone.spellSlots);
  if (slots) parts.push(`法术位 ${slots}`);
  if (milestone.cantripsKnown != null) parts.push(`戏法 ${milestone.cantripsKnown}`);
  if (milestone.spellsKnown != null) parts.push(`已知法术 ${milestone.spellsKnown}`);
  if (milestone.hpGain) parts.push(`生命值 +${milestone.hpGain.fixed}`);
  return parts;
}

export default function GrowthPathTimeline(props: Props) {
  const { character, options } = props;
  const [expanded, setExpanded] = useState(false);
  const path = useMemo(() => buildGrowthPath(character, options), [character, options]);
  const visibleLimit = expanded ? 20 : Math.min(20, Math.max(path.effectiveLevel + 4, 8));
  const visibleMilestones = path.milestones.filter((milestone) => milestone.level <= visibleLimit);
  const gapCount = path.milestones.reduce((count, milestone) => count + milestone.gaps.length, 0);
  const subclassNames = new Map(
    path.milestones
      .flatMap((milestone) => milestone.subclassChoice?.candidates ?? [])
      .map((candidate) => [candidate.id, candidate.name]),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          有效等级 {path.effectiveLevel}
        </span>
        <span className="dark:text-text-dark-muted light:text-text-light-muted">
          {path.classKey || '未填写职业'}
          {path.subclassKey ? ` · ${subclassNames.get(path.subclassKey) ?? path.subclassKey}` : ''}
        </span>
        <span className="ml-auto dark:text-text-dark-muted light:text-text-light-muted tabular-nums">
          熟练 +{path.milestones[path.effectiveLevel - 1]?.proficiencyBonus ?? 2}
        </span>
      </div>

      {gapCount > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{gapCount} 处数据缺失，升级时由 DM 手工补充</span>
        </div>
      )}

      <div className="space-y-1.5">
        {visibleMilestones.map((milestone) => {
          const current = milestone.level === path.effectiveLevel;
          const future = milestone.level > path.effectiveLevel;
          const parts = milestoneSummary(milestone);
          return (
            <div
              key={milestone.level}
              className={`rounded-lg border px-2.5 py-2 ${
                current
                  ? 'border-primary/50 bg-primary/5'
                  : 'dark:border-border-dark light:border-border-light'
              } ${future ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-10 shrink-0 text-xs font-bold tabular-nums ${
                    current ? 'text-primary' : 'dark:text-text-dark light:text-text-light'
                  }`}
                >
                  Lv.{milestone.level}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full dark:bg-white/10 light:bg-black/5 dark:text-text-dark-muted light:text-text-light-muted">
                  +{milestone.proficiencyBonus}
                </span>
                {current && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-white">当前</span>
                )}
                <span className="ml-auto text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                  {milestone.hitDie ? `d${milestone.hitDie}` : ''}
                </span>
              </div>
              {parts.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1 pl-12">
                  {parts.map((part, index) => (
                    <span
                      key={`${milestone.level}-${part}-${index}`}
                      className="px-1.5 py-0.5 rounded text-xs dark:bg-white/5 light:bg-black/5 dark:text-text-dark light:text-text-light"
                    >
                      {part}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-1 pl-12 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  本等级无新增特性
                </div>
              )}
              {milestone.gaps.map((gap, index) => (
                <div
                  key={`${milestone.level}-gap-${index}`}
                  className="mt-1 pl-12 text-[11px] text-amber-600 dark:text-amber-400"
                >
                  {gap.message}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full py-1.5 text-xs rounded-lg border border-dashed transition-colors flex items-center justify-center gap-1 dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
      >
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {expanded ? '收起至当前等级附近' : '展开 1-20 级完整路径'}
      </button>
      <div className="flex items-center gap-1 text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
        <Sparkles className="w-3 h-3" />
        <span>路径版本 {path.pathVersion.split(':').slice(0, 4).join(' · ')}</span>
      </div>
    </div>
  );
}
