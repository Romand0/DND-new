import type { Combatant } from '@/types/combat';

interface Props {
  open: boolean;
  combatants: Combatant[];
  onConfirm: () => void;
  onClose: () => void;
}

export default function SurpriseAttackDialog(props: Props) {
  const { open, combatants, onConfirm, onClose } = props;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">🐉 突袭！</h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          根据 D&amp;D 5e 规则，以下参战者在第一回合无法行动，将自动填入「被突袭」：
        </p>
        <ul className="mb-4 list-disc space-y-1 rounded-lg border border-gray-200 p-3 text-sm pl-6 dark:border-gray-700">
          {combatants.map(c => (
            <li key={c.id} className="text-gray-800 dark:text-gray-100">
              <span className="font-medium">{c.name}</span>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                （先攻 {c.initiative}{c.isPc ? '，玩家' : '，敌人'}）
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >取消</button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >确认突袭</button>
        </div>
      </div>
    </div>
  );
}
