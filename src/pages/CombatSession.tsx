import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { combatStore } from '@/data/combatStore';
import type { CombatRecord, Combatant, RoundAction } from '@/types/combat';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';

export default function CombatSession() {
  // ✅ 唯一修改：和App.tsx路由参数名完全对齐
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);

  useEffect(() => {
    // ✅ 唯一修改：判断sessionId是否存在
    if (!sessionId) return;
    // ✅ 唯一修改：用sessionId查询战斗记录
    const r = combatStore.get(sessionId);
    setRecord(r || null);
    const unsub = combatStore.subscribe(() => {
      // ✅ 唯一修改：订阅更新时也用sessionId
      setRecord(combatStore.get(sessionId) || null);
    });
    return unsub;
  // ✅ 唯一修改：依赖项改成sessionId
  }, [sessionId]);

  if (!isDM) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate('/combat')} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        <div className="text-center py-16 text-sm opacity-50">无权限访问</div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate('/combat')} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        <div className="text-center py-16 text-sm opacity-50">
          战斗记录未找到（sessionId: {sessionId || '空'}）
        </div>
      </div>
    );
  }

  const handleCellChange = (roundIndex: number, combatantId: string, value: string) => {
    const updatedRounds = [...record.rounds];
    updatedRounds[roundIndex] = {
      ...updatedRounds[roundIndex],
      [combatantId]: value,
    };
    combatStore.update(record.id, {
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  const handleAddCombatant = () => {
    const name = prompt('参战者名称：');
    if (!name) return;
    const init = parseInt(prompt('先攻值：') || '0', 10);
    if (isNaN(init)) return;
    const newCombatant: Combatant = {
      id: crypto.randomUUID(),
      name,
      initiative: init,
      isDead: false,
      isPc: false,
      note: '',
    };
    const updatedCombatants = [...record.combatants, newCombatant].sort(
      (a, b) => b.initiative - a.initiative
    );
    const updatedRounds = record.rounds.map(round => ({
      ...round,
      [newCombatant.id]: '',
    }));
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  const handleAddRound = () => {
    const newRound: RoundAction = {};
    record.combatants.forEach(combatant => {
      newRound[combatant.id] = '';
    });
    const updatedRounds = [...record.rounds, newRound];
    combatStore.update(record.id, {
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  const handleRemoveCombatant = (combatantId: string) => {
    if (!confirm('确定删除该参战者吗？')) return;
    const updatedCombatants = record.combatants.filter(c => c.id !== combatantId);
    const updatedRounds = record.rounds.map(round => {
      const newRound = { ...round };
      delete newRound[combatantId];
      return newRound;
    });
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="max-w-full mx-auto p-4 space-y-4 overflow-x-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/combat')} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold dark:text-text-dark light:text-text-light truncate">
            {record.title}
          </h1>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleAddCombatant}
            className="px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加参战者
          </button>
          <button
            onClick={handleAddRound}
            className="px-3 py-2 rounded-lg bg-primary text-white text-sm flex items-center gap-1 hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增轮次
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="dark:bg-card-dark light:bg-card-light">
              <th className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-card-dark light:bg-card-light z-10 w-16 text-center">
                轮次
              </th>
              {record.combatants.map((c) => (
                <th key={c.id} className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] relative group">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs opacity-60">先攻 {c.initiative}</div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveCombatant(c.id);
                    }}
                    className="absolute top-1 right-1 p-0.5 rounded hover:bg-danger/20 text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除参战者"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {record.rounds.map((round, roundIndex) => (
              <tr key={roundIndex} className="border-t dark:border-border-dark/50 light:border-border-light/50">
                <td className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-bg-dark light:bg-bg-light font-medium text-center">
                  {roundIndex + 1}
                </td>
                {record.combatants.map((c) => {
                  const action = round[c.id] || '';
                  const isEditing =
                    editingCell?.round === roundIndex &&
                    editingCell?.combatantId === c.id;
                  return (
                    <td
                      key={c.id}
                      className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] cursor-text hover:bg-white/5 transition-colors"
                      onClick={() => setEditingCell({ round: roundIndex, combatantId: c.id })}
                    >
                      {isEditing ? (
                        <textarea
                          autoFocus
                          value={action}
                          onChange={(e) => handleCellChange(roundIndex, c.id, e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-full bg-transparent outline-none resize-none text-xs"
                          rows={2}
                        />
                      ) : (
                        <div className="whitespace-pre-wrap text-xs min-h-[2em]">{action || ''}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
