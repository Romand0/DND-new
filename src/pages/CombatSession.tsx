// src/pages/CombatSession.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, UserPlus } from 'lucide-react';
import { combatStore } from '@/data/combatStore';
import type { CombatRecord } from '@/types/combat';

export default function CombatSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    const r = combatStore.get(id);
    setRecord(r || null);
    const unsub = combatStore.subscribe(() => {
      setRecord(combatStore.get(id) || null);
    });
    return unsub;
  }, [id]);

  if (!record) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate('/combat')} className="text-primary">&larr; 返回</button>
        <div className="text-center py-16 text-sm opacity-50">战斗记录未找到</div>
      </div>
    );
  }

  const handleCellChange = (roundIndex: number, combatantId: string, value: string) => {
    combatStore.updateAction(record.id, roundIndex, combatantId, value);
  };

  const handleAddCombatant = () => {
    // 简单弹窗输入名称和先攻
    const name = prompt('参战者名称：');
    if (!name) return;
    const init = parseInt(prompt('先攻值：') || '0', 10);
    if (isNaN(init)) return;
    combatStore.addCombatant(record.id, { name, initiative: init });
  };

  return (
    <div className="max-w-full mx-auto p-4 space-y-4 overflow-x-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/combat')} className="p-2 rounded hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold dark:text-text-dark light:text-text-light">{record.title}</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddCombatant}
            className="px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1"
          >
            <UserPlus className="w-4 h-4" />
            添加参战者
          </button>
          <button
            onClick={() => combatStore.addRound(record.id)}
            className="px-3 py-2 rounded-lg bg-primary text-white text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            新增轮次
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="dark:bg-card-dark light:bg-card-light">
              <th className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-card-dark light:bg-card-light z-10">
                轮次
              </th>
              {record.combatants.map((c) => (
                <th key={c.id} className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] relative group">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs opacity-60">先攻 {c.initiative}</div>
                  {c.ac && <div className="text-xs opacity-60">AC {c.ac}</div>}
                  <button
                    onClick={() => combatStore.removeCombatant(record.id, c.id)}
                    className="absolute top-1 right-1 p-0.5 rounded hover:bg-danger/20 text-danger opacity-0 group-hover:opacity-100 transition-opacity"
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
                    editingCell?.round === roundIndex && editingCell?.combatantId === c.id;
                  return (
                    <td
                      key={c.id}
                      className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] cursor-text"
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
