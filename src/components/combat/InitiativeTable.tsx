import type { Combatant, RoundAction, TurnTodo } from '@/types/combat';

interface Props {
  combatants: Combatant[];
  rounds: RoundAction[];
  selectedCell: { round: number; combatantId: string } | null;
  onCellClick: (round: number, combatantId: string) => void;
  onCellChange: (round: number, combatantId: string, value: string) => void;
  currentTurnId: string | null;
  currentTurnRound: number;
  getInitiativeCircle: (id: string) => string;
  turnTodos: TurnTodo[] | undefined;
  onToggleTodo?: (todoId: string, round: number) => void;
}

export default function InitiativeTable(props: Props) {
  const {
    combatants, rounds, selectedCell, onCellClick, onCellChange,
    currentTurnId, currentTurnRound, getInitiativeCircle,
    turnTodos, onToggleTodo,
  } = props;

  const pendingTodoAtCell = (round: number, combatantId: string) =>
    turnTodos?.filter(t =>
      t.combatantId === combatantId && !t.executed &&
      t.startRound <= round &&
      (t.endRound === -1 || t.endRound >= round)
    ) ?? [];

  return (
    <div className="mb-4 overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 dark:bg-gray-750">
          <tr>
            <th className="sticky left-0 z-10 min-w-[160px] border-b border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-750 dark:text-gray-200">
              回合
            </th>
            {rounds.map((_, roundIdx) => (
              <th
                key={roundIdx}
                className={`border-b border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200 ${
                  currentTurnRound === roundIdx ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                }`}
              >
                回合 {roundIdx + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {combatants.map(c => (
            <tr key={c.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
              <td className="sticky left-0 z-10 border-b border-gray-100 bg-white px-3 py-2 font-medium dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-gray-500">{getInitiativeCircle(c.id)}</span>
                  <span className={`${
                    c.isDead ? 'text-red-600 line-through dark:text-red-400' :
                    c.isUnconscious ? 'text-orange-600 dark:text-orange-300' :
                    currentTurnId === c.id ? 'font-bold text-indigo-700 dark:text-indigo-200' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {c.name}
                  </span>
                </div>
              </td>
              {rounds.map((round, rIdx) => {
                const isCurrentCell = currentTurnRound === rIdx && currentTurnId === c.id;
                const isSelected = selectedCell?.round === rIdx && selectedCell.combatantId === c.id;
                const cellTodos = pendingTodoAtCell(rIdx, c.id);
                const rawValue = round[c.id] ?? '';
                const canEdit = !c.isDead && rawValue !== '被突袭' && rawValue !== '昏迷' && rawValue !== '死亡';
                return (
                  <td
                    key={rIdx}
                    onClick={() => canEdit && onCellClick(rIdx, c.id)}
                    className={`relative min-w-[180px] border-b border-gray-100 p-2 align-top dark:border-gray-700 ${
                      canEdit ? 'cursor-pointer' : 'cursor-default bg-gray-50 dark:bg-gray-800/50'
                    } ${isSelected ? 'ring-2 ring-inset ring-blue-500 bg-blue-50 dark:bg-blue-950/40' : ''} ${
                      isCurrentCell ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''
                    }`}
                  >
                    {cellTodos.length > 0 && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {cellTodos.map(todo => (
                          <span
                            key={todo.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleTodo?.(todo.id, rIdx);
                            }}
                            title="点击标记为已执行"
                            className="inline-flex cursor-pointer items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:hover:bg-purple-900/60"
                          >
                            ⏳ {todo.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {isSelected ? (
                      <textarea
                        value={rawValue}
                        onChange={(e) => onCellChange(rIdx, c.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        rows={3}
                        placeholder="输入操作记录，Shift+Enter 换行，失焦保存"
                        className="block w-full resize-y rounded-md border border-blue-400 bg-white px-2 py-1 text-xs text-gray-900 outline-none ring-2 ring-blue-100 dark:border-blue-500 dark:bg-gray-900 dark:text-white dark:ring-blue-900/40"
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200 min-h-[2rem]">
                        {rawValue || <span className="text-gray-400 dark:text-gray-500">— 点击输入 —</span>}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rounds.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          尚无回合。点击顶部「添加回合」开启第一回合。
        </div>
      )}
    </div>
  );
}
