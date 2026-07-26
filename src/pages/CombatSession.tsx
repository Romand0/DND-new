import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { characterStore } from '@/data/characterStore';
import combatStore from '@/data/combatStore'; // ✅ 默认导入
import type { CombatRecord, Combatant } from '@/types/combat';
import { Swords, Plus, Minus, X, GripVertical } from 'lucide-react';

// 候选角色类型（仅用于角色选择弹窗的临时状态）
type CandidateCharacter = {
  id: string;
  name: string;
  race: string;
  class: string;
  dexMod: number;
};

// 待输入先攻的临时数据类型（仅用于先攻输入弹窗的临时状态）
type PendingInitiative = {
  characterId: string;
  name: string;
  dexMod: number;
  d20Roll: number | '';
  total: number;
};

export default function CombatSession() {
  const { isDM } = useAuth();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  // 战斗记录状态（对齐全局CombatRecord类型）
  const [session, setSession] = useState<CombatRecord | null>(null);
  const [loading, setLoading] = useState(true);

  // 角色选择弹窗状态
  const [showCharSelect, setShowCharSelect] = useState(false);
  const [candidateChars, setCandidateChars] = useState<CandidateCharacter[]>([]);
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());

  // 先攻输入弹窗状态
  const [showInitInput, setShowInitInput] = useState(false);
  const [pendingInitiatives, setPendingInitiatives] = useState<PendingInitiative[]>([]);

  // 同先攻排序弹窗状态
  const [showTieBreak, setShowTieBreak] = useState(false);
  const [tieBreakCombatants, setTieBreakCombatants] = useState<Combatant[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // 权限兜底：非DM直接跳回首页（战斗记录为DM专用工具）
  if (!isDM) return <Navigate to="/" replace />;

  // 加载战斗数据与角色库同步
  useEffect(() => {
    if (!sessionId) {
      navigate('/combat');
      return;
    }
    const loadData = () => {
      const currentSession = combatStore.get(sessionId);
      if (!currentSession) {
        navigate('/combat');
        return;
      }
      setSession(currentSession);

      // 过滤已参战的角色，避免重复添加
      const allChars = characterStore.getAll() || [];
      const existingCharIds = new Set(
        currentSession.combatants.map(c => c.characterId).filter(Boolean)
      );
      const candidates: CandidateCharacter[] = allChars
        .filter(char => char.id && !existingCharIds.has(char.id))
        .map(char => ({
          id: char.id,
          name: char.name || '未命名',
          race: char.race || '未知种族',
          class: char.class || '未知职业',
          dexMod: char.abilities?.dexterity?.modifier ?? 0,
        }));
      setCandidateChars(candidates);
      setLoading(false);
    };
    loadData();

    // 监听角色库和战斗记录更新，同步数据
    const onStorage = () => loadData();
    window.addEventListener('storage', onStorage);
    window.addEventListener('dm-token-change', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('dm-token-change', onStorage);
    };
  }, [sessionId, navigate]);

  // ===== 角色选择逻辑 =====
  const toggleCharSelect = useCallback((charId: string) => {
    setSelectedCharIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(charId)) {
        newSet.delete(charId);
      } else {
        newSet.add(charId);
      }
      return newSet;
    });
  }, []);

  const openCharSelect = useCallback(() => {
    setSelectedCharIds(new Set());
    setShowCharSelect(true);
  }, []);

  const confirmCharSelect = useCallback(() => {
    if (selectedCharIds.size === 0) return;
    const pending: PendingInitiative[] = candidateChars
      .filter(char => selectedCharIds.has(char.id))
      .map(char => ({
        characterId: char.id,
        name: char.name,
        dexMod: char.dexMod,
        d20Roll: '',
        total: char.dexMod,
      }));
    setPendingInitiatives(pending);
    setShowCharSelect(false);
    setShowInitInput(true);
  }, [selectedCharIds, candidateChars]);

  // ===== 先攻输入逻辑 =====
  const updateD20Roll = useCallback((charId: string, value: string) => {
    const numValue = value === '' ? '' : parseInt(value, 10);
    setPendingInitiatives(prev => prev.map(item => {
      if (item.characterId === charId) {
        const d20 = typeof numValue === 'number' && !isNaN(numValue) ? numValue : '';
        return {
          ...item,
          d20Roll: d20,
          total: item.dexMod + (typeof d20 === 'number' ? d20 : 0),
        };
      }
      return item;
    }));
  }, []);

  const confirmInitInput = useCallback(() => {
    const hasEmpty = pendingInitiatives.some(item => item.d20Roll === '');
    if (hasEmpty) {
      alert('请为所有参战者输入d20掷骰结果（1-20）');
      return;
    }

    // 按先攻总值分组，检测同先攻情况
    const initGroups: Record<number, PendingInitiative[]> = {};
    pendingInitiatives.forEach(item => {
      const total = item.total;
      if (!initGroups[total]) initGroups[total] = [];
      initGroups[total].push(item);
    });
    const tieGroups = Object.values(initGroups).filter(group => group.length > 1);

    if (tieGroups.length > 0) {
      // 同先攻：生成待排序的Combatant数组
      const allTied: Combatant[] = pendingInitiatives.map(item => {
        const char = characterStore.get(item.characterId);
        return {
          id: crypto.randomUUID(),
          characterId: item.characterId,
          name: item.name,
          initiative: item.total,
          maxHp: char?.maxHp ?? 0,
          currentHp: char?.currentHp ?? 0,
          ac: char?.armorClass ?? 0,
          isDead: false,
          isPc: !!char,
          note: '',
        };
      });
      setTieBreakCombatants(allTied);
      setShowInitInput(false);
      setShowTieBreak(true);
    } else {
      // 无同先攻：构造新参战者，按先攻降序排序后更新
      const newCombatants: Combatant[] = pendingInitiatives.map(item => {
        const char = characterStore.get(item.characterId);
        return {
          id: crypto.randomUUID(),
          characterId: item.characterId,
          name: item.name,
          initiative: item.total,
          maxHp: char?.maxHp ?? 0,
          currentHp: char?.currentHp ?? 0,
          ac: char?.armorClass ?? 0,
          isDead: false,
          isPc: !!char,
          note: '',
        };
      }).sort((a, b) => b.initiative - a.initiative);

      if (session) {
        // 更新战斗记录，保留原有rounds字段
        combatStore.update(session.id, {
          combatants: [...session.combatants, ...newCombatants],
          rounds: session.rounds,
          updatedAt: Date.now(),
        });
        setSession({
          ...session,
          combatants: [...session.combatants, ...newCombatants].sort((a, b) => b.initiative - a.initiative),
          updatedAt: Date.now(),
        });
      }
      setPendingInitiatives([]);
      setShowInitInput(false);
    }
  }, [pendingInitiatives, session]);

  // ===== 同先攻拖拽排序逻辑 =====
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;
    const newCombatants = [...tieBreakCombatants];
    const [draggedItem] = newCombatants.splice(draggedIndex, 1);
    newCombatants.splice(dropIndex, 0, draggedItem);
    setTieBreakCombatants(newCombatants);
    setDraggedIndex(null);
  }, [draggedIndex, tieBreakCombatants]);

  const confirmTieBreak = useCallback(() => {
    if (session) {
      const updatedCombatants = [...session.combatants, ...tieBreakCombatants];
      combatStore.update(session.id, {
        combatants: updatedCombatants,
        rounds: session.rounds,
        updatedAt: Date.now(),
      });
      setSession({
        ...session,
        combatants: updatedCombatants,
        updatedAt: Date.now(),
      });
    }
    setTieBreakCombatants([]);
    setShowTieBreak(false);
  }, [tieBreakCombatants, session]);

  // ===== 战斗操作逻辑 =====
  const updateHp = useCallback((combatantId: string, delta: number) => {
    if (!session) return;
    const updatedCombatants = session.combatants.map(combatant => {
      if (combatant.id === combatantId) {
        const newHp = Math.max(0, Math.min(combatant.maxHp, combatant.currentHp + delta));
        // 仅同步PC角色的HP到角色库
        if (combatant.isPc && combatant.characterId) {
          characterStore.update(combatant.characterId, { currentHp: newHp });
        }
        return { ...combatant, currentHp: newHp };
      }
      return combatant;
    });

    combatStore.update(session.id, {
      combatants: updatedCombatants,
      rounds: session.rounds,
      updatedAt: Date.now(),
    });
    setSession({
      ...session,
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });
  }, [session]);

  const removeCombatant = useCallback((combatantId: string) => {
    if (!session) return;
    const updatedCombatants = session.combatants.filter(c => c.id !== combatantId);
    combatStore.update(session.id, {
      combatants: updatedCombatants,
      rounds: session.rounds,
      updatedAt: Date.now(),
    });
    setSession({
      ...session,
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });
  }, [session]);

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="ml-4 dark:text-text-dark-muted light:text-text-light-muted">加载战斗中...</span>
      </div>
    );
  }

  // 战斗记录不存在，跳回战斗列表
  if (!session) {
    return <Navigate to="/combat" replace />;
  }

  return (
    <div className="space-y-6">
      {/* 战斗头部 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <Swords className="w-7 h-7 text-primary" />
            {session.title || '战斗记录'}
          </h1>
          <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
            参战者：{session.combatants.length}人 | 顺序：按先攻降序排列，首位为当前回合
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCharSelect}
            className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            添加参战者
          </button>
        </div>
      </div>

      {/* 战斗列表 */}
      {session.combatants.length === 0 ? (
        <div className="text-center py-12 rounded-xl border-2 border-dashed dark:border-border-dark light:border-border-light">
          <Swords className="w-16 h-16 mx-auto mb-4 opacity-30 dark:text-text-dark-muted light:text-text-light-muted" />
          <p className="dark:text-text-dark-muted light:text-text-light-muted">暂无参战者，点击「添加参战者」开始战斗</p>
        </div>
      ) : (
        <div className="space-y-3">
          {session.combatants.map((combatant, index) => (
            <div
              key={combatant.id}
              className={`p-4 rounded-xl border transition-all ${
                index === 0
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                {/* 左侧：先攻值+角色信息 */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    {combatant.initiative}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold dark:text-text-dark light:text-text-light truncate">
                        {combatant.name}
                      </span>
                      {combatant.isPc && (
                        <span className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-500 rounded-full">
                          玩家
                        </span>
                      )}
                      {combatant.isDead && (
                        <span className="px-2 py-0.5 text-xs bg-danger/10 text-danger rounded-full">
                          死亡
                        </span>
                      )}
                    </div>
                    <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                      AC {combatant.ac} | {combatant.note || '无备注'}
                    </div>
                  </div>
                </div>
                {/* 右侧：HP操作+删除 */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateHp(combatant.id, -1)}
                      className="p-1.5 rounded-lg hover:bg-danger/10 text-danger transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-20 text-center font-medium dark:text-text-dark light:text-text-light">
                      {combatant.currentHp}/{combatant.maxHp}
                    </span>
                    <button
                      onClick={() => updateHp(combatant.id, 1)}
                      className="p-1.5 rounded-lg hover:bg-success/10 text-success transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeCombatant(combatant.id)}
                    className="p-1.5 rounded-lg hover:bg-danger/10 text-danger transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 角色选择弹窗 */}
      {showCharSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-2xl rounded-xl p-6 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold dark:text-text-dark light:text-text-light">选择参战角色</h3>
              <button onClick={() => setShowCharSelect(false)} className="p-1.5 rounded-lg hover:bg-bg-dark/10">
                <X className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
              </button>
            </div>
            {candidateChars.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center dark:text-text-dark-muted light:text-text-light-muted">
                角色库中暂无可用角色，请先在角色列表中添加
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {candidateChars.map(char => (
                    <div
                      key={char.id}
                      onClick={() => toggleCharSelect(char.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedCharIds.has(char.id)
                          ? 'border-primary bg-primary/5'
                          : 'dark:border-border-dark light:border-border-light hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {char.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium dark:text-text-dark light:text-text-light truncate">
                            {char.name}
                          </div>
                          <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted truncate">
                            {char.race} · {char.class}
                          </div>
                        </div>
                        <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                          敏捷调整：{char.dexMod >= 0 ? `+${char.dexMod}` : char.dexMod}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => setShowCharSelect(false)}
                    className="px-4 py-2 border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmCharSelect}
                    disabled={selectedCharIds.size === 0}
                    className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    下一步（{selectedCharIds.size}个选中）
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 先攻输入弹窗 */}
      {showInitInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg rounded-xl p-6 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold dark:text-text-dark light:text-text-light">输入先攻掷骰结果</h3>
              <button onClick={() => setShowInitInput(false)} className="p-1.5 rounded-lg hover:bg-bg-dark/10">
                <X className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4">
              {pendingInitiatives.map(item => (
                <div key={item.characterId} className="p-3 rounded-lg border dark:border-border-dark light:border-border-light">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium dark:text-text-dark light:text-text-light">{item.name}</span>
                    <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                      敏捷调整：{item.dexMod >= 0 ? `+${item.dexMod}` : item.dexMod}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={item.d20Roll}
                      onChange={(e) => updateD20Roll(item.characterId, e.target.value)}
                      placeholder="输入d20掷骰结果（1-20）"
                      className="flex-1 px-3 py-2 rounded-lg border dark:bg-bg-dark dark:border-border-dark dark:text-text-dark light:bg-bg-light-2 light:border-border-light light:text-text-light outline-none focus:border-primary"
                    />
                    <span className="w-20 text-center font-medium dark:text-text-dark light:text-text-light">
                      总值：{item.total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowInitInput(false)}
                className="px-4 py-2 border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmInitInput}
                className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
              >
                确认先攻
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 同先攻排序弹窗 */}
      {showTieBreak && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-lg rounded-xl p-6 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold dark:text-text-dark light:text-text-light">调整同先攻角色顺序</h3>
              <button onClick={() => setShowTieBreak(false)} className="p-1.5 rounded-lg hover:bg-bg-dark/10">
                <X className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
              </button>
            </div>
            <p className="mb-4 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              以下角色先攻总值相同，拖拽卡片调整出场顺序（首位为当前回合）：
            </p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {tieBreakCombatants.map((combatant, index) => (
                <div
                  key={combatant.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`p-3 rounded-lg border cursor-move transition-colors ${
                    draggedIndex === index
                      ? 'border-primary bg-primary/10 opacity-50'
                      : 'dark:border-border-dark light:border-border-light hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted shrink-0" />
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                      {combatant.initiative}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium dark:text-text-dark light:text-text-light truncate">
                        {combatant.name}
                      </span>
                    </div>
                    <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted shrink-0">
                      顺序：{index + 1}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowTieBreak(false)}
                className="px-4 py-2 border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmTieBreak}
                className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
              >
                确认排序
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
