// 施法材料成分（M）面板 —— 前置检查与流程施放共用的门禁 UI
// 纯展示组件：材料评估与补货/消耗由宿主（CombatSpellModal）通过 props 注入。
import { Check, X, ScrollText, Plus, AlertTriangle } from 'lucide-react';
import type { MaterialEvaluation, MaterialRequirement } from '@/data/spellMaterials';

interface Props {
  evaluation: MaterialEvaluation;
  spellName: string;
  onCraftMaterial?: (req: MaterialRequirement) => void;
  onCraftScroll?: () => void;
  /** 紧凑模式（流程施放页顶部） */
  compact?: boolean;
}

const STATUS_LABEL: Record<'have' | 'pouch' | 'missing', string> = {
  have: '持有',
  pouch: '材料包替代',
  missing: '缺失',
};

export default function SpellMaterialPanel({
  evaluation,
  spellName,
  onCraftMaterial,
  onCraftScroll,
  compact = false,
}: Props) {
  if (evaluation.requirements.items.length === 0) return null;

  const { satisfied, viaPouch, viaScroll, statuses, missing, requirements } = evaluation;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${satisfied ? 'dark:border-border-dark light:border-border-light' : 'border-amber-500/40 bg-amber-500/5'}`}>
      <div className="flex items-center gap-2">
        {satisfied ? (
          <Check className="w-4 h-4 text-green-500 shrink-0" />
        ) : (
          <X className="w-4 h-4 text-red-400 shrink-0" />
        )}
        <span className={`text-sm font-medium ${satisfied ? 'dark:text-text-dark light:text-text-light' : 'text-red-400'}`}>
          材料成分（M）
        </span>
        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          {viaScroll
            ? '由对应法术卷轴满足'
            : viaPouch
              ? '由材料包替代'
              : satisfied
                ? '材料齐备'
                : `缺少 ${missing.length} 项材料`}
        </span>
      </div>

      {requirements.items.length > 1 && (
        <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted">
          {requirements.mode === 'any' ? '以下材料任选其一即可' : '以下材料需全部具备'}
        </div>
      )}

      <div className="space-y-1.5">
        {statuses.map(({ requirement, status }) => {
          return (
            <div key={requirement.key} className="flex items-start gap-2 text-xs">
              <span
                className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  status === 'have'
                    ? 'bg-green-500/10 text-green-500'
                    : status === 'pouch'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-red-500/10 text-red-400'
                }`}
              >
                {STATUS_LABEL[status]}
              </span>
              <div className="min-w-0 flex-1">
                <span className="dark:text-text-dark light:text-text-light">{requirement.description || requirement.name}</span>
                {requirement.costGp ? (
                  <span className="ml-1 text-[10px] text-amber-400">价值 ≥ {requirement.costGp} gp</span>
                ) : null}
                {requirement.consumed ? (
                  <span className="ml-1 text-[10px] text-red-400">耗材</span>
                ) : null}
                {!compact && status === 'missing' && onCraftMaterial && (
                  <button
                    onClick={() => onCraftMaterial(requirement)}
                    className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                    title="将该法术材料加入施法者背包"
                  >
                    <Plus className="w-3 h-3" />
                    补入材料
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!satisfied && onCraftScroll && (
        <button
          onClick={onCraftScroll}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs border border-dashed dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:border-primary hover:text-primary"
        >
          <ScrollText className="w-3.5 h-3.5" />
          以《{spellName}》卷轴代替材料
        </button>
      )}

      {!satisfied && !onCraftScroll && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>缺少材料时无法施放该法术（可用材料包替代，价值型与耗材型除外）</span>
        </div>
      )}
    </div>
  );
}

export type { MaterialEvaluation };
