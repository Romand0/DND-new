import { X } from 'lucide-react';
import type { Combatant } from '@/types/combat';

interface Props {
  open: boolean;
  round: number;
  combatants: Combatant[];
  surprisedCombatants: Set<string>;
  onToggleSurprised: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function SurpriseAttackDialog(props: Props) {
  const { open, round, combatants, surprisedCombatants, onToggleSurprised, onConfirm, onClose } = props;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
            突袭 · 第 {round + 1} 轮
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-3">
          选择在该轮被突袭的角色，被突袭角色在本回合失去先攻
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {combatants.map(c => {
            const isChecked = surprisedCombatants.has(c.id);
            return (
              <label
                key={c.id}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  isChecked
                    ? 'border-primary bg-primary/5'
                    : 'dark:border-border-dark light:border-border-light hover:border-primary/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleSurprised(c.id)}
                  className="rounded"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm dark:text-text-dark light:text-text-light">{c.name}</div>
                  <div className="text-xs opacity-60">
                    {c.isPc ? '玩家角色' : 'NPC'}
                    {c.initiative ? ` · 先攻 ${c.initiative}` : ''}
                  </div>
                </div>
                {c.isDead && <span className="text-xs text-danger">已死亡</span>}
              </label>
            );
          })}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
          >
            确定（{surprisedCombatants.size}）
          </button>
        </div>
      </div>
    </div>
  );
}
