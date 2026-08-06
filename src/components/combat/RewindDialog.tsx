interface Props {
  open: boolean;
  onRewind: () => void;
  onCancel: () => void;
}

export default function RewindDialog(props: Props) {
  const { open, onRewind, onCancel } = props;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">⏪ 回滚回合</h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          确认回滚到当前回合开始时的状态？所有在当前回合对战斗状态和沙盘做出的修改都会被撤销（人物 HP、背包物品、沙盘棋子位置等）。此操作不可撤销。
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >取消</button>
          <button
            onClick={onRewind}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >确认回滚</button>
        </div>
      </div>
    </div>
  );
}
