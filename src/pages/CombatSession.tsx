import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import combatStore from '@/data/combatStore';
import { characterStore } from '@/data/characterStore';
import type { CombatRecord, Combatant, RoundAction } from '@/types/combat';
import { Plus, Trash2, ArrowLeft, UserPlus, Users, X } from 'lucide-react';

export default function CombatSession() {
  // ✅ 严格对齐你现有路由的参数名`id`，不再瞎改sessionId
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);
  // ✅ 新增：角色选择弹窗状态（仅补充，不覆盖原有逻辑）
  const [showCharSelect, setShowCharSelect] = useState(false);

  // ✅ 保留你原有的权限校验逻辑
  useEffect(() => {
    if (!isDM) navigate('/', { replace: true });
  }, [isDM, navigate]);

  // ✅ 保留你原有的加载逻辑，补充HP同步逻辑
  const loadRecord = useCallback(() => {
    if (!id) {
      navigate('/combat', { replace: true });
      return;
    }
    const r = combatStore.get(id);
    if (!r) {
      navigate('/combat', { replace: true });
      return;
    }
    // 按先攻降序排序（符合设计文档「快速建表」要求）
    const sortedCombatants = [...r.combatants].sort(
      (a, b) => b.initiative - a.initiative
    );
    setRecord({ ...r, combatants: sortedCombatants });
  }, [id, navigate]);

  useEffect(() => {
    loadRecord();
    // 订阅战斗记录变化
    const unsubCombat = combatStore.subscribe(loadRecord);
    // ✅ 新增：订阅角色库变化，实现HP双向同步（设计文档核心要求）
    const unsubChar = characterStore.subscribe(() => {
      if (!id) return;
      const r = combatStore.get(id);
      if (!r) return;
      // 同步所有PC的HP到战斗记录
      const updatedCombatants = r.combatants.map(c => {
        if (c.isPc && c.characterId) {
          const char = characterStore.get(c.characterId);
          return char ? { ...c, currentHp: char.currentHp, maxHp: char.maxHp } : c;
        }
        return c;
      });
      setRecord(prev => prev ? { ...prev, combatants: updatedCombatants } : null);
    });
    return () => {
      unsubCombat();
      unsubChar();
    };
  }, [loadRecord, id]);

  // ✅ 新增：已参战角色ID集合，用于过滤角色选择弹窗
  const existingCharIds = useMemo(() => 
    new Set(record?.combatants.map(c => c.characterId).filter(Boolean) || []),
  [record?.combatants]);

  // ✅ 新增：可选角色列表（过滤已参战的角色）
  const availableChars = useMemo(() => 
    characterStore.getAll().filter(char => !existingCharIds.has(char.id)),
  [existingCharIds]);

  // ✅ 保留你原有的单元格编辑逻辑，一字未改
  const handleCellChange = (roundIndex: number, combatantId: string, value: string) => {
    const updatedRounds = [...record!.rounds];
    updatedRounds[roundIndex] = {
      ...updatedRounds[roundIndex],
      [combatantId]: value,
    };
    combatStore.update(record!.id, {
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  // ✅ 修改：保留你原有的prompt加NPC逻辑，新增角色库拉取PC逻辑
  const handleAddCombatant = (char?: { 
    id: string; 
    name: string; 
    initiative: number; 
    ac: number; 
    maxHp: number; 
    currentHp: number 
  }) => {
    if (char) {
      // ✅ 新增：从角色库拉取PC（设计文档核心要求）
      const newCombatant: Combatant = {
        id: crypto.randomUUID(),
        name: char.name,
        initiative: char.initiative || 0,
        ac: char.ac || char.armorClass || 0,
        maxHp: char.maxHp,
        currentHp: char.currentHp,
        isDead: false, // 设计文档要求的字段
        isPc: true, // 设计文档要求的字段
        characterId: char.id, // 设计文档要求的字段，关联角色卡
        note: '',
      };
      const updatedCombatants = [...record!.combatants, newCombatant].sort(
        (a, b) => b.initiative - a.initiative
      );
      const updatedRounds = record!.rounds.map(round => ({
        ...round,
        [newCombatant.id]: '',
      }));
      combatStore.update(record!.id, {
        combatants: updatedCombatants,
        rounds: updatedRounds,
        updatedAt: Date.now(),
      });
      setShowCharSelect(false);
    } else {
      // ✅ 完全保留你原有的NPC手动输入逻辑，一字未改
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
      const updatedCombatants = [...record!.combatants, newCombatant].sort(
        (a, b) => b.initiative - a.initiative
      );
      const updatedRounds = record!.rounds.map(round => ({
        ...round,
        [newCombatant.id]: '',
      }));
      combatStore.update(record!.id, {
        combatants: updatedCombatants,
        rounds: updatedRounds,
        updatedAt: Date.now(),
      });
    }
  };

  // ✅ 新增：HP修改+同步到角色库（设计文档核心要求）
  const updateHp = (combatantId: string, delta: number) => {
    const combatant = record!.combatants.find(c => c.id === combatantId);
    if (!combatant || !combatant.maxHp) return;
    const newHp = Math.max(0, Math.min(combatant.maxHp, combatant.currentHp + delta));
    // 更新战斗记录中的HP
    const updatedCombatants = record!.combatants.map(c =>
      c.id === combatantId ? { ...c, currentHp: newHp, isDead: newHp === 0 } : c
    );
    combatStore.update(record!.id, {
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });
    // 同步到角色库（仅PC）
    if (combatant.isPc && combatant.characterId) {
      characterStore.update(combatant.characterId, { currentHp: newHp });
    }
  };

  // ✅ 保留你原有的新增轮次逻辑，一字未改
  const handleAddRound = () => {
    const newRound: RoundAction = {};
    record!.combatants.forEach(combatant => {
      newRound[combatant.id] = '';
    });
    const updatedRounds = [...record!.rounds, newRound];
    combatStore.update(record!.id, {
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  // ✅ 保留你原有的删除参战者逻辑，一字未改
  const handleRemoveCombatant = (combatantId: string) => {
    if (!confirm('确定删除该参战者吗？')) return;
    const updatedCombatants = record!.combatants.filter(c => c.id !== combatantId);
    const updatedRounds = record!.rounds.map(round => {
      const newRound = { ...round };
      delete newRound[combatantId];
      return newRound;
    });
    combatStore.update(record!.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  // ✅ 保留你原有的加载状态逻辑，一字未改
  if (!isDM || !record) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate('/combat')} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回战斗列表
        </button>
        <div className="text-center py-16 text-sm opacity-50">
          {!isDM ? '仅DM可访问战斗记录' : '战斗记录未找到'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto p-4 space-y-4 overflow-x-auto">
      {/* ✅ 保留你原有的头部布局，仅修改添加参战者按钮的交互 */}
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
          {/* ✅ 修改：点击后打开角色选择弹窗，保留原有NPC输入逻辑 */}
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

      {/* ✅ 新增：角色选择弹窗（完全贴合你现有UI风格，不新增多余元素） */}
      {showCharSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">选择参战角色</h3>
              <button onClick={() => setShowCharSelect(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            {availableChars.length === 0 ? (
              <div className="text-center py-8 text-sm opacity-50">无可用角色，请先在角色库中添加</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableChars.map(char => (
                  <div
                    key={char.id}
                    onClick={() => handleAddCombatant({
                      id: char.id,
                      name: char.name,
                      initiative: char.initiative || 0,
                      ac: char.armorClass || 0,
                      maxHp: char.maxHp || 0,
                      currentHp: char.currentHp || 0,
                    })}
                    className="p-3 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/50 cursor-pointer transition-colors"
                  >
                    <div className="font-medium dark:text-text-dark light:text-text-light">{char.name}</div>
                    <div className="text-xs opacity-60">AC {char.armorClass} | HP {char.currentHp}/{char.maxHp}</div>
                  </div>
                ))}
              </div>
            )}
            {/* ✅ 保留原有手动添加NPC的入口，不覆盖你的原有逻辑 */}
            <button
              onClick={() => {
                setShowCharSelect(false);
                handleAddCombatant(); // 传入undefined触发你原有的prompt逻辑
              }}
              className="w-full mt-4 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 justify-center hover:bg-white/5 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              手动添加NPC
            </button>
          </div>
        </div>
      )}

      {/* ✅ 保留你原有的表格逻辑，仅新增HP操作按钮和状态标识（用设计文档要求的字段） */}
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
                  {/* ✅ 用设计文档要求的字段，仅显示标识，不新增展示内容 */}
                  {c.isPc && <div className="text-xs opacity-60">PC</div>}
                  {c.isDead && <div className="text-xs text-danger">死亡</div>}
                  {/* ✅ 新增HP操作按钮（仅在有HP数据的参战者显示） */}
                  {c.maxHp && (
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateHp(c.id, -1);
                        }}
                        className="p-0.5 rounded hover:bg-danger/20 text-danger text-xs"
                      >
                        -1
                      </button>
                      <span className="text-xs">{c.currentHp}/{c.maxHp}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateHp(c.id, 1);
                        }}
                        className="p-0.5 rounded hover:bg-success/20 text-success text-xs"
                      >
                        +1
                      </button>
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
