// checkModifier 通道目标选择弹窗：泛化自吟游诗人激励弹窗。
// 通道参数（骰面/场景/文案）由 featureCapabilities 注册表驱动，弹窗只负责选受益人。
// 资源与动作由宿主在确认回调时扣减（取消不损失资源）。
import { X } from 'lucide-react';
import type { Combatant } from '@/types/combat';
import { resolveFeatureCapability } from '@/data/featureCapabilities';

interface Props {
  from: Combatant;
  featureName: string;
  friendlies: Combatant[];
  onConfirm: (targetId: string) => void;
  onClose: () => void;
}

export default function FeatureCheckModifierModal({ from, featureName, friendlies, onConfirm, onClose }: Props) {
  const capability = resolveFeatureCapability(featureName);
  const spec = capability.checkModifier;
  if (!spec) return null;
  const die = spec.dice(from);
  const dieLabel = spec.diceLabel?.(from) ?? `d${die.sides}`;
  const sceneText = spec.scene === 'any' ? '能力检定 / 攻击检定 / 豁免检定' : '适用的检定场景';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">{featureName}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-2">
          发出者：<span className="font-medium dark:text-text-dark light:text-text-light">{from.name}</span>
        </p>
        <ul className="text-xs dark:text-text-dark-muted light:text-text-light-muted space-y-0.5 mb-4 list-disc pl-5">
          <li>效果：获得一枚{dieLabel}，进行{sceneText}后可将其结果加到检定值上（弹窗内自行决定是否使用）</li>
          <li>类型：一次性消耗，用后即失效</li>
          <li>有效期：{(spec.expireRound ?? -1) === -1 ? '按战斗尺度等效整场战斗' : `至第 ${(spec.expireRound ?? -1) + 1} 轮`}</li>
          {capability.hint && <li>说明：{capability.hint}</li>}
        </ul>
        <div className="text-xs font-medium dark:text-text-dark light:text-text-light mb-2">
          选择目标（友方 · {friendlies.length}）
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {friendlies.length === 0 && (
            <div className="text-xs opacity-60 text-center py-6">当前没有可选择的友方</div>
          )}
          {friendlies.map(f => {
            const held = (f.pendingCheckModifiers || []).some(m => !m.consumed && m.remainingUses > 0);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onConfirm(f.id)}
                className="w-full text-left px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/60 hover:bg-primary/5 transition-colors"
              >
                <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{f.name}</div>
                <div className="text-xs opacity-60">
                  {f.isPc ? '玩家角色' : 'NPC'}
                  {f.initiative ? ` · 先攻 ${f.initiative}` : ''}
                  {held ? ' · 已持有同类加值骰' : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
