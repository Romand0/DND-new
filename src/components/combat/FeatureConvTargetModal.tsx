// resource_conv convert 通道目标选择弹窗（feature-fullcycle P3）。
// to 多元素时 DM 端（handleFeatureUse）与玩家端（PlayerSpectate 打包）共用；
// 资源与动作由宿主在确认回调时扣减（取消不损失资源）。
import { X } from 'lucide-react';
import type { Combatant } from '@/types/combat';
import { CONV_TARGET_LABELS } from '@/data/engines/resourceConvEngine';

interface Props {
  from: Combatant;
  featureName: string;
  targets: string[];
  onConfirm: (target: string) => void;
  onClose: () => void;
}

const TARGET_DESC: Record<string, string> = {
  action: '获得一个额外主动作',
  bonus: '获得一个附赠动作',
  dash: '额外移动力 += 战斗速度（本回合）',
  disengage: '本回合移动不触发敌人的借机攻击',
  hide: '进入躲藏（隐匿由 DM 裁定）',
};

export default function FeatureConvTargetModal({ from, featureName, targets, onConfirm, onClose }: Props) {
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
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-3">
          发出者：<span className="font-medium dark:text-text-dark light:text-text-light">{from.name}</span> · 选择本次转换获得的动作项
        </p>
        <div className="space-y-2">
          {targets.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onConfirm(t)}
              className="w-full text-left px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/60 hover:bg-primary/5 transition-colors"
            >
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                {CONV_TARGET_LABELS[t] ?? t}
              </div>
              <div className="text-xs opacity-60">{TARGET_DESC[t] ?? '效果由 DM 按特性描述裁定'}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
