import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import combatStore from '@/data/combatStore';
import { characterStore } from '@/data/characterStore';
import type { CombatRecord, Combatant, RoundAction } from '@/types/combat';
import type { Character } from '@/types/character';
import { Plus, Trash2, ArrowLeft, Users, X } from 'lucide-react';

export default function CombatSession() {
  // ✅ 严格用你原有路由参数名`id`，不做任何修改
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);
  // ✅ 角色选择弹窗状态
  const [showCharSelect, setShowCharSelect] = useState(false);

  // ✅ 保留你原有权限校验
  useEffect(() => {
    if (!isDM) navigate('/', { replace: true });
  }, [isDM, navigate]);

  // ✅ 加载战斗记录 + 同步PC最新HP（删掉不存在的subscribe）
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
    // ✅ 核心：加载时用角色库最新HP覆盖战斗记录里的PC HP（实现反向同步）
    const syncedCombatants = r.combatants.map(c => {
      if (c.isPc && c.characterId) {
        const char = characterStore.get(c.characterId);
        if (char) {
          return {
            ...c,
            currentHp: char.currentHp,
            maxHp: char.maxHp,
            ac: char.ac, // 同步最新AC
          };
        }
      }
      return c;
    });
    // 按先攻降序排序（符合设计文档要求）
    const sortedCombatants = [...syncedCombatants].sort(
      (a, b) => b.initiative - a.initiative
    );
    setRecord({ ...r, combatants: sortedCombatants });
  }, [id, navigate]);

  useEffect(() => {
    loadRecord();
    // ✅ 只订阅combatStore的变化（characterStore没有subscribe）
    const unsub = combatStore.subscribe(loadRecord);
    return unsub;
  }, [loadRecord]);

  // ✅ 已参战角色ID集合（过滤已添加的PC）
  const existingCharIds = useMemo(() => 
    new Set(record?.combatants.map(c => c.characterId).filter(Boolean) || []),
  [record?.combatants]);

  // ✅ 可选角色列表（仅显示未参战的PC）
  const availableChars = useMemo(() => 
    characterStore.getAll().filter(char => !existingCharIds.has(char.id)),
  [existingCharIds]);

  // ✅ 保留你原有单元格编辑逻辑
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

  // ✅ 修改：添加参战者（PC需要输入先攻，和NPC逻辑一致）
  const handleAddCombatant = (char?: Character) => {
    if (char) {
      // ✅ PC：从角色库拉取基础信息，手动输入先攻
      const initStr = prompt(`为 ${char.name} 输入先攻值：`);
      const initiative = parseInt(initStr || '0', 10);
      if (isNaN(initiative)) {
        alert('请输入有效的先攻值');
        return;
      }
      const newCombatant: Combatant = {
        id: crypto.randomUUID(),
        name: char.name,
        initiative, // 手动输入的先攻值
        ac: char.ac, // 角色卡的AC字段（正确字段名）
        maxHp: char.maxHp,
        currentHp: char.currentHp,
        isDead: char.currentHp <= 0,
        isPc: true,
        characterId: char.id, // 关联角色ID
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
      // ✅ 完全保留你原有NPC手动输入逻辑
      const name = prompt('NPC名称：');
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

  // ✅ 修改：HP更新+同步到角色库（仅PC）
  const updateHp = (combatantId: string, delta: number) => {
    const combatant = record!.combatants.find(c => c.id === combatantId);
    if (!combatant || !combatant.maxHp) return;
    const newHp = Math.max(0, Math.min(combatant.maxHp, combatant.currentHp + delta));
    // 更新战斗记录
    const updatedCombatants = record!.combatants.map(c =>
      c.id === combatantId ? { ...c, currentHp: newHp, isDead: newHp === 0 } : c
    );
    combatStore.update(record!.id, {
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });
    // ✅ 同步到角色库（仅PC，调用真实存在的update方法）
    if (combatant.isPc && combatant.characterId) {
      characterStore.update(combatant.characterId, { currentHp: newHp });
    }
  };

  // ✅ 保留你原有新增轮次逻辑
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

  // ✅ 保留你原有删除参战者逻辑
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

  // ✅ 保留你原有加载状态
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
      {/* ✅ 保留你原有头部布局 */}
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

      {/* ✅ 角色选择弹窗（无多余字段） */}
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
            {/* 保留手动添加NPC入口 */}
            <button
              onClick={() => {
                setShowCharSelect(false);
                handleAddCombatant(); // 触发NPC手动输入逻辑
              }}
              className="w-full mt-4 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 justify-center hover:bg-white/5 transition-colors"
            >
              手动添加NPC
            </button>
          </div>
        </div>
      )}

      {/* ✅ 保留你原有表格结构，仅增加HP操作按钮 */}
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
                  {/* ✅ HP操作按钮（仅在有HP数据的参战者显示） */}
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
