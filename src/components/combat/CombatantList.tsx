import type { Combatant, TurnTodo } from '@/types/combat';

interface Props {
  combatants: Combatant[];
  turnTodos: TurnTodo[] | undefined;
  getEffectiveAc: (c: Combatant) => number;
  batchMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (checked: boolean) => void;
  onSetBatchMode: (v: boolean) => void;
  onBatchDelete: () => void;
  editingInitiative: string | null;
  initiativeInput: string;
  onInitiativeInputChange: (v: string) => void;
  onStartEditInitiative: (id: string) => void;
  onSaveInitiative: (id: string) => void;
  onCancelEditInitiative: () => void;
  onRemoveCombatant: (id: string) => void;
  currentTurnId: string | null;
  currentTurnRound: number;
}

export default function CombatantList(props: Props) {
  const {
    combatants, turnTodos, getEffectiveAc,
    batchMode, selectedIds, onToggleSelect, onSelectAll, onSetBatchMode, onBatchDelete,
    editingInitiative, initiativeInput, onInitiativeInputChange,
    onStartEditInitiative, onSaveInitiative, onCancelEditInitiative,
    onRemoveCombatant, currentTurnId, currentTurnRound,
  } = props;

  const hasTodos = (id: string) =>
    turnTodos?.some(t =>
      t.combatantId === id && !t.executed &&
      t.startRound <= currentTurnRound &&
      (t.endRound === -1 || t.endRound >= currentTurnRound)
    );

  return (
    <div className="mb-4 rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light">
      <div className="flex items-center justify-between border-b dark:border-border-dark light:border-border-light p-3">
        <h3 className="font-semibold dark:text-text-dark light:text-text-light">
          参战者（{combatants.length}）
        </h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs dark:text-text-dark-muted light:text-text-light-muted">
            <input
              type="checkbox"
              checked={batchMode}
              onChange={(e) => onSetBatchMode(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            批量操作
          </label>
          {batchMode && (
            <>
              <button
                onClick={() => onSelectAll(true)}
                className="rounded border dark:border-border-dark light:border-border-light px-2 py-1 text-xs dark:text-text-dark light:text-text-light dark:hover:bg-bg-dark light:hover:bg-bg-light-2"
              >全选</button>
              <button
                onClick={() => onSelectAll(false)}
                className="rounded border dark:border-border-dark light:border-border-light px-2 py-1 text-xs dark:text-text-dark light:text-text-light dark:hover:bg-bg-dark light:hover:bg-bg-light-2"
              >取消</button>
              <button
                onClick={onBatchDelete}
                disabled={selectedIds.size === 0}
                className="rounded bg-danger px-2 py-1 text-xs font-medium text-white hover:bg-danger/90 disabled:bg-gray-400"
              >删除选中</button>
            </>
          )}
        </div>
      </div>
      <div className="divide-y dark:divide-border-dark light:divide-border-light max-h-[440px] overflow-y-auto">
        {combatants.map(c => {
          const effAc = getEffectiveAc(c);
          const maxHp = c.maxHp ?? 0;
          const curHp = c.currentHp ?? 0;
          const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, (curHp / maxHp) * 100)) : 0;
          const isCurrentTurn = currentTurnId === c.id;
          return (
            <div
              key={c.id}
              className={`flex items-start gap-2 p-3 transition ${
                isCurrentTurn ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
              }`}
            >
              {batchMode && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(c.id)}
                  onChange={() => onToggleSelect(c.id)}
                  className="mt-1 h-4 w-4"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold text-sm ${
                    c.isDead ? 'text-danger line-through' :
                    c.isUnconscious ? 'text-orange-600 dark:text-orange-300' :
                    'dark:text-text-dark light:text-text-light'
                  }`}>
                    {c.name}
                  </span>
                  {c.isPc ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">玩家</span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200">敌人</span>
                  )}
                  {hasTodos(c.id) && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 animate-pulse">
                      ⏳ 待办
                    </span>
                  )}
                  {isCurrentTurn && (
                    <span className="rounded-full bg-yellow-200 px-2 py-0.5 text-[10px] font-semibold text-yellow-900 dark:bg-yellow-700/60 dark:text-yellow-100">
                      👉 行动中
                    </span>
                  )}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold dark:text-text-dark-muted light:text-text-light-muted">先攻：</span>
                    {editingInitiative === c.id ? (
                      <>
                        <input
                          type="number"
                          value={initiativeInput}
                          onChange={(e) => onInitiativeInputChange(e.target.value)}
                          className="w-16 rounded border dark:border-border-dark light:border-border-light px-1 py-0.5 text-xs dark:bg-bg-dark dark:text-text-dark"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSaveInitiative(c.id);
                            else if (e.key === 'Escape') onCancelEditInitiative();
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => onSaveInitiative(c.id)}
                          className="rounded bg-primary px-1.5 py-0.5 text-[10px] text-white"
                        >✔</button>
                        <button
                          onClick={onCancelEditInitiative}
                          className="rounded bg-gray-400 px-1.5 py-0.5 text-[10px] text-white"
                        >✕</button>
                      </>
                    ) : (
                      <span onDoubleClick={() => onStartEditInitiative(c.id)} className="cursor-pointer hover:underline">
                        {c.initiative}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold dark:text-text-dark-muted light:text-text-light-muted">AC：</span>
                    <span className="font-mono">{c.ac ?? '—'}{effAc !== null && effAc !== undefined && effAc !== (c.ac ?? 0) ? `(+装备${effAc})` : ''}</span>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold dark:text-text-dark-muted light:text-text-light-muted">HP：</span>
                      <span className="font-mono">{curHp} / {maxHp || '—'}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full dark:bg-bg-dark light:bg-bg-light-2">
                      <div
                        className={`h-full rounded-full transition ${
                          hpPct > 50 ? 'bg-green-500' :
                          hpPct > 25 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              {!batchMode && (
                <button
                  onClick={() => onRemoveCombatant(c.id)}
                  title="移除参战者"
                  className="rounded p-1 dark:text-text-dark-muted light:text-text-light-muted hover:bg-danger/10 hover:text-danger"
                >
                  🗑
                </button>
              )}
            </div>
          );
        })}
        {combatants.length === 0 && (
          <div className="p-6 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">
            尚未添加参战者。点击上方「添加角色」或「添加敌人」开始。
          </div>
        )}
      </div>
    </div>
  );
}
