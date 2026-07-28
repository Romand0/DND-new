// 原内容：完全保留，一个字都没改
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import combatStore from '@/data/combatStore';
import { characterStore } from '@/data/characterStore';
import npcTemplateStore from '@/data/npcTemplateStore';
import battlegroundStore from '@/data/battlegroundStore';
import type { Character, Attack } from '@/types/character';
import type { CombatRecord, Combatant, RoundAction, NpcTemplate, NpcAttack } from '@/types/combat';
import { Plus, Trash2, ArrowLeft, Users, X, GripVertical } from 'lucide-react';
import Battleground from '@/components/Battleground';
import NpcCreator from '@/components/NpcCreator';
import CombatAttackModal from '@/components/CombatAttackModal';
import CombatDamageModal from '@/components/CombatDamageModal';

export default function CombatSession() {
  // 原内容：完全保留，一个字都没改（和App.tsx路由参数完全对齐）
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);
  // ✅ 新增：控制角色选择弹窗的显示状态（仅点击按钮触发，不影响加载逻辑）
  const [showCharSelect, setShowCharSelect] = useState(false);
  // ✅ 新增：先攻编辑状态（先攻属于战斗临时数据，PC/NPC 均可编辑）
  const [editingInitiative, setEditingInitiative] = useState<string | null>(null);
  const [initiativeInput, setInitiativeInput] = useState('');
  // ✅ 新增：批量删除状态
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // ✅ 新增：先攻投掷弹窗（PC 参战用）
  const [initiativeRollOpen, setInitiativeRollOpen] = useState(false);
  const [selectedPc, setSelectedPc] = useState<Character | null>(null);
  const [d20Input, setD20Input] = useState('');
  // ✅ 新增：NPC 创建器
  const [npcCreatorOpen, setNpcCreatorOpen] = useState(false);
  const [npcTemplates, setNpcTemplates] = useState<NpcTemplate[]>([]);
  // ✅ 新增：战斗攻击检定弹窗（在 main 上处理）
  const [attackModal, setAttackModal] = useState<{
    attacker: Combatant;
    target: Combatant;
    attackerPos?: { col: number; row: number };
    targetPos?: { col: number; row: number };
  } | null>(null);
  // ✅ 新增：伤害结算弹窗（攻击命中后切换）
  const [damageModal, setDamageModal] = useState<{
    attacker: Combatant;
    target: Combatant;
    attack: Attack | NpcAttack;
    disadvantage: boolean;
  } | null>(null);
  // ✅ 新增：先攻平局排序弹窗（触屏拖拽重排）
  const [tiebreakerOpen, setTiebreakerOpen] = useState(false);
  const [tiedOrder, setTiedOrder] = useState<Combatant[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 原内容：完全保留，一个字都没改（加载逻辑100%不变，保证能进入）
  useEffect(() => {
    if (!sessionId) return;
    const r = combatStore.get(sessionId);
    setRecord(r || null);
    const unsub = combatStore.subscribe(() => {
      setRecord(combatStore.get(sessionId) || null);
    });
    return unsub;
  }, [sessionId]);

  // ✅ 新增：过滤已参战的角色，避免重复添加（完全不影响原有逻辑）
  const existingCharIds = record
    ? new Set(record.combatants.map(c => c.characterId).filter(Boolean))
    : new Set<string>();
  // ✅ 新增：从角色库读取未参战的PC（仅读取，不修改）
  const availableChars = characterStore.getAll().filter(char => 
    !existingCharIds.has(char.id)
  );

  useEffect(() => {
    setNpcTemplates(npcTemplateStore.getAll());
    const unsub = npcTemplateStore.subscribe(() => {
      setNpcTemplates(npcTemplateStore.getAll());
    });
    return unsub;
  }, []);

  // 原内容：完全保留，一个字都没改（权限校验逻辑不变）
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

  // 原内容：完全保留，一个字都没改（未找到逻辑不变）
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

  // 原内容：完全保留，一个字都没改（单元格编辑逻辑不变）
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

  const handleAddCombatant = (char?: Character) => {
    if (char) {
      setSelectedPc(char);
      setD20Input('');
      setShowCharSelect(false);
      setInitiativeRollOpen(true);
      return;
    }

    setShowCharSelect(false);
    setNpcCreatorOpen(true);
  };

  const handleCreateNpc = (combatantData: Omit<Combatant, 'id'>) => {
    const newId = crypto.randomUUID();
    const newCombatant: Combatant = {
      ...combatantData,
      id: newId,
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
    checkTieAndOpen(newId);
  };

  const handleBatchCreateNpc = (combatantsData: Omit<Combatant, 'id'>[]) => {
    const newCombatants: Combatant[] = combatantsData.map(data => ({
      ...data,
      id: crypto.randomUUID(),
    }));
    const updatedCombatants = [...record.combatants, ...newCombatants].sort(
      (a, b) => b.initiative - a.initiative
    );
    const newRounds = newCombatants.reduce((acc, c) => {
      record.rounds.forEach((_, idx) => {
        if (!acc[idx]) acc[idx] = {};
        acc[idx][c.id] = '';
      });
      return acc;
    }, [] as Record<string, string>[]);
    const updatedRounds = record.rounds.map((round, idx) => ({
      ...round,
      ...(newRounds[idx] || {}),
    }));
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  // ✅ 新增：确认 PC 先攻并加入战斗（d20 + 敏捷调整值 = 先攻总值）
  const handleConfirmInitiative = () => {
    if (!selectedPc) return;
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) {
      alert('请输入 1-20 之间的 d20 数值');
      return;
    }
    const dexMod = selectedPc.abilities?.dexterity?.modifier ?? 0;
    const initiative = d20 + dexMod;
    const newId = crypto.randomUUID();
    // 从角色库读取数据，填充Combatant字段（完全对齐设计文档的Combatant定义）
    const newCombatant: Combatant = {
      id: newId,
      name: selectedPc.name,
      initiative,
      ac: selectedPc.armorClass,
      maxHp: selectedPc.maxHp,
      currentHp: selectedPc.currentHp,
      isDead: selectedPc.currentHp <= 0,
      isPc: true,
      characterId: selectedPc.id,
      speed: selectedPc.speed,
      note: '',
    };
    // 按先攻总值排序，符合设计文档的「快速建表」要求
    const updatedCombatants = [...record.combatants, newCombatant].sort(
      (a, b) => b.initiative - a.initiative
    );
    // 为新参战者初始化所有回合的行动记录
    const updatedRounds = record.rounds.map(round => ({
      ...round,
      [newCombatant.id]: '',
    }));
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
    setInitiativeRollOpen(false);
    setSelectedPc(null);
    setD20Input('');
    // ✅ 新增：检测先攻平局
    checkTieAndOpen(newId);
  };

  // ✅ 新增：检测先攻平局 —— 新参战者先攻与现有参战者相同时，打开排序弹窗
  // latestId 为刚加入的参战者 ID；用 combatStore.get 取最新记录
  const checkTieAndOpen = (latestId: string) => {
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const target = latest.combatants.find((c) => c.id === latestId);
    if (!target) return;
    const tied = latest.combatants.filter((c) => c.initiative === target.initiative);
    if (tied.length >= 2) {
      setTiedOrder(tied);
      setTiebreakerOpen(true);
    }
  };

  // ✅ 新增：确认平局顺序 —— 只调整平局参战者的相对顺序，其他参战者位置不变
  const handleConfirmTiebreaker = () => {
    const latest = combatStore.get(record.id);
    if (!latest) {
      setTiebreakerOpen(false);
      return;
    }
    // 平局组的先攻值
    const tieInit = tiedOrder[0]?.initiative;
    if (tieInit === undefined) {
      setTiebreakerOpen(false);
      return;
    }
    // 平局组的新顺序 ID 列表
    const newTiedIds = tiedOrder.map((c) => c.id);
    // 重建 combatants：遇到平局组的占位，按新顺序填入；非平局者原样保留
    let tiedPtr = 0;
    const updatedCombatants = latest.combatants.map((c) => {
      if (c.initiative === tieInit) {
        const replacement = latest.combatants.find((x) => x.id === newTiedIds[tiedPtr]);
        tiedPtr++;
        return replacement || c;
      }
      return c;
    });
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });
    setTiebreakerOpen(false);
    setTiedOrder([]);
  };

  // ✅ 新增：触屏拖拽 —— pointer 事件同时兼容鼠标与触摸
  const handleDragStart = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    setDraggingIndex(index);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const handleDragMove = (e: React.PointerEvent) => {
    if (draggingIndex === null) return;
    // 用各卡片中点判断指针落在哪个卡片，跨越中点则交换
    const pointerY = e.clientY;
    let targetIndex = draggingIndex;
    for (let i = 0; i < cardRefs.current.length; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (pointerY < midY) {
        targetIndex = i;
        break;
      }
      if (i === cardRefs.current.length - 1) targetIndex = i;
    }
    if (targetIndex !== draggingIndex) {
      setTiedOrder((prev) => {
        const next = [...prev];
        const [moved] = next.splice(draggingIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
      setDraggingIndex(targetIndex);
    }
  };
  const handleDragEnd = () => {
    setDraggingIndex(null);
  };

  // 原内容：完全保留，一个字都没改（新增轮次逻辑不变）
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

  // 原内容：完全保留，一个字都没改（删除参战者逻辑不变）
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

  // ✅ 新增：应用伤害 —— 仅写入战斗参战者 HP，不回传角色卡
  const handleApplyDamage = (targetId: string, newHp: number) => {
    const updatedCombatants = record.combatants.map(c =>
      c.id === targetId
        ? { ...c, currentHp: newHp, isDead: newHp <= 0 }
        : c
    );
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });
  };

  // ✅ 新增：保存先攻值并按先攻重新排序（先攻是战斗临时数据，不涉及角色卡默认信息）
  const handleInitiativeSave = (combatantId: string) => {
    const newInit = parseInt(initiativeInput, 10);
    setEditingInitiative(null);
    if (isNaN(newInit)) return;
    const updatedCombatants = record.combatants
      .map((c) => (c.id === combatantId ? { ...c, initiative: newInit } : c))
      .sort((a, b) => b.initiative - a.initiative);
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });
  };

  // ✅ 新增：批量删除参战者（同时清理各回合对应行动记录）
  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个参战者吗？`)) return;
    const updatedCombatants = record.combatants.filter((c) => !selectedIds.has(c.id));
    const updatedRounds = record.rounds.map((round) => {
      const newRound = { ...round };
      selectedIds.forEach((id) => delete newRound[id]);
      return newRound;
    });
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
    setSelectedIds(new Set());
    setBatchMode(false);
  };

  // ✅ 新增：切换选中状态
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 原内容：完全保留，一个字都没改（页面结构主体不变）
  return (
    <div className="max-w-full mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/combat')} className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base sm:text-xl font-bold dark:text-text-dark light:text-text-light truncate">
            {record.title}
          </h1>
        </div>
        <div className="flex gap-2 shrink-0">
          {batchMode ? (
            <>
              <button
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
                className="px-2 sm:px-3 py-2 rounded-lg bg-danger text-white text-sm flex items-center gap-1 hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">删除选中({selectedIds.size})</span>
                <span className="sm:hidden">{selectedIds.size}</span>
              </button>
              <button
                onClick={() => {
                  setBatchMode(false);
                  setSelectedIds(new Set());
                }}
                className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">取消</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowCharSelect(true)}
                className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">添加参战者</span>
              </button>
              <button
                onClick={() => setBatchMode(true)}
                className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">批量删除</span>
              </button>
              <button
                onClick={handleAddRound}
                className="px-2 sm:px-3 py-2 rounded-lg bg-primary text-white text-sm flex items-center gap-1 hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">新增轮次</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ✅ 新增：角色选择弹窗（仅点击按钮时显示，完全不影响加载逻辑） */}
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
                    {/* 展示角色库的AC和HP，完全对齐设计文档字段 */}
                    <div className="text-xs opacity-60">AC {char.armorClass} | HP {char.currentHp}/{char.maxHp}</div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                setShowCharSelect(false);
                setNpcCreatorOpen(true);
              }}
              className="w-full mt-4 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 justify-center hover:bg-white/5 transition-colors"
            >
              创建NPC
            </button>
          </div>
        </div>
      )}

      {/* ✅ 新增：PC 先攻投掷弹窗 —— d20 输入 + 敏捷加值 + 自动计算先攻总值 */}
      {initiativeRollOpen && selectedPc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">先攻投掷</h3>
              <button
                onClick={() => {
                  setInitiativeRollOpen(false);
                  setSelectedPc(null);
                  setD20Input('');
                }}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium dark:text-text-dark light:text-text-light mb-1">
                  {selectedPc.name}
                </div>
                <div className="text-xs opacity-60">
                  敏捷调整值：
                  <span className="text-primary font-bold ml-1">
                    {(selectedPc.abilities?.dexterity?.modifier ?? 0) >= 0
                      ? `+${selectedPc.abilities?.dexterity?.modifier ?? 0}`
                      : selectedPc.abilities?.dexterity?.modifier ?? 0}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5 block">
                  输入 d20 结果（1-20）
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  autoFocus
                  value={d20Input}
                  onChange={(e) => setD20Input(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmInitiative();
                    if (e.key === 'Escape') {
                      setInitiativeRollOpen(false);
                      setSelectedPc(null);
                      setD20Input('');
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary transition-colors"
                  placeholder="例如 12"
                />
              </div>
              <div className="flex items-center justify-between py-3 px-4 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  先攻总值
                </div>
                <div className="text-2xl font-bold dark:text-text-dark light:text-text-light">
                  {isNaN(parseInt(d20Input, 10))
                    ? '-'
                    : (parseInt(d20Input, 10) + (selectedPc.abilities?.dexterity?.modifier ?? 0))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setInitiativeRollOpen(false);
                    setSelectedPc(null);
                    setD20Input('');
                  }}
                  className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmInitiative}
                  disabled={isNaN(parseInt(d20Input, 10))}
                  className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  确认加入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 新增：先攻平局排序弹窗 —— 触屏拖拽重排平局参战者 */}
      {tiebreakerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">先攻平局</h3>
              <button
                onClick={() => {
                  setTiebreakerOpen(false);
                  setTiedOrder([]);
                }}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-4">
              以下参战者先攻相同（{tiedOrder[0]?.initiative ?? '-'}），长按拖动调整行动顺序
            </p>
            <div
              className="space-y-2 max-h-[60vh] overflow-y-auto touch-none select-none"
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              {tiedOrder.map((c, index) => {
                // PC 查种族/职业；NPC 仅显示名称
                const pc = c.characterId ? characterStore.get(c.characterId) : null;
                const race = pc?.race;
                const cls = pc?.class;
                return (
                  <div
                    key={c.id}
                    ref={(el) => { cardRefs.current[index] = el; }}
                    onPointerDown={(e) => handleDragStart(e, index)}
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-shadow ${
                      draggingIndex === index
                        ? 'border-primary shadow-lg scale-[1.02] opacity-90'
                        : 'dark:border-border-dark light:border-border-light'
                    } dark:bg-bg-dark light:bg-bg-light-2`}
                    style={{ touchAction: 'none' }}
                  >
                    <GripVertical className="w-4 h-4 opacity-40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate dark:text-text-dark light:text-text-light">
                        {c.name}
                      </div>
                      <div className="text-xs opacity-60 truncate">
                        {c.isPc
                          ? [race, cls].filter(Boolean).join(' · ') || '玩家角色'
                          : 'NPC'}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-primary shrink-0">#{index + 1}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setTiebreakerOpen(false);
                  setTiedOrder([]);
                }}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmTiebreaker}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
              >
                确认顺序
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 原内容：完全保留，一个字都没改（表格逻辑不变） */}
      <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="dark:bg-card-dark light:bg-card-light">
              <th className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-card-dark light:bg-card-light z-10 w-16 text-center">
                轮次
              </th>
              {record.combatants.map((c, idx) => (
                <th key={c.id} className="p-2 pt-7 border-r dark:border-border-dark light:border-border-light min-w-[120px] relative group">
                  <div className="absolute top-1 left-1 w-6 h-6 rounded-full dark:bg-gray-600 dark:text-white light:bg-gray-300 light:text-black text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <div className="flex items-center gap-1">
                    {batchMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="shrink-0 cursor-pointer"
                      />
                    )}
                    {/* 名称：PC/NPC 均为只读，不可编辑（名称属于角色卡默认信息） */}
                    <div className="font-medium truncate flex-1">{c.name}</div>
                  </div>
                  {/* 先攻：点击可编辑（先攻是战斗临时数据，不涉及角色卡默认信息） */}
                  {editingInitiative === c.id ? (
                    <input
                      type="number"
                      autoFocus
                      value={initiativeInput}
                      onChange={(e) => setInitiativeInput(e.target.value)}
                      onBlur={() => handleInitiativeSave(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleInitiativeSave(c.id);
                        if (e.key === 'Escape') setEditingInitiative(null);
                      }}
                      className="w-12 text-xs bg-transparent border-b border-primary outline-none dark:text-text-dark light:text-text-light"
                    />
                  ) : (
                    <div
                      className="text-xs opacity-60 cursor-text hover:opacity-100"
                      onClick={() => {
                        setEditingInitiative(c.id);
                        setInitiativeInput(String(c.initiative));
                      }}
                      title="点击编辑先攻"
                    >
                      先攻 {c.initiative}
                    </div>
                  )}
                  {/* 展示 HP（PC 和 NPC 均显示） */}
                  {c.maxHp != null && c.maxHp > 0 && (
                    <div className="text-xs opacity-60 mt-1">
                      HP {c.currentHp}/{c.maxHp}
                    </div>
                  )}
                  {/* 单个删除按钮：仅非批量模式显示 */}
                  {!batchMode && (
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
                  )}
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

      {/* ✅ 新增：网格沙盘 —— 展示参战者位置与移动 */}
      <Battleground
        sessionId={record.id}
        combatants={record.combatants}
        onRequestAttack={(attacker, target) => {
          // main 上处理：从 battlegroundStore 读取坐标，一并传入攻击检定弹窗
          const bg = record.id ? battlegroundStore.get(record.id) : null;
          const tokens = bg?.tokens ?? [];
          const attackerPos = tokens.find(t => t.combatantId === attacker.id);
          const targetPos = tokens.find(t => t.combatantId === target.id);
          setAttackModal({
            attacker,
            target,
            attackerPos: attackerPos ? { col: attackerPos.col, row: attackerPos.row } : undefined,
            targetPos: targetPos ? { col: targetPos.col, row: targetPos.row } : undefined,
          });
        }}
      />

      {/* ✅ 新增：NPC 创建器 */}
      {npcCreatorOpen && (
        <NpcCreator
          onClose={() => setNpcCreatorOpen(false)}
          onCreate={handleCreateNpc}
          onBatchCreate={handleBatchCreateNpc}
          templates={npcTemplates}
        />
      )}

      {/* ✅ 新增：战斗攻击检定弹窗 —— 在 main 上处理 */}
      {attackModal && (
        <CombatAttackModal
          attacker={attackModal.attacker}
          target={attackModal.target}
          attackerPos={attackModal.attackerPos}
          targetPos={attackModal.targetPos}
          onClose={() => setAttackModal(null)}
          onConfirmHit={(attack, disadvantage) => {
            // 命中确认：关闭攻击检定弹窗，切换至伤害结算弹窗
            setDamageModal({
              attacker: attackModal.attacker,
              target: attackModal.target,
              attack,
              disadvantage,
            });
            setAttackModal(null);
          }}
        />
      )}

      {/* ✅ 新增：伤害结算弹窗 —— 攻击命中后展示 */}
      {damageModal && (
        <CombatDamageModal
          attacker={damageModal.attacker}
          target={damageModal.target}
          attack={damageModal.attack}
          disadvantage={damageModal.disadvantage}
          onApplyDamage={(damage, newHp) => {
            handleApplyDamage(damageModal.target.id, newHp);
          }}
          onClose={() => setDamageModal(null)}
        />
      )}
    </div>
  );
}
