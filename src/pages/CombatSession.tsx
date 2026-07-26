import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { characterStore } from '@/data/characterStore';
import { combatStore, type CombatSession, type Combatant } from '@/data/combatStore';
import { 
  User, Swords, ArrowUpDown, Plus, Minus, ChevronUp, ChevronDown, 
  X, GripVertical, RotateCcw 
} from 'lucide-react';

// 候选角色类型（从角色库同步）
type CandidateCharacter = {
  id: string;
  name: string;
  race: string;
  class: string;
  dexMod: number; // 敏捷调整值（先攻加值）
};

// 待输入先攻的临时数据类型
type PendingInitiative = {
  characterId: string;
  name: string;
  dexMod: number;
  d20Roll: number | ''; // d20掷骰结果
  total: number; // 先攻总值 = 敏捷调整值 + d20Roll
};

export default function CombatSession() {
  const { isDM } = useAuth();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  // 战斗核心状态
  const [session, setSession] = useState<CombatSession | null>(null);
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

  // 【权限兜底】非DM直接跳回首页（战斗记录为DM专用工具）
  if (!isDM) return <Navigate to="/" replace />;

  // 加载战斗数据和角色库
  useEffect(() => {
    if (!sessionId) {
      navigate('/combat');
      return;
    }
    const loadData = () => {
      // 加载当前战斗会话
      const currentSession = combatStore.getSession(sessionId);
      if (!currentSession) {
        navigate('/combat');
        return;
      }
      setSession(currentSession);

      // 加载本地角色库，过滤已参战的角色
      const allChars = characterStore.getAll() || [];
      const existingCharIds = new Set(currentSession.combatants.map(c => c.characterId));
      const candidates: CandidateCharacter[] = allChars
        .filter(char => char.id && !existingCharIds.has(char.id))
        .map(char => ({
          id: char.id,
          name: char.name || '未命名',
          race: char.race || '未知种族',
          class: char.class || '未知职业',
          // 兜底处理：避免角色无敏捷属性时报错
          dexMod: char.abilities?.dexterity?.modifier ?? 0
        }));
      setCandidateChars(candidates);
      setLoading(false);
    };
    loadData();

    // 监听角色库更新，同步候选列表
    const onStorage = () => loadData();
    window.addEventListener('storage', onStorage);
    window.addEventListener('dm-token-change', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('dm-token-change', onStorage);
    };
  }, [sessionId, navigate]);

  // 当前回合参战者
  const currentCombatant = useMemo(() => {
    if (!session || session.combatants.length === 0) return null;
    return session.combatants[session.currentTurn];
  }, [session]);

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
    // 生成待输入先攻的临时数据
    const pending: PendingInitiative[] = candidateChars
      .filter(char => selectedCharIds.has(char.id))
      .map(char => ({
        characterId: char.id,
        name: char.name,
        dexMod: char.dexMod,
        d20Roll: '',
        total: char.dexMod
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
          total: item.dexMod + (typeof d20 === 'number' ? d20 : 0)
        };
      }
      return item;
    }));
  }, []);

  const confirmInitInput = useCallback(() => {
    // 校验所有d20结果已输入
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

    // 存在同先攻组，进入拖拽排序流程
    const tieGroups = Object.values(initGroups).filter(group => group.length > 1);
    if (tieGroups.length > 0) {
      const allTied: Combatant[] = pendingInitiatives.map(item => ({
        id: crypto.randomUUID(),
        characterId: item.characterId,
        name: item.name,
        initiative: item.total,
        maxHp: 0,
        currentHp: 0,
        ac: 0,
        conditions: [],
        isPlayer: true
      }));
      setTieBreakCombatants(allTied);
      setShowInitInput(false);
      setShowTieBreak(true);
    } else {
      // 无同先攻，直接生成战斗参战者
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
          conditions: [],
          isPlayer: !!char // 有角色数据则为玩家角色
        };
      });
      // 按先攻降序排序
      newCombatants.sort((a, b) => b.initiative - a.initiative);
      // 更新战斗会话并持久化
      if (session) {
        const updatedSession: CombatSession = {
          ...session,
          combatants: [...session.combatants, ...newCombatants],
          updatedAt: Date.now()
        };
        combatStore.saveSession(updatedSession);
        setSession(updatedSession);
      }
      // 重置临时状态
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
    // 同步角色库基础数据（HP/AC等）
    const finalCombatants: Combatant[] = tieBreakCombatants.map(combatant => {
      const char = characterStore.get(combatant.characterId);
      return {
        ...combatant,
        maxHp: char?.maxHp ?? combatant.maxHp,
        currentHp: char?.currentHp ?? combatant.currentHp,
        ac: char?.armorClass ?? combatant.ac,
        isPlayer: !!char
      };
    });
    // 更新战斗会话并持久化
    if (session) {
      const updatedSession: CombatSession = {
        ...session,
        combatants: [...session.combatants, ...finalCombatants],
        updatedAt: Date.now()
      };
      combatStore.saveSession(updatedSession);
      setSession(updatedSession);
    }
    // 重置临时状态
    setTieBreakCombatants([]);
    setShowTieBreak(false);
  }, [tieBreakCombatants, session]);

  // ===== 战斗操作逻辑 =====
  // HP修改（角色联动：同步到本地角色库）
  const updateHp = useCallback((combatantId: string, delta: number) => {
    if (!session) return;
    const updatedCombatants = session.combatants.map(combatant => {
      if (combatant.id === combatantId) {
        const newHp = Math.max(0, Math.min(combatant.maxHp, combatant.currentHp + delta));
        // 仅同步玩家角色的HP到角色库
        if (combatant.isPlayer && combatant.characterId) {
          characterStore.update(combatant.characterId, { currentHp: newHp });
        }
        return { ...combatant, currentHp: newHp };
      }
      return combatant;
    });
    const updatedSession: CombatSession = {
      ...session,
      combatants: updatedCombatants,
      updatedAt: Date.now()
    };
    combatStore.saveSession(updatedSession);
    setSession(updatedSession);
  }, [session]);

  // 推进回合
  const nextTurn = useCallback(() => {
    if (!session || session.combatants.length === 0) return;
    const nextTurn = (session.currentTurn + 1) % session.combatants.length;
    const updatedSession: CombatSession = {
      ...session,
      currentTurn: nextTurn,
      updatedAt: Date.now()
    };
    combatStore.saveSession(updatedSession);
    setSession(updatedSession);
  }, [session]);

  // 重置战斗
  const resetCombat = useCallback(() => {
    if (!session) return;
    const updatedSession: CombatSession = {
      ...session,
      currentTurn: 0,
      combatants: session.combatants.map(c => ({ ...c, conditions: [] })),
      updatedAt: Date.now()
    };
    combatStore.saveSession(updatedSession);
    setSession(updatedSession);
  }, [session]);

  // 移除参战者
  const removeCombatant = useCallback((combatantId: string) => {
    if (!session) return;
    const updatedCombatants = session.combatants.filter(c => c.id !== combatantId);
    const updatedSession: CombatSession = {
      ...session,
      combatants: updatedCombatants,
      currentTurn: Math.min(session.currentTurn, updatedCombatants.length - 1),
      updatedAt: Date.now()
    };
    combatStore.saveSession(updatedSession);
    setSession(updatedSession);
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

  // 会话不存在跳转回战斗列表
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
            {session.name}
          </h1>
          <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
            当前回合：{currentCombatant?.name || '未开始'} | 参战者：{session.combatants.length}人
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
          <button
            onClick={nextTurn}
            disabled={session.combatants.length === 0}
            className="px-4 py-2 bg-success hover:bg-success-dark text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <ChevronDown className="w-4 h-4" />
            下一回合
          </button>
          <button
            onClick={resetCombat}
            className="px-4 py-2 border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light rounded-lg transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            重置战斗
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
                index === session.currentTurn
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
                      {combatant.isPlayer && (
                        <span className="px-2 py-0.5 text-xs bg-blue-500/10 text-blue-500 rounded-full">
                          玩家
                        </span>
                      )}
                    </div>
                    <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                      AC {combatant.ac} | {combatant.conditions.length > 0 ? combatant.conditions.join(', ') : '无状态'}
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

      {/* ===== 角色选择弹窗 ===== */}
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

      {/* ===== 先攻输入弹窗 ===== */}
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

      {/* ===== 同先攻排序弹窗 ===== */}
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
              以下角色先攻总值相同，拖拽卡片调整出场顺序：
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
