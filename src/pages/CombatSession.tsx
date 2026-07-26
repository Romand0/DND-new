import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, UserPlus } from 'lucide-react';
import combatStore from '@/data/combatStore';
import type { CombatRecord, Combatant, RoundAction } from '@/types/combat';

export default function CombatSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);

  /**
   * 加载战斗记录并按先攻降序排序（符合设计文档「快速建表自动排序」要求）
   * 订阅store变化实时更新UI
   */
  const loadRecord = useCallback(() => {
    if (!id) {
      navigate('/combat');
      return;
    }
    const r = combatStore.get(id);
    if (r) {
      // 核心逻辑：参战者始终按先攻值从高到低排序
      const sortedCombatants = [...r.combatants].sort(
        (a, b) => b.initiative - a.initiative
      );
      setRecord({ ...r, combatants: sortedCombatants });
    } else {
      setRecord(null);
    }
  }, [id, navigate]);

  useEffect(() => {
    loadRecord();
    const unsub = combatStore.subscribe(loadRecord);
    return unsub;
  }, [loadRecord]);

  // 记录未找到状态
  if (!record) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate('/combat')} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回战斗列表
        </button>
        <div className="text-center py-16 text-sm opacity-50">战斗记录未找到</div>
      </div>
    );
  }

  /**
   * 更新指定轮次、指定参战者的行动记录
   */
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

  /**
   * 添加参战者（保留你初版的prompt交互逻辑）
   * 自动同步到所有已有轮次的行动记录中
   */
  const handleAddCombatant = () => {
    const name = prompt('参战者名称：');
    if (!name?.trim()) return;
    
    const initStr = prompt('先攻值：');
    const initiative = parseInt(initStr || '0', 10);
    if (isNaN(initiative)) {
      alert('请输入有效的先攻值');
      return;
    }

    const newCombatant: Combatant = {
      id: crypto.randomUUID(),
      name: name.trim(),
      initiative,
      // 按设计文档，以下字段为可选，暂不填充
      isPc: false,
      note: '',
    };

    // 新参战者加入后重新排序
    const updatedCombatants = [...record.combatants, newCombatant].sort(
      (a, b) => b.initiative - a.initiative
    );
    // 给所有已有轮次补充新参战者的行动记录（避免表格列缺失）
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

  /**
   * 新增轮次
   * 自动初始化所有参战者的行动记录为空（符合RoundAction类型定义）
   */
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

  /**
   * 删除参战者
   * 同步清理所有轮次中该参战者的残留记录
   */
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
      {/* 头部导航和操作区（完全保留你初版的布局） */}
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
            <UserPlus className="w-4 h-4" />
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

      {/* 先攻表格（核心设计保留，删除所有多余展示字段） */}
      <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="dark:bg-card-dark light:bg-card-light">
              {/* 固定左侧的轮次列 */}
              <th className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-card-dark light:bg-card-light z-10 w-16 text-center">
                轮次
              </th>
              {/* 参战者列（仅展示名称和先攻值，无HP/AC/加值） */}
              {record.combatants.map((c) => (
                <th key={c.id} className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] relative group">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs opacity-60">先攻 {c.initiative}</div>
                  {/* 删除按钮（仅hover显示，不干扰阅读） */}
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
                {/* 轮次编号 */}
                <td className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-bg-dark light:bg-bg-light font-medium text-center">
                  {roundIndex + 1}
                </td>
                {/* 行动记录单元格（保留你初版的编辑逻辑） */}
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
