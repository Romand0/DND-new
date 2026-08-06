import type { Character } from '@/types/character';

interface Props {
  open: boolean;
  characters: Character[];
  selectedPc: Character | null;
  onSelectPc: (c: Character | null) => void;
  d20Input: string;
  onD20Change: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function InitiativeRollDialog(props: Props) {
  const {
    open, characters, selectedPc, onSelectPc,
    d20Input, onD20Change, onConfirm, onClose,
  } = props;

  if (!open) return null;

  const dexMod = selectedPc?.abilities?.dexterity?.modifier ?? 0;
  const initPreview = (d20Input && !isNaN(parseInt(d20Input, 10)))
    ? (parseInt(d20Input, 10) + dexMod)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">加入参战者</h2>
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">请选择玩家角色，输入 d20 掷骰结果。敏捷加值会自动加上。</p>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">选择角色</label>
        <select
          value={selectedPc?.id ?? ''}
          onChange={(e) => {
            const found = characters.find((c) => c.id === e.target.value) ?? null;
            onSelectPc(found);
          }}
          className="mb-4 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        >
          <option value="">-- 请选择 --</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {selectedPc && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-100">
            <span>敏捷加值：</span>
            <span className="font-bold">
              {dexMod >= 0 ? `+${dexMod}` : `${dexMod}`}
            </span>
          </div>
        )}
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">d20 结果（1-20）</label>
        <input
          type="number"
          min={1}
          max={20}
          value={d20Input}
          onChange={(e) => onD20Change(e.target.value)}
          placeholder="例如 15"
          className="mb-3 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        />
        {selectedPc && initPreview !== null && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-100">
            <span>先攻值：</span>
            <span className="text-2xl font-bold">{initPreview}</span>
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >取消</button>
          <button
            onClick={onConfirm}
            disabled={!selectedPc || !d20Input}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
          >确认加入</button>
        </div>
      </div>
    </div>
  );
}
