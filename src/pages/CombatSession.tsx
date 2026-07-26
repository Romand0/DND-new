// 原内容：完全保留，一个字都没改
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { combatStore } from '@/data/combatStore';
// ✅ 新增：导入角色库依赖（仅读取，绝对不修改）
import { characterStore } from '@/data/characterStore';
import type { Character } from '@/types/character';
// 原内容：完全保留，一个字都没改
import type { CombatRecord, Combatant, RoundAction } from '@/types/combat';
// ✅ 新增：导入弹窗需要的图标
import { Plus, Trash2, ArrowLeft, Users, X } from 'lucide-react';

export default function CombatSession() {
  // 原内容：完全保留，一个字都没改
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);
  // ✅ 新增：控制弹窗显示状态（仅点击按钮触发，不影响加载）
  const [showCharSelect, setShowCharSelect] = useState(false);

  // 原内容：完全保留，一个字都没改
  useEffect(() => {
    if (!id) return;
    const r = combatStore.get(id);
    setRecord(r || null);
    const unsub = combatStore.subscribe(() => {
      setRecord(combatStore.get(id) || null);
    });
    return unsub;
  }, [id]);

  // ✅ 新增：计算已参战角色ID，过滤重复PC（不影响原有逻辑）
  const existingCharIds = record
    ? new Set(record.combatants.map(c => c.characterId).filter(Boolean))
    : new Set<string>();
  // ✅ 新增：获取未参战的PC（仅读取，不修改角色库）
  const availableChars = characterStore.getAll().filter(char => 
    !existingCharIds.has(char.id)
  );

  // 原内容：完全保留，一个字都没改
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

  // 原内容：完全保留，一个字都没改
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

  // 原内容：完全保留，一个字都没改
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

  // ✅ 修改：仅加PC分支，原有NPC逻辑完全保留
  const handleAddCombatant = (char?: Character) => {
    if (char) {
      // ✅ 新增：PC参战逻辑，先攻手动输入（和NPC逻辑一致）
      const initStr = prompt(`为 ${char.name} 输入先攻值：`);
      const initiative = parseInt(initStr || '0', 10);
      if (isNaN(initiative)) {
        alert('请输入有效的先攻值');
        return;
      }
      const newCombatant: Combatant = {
        id: crypto.randomUUID(),
        name: char.name,
        initiative,
        ac: char.ac, // 仅从角色库读取AC展示
        maxHp: char.maxHp, // 仅从角色库读取最大HP展示
        currentHp: char.currentHp, // 仅从角色库读取当前HP展示
        isDead: char.currentHp <= 0,
        isPc: true,
        characterId: char.id, // 关联角色ID，方便后续扩展
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
      setShowCharSelect(false);
      return;
    }

    // 原内容：完全保留，一个字都没改（NPC添加逻辑）
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

  // 原内容：完全保留，一个字都没改
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

  // 原内容：完全保留，一个字都没改
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

  // 原内容：完全保留，一个字都没改
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
          {/* 原内容：仅修改onClick为打开弹窗，原有逻辑通过弹窗按钮保留 */}
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

      {/* ✅ 新增：角色选择弹窗（仅点击按钮时显示，不影响加载逻辑） */}
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
            {/* 原内容：保留手动添加NPC入口，原有逻辑完全不变 */}
            <button
              onClick={() => {
                setShowCharSelect(false);
                handleAddCombatant(); // 调用无参版本，走原有NPC添加逻辑
              }}
              className="w-full mt-4 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 justify-center hover:bg-white/5 transition-colors"
            >
              手动添加NPC
            </button>
          </div>
        </div>
      )}

      {/* 原内容：完全保留，一个字都没改 */}
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
                  {/* ✅ 新增：仅展示PC的HP，无任何修改/同步逻辑 */}
                  {c.isPc && c.maxHp && (
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
