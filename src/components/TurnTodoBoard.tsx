import { useState, useMemo } from 'react';
import { Plus, X, Trash2, Check } from 'lucide-react';
import combatStore from '@/data/combatStore';
import type { CombatRecord, Combatant, TurnTodo, TurnTodoType } from '@/types/combat';
import { TURN_TODO_TYPE_LABELS } from '@/types/combat';

interface Props {
  record: CombatRecord;
  currentTurn: { round: number; combatantId: string } | null;
  combatants: Combatant[];
}

const ALL_TYPES: (TurnTodoType | 'other')[] = [
  'save_throw',
  'damage_roll',
  'condition_check',
  'concentration_check',
  'death_save',
  'other',
];

const TYPE_LABELS_WITH_OTHER: Record<string, string> = {
  ...TURN_TODO_TYPE_LABELS,
  other: '其他',
};

export default function TurnTodoBoard({ record, currentTurn, combatants }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [activeTodo, setActiveTodo] = useState<TurnTodo | null>(null);

  // 创建表单
  const [formCombatantId, setFormCombatantId] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<TurnTodoType | 'other'>('other');
  const [formStartRound, setFormStartRound] = useState(0);
  const [formEndRound, setFormEndRound] = useState(-1);

  const activeTodos = useMemo(() => {
    if (!currentTurn || !record.turnTodos) return [];
    const round = currentTurn.round;
    return record.turnTodos.filter(
      t =>
        t.combatantId === currentTurn.combatantId &&
        t.startRound <= round &&
        (t.endRound === -1 || t.endRound >= round)
    );
  }, [record.turnTodos, currentTurn]);

  let taskCounter = 0;

  const handleCreate = () => {
    if (!formCombatantId) return;
    if (formEndRound !== -1 && formStartRound > formEndRound) return;
    combatStore.addTurnTodo(record.id, {
      combatantId: formCombatantId,
      name: formName.trim(),
      type: formType === 'other' ? null : formType,
      startRound: formStartRound,
      endRound: formEndRound,
    });
    setShowCreate(false);
    setFormCombatantId('');
    setFormName('');
    setFormType('other');
    setFormStartRound(0);
    setFormEndRound(-1);
  };

  const handleClickTodo = (todo: TurnTodo) => {
    if (todo.executed) return;
    if (todo.type === null) {
      combatStore.toggleTurnTodo(record.id, todo.id);
    } else {
      setActiveTodo(todo);
    }
  };

  const handleCompleteTodo = () => {
    if (!activeTodo) return;
    combatStore.toggleTurnTodo(record.id, activeTodo.id);
    setActiveTodo(null);
  };

  return (
    <div className="rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium dark:text-text-dark light:text-text-light">
          回合待办
        </span>
        <button
          onClick={() => {
            if (currentTurn) {
              setFormCombatantId(currentTurn.combatantId);
              setFormStartRound(currentTurn.round + 1);
            }
            setShowCreate(true);
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted hover:border-primary hover:text-primary transition-colors"
        >
          <Plus className="w-3 h-3" />
          添加待办
        </button>
      </div>

      {activeTodos.length === 0 ? (
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted py-1">
          当前回合无待办事项
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {activeTodos.map(todo => {
            const name = todo.name || `任务 ${++taskCounter}`;
            const typeLabel = todo.type ? TYPE_LABELS_WITH_OTHER[todo.type] : null;
            return (
              <div
                key={todo.id}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                  todo.executed
                    ? 'dark:bg-bg-dark light:bg-bg-light-2 dark:border-border-dark light:border-border-light opacity-60 cursor-not-allowed'
                    : 'dark:bg-bg-dark light:bg-bg-light-2 dark:border-primary/40 light:border-primary/40 cursor-pointer hover:border-primary'
                }`}
                onClick={() => handleClickTodo(todo)}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    todo.executed
                      ? 'bg-primary border-primary'
                      : 'dark:border-border-dark light:border-border-light'
                  }`}
                >
                  {todo.executed && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className={todo.executed ? 'line-through dark:text-text-dark-muted light:text-text-light-muted' : 'dark:text-text-dark light:text-text-light'}>
                  {name}
                </span>
                {typeLabel && (
                  <span className="px-1 py-0.5 rounded text-[10px] dark:bg-primary/20 light:bg-primary/20 dark:text-primary light:text-primary">
                    {typeLabel}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    combatStore.removeTurnTodo(record.id, todo.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity dark:text-text-dark-muted light:text-text-light-muted hover:text-red-500"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 创建弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">添加待办</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5 dark:text-text-dark light:text-text-light" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted block mb-1">适用者</label>
                <select
                  value={formCombatantId}
                  onChange={e => setFormCombatantId(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light"
                >
                  <option value="">选择角色…</option>
                  {combatants.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted block mb-1">名称（可选）</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="留空则自动编号"
                  className="w-full px-2 py-1.5 text-sm rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light"
                />
              </div>
              <div>
                <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted block mb-1">类型</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value as TurnTodoType | 'other')}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light"
                >
                  {ALL_TYPES.map(t => (
                    <option key={t} value={t}>{TYPE_LABELS_WITH_OTHER[t]}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted block mb-1">起始回合（0-indexed）</label>
                  <input
                    type="number"
                    value={formStartRound}
                    onChange={e => setFormStartRound(parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 text-sm rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted block mb-1">终止回合（-1=无限期）</label>
                  <input
                    type="number"
                    value={formEndRound}
                    onChange={e => setFormEndRound(parseInt(e.target.value) || -1)}
                    className="w-full px-2 py-1.5 text-sm rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light"
                  />
                </div>
              </div>
              {formEndRound !== -1 && formStartRound > formEndRound && (
                <p className="text-xs text-red-500">起始回合不能大于终止回合</p>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!formCombatantId || (formEndRound !== -1 && formStartRound > formEndRound)}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 任务弹窗（预留接口） */}
      {activeTodo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
                {activeTodo.type ? TYPE_LABELS_WITH_OTHER[activeTodo.type] : '待办'}
              </h3>
              <button
                onClick={() => setActiveTodo(null)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5 dark:text-text-dark light:text-text-light" />
              </button>
            </div>
            <p className="text-sm dark:text-text-dark light:text-text-light mb-2">
              {activeTodo.name || '未命名任务'}
            </p>
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-4">
              {activeTodo.type
                ? `请为 ${combatants.find(c => c.id === activeTodo.combatantId)?.name ?? '?'} 完成此${TYPE_LABELS_WITH_OTHER[activeTodo.type]}操作。`
                : `为 ${combatants.find(c => c.id === activeTodo.combatantId)?.name ?? '?'} 执行此任务。`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTodo(null)}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCompleteTodo}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" />
                标记完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
