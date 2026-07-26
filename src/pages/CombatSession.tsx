import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { combatStore } from '@/data/combatStore';
import { characterStore } from '@/data/characterStore';
import type { CombatRecord, Combatant, RoundAction } from '@/types/combat';
import type { Character } from '@/types/character';
import { Plus, Trash2, ArrowLeft, Users, X } from 'lucide-react';

export default function CombatSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);
  // ✅ 新增：控制角色选择弹窗的显示状态（仅点击按钮时触发，不影响加载）
  const [showCharSelect, setShowCharSelect] = useState(false);

  // ✅ 100%保留你原有的加载逻辑，一个字都没改
  useEffect(() => {
    if (!id) return;
    const r = combatStore.get(id);
    setRecord(r || null);
    const unsub = combatStore.subscribe(() => {
      setRecord(combatStore.get(id) || null);
    });
    return unsub;
  }, [id]);

  // ✅ 100%保留你原有的权限校验逻辑，一个字都没改
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
        <div className="text-center py-16 text-sm opacity-50">战斗记录未找到</div>
      </div>
    );
  }

  // ✅ 100%保留你原有的单元格编辑逻辑，一个字都没改
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

  // ✅ 新增：已参战的角色ID集合，用于过滤弹窗里的角色
  const existingCharIds = new Set(
    record.combatants.map(c => c.characterId).filter(Boolean)
  );
  // ✅ 新增：可选角色列表（仅显示未参战的PC）
  const availableChars = characterStore.getAll().filter(char => 
    !existingCharIds.has(char.id)
  );

  // ✅ 修改：合并原有NPC添加逻辑 + 新增PC添加逻辑（无任何HP同步代码）
  const handleAddCombatant = (char?: Character) => {
    if (char) {
      // ✅ 新增：从角色库拉PC信息（仅读取，不修改角色库）
      const initStr = prompt(`为 ${char.name} 输入先攻值：`);
      const initiative = parseInt(initStr || '0', 10);
      if (isNaN(initiative)) {
        alert('请输入有效的先攻值');
        return;
      }
      const newCombatant: Combatant = {
        id: crypto.randomUUID(),
        name: char.name,
        initiative, // 手动输入的先攻
        ac: char.ac, // 从角色库读取AC
        maxHp: char.maxHp, // 从角色库读取最大HP
        currentHp: char.currentHp, // 从角色库读取当前HP（仅展示，不回写）
        isDead: char.currentHp <= 0,
        isPc: true,
        characterId: char.id, // 关联角色ID，方便后续扩展
        note: '',
      };
      // 按先攻排序（和你原有逻辑一致）
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
      setShowCharSelect(false);
    } else {
      // ✅ 100%保留你原有的NPC手动输入逻辑，一个字都没改
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
    }
  };

  // ✅ 100%保留你原有的新增轮次逻辑，一个字都没改
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

  // ✅ 100%保留你原有的删除参战者逻辑，一个字都没改
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
      {/* ✅ 100%保留你原有的头部布局，仅修改添加按钮的交互 */}
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
          {/* ✅ 修改：点击打开角色选择弹窗，原有NPC入口保留 */}
          <button
            onClick={() => setShowCharSelect(true)}
            className="px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
          >
            <Users className="w-4 h-4" />
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

      {/* ✅ 新增：角色选择弹窗（仅点击按钮时显示，不影响加载） */}
      {showCharSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">选择PC参战</h3>
              <button onClick={() => setShowCharSelect(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            {availableChars.length === 0 ? (
              <div className="text-center py-8 text-sm opacity-50">无可用PC，请先在角色库添加</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableChars.map(char => (
                  <div
                    key={char.id}
                    onClick={() => handleAddCombatant(char)}
                    className="p-3 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/50 cursor-pointer transition-colors"
                  >
                    <div className="font-medium dark:text-text-dark light:text-text-light">{char.name}</div>
                    <div className="text-xs opacity-60">AC {char.ac} | HP {char.currentHp}/{char.maxHp}</div>
                  </div>
                ))}
              </div>
            )}
            {/* ✅ 100%保留原有手动添加NPC入口，一个字都没改 */}
            <button
              onClick={() => {
                setShowCharSelect(false);
                handleAddCombatant(); // 触发原有NPC手动输入逻辑
              }}
              className="w-full mt-4 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 justify-center hover:bg-white/5 transition-colors"
            >
              手动添加NPC
            </button>
          </div>
        </div>
      )}

      {/* ✅ 100%保留你原有的表格结构，仅展示HP，无任何修改/同步逻辑 */}
      <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="dark:bg-card-dark light:bg-card-light">
              <th className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-card-dark light:bg-card-light z-10 w-16 text-center">
                轮次
              </th>
              {record.combatants.map((c) => (
                <th key={c.id} className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[140px] relative group">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs opacity-60">先攻 {c.initiative}</div>
                  {c.isPc && <div className="text-xs opacity-60">PC</div>}
                  {c.isDead && <div className="text-xs text-danger">死亡</div>}
                  {/* ✅ 仅展示HP，无任何修改按钮，彻底避免同步问题 */}
                  {c.maxHp && (
                    <div className="text-xs opacity-60 mt-1">
                      HP {c.currentHp}/{c.maxHp}
                    </div>
                  )}
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
