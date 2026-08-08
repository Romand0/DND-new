// 原内容：完全保留，一个字都没改（保持旧版 UI 视觉与功能完全一致）
// 拆分产物保留引用（避免被当作"废文件"，未来模块化改造可按职责迁移对应逻辑）：
//   hooks:  useActions / useCombatInventories / useDamageAndHp / useInitiative /
//          useManualRecord / usePlayback / useRoundTurn / useSurprise / useThrownDrop
//   components: CombatantList / InitiativeTable / InitiativeRollDialog /
//          InitiativeTiebreakerDialog / ManualRecordDialog / PlaybackToolbar /
//          RewindDialog / SurpriseAttackDialog / CombatantInfoPanel
import type {} from '@/hooks/combat/useActions';
import type {} from '@/hooks/combat/useCombatInventories';
import type {} from '@/hooks/combat/useDamageAndHp';
import type {} from '@/hooks/combat/useInitiative';
import type {} from '@/hooks/combat/useManualRecord';
import type {} from '@/hooks/combat/usePlayback';
import type {} from '@/hooks/combat/useRoundTurn';
import type {} from '@/hooks/combat/useSurprise';
import type {} from '@/hooks/combat/useThrownDrop';
import type {} from '@/components/combat/CombatantList';
import type {} from '@/components/combat/InitiativeTable';
import type {} from '@/components/combat/InitiativeRollDialog';
import type {} from '@/components/combat/InitiativeTiebreakerDialog';
import type {} from '@/components/combat/ManualRecordDialog';
import type {} from '@/components/combat/PlaybackToolbar';
import type {} from '@/components/combat/RewindDialog';
import type {} from '@/components/combat/SurpriseAttackDialog';
import type {} from '@/components/CombatantInfoPanel';
import { useState, useEffect, useRef, useMemo } from 'react';
import * as snapDb from '@/lib/combatSnapshots';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  applyEquipmentChange,
  computeCombatantAc,
  getCombatInventory,
  getCombatInventoryRaw,
} from '@/data/combatStore';
import combatStore from '@/data/combatStore';
import { characterStore } from '@/data/characterStore';
import npcTemplateStore from '@/data/npcTemplateStore';
import battlegroundStore from '@/data/battlegroundStore';
import type { Character, Attack } from '@/types/character';
import type { CombatRecord, Combatant, RoundAction, NpcTemplate, NpcAttack, EquipmentChanges, TurnSnapshot, CheckScene } from '@/types/combat';
import { isOneActionCast } from '@/types/combat';
import type { ItemToken } from '@/types/battleground';
import { Plus, Trash2, ArrowLeft, Users, X, GripVertical, Pencil, Swords, Heart, Target, Check, Keyboard, Play, SkipForward, Pause, Undo2, PlayCircle, PauseCircle } from 'lucide-react';
import Battleground from '@/components/Battleground';
import NpcCreator from '@/components/NpcCreator';
import CombatAttackModal from '@/components/CombatAttackModal';
import CombatDamageModal from '@/components/CombatDamageModal';
import CombatSpellModal from '@/components/CombatSpellModal';
import TurnTodoBoard from '@/components/TurnTodoBoard';
import CombatantInfoPanel from '@/components/CombatantInfoPanel';

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
    isCritical: boolean;
    // 用于写入先攻表格的攻击检定过程信息
    d20Rolled: number[];
    d20Final: number;
    d20Bonus: number;
    d20Total: number;
    usageMode?: 'melee' | 'thrown';
    isTwoHandedWield?: boolean;
  } | null>(null);
  // ✅ 新增：法术施放弹窗（独立交互流程，与攻击检定解耦）
  const [spellModal, setSpellModal] = useState<{
    caster: Combatant;
    target: Combatant;
  } | null>(null);
  // ✅ 新增：协助（Help）动作弹窗 —— 选择友方 → 挂 pending 优劣势标记
  const [helpModal, setHelpModal] = useState<{ from: Combatant } | null>(null);
  // ✅ 新增：先攻平局排序弹窗（触屏拖拽重排）
  const [tiebreakerOpen, setTiebreakerOpen] = useState(false);
  const [tiedOrder, setTiedOrder] = useState<Combatant[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ✅ 突袭相关状态
  const [surpriseAttackOpen, setSurpriseAttackOpen] = useState(false);
  const [surpriseAttackRound, setSurpriseAttackRound] = useState(0);
  const [surprisedCombatants, setSurprisedCombatants] = useState<Set<string>>(new Set());
  // ✅ 手动记录相关状态
  const [selectedCell, setSelectedCell] = useState<{ round: number; combatantId: string } | null>(null);
  const [manualRecordOpen, setManualRecordOpen] = useState(false);
  const [manualRecordType, setManualRecordType] = useState<'attack' | 'recovery' | null>(null);
  const [manualTargetId, setManualTargetId] = useState('');
  const [manualAttackMethod, setManualAttackMethod] = useState('');
  const [manualDamage, setManualDamage] = useState('');
  const [manualIsKill, setManualIsKill] = useState(false);
  const [manualHealMethod, setManualHealMethod] = useState('');
  const [manualHealAmount, setManualHealAmount] = useState('');
  const [manualAttackRoll, setManualAttackRoll] = useState('');
  // ✅ 放映模式状态
  const [playbackStarted, setPlaybackStarted] = useState(false);
  // 当前回合：{ round: 行索引, combatantIdx: 列索引, combatantId }
  const [currentTurn, setCurrentTurn] = useState<{ round: number; combatantIdx: number; combatantId: string } | null>(null);
  // ✅ 暂停放映：true 时不处于任何参战者的回合，操作按模拟模式处理（不消耗动作、不计入当前回合）
  const [playbackPaused, setPlaybackPaused] = useState(false);
  // 暂停时临时保存的回合位置，恢复放映时回到该处
  const pausedTurnRef = useRef<{ round: number; combatantIdx: number; combatantId: string } | null>(null);
  // 沙盘快照：用于开始放映时重置
  const playbackSnapshotRef = useRef<{ col: number; row: number; combatantId: string }[] | null>(null);
  // 确认弹窗：完成回合
  const [confirmEndTurnOpen, setConfirmEndTurnOpen] = useState(false);
  // 退出放映弹窗：保存 / 丢弃
  const [exitPlaybackModalOpen, setExitPlaybackModalOpen] = useState(false);
  // ✅ 回溯弹窗：放映模式下删除先攻表格记录用（清空该格之后所有内容 + 还原生命值/沙盘）
  const [rewindModal, setRewindModal] = useState<{
    round: number;
    combatantId: string;
    combatantIdx: number;
    firstClickDone: boolean;
  } | null>(null);
  // ✅ 参战者信息面板（点击表头名称按钮打开，等价沙盘双击弹窗）
  const [infoPanelCombatant, setInfoPanelCombatant] = useState<Combatant | null>(null);
  // ✅ 沙盘最近单击选中的参战者 ID（用于左上 HUD 展示；若放映中有当前回合则以当前回合角色优先覆盖）
  const [sandboxSelectedId, setSandboxSelectedId] = useState<string | null>(null);
  // 回合快照集合（key = `${round}:${combatantId}`）
  // （TurnSnapshot 是 @/types/combat 导出的全局 interface，已在上面 import）
  const rollbackSnapshotRef = useRef<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>({ initial: null, snapshots: {} });

  // ✅ 自动推进锁：防止昏迷角色回合 setTimeout 递归
  const autoAdvanceRef = useRef(false);

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

  // ✅ 修复：刷新/关闭页面后再次进入战斗，把 IndexedDB 中的快照回灌到内存 useRef
  // 触发条件：record 已加载且当前是放映模式 playbackStarted=true 但内存 initial 为空
  useEffect(() => {
    if (!record || record.mode !== 'playback') return;
    if (!playbackStarted) return;
    if (rollbackSnapshotRef.current.initial && Object.keys(rollbackSnapshotRef.current.snapshots).length > 0) return;
    (async () => {
      try {
        const init = await snapDb.getInitialSnapshot(record.id);
        if (init && !rollbackSnapshotRef.current.initial) {
          rollbackSnapshotRef.current.initial = init;
        }
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, record?.mode, playbackStarted]);

  /**
   * 基于战斗背包实际装备，获取该 combatant 的有效 AC。
   * PC 角色：护甲/盾牌被移除或数量=0时，不参与加值；不存在于战斗背包的装备不加值。
   * NPC：直接用 combatant.ac。
   */
  const getEffectiveAc = (c: Combatant): number => {
    if (!record) return c.ac ?? 0;
    const changes = record.equipmentChanges?.[c.id];
    let character: Character | null = null;
    if (c.characterId) character = characterStore.get(c.characterId);
    const combatInventory = combatInventories[c.id];
    if (character) return computeCombatantAc(c, character, combatInventory);
    return c.ac ?? 0;
  };

  useEffect(() => {
    setNpcTemplates(npcTemplateStore.getAll());
    const unsub = npcTemplateStore.subscribe(() => {
      setNpcTemplates(npcTemplateStore.getAll());
    });
    return unsub;
  }, []);

  // 战斗背包记忆化：按 record 引用缓存全部参战者的战斗背包映射。
  // store 每次更新会生成新 record 引用，此处自然失效；渲染热路径（每秒定时刷新等）
  // 不会重跑，避免每个参战者重复走 parse + 派生计算。
  const combatInventories = useMemo(() => {
    if (!record) return {} as Record<string, any[]>;
    const result: Record<string, any[]> = {};
    for (const c of record.combatants) {
      result[c.id] = getCombatInventory(record, c);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  // 所有参战者沙盘位置字典（用于跨参战者距离判定：协助动作 5 尺约束等）
  const combatantPositions = useMemo(() => {
    if (!record?.id) return null;
    const bg = battlegroundStore.get(record.id);
    if (!bg?.tokens) return null;
    const map: Record<string, { col: number; row: number }> = {};
    for (const t of bg.tokens) {
      if (!t.combatantId) continue;
      map[t.combatantId] = { col: t.col, row: t.row };
    }
    return map;
  }, [record?.id, record?.combatants.length, record?.updatedAt]);

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
      actions: typeof combatantData.actions === 'number' && combatantData.actions >= 0 ? combatantData.actions : 1,
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
      actions: typeof data.actions === 'number' && data.actions >= 0 ? data.actions : 1,
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
      actions: 1,
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
  // status: 'unconscious' 昏迷 / 'dead' 死亡（NPC 致命伤害时附带）
  // PC HP 归零未显式指定 status 时，按 D&D 5e 规则自动判定为昏迷（不直接死亡）
  const handleApplyDamage = (targetId: string, newHp: number, status?: 'unconscious' | 'dead') => {
    const target = record.combatants.find(c => c.id === targetId);
    const wasUnconscious = target?.isUnconscious ?? false;
    const isPc = target?.isPc ?? false;
    // PC HP≤0 且未显式指定状态 → 自动昏迷（D&D 5e：PC 不会因伤害直接死亡，先进入昏迷）
    const effectiveStatus: 'unconscious' | 'dead' | undefined =
      status ?? (newHp <= 0 && isPc ? 'unconscious' : undefined);

    const updatedCombatants = record.combatants.map(c => {
      if (c.id !== targetId) return c;
      if (newHp <= 0 && effectiveStatus === 'dead') {
        return { ...c, currentHp: newHp, isDead: true, isUnconscious: false };
      }
      if (newHp <= 0 && effectiveStatus === 'unconscious') {
        // 首次进入昏迷时重置死亡豁免计数（D&D 5e：每次倒下重新计数）
        const firstDown = !wasUnconscious;
        return {
          ...c,
          currentHp: newHp,
          isDead: false,
          isUnconscious: true,
          deathSaveFailures: firstDown ? 0 : (c.deathSaveFailures ?? 0),
          deathSaveSuccesses: firstDown ? 0 : (c.deathSaveSuccesses ?? 0),
        };
      }
      // HP > 0：恢复清醒，同时清零死亡豁免计数
      return {
        ...c,
        currentHp: newHp,
        isDead: false,
        isUnconscious: false,
        deathSaveFailures: 0,
        deathSaveSuccesses: 0,
      };
    });
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });

    // ✅ 死亡豁免待办自动生命周期：
    //   1) PC 首次进入昏迷（HP=0 & unconscious）→ 自动创建待办
    //   2) HP 恢复 / 死亡 / 稳定 → 自动清理
    // 仅放映模式下创建（待办依赖回合系统）
    if (record.mode === 'playback' && isPc) {
      const nowDown = newHp <= 0 && effectiveStatus === 'unconscious';
      if (nowDown) {
        const existing = combatStore.get(record.id)?.turnTodos?.some(
          t => t.type === 'death_save' && t.combatantId === targetId
        );
        if (!existing) {
          // 起始回合 = 当前回合（"当前回合后满足触发条件的第一个属于适用者的回合"）。
          // findNextValidTurn 会让带未执行死亡豁免待办的昏迷 PC 的回合照常推进，
          // activeTodos 的 startRound <= round 判定会确保只在 PC 的回合显示。
          const startRound = currentTurn ? currentTurn.round : 0;
          combatStore.addTurnTodo(record.id, {
            combatantId: targetId,
            name: '死亡豁免',
            type: 'death_save',
            startRound,
            endRound: -1, // 由 cleanupDeathSaveTodos 按 HP 状态终止
          });
        }
      }
    }
    // 放映模式下昏迷/死亡状态变化后，自动填充后续轮次的占位标记
    // （非放映模式没有轮次概念，不需要填）
    if (record.mode === 'playback') {
      autoFillDownedMarkers();
    }
    // HP 变化后统一清理已失效的死亡豁免待办
    combatStore.cleanupDeathSaveTodos(record.id);
  };

  // ============ 动作机制 ============
  // 当前战斗模式：playback=放映（有回合，每回合 1 动作），否则 simulation=模拟（动作无限）
  const currentMode = (): 'simulation' | 'playback' =>
    record?.mode === 'playback' ? 'playback' : 'simulation';

  // 是否处于"有效放映回合中"：放映模式 + 已开始 + 未暂停 + 有当前回合
  // （暂停期间所有动作判定按模拟模式处理：不消耗动作、不写当前回合格）
  const isPlaybackActive = (): boolean =>
    currentMode() === 'playback' && playbackStarted && !playbackPaused && !!currentTurn;

  // 该参战者当前是否还能发起动作（模拟模式/放映暂停恒可；放映模式 0 时禁止）
  const canUseAction = (combatantId: string): boolean => {
    if (!record) return false;
    if (!isPlaybackActive()) return true;
    const c = record.combatants.find(x => x.id === combatantId);
    if (!c) return false;
    return (typeof c.actions === 'number' ? c.actions : 1) > 0;
  };

  // 消耗 1 个动作（写入 store，订阅机制自动刷新 UI）；暂停期间不消耗
  const consumeCombatantAction = (combatantId: string) => {
    if (!record) return;
    if (!isPlaybackActive()) return;
    combatStore.consumeAction(record.id, combatantId, 'playback');
  };

  // 放映模式：标记本回合已用过装填武器攻击（每回合只能攻击一次，优先级高于额外动作）
  // 暂停期间不做标记，暂停解除前的操作不计入回合限制
  const markLoadingAttacked = (combatantId: string) => {
    if (!isPlaybackActive()) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    combatStore.update(record.id, {
      loadingAttackedThisRound: {
        ...(latest.loadingAttackedThisRound || {}),
        [combatantId]: true,
      },
      updatedAt: Date.now(),
    });
  };

  // 放映模式回合开始：恢复该参战者可用动作为 1
  const resetCombatantActions = (combatantId: string) => {
    if (!record) return;
    if (record.mode !== 'playback') return;
    combatStore.resetActions(record.id, combatantId);
  };

  // ============ 投掷武器掉落机制 ============
  // 切比雪夫距离（格）
  const chebyDist = (a: { col: number; row: number }, b: { col: number; row: number }) =>
    Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

  // 计算投掷武器掉落位置
  // hit=true: 敌人5尺（1格）内最靠近玩家的3格中随机一格
  // hit=false: 以玩家为圆心、本次射程为半径 和 以敌人为圆心、敌人速度为半径 的交集区域随机一格
  const calcThrownDropPos = (
    attackerPos: { col: number; row: number },
    targetPos: { col: number; row: number },
    hit: boolean,
    rangeUsedFeet: number,
    targetSpeed: number,
    gridCols: number,
    gridRows: number,
  ): { col: number; row: number } => {
    if (hit) {
      // 敌人周围8格，按到玩家的切比雪夫距离排序，取前3格随机选一
      const candidates: { col: number; row: number; d: number }[] = [];
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (dc === 0 && dr === 0) continue; // 跳过敌人自身格
          const c = targetPos.col + dc;
          const r = targetPos.row + dr;
          if (c < 0 || c >= gridCols || r < 0 || r >= gridRows) continue;
          candidates.push({ col: c, row: r, d: chebyDist({ col: c, row: r }, attackerPos) });
        }
      }
      candidates.sort((a, b) => a.d - b.d);
      const top = candidates.slice(0, Math.min(3, candidates.length));
      if (top.length === 0) return { col: targetPos.col, row: targetPos.row };
      return top[Math.floor(Math.random() * top.length)];
    } else {
      // 未命中：两个圆形区域的交集
      const rangeCells = Math.floor(rangeUsedFeet / 5);
      const speedCells = Math.floor(targetSpeed / 5);
      const candidates: { col: number; row: number }[] = [];
      for (let c = 0; c < gridCols; c++) {
        for (let r = 0; r < gridRows; r++) {
          const dPlayer = chebyDist({ col: c, row: r }, attackerPos);
          const dEnemy = chebyDist({ col: c, row: r }, targetPos);
          if (dPlayer <= rangeCells && dEnemy <= speedCells) {
            candidates.push({ col: c, row: r });
          }
        }
      }
      if (candidates.length === 0) {
        // 交集为空时退回到玩家与敌人连线中点
        return {
          col: Math.round((attackerPos.col + targetPos.col) / 2),
          row: Math.round((attackerPos.row + targetPos.row) / 2),
        };
      }
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
  };

  // 执行投掷武器掉落：从攻击者背包移除武器，在网格上生成物品 token
  const executeThrownDrop = (
    attacker: Combatant,
    target: Combatant,
    attack: Attack | NpcAttack,
    attackerPos: { col: number; row: number },
    targetPos: { col: number; row: number },
    hit: boolean,
    usageMode?: 'melee' | 'thrown',
  ) => {
    if (usageMode !== 'thrown') return;
    if (!record) return;
    const bg = battlegroundStore.get(record.id);
    if (!bg) return;

    // 确定本次使用的射程（常规或最大）
    let rangeUsedFeet = attack.normalRange || 20;
    const distanceFeet = chebyDist(attackerPos, targetPos) * 5;
    if (attack.maxRange && distanceFeet > (attack.normalRange || 0)) {
      rangeUsedFeet = attack.maxRange;
    }
    const targetSpeed = target.speed || 30;

    const gridCols = bg.size === 'small' ? 12 : bg.size === 'medium' ? 24 : 36;
    const gridRows = bg.size === 'small' ? 18 : bg.size === 'medium' ? 36 : 54;

    const dropPos = calcThrownDropPos(attackerPos, targetPos, hit, rangeUsedFeet, targetSpeed, gridCols, gridRows);

    // 构造装备快照数据
    let equipData: Record<string, unknown> = {
      name: attack.name,
      category: '武器',
      subtype: attack.subtype,
      damageDice: attack.damage,
      damageType: attack.damageType,
      properties: attack.properties,
      normalRange: attack.normalRange,
      maxRange: attack.maxRange,
      range: attack.range,
      quantity: 1,
    };

    // PC：从"战斗背包"查找对应武器（未合并版本，确保 childId 精确匹配）
    if (attacker.characterId) {
      const combatInventoryRaw = getCombatInventoryRaw(record, attacker);
      // 手持 id 从角色卡拿（手持的引用指向角色源装备）
      const char = characterStore.get(attacker.characterId);
      const heldLeftId = char?.heldLeft?.equipmentId;
      const heldRightId = char?.heldRight?.equipmentId;
      // 优先找手持的匹配武器（在未合并列表中按 childId 精确匹配）
      let foundEquip = null;
      for (const eq of combatInventoryRaw) {
        const slotId = eq.childId || eq.id;
        if (slotId === heldLeftId || slotId === heldRightId) {
          if (eq.name === attack.name) {
            foundEquip = eq;
            break;
          }
        }
      }
      // 若手持未找到，按名称查找（取第一个匹配的）
      if (!foundEquip) {
        foundEquip = combatInventoryRaw.find(e => e.name === attack.name) || null;
      }
      if (foundEquip) {
        equipData = { ...(foundEquip as any), quantity: 1 };
        // 写入变更信息漏斗：数量 > 1 → -1，否则 → 移除该 childId
        const slotId = foundEquip.childId || foundEquip.id || '';
        // 未合并列表中每条的数量是源装备的原始数量（已应用 delta）
        const qty = (foundEquip.quantity || 1);
        const currentChanges = record?.equipmentChanges?.[attacker.id];
        const newChanges = applyEquipmentChange(currentChanges, (ch) => {
          if (qty > 1) {
            ch.quantityDeltas[slotId] = (ch.quantityDeltas[slotId] || 0) - 1;
          } else {
            // 数量已经是 1（或 0），直接移除
            if (!ch.removedChildIds.includes(slotId)) {
              ch.removedChildIds.push(slotId);
            }
          }
        });
        combatStore.update(record.id, {
          equipmentChanges: {
            ...(record?.equipmentChanges || {}),
            [attacker.id]: newChanges,
          },
        });
      }
    }

    // 生成唯一 token id
    const tokenId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const itemToken: ItemToken = {
      id: tokenId,
      col: dropPos.col,
      row: dropPos.row,
      name: attack.name,
      equipmentData: equipData,
      droppedBy: attacker.id,
    };
    battlegroundStore.placeItemToken(record.id, itemToken);
  };

  // ✅ 突袭：打开突袭选择窗口
  const openSurpriseAttackModal = (round: number) => {
    setSurpriseAttackRound(round);
    // 初始化当前回合已标记为被突袭的角色
    const existing = new Set<string>();
    const roundData = record.rounds[round];
    if (roundData) {
      Object.entries(roundData).forEach(([id, val]) => {
        if (val === '被突袭') existing.add(id);
      });
    }
    setSurprisedCombatants(existing);
    setSurpriseAttackOpen(true);
  };

  // ✅ 突袭：确认后写入被突袭标记
  const confirmSurpriseAttack = () => {
    const updatedRounds = [...record.rounds];
    updatedRounds[surpriseAttackRound] = { ...updatedRounds[surpriseAttackRound] };
    record.combatants.forEach(c => {
      if (surprisedCombatants.has(c.id)) {
        updatedRounds[surpriseAttackRound][c.id] = '被突袭';
      } else {
        // 不清除已有标记（避免误操作），仅在首次设置时处理
        if (updatedRounds[surpriseAttackRound][c.id] === '被突袭' && !surprisedCombatants.has(c.id)) {
          updatedRounds[surpriseAttackRound][c.id] = '';
        }
      }
    });
    combatStore.update(record.id, {
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
    setSurpriseAttackOpen(false);
    setSurprisedCombatants(new Set());
  };

  // ✅ 模式切换（真正的写入，不弹确认窗）
  const commitModeChange = (mode: 'simulation' | 'playback') => {
    if (!record) return;
    combatStore.update(record.id, { mode, updatedAt: Date.now() });
  };

  // ✅ 模式切换（对外入口：放映→模拟时弹出确认窗，其他情况直接提交）
  const handleModeChange = (mode: 'simulation' | 'playback') => {
    if (!record) return;
    if (record.mode === mode) return;
    // 放映模式 → 模拟模式：弹窗
    if (record.mode === 'playback' && mode === 'simulation') {
      if (playbackStarted || playbackSnapshotRef.current) {
        setExitPlaybackModalOpen(true);
        return;
      }
    }
    // 其他情况：直接切换
    commitModeChange(mode);
    if (mode === 'playback') {
      const bg = battlegroundStore.get(record.id);
      const latestForSnapshot = combatStore.get(record.id);
      playbackSnapshotRef.current = (bg?.tokens ?? []).map(t => ({ ...t }));
      const initialSnap: TurnSnapshot = {
        combatants: record.combatants.map(c => ({ ...c })),
        rounds: record.rounds.map(r => ({ ...r })),
        battleground: (bg?.tokens ?? []).map(t => ({ ...t })),
        equipmentChanges: latestForSnapshot?.equipmentChanges
          ? Object.fromEntries(
              Object.entries(latestForSnapshot.equipmentChanges).map(([k, v]) => [
                k,
                { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
              ]),
            )
          : undefined,
      };
      rollbackSnapshotRef.current = { initial: initialSnap, snapshots: {} };
      // 同步写入 IndexedDB：刷新/关闭页面后恢复可用
      snapDb.putInitialSnapshot(record.id, initialSnap).catch(e => console.warn('写入初始快照失败', e));
    }
  };

  // ✅ 退出放映：保存覆盖 or 丢弃恢复（由 exit modal 按钮调用）
  const finalizeExitPlayback = (preserveChanges: boolean) => {
    if (record?.mode !== 'playback') {
      setExitPlaybackModalOpen(false);
      return;
    }
    if (!preserveChanges) {
      // 「丢弃，恢复原先状态」：完整还原 combatants / rounds / 装备变更 / 沙盘 到进入放映模式时的快照
      const init = rollbackSnapshotRef.current.initial;
      if (init) {
        combatStore.update(record.id, {
          combatants: init.combatants.map(c => ({ ...c })),
          rounds: init.rounds.map(r => ({ ...r })),
          equipmentChanges: init.equipmentChanges
            ? Object.fromEntries(
                Object.entries(init.equipmentChanges).map(([k, v]) => [
                  k,
                  { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
                ]),
              )
            : undefined,
          updatedAt: Date.now(),
        });
        battlegroundStore.setTokens(record.id, init.battleground.map(t => ({ ...t })));
      } else if (playbackSnapshotRef.current) {
        // fallback：只恢复了沙盘
        battlegroundStore.setTokens(record.id, playbackSnapshotRef.current);
      }
    }
    // 「保存并覆盖」分支：combatStore 中已是最新数据，无需额外还原
    setPlaybackStarted(false);
    setPlaybackPaused(false);
    pausedTurnRef.current = null;
    setCurrentTurn(null);
    playbackSnapshotRef.current = null;
    rollbackSnapshotRef.current = { initial: null, snapshots: {} };
    // 退出放映模式清理 IndexedDB 快照（避免磁盘长期堆积）
    if (record) snapDb.deleteSessionSnapshots(record.id).catch(() => {});
    setExitPlaybackModalOpen(false);
    commitModeChange('simulation');
  };

  // ✅ 暂停放映：清空 currentTurn，保存回合位置以便恢复
  const pausePlayback = () => {
    if (!record || !playbackStarted || playbackPaused) return;
    pausedTurnRef.current = currentTurn;
    setPlaybackPaused(true);
    // 这里不清空 actions：只是"临时脱离"，恢复放映时仍保持原动作计数不变
    // （暂停期间操作不消耗动作，恢复后按原状态继续）
  };

  // ✅ 恢复放映：回到暂停前保存的回合位置
  const resumePlayback = () => {
    if (!record || !playbackStarted || !playbackPaused) return;
    const savedTurn = pausedTurnRef.current;
    // 暂停期间用户可能把 rounds 截断或新增了轮次：若保存位置仍有效则直接用，否则重新扫描
    if (savedTurn
      && savedTurn.round < record.rounds.length
      && savedTurn.combatantIdx < record.combatants.length
      && record.combatants[savedTurn.combatantIdx]?.id === savedTurn.combatantId) {
      setCurrentTurn(savedTurn);
      checkAndAutoAdvance(savedTurn);
    } else {
      // 保存位置已失效（暂停期间做过回溯/截断等）：重新从头部扫描有效回合
      const firstTurn = findNextValidTurn(0, 0);
      setCurrentTurn(firstTurn);
      if (firstTurn) {
        resetCombatantActions(firstTurn.combatantId);
        takeTurnSnapshot(firstTurn.round, firstTurn.combatantId);
        checkAndAutoAdvance(firstTurn);
      }
    }
    pausedTurnRef.current = null;
    setPlaybackPaused(false);
  };

  // ✅ 启动放映：重置沙盘到快照状态，从选中的格子开始扫描
  const startPlayback = () => {
    if (!record) return;
    // 1. 重置沙盘到进入放映模式时的快照
    if (playbackSnapshotRef.current) {
      battlegroundStore.setTokens(record.id, playbackSnapshotRef.current);
    }
    // 2. 自动填充昏迷/死亡标记到后续所有轮次
    autoFillDownedMarkers();
    // 3. 从用户点击的格子开始扫描（若未选中则从开头）
    let startRound = 0;
    let startCol = 0;
    if (selectedCell) {
      startRound = selectedCell.round;
      const colIdx = record.combatants.findIndex(c => c.id === selectedCell.combatantId);
      startCol = Math.max(0, colIdx);
    }
    const firstTurn = findNextValidTurn(startRound, startCol);
    setPlaybackPaused(false);
    pausedTurnRef.current = null;
    setCurrentTurn(firstTurn);
    setPlaybackStarted(true);
    // 进入第一回合时立即拍快照（takeTurnSnapshot 直接读 combatStore 最新值，无需等渲染）
    if (firstTurn) {
      // 放映模式：回合开始恢复该参战者可用动作为 1
      resetCombatantActions(firstTurn.combatantId);
      takeTurnSnapshot(firstTurn.round, firstTurn.combatantId);
      checkAndAutoAdvance(firstTurn);
    }
  };

  // ✅ 给已昏迷/死亡角色在所有未填写的后续轮次中填入「昏迷」/「死亡」占位
  // 注意：必须从 combatStore.get 读取最新数据，因为调用方（如 handleApplyDamage）
  // 可能刚刚写入 store 但 React state（record）尚未异步更新，闭包里的 record 是旧快照
  const autoFillDownedMarkers = () => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    let updatedRounds = latest.rounds.map(r => ({ ...r }));
    let changed = false;
    latest.combatants.forEach(c => {
      if (!c.isDead && !c.isUnconscious) return;
      const marker = c.isDead ? '死亡' : '昏迷中，无法行动';
      updatedRounds = updatedRounds.map(round => {
        const cur = round[c.id];
        if (cur && cur !== '被突袭' && cur !== '昏迷中，无法行动' && cur !== '死亡') {
          // 已有有效记录的轮次不覆盖
          return round;
        }
        // 没记录或就是「昏迷/死亡」占位的，更新为最新状态
        if (cur !== marker) {
          changed = true;
          return { ...round, [c.id]: marker };
        }
        return round;
      });
    });
    if (changed) {
      combatStore.update(record.id, { rounds: updatedRounds, updatedAt: Date.now() });
    }
  };

  // ✅ 找到下一个有效回合（跳过被突袭/死亡，不跳过昏迷）
  // 从指定位置（行、列）开始，向右→下一行扫描
  // 可选传入 roundsOverride：当本帧刚 combatStore.update 新增了轮次、record 还没重新渲染时使用
  // 说明：昏迷角色一律不跳过——进入回合后再根据 PC/NPC/稳定 分别处理
  //   - PC：显示待办板让用户做死亡豁免
  //   - NPC：系统自动掷骰并推进
  //   - 稳定（成功≥3）：显示状态后手动/自动推进
  const findNextValidTurn = (
    fromRound: number,
    fromCol: number,
    roundsOverride?: RoundAction[]
  ): { round: number; combatantIdx: number; combatantId: string } | null => {
    if (!record) return null;
    const rounds = roundsOverride ?? record.rounds;
    for (let r = fromRound; r < rounds.length; r++) {
      const startCol = r === fromRound ? fromCol : 0;
      for (let i = startCol; i < record.combatants.length; i++) {
        const c = record.combatants[i];
        const v = rounds[r][c.id];
        if (v === '被突袭' || v === '死亡') continue;
        // 昏迷中，无法行动：不再跳过，保证视觉可见性
        return { round: r, combatantIdx: i, combatantId: c.id };
      }
    }
    return null;
  };

  // ✅ 处理单个昏迷角色回合（NPC 自动掷骰，PC 稳定后直接跳过）
  // 返回 true 表示该回合无需用户操作（系统已自动处理）
  const handleComatoseTurn = (combatant: Combatant, round: number): boolean => {
    if (!record || record.mode !== 'playback') return false;
    if (!combatant.isUnconscious || combatant.isDead) return false;
    const latest = combatStore.get(record.id);
    if (!latest) return false;

    // PC：有未执行的 death_save 待办 → 需要用户操作（返回 false）
    if (combatant.isPc) {
      const hasActiveTodo = (latest.turnTodos ?? []).some(t =>
        t.type === 'death_save' &&
        t.combatantId === combatant.id &&
        !t.executed &&
        t.startRound <= round &&
        (t.endRound === -1 || t.endRound >= round)
      );
      // 无待办 → 稳定状态，直接跳过
      if (!hasActiveTodo) {
        // 稳定后的回合写入明确文字
        const roundContent = latest.rounds[round]?.[combatant.id] ?? '';
        if (roundContent === '昏迷中，无法行动') {
          const updatedRounds = latest.rounds.map((r, idx) =>
            idx === round ? { ...r, [combatant.id]: '昏迷中，伤势稳定（无需再掷骰）' } : r
          );
          combatStore.update(latest.id, { rounds: updatedRounds, updatedAt: Date.now() });
        }
        return true;
      }
      return false; // PC 有 death_save 待办 → 等用户操作
    }

    // NPC：自动死亡豁免掷骰 + 写入先攻表格
    const result = combatStore.autoNpcDeathSave(latest.id, combatant.id);
    if (!result) return true; // 已死亡或非昏迷，跳过
    let text: string;
    if (result.outcome === 'revive') {
      text = `死亡豁免：掷出 ${result.roll}，苏醒，HP 恢复至 1`;
    } else if (result.combatant.isDead) {
      text = `死亡豁免：掷出 ${result.roll}，失败 ${result.combatant.deathSaveFailures}/3，已死亡`;
    } else if ((result.combatant.deathSaveSuccesses ?? 0) >= 3) {
      text = `死亡豁免：掷出 ${result.roll}，成功 ${result.combatant.deathSaveSuccesses}/3，已稳定`;
    } else if (result.outcome === 'crit_fail') {
      text = `死亡豁免：掷出 ${result.roll}，两次失败（${result.combatant.deathSaveFailures}/3）`;
    } else if (result.outcome === 'fail') {
      text = `死亡豁免：掷出 ${result.roll}，一次失败（${result.combatant.deathSaveFailures}/3）`;
    } else {
      text = `死亡豁免：掷出 ${result.roll}，一次成功（${result.combatant.deathSaveSuccesses}/3）`;
    }
    const afterLatest = combatStore.get(latest.id);
    if (afterLatest) {
      const updatedRounds = afterLatest.rounds.map((r, idx) =>
        idx === round ? { ...r, [combatant.id]: text } : r
      );
      combatStore.update(afterLatest.id, { rounds: updatedRounds, updatedAt: Date.now() });
    }
    return true;
  };

  // ✅ 推进到下一个回合（用户点击"完成回合"时）
  const advanceTurn = () => {
    if (!currentTurn || !record) return;
    const next = findNextValidTurn(currentTurn.round, currentTurn.combatantIdx + 1);
    if (next) {
      if (next.round > currentTurn.round) {
        combatStore.resetTurnTodosForRound(record.id, next.round);
      }
      setCurrentTurn(next);
      resetCombatantActions(next.combatantId);
      takeTurnSnapshot(next.round, next.combatantId);
      checkAndAutoAdvance(next);
      return;
    }
    // 当前行结束 → 判断是否还有活着的角色可战斗
    const aliveCount = record.combatants.filter(c => !c.isDead && !c.isUnconscious).length;
    if (aliveCount === 0) {
      setCurrentTurn(null);
      setPlaybackStarted(false);
      alert('战斗已结束（所有参战者已倒地或死亡）。');
      return;
    }
    // 检查是否需要新开一轮
    const nextRound = currentTurn.round + 1;
    if (nextRound >= record.rounds.length) {
      const newRound: RoundAction = {};
      record.combatants.forEach(c => {
        if (c.isDead) newRound[c.id] = '死亡';
        else if (c.isUnconscious) newRound[c.id] = '昏迷中，无法行动';
        else newRound[c.id] = '';
      });
      const updatedRounds = [...record.rounds, newRound];
      combatStore.update(record.id, { rounds: updatedRounds, updatedAt: Date.now() });
      combatStore.resetTurnTodosForRound(record.id, nextRound);
      const firstInNew = findNextValidTurn(nextRound, 0, updatedRounds);
      if (firstInNew) {
        setCurrentTurn(firstInNew);
        resetCombatantActions(firstInNew.combatantId);
        takeTurnSnapshot(firstInNew.round, firstInNew.combatantId);
        checkAndAutoAdvance(firstInNew);
      } else {
        setCurrentTurn(null);
        setPlaybackStarted(false);
      }
    } else {
      combatStore.resetTurnTodosForRound(record.id, nextRound);
      const firstInNext = findNextValidTurn(nextRound, 0);
      if (firstInNext) {
        setCurrentTurn(firstInNext);
        resetCombatantActions(firstInNext.combatantId);
        takeTurnSnapshot(firstInNext.round, firstInNext.combatantId);
        checkAndAutoAdvance(firstInNext);
      } else {
        setCurrentTurn(null);
        setPlaybackStarted(false);
      }
    }
  };

  // ✅ 切换回合后检查：若当前是昏迷角色且无需用户操作（NPC/稳定PC），自动处理并延迟推进
  const checkAndAutoAdvance = (turn: { round: number; combatantIdx: number; combatantId: string } | null) => {
    if (!record || !turn || record.mode !== 'playback' || !playbackStarted) return;
    if (autoAdvanceRef.current) return;
    const c = record.combatants[turn.combatantIdx];
    if (!c || !c.isUnconscious || c.isDead) return;
    const handled = handleComatoseTurn(c, turn.round);
    if (!handled) return;
    autoAdvanceRef.current = true;
    setTimeout(() => {
      autoAdvanceRef.current = false;
      advanceTurn();
    }, 750);
  };

  // 先攻顺序序号（按先攻高→低排序，同先攻保持原序）：返回圆形序号标记
  // 注意：不能用 useMemo，因为在 if(!record) early return 之后，会导致 hooks 顺序不一致
  const initiativeOrder: Map<string, number> = (() => {
    if (!record) return new Map<string, number>();
    const order = [...record.combatants]
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (b.c.initiative - a.c.initiative) || (a.i - b.i));
    const m = new Map<string, number>();
    order.forEach((o, idx) => m.set(o.c.id, idx));
    return m;
  })();

  const CIRCLE_NUMBERS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
  const getInitiativeCircle = (combatantId: string): string => {
    const idx = initiativeOrder.get(combatantId);
    if (idx === undefined) return '';
    if (idx < CIRCLE_NUMBERS.length) return CIRCLE_NUMBERS[idx];
    return `㉑${idx + 1}`; // 超过 20 时简单 fallback
  };

  // ✅ 确定沙盘攻击写入先攻表格的 {round, combatantId} 坐标
  // 有效放映回合 → 当前回合（写入当前角色列）；模拟模式/暂停放映 → 最后一轮（写入攻击者本人列）
  const resolveWriteCell = (attackerId: string): { round: number; combatantId: string } | null => {
    if (!record) return null;
    if (isPlaybackActive()) {
      return { round: currentTurn!.round, combatantId: currentTurn!.combatantId };
    }
    // 模拟模式 / 暂停放映：最后一轮（不存在则创建第一轮），写入攻击者本人列
    const round = Math.max(0, record.rounds.length - 1);
    return { round, combatantId: attackerId };
  };

  // ✅ 写入先攻表格：支持追加（保留已有内容，另起一行）
  const appendRoundRecord = (round: number, combatantId: string, newLine: string) => {
    if (!record) return;
    const existing = record.rounds[round]?.[combatantId] || '';
    const finalText = existing ? `${existing}\n${newLine}` : newLine;
    handleCellChange(round, combatantId, finalText);
  };

  // ✅ 拍某回合的快照：记录此回合开始时的 combatants / rounds / 沙盘
  // 每次进入新回合（播放起始、确认完成回合后）调用一次
  // 注意：直接从 combatStore 读取最新值，避免 record state 还未重新渲染导致读到旧数据
  // 双写：内存 useRef（同步快读）+ IndexedDB（刷新/关闭页面后仍可回溯）
  function takeTurnSnapshot(round: number, combatantId: string) {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const bg = battlegroundStore.get(record.id);
    const snap: TurnSnapshot = {
      combatants: latest.combatants.map(c => ({ ...c })),
      rounds: latest.rounds.map(r => ({ ...r })),
      battleground: (bg?.tokens ?? []).map(t => ({ ...t })),
      equipmentChanges: latest.equipmentChanges
        ? Object.fromEntries(
            Object.entries(latest.equipmentChanges).map(([k, v]) => [
              k,
              { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
            ]),
          )
        : undefined,
    };
    const memKey = `${round}:${combatantId}`;
    // 只在第一次拍（始终回到该回合最初状态）
    if (!rollbackSnapshotRef.current.snapshots[memKey]) {
      rollbackSnapshotRef.current.snapshots[memKey] = snap;
    }
    // 异步写入 IndexedDB，不阻塞主线程
    snapDb.putTurnSnapshot(record.id, round, combatantId, snap).catch(e => console.warn('写入回合快照失败', e));
  }

  // ✅ 回溯到指定回合开始：还原该回合及其之后所有记录为空，并把战斗数据整体还原到快照
  // 查找优先级：内存 useRef（exact key）→ IndexedDB exact key → IndexedDB 近似 key（≤目标 round 的最大 round）→ initial
  // 关键修复：snap.rounds 是"拍快照那一瞬间"的短数组，若当时还没 push 到目标 round 长度，
  // 用 currentStoreRounds 在 snap.rounds 末尾补长度，避免"目标回合格子不存在就不做清空"。
  async function applyRollback(round: number, combatantIdx: number) {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const combatantId = latest.combatants[combatantIdx]?.id;
    if (!combatantId) return;
    const memKey = `${round}:${combatantId}`;
    let snap: TurnSnapshot | null =
      rollbackSnapshotRef.current.snapshots[memKey] ?? rollbackSnapshotRef.current.initial ?? null;
    let exact = !!snap;
    if (!snap) {
      try {
        const best = await snapDb.getBestTurnSnapshot(record.id, round, combatantId);
        if (best) { snap = best.snapshot; exact = best.exact; }
      } catch { /* ignore */ }
    }
    if (!snap) {
      alert('回溯失败：未找到该回合的快照，请先至少推进一个回合后再回溯');
      return;
    }
    // 1) 还原 combatants（HP / 状态）到快照
    const restoredCombatants = snap.combatants.map(c => ({ ...c }));
    // 2) 还原 rounds：
    //   - 先将 snap.rounds 与 latest.rounds 对齐补全到目标 round + 1 长度（避免快照拍得太早导致缺少目标轮）
    //   - 然后直接截断到 round + 1，移除当前轮数之后的所有整行
    const needRounds = Math.max(round + 1, snap.rounds.length);
    const snapRounds = snap.rounds.map(r => ({ ...r }));
    const latestRounds = latest.rounds;
    const paddedRounds: RoundAction[] = [];
    for (let r = 0; r < needRounds; r++) {
      if (r < snapRounds.length) paddedRounds.push(snapRounds[r]);
      else paddedRounds.push({ ...(latestRounds[r] ?? {}) });
    }
    // 非 exact 的回退（用了较旧的 snapshot）：保留 snapshot 到目标 round 之间 rounds 已有的"被突袭/昏迷/死亡"占位
    if (!exact && latest.rounds.length > snap.rounds.length) {
      for (let r = snap.rounds.length; r < paddedRounds.length; r++) {
        if (latest.rounds[r]) {
          const cur = paddedRounds[r];
          for (const c of restoredCombatants) {
            const v = latest.rounds[r][c.id];
            if (v === '被突袭' || v === '昏迷中，无法行动' || v === '死亡') {
              cur[c.id] = v;
            }
          }
        }
      }
    }
    // 当前轮内：目标格之后的单元格清空（同一轮内的后续角色不删除整行）
    const totalCombatants = restoredCombatants.length;
    for (let c = 0; c < totalCombatants; c++) {
      const cid = restoredCombatants[c].id;
      const isAfterInRound = c > combatantIdx;
      if (isAfterInRound) {
        paddedRounds[round] = { ...paddedRounds[round], [cid]: '' };
      }
    }
    // 当前轮内目标格之后：根据 snap 时刻角色状态重新填入昏迷/死亡占位（不覆盖被突袭）
    restoredCombatants.forEach((c, idx) => {
      if (!c.isDead && !c.isUnconscious) return;
      const marker = c.isDead ? '死亡' : '昏迷中，无法行动';
      const isAfterInRound = idx > combatantIdx;
      if (!isAfterInRound) return;
      const cur = paddedRounds[round]?.[c.id];
      if (cur === '被突袭') return;
      paddedRounds[round] = { ...paddedRounds[round], [c.id]: marker };
    });
    // 关键修改：截断到 round + 1，移除当前轮数之后的所有整行（而非仅清空单元格）
    const truncatedRounds = paddedRounds.slice(0, round + 1);
    // 3) 应用还原
    combatStore.update(record.id, {
      combatants: restoredCombatants,
      rounds: truncatedRounds,
      equipmentChanges: snap.equipmentChanges
        ? Object.fromEntries(
            Object.entries(snap.equipmentChanges).map(([k, v]) => [
              k,
              { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
            ]),
          )
        : undefined,
      updatedAt: Date.now(),
    });
    // 4) 还原沙盘
    battlegroundStore.setTokens(record.id, snap.battleground.map(t => ({ ...t })));
    // 5) 当前回合跳到此回合格
    setCurrentTurn({ round, combatantIdx, combatantId });
    // 6) 此回合格在回溯后需要重新拍快照：清掉内存+IDB 中旧快照，下次进入重拍
    const memKey2 = `${round}:${combatantId}`;
    delete rollbackSnapshotRef.current.snapshots[memKey2];
    snapDb.getTurnSnapshot(record.id, round, combatantId).then(() => {}); // 热身连接
    // 下帧立即为当前"回到此回合"拍新快照（避免回到后再回溯找不到）
    setTimeout(() => takeTurnSnapshot(round, combatantId), 0);
    setRewindModal(null);
  }

  // ✅ 确认完成回合
  const confirmEndTurn = () => {
    setConfirmEndTurnOpen(false);
    advanceTurn();
  };

  // ✅ 手动记录：确认后写入表格并应用效果
  const confirmManualRecord = () => {
    if (!selectedCell) return;
    const { round, combatantId } = selectedCell;
    const target = record.combatants.find(c => c.id === manualTargetId);
    const attacker = record.combatants.find(c => c.id === combatantId);

    if (manualRecordType === 'attack') {
      if (!canUseAction(combatantId)) {
        alert('该参战者本回合已没有可用动作');
        return;
      }
      if (!manualAttackMethod.trim()) { alert('请填写攻击方式'); return; }
      if (!target) { alert('请选择目标'); return; }
      if (!manualAttackRoll) { alert('请填写攻击检定值'); return; }

      // 自动判定：攻击检定值根据目标 AC 自动判断命中
      const roll = parseInt(manualAttackRoll, 10);
      if (isNaN(roll)) { alert('攻击检定值必须是数字'); return; }
      const tgtAc = getEffectiveAc(target);
      if (!tgtAc && tgtAc !== 0) { alert('目标缺少 AC，无法判定命中'); return; }
      const hit = roll >= tgtAc;

      let text = '';
      if (!hit) {
        text = `对 ${target.name} 的攻击未命中，${manualAttackMethod}打偏了`;
      } else {
        const dmg = parseInt(manualDamage, 10);
        if (isNaN(dmg) || dmg === 0) { alert('请输入有效的伤害值（非0整数）'); return; }
        text = `对 ${target.name} 的攻击命中，用${manualAttackMethod}造成${dmg}点伤害`;
        if (manualIsKill && target.currentHp !== undefined) {
          const newHp = Math.max(0, (target.currentHp ?? 0) - dmg);
          const status: 'unconscious' | 'dead' = target.isPc ? 'unconscious' : 'dead';
          handleApplyDamage(target.id, newHp, status);
          text += target.isPc ? `，将其击昏` : `，将其杀死`;
        } else if (target.currentHp !== undefined) {
          const newHp = Math.max(0, target.currentHp - dmg);
          handleApplyDamage(target.id, newHp);
        }
      }
      handleCellChange(round, combatantId, text);
      // 攻击（无论命中/未命中）消耗 1 个动作
      consumeCombatantAction(combatantId);
    } else if (manualRecordType === 'recovery') {
      if (!manualHealMethod.trim()) { alert('请填写恢复方式'); return; }
      const amount = parseInt(manualHealAmount, 10);
      if (isNaN(amount) || amount <= 0) { alert('请输入有效的恢复量（正整数）'); return; }
      if (!attacker) return;

      let targetHpId = manualTargetId;
      let targetName = target?.name || '';
      if (!target) {
        // 如果没选目标，默认恢复自己
        targetHpId = combatantId;
        targetName = attacker.name;
      }
      const tgt = record.combatants.find(c => c.id === targetHpId);
      if (!tgt) return;

      const newHp = Math.min(tgt.maxHp ?? tgt.currentHp ?? 0, (tgt.currentHp ?? 0) + amount);
      handleApplyDamage(tgt.id, newHp);

      const isSelf = targetHpId === combatantId;
      const text = isSelf
        ? `用${manualHealMethod}恢复了自己${amount}点生命值`
        : `用${manualHealMethod}恢复了${targetName} ${amount}点生命值`;
      handleCellChange(round, combatantId, text);
    }

    // 重置表单
    setManualRecordOpen(false);
    setManualRecordType(null);
    setManualTargetId('');
    setManualAttackMethod('');
    setManualDamage('');
    setManualIsKill(false);
    setManualHealMethod('');
    setManualHealAmount('');
    setManualAttackRoll('');
    setSelectedCell(null);
  };

  // ✅ 手动记录：关闭窗口
  const cancelManualRecord = () => {
    setManualRecordOpen(false);
    setManualRecordType(null);
    setManualTargetId('');
    setManualAttackMethod('');
    setManualDamage('');
    setManualIsKill(false);
    setManualHealMethod('');
    setManualHealAmount('');
    setManualAttackRoll('');
    setSelectedCell(null);
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
          {/* 放映模式不提供批量删除，强制隐藏 batchMode UI（如果切换时还在批量模式则关掉） */}
          {(batchMode && record.mode !== 'playback') ? (
            <>
              <button
                type="button"
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
                type="button"
                onClick={() => setShowCharSelect(true)}
                className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">添加参战者</span>
              </button>
              {/* 批量删除：放映模式下不提供（放映模式用回溯代替） */}
              {record.mode !== 'playback' && (
                <button
                  type="button"
                  onClick={() => setBatchMode(true)}
                  className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">批量删除</span>
                </button>
              )}
              <button
                type="button"
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

      {/* ✅ 模式切换栏 —— 模拟模式 / 放映模式（仅切换按钮，不挤其他信息） */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light w-fit">
        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">
          战斗模式
        </span>
        <div className="flex rounded-lg border dark:border-border-dark light:border-border-light overflow-hidden">
          <button
            onClick={() => handleModeChange('simulation')}
            disabled={playbackStarted}
            className={`px-3 py-1.5 text-xs transition-colors ${
              (record.mode ?? 'simulation') === 'simulation'
                ? 'bg-primary text-white'
                : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            模拟模式
          </button>
          <button
            onClick={() => handleModeChange('playback')}
            className={`px-3 py-1.5 text-xs transition-colors ${
              record.mode === 'playback'
                ? 'bg-primary text-white'
                : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
            }`}
          >
            放映模式
          </button>
        </div>
      </div>

      {/* ✅ 当前回合信息悬浮块（左上角，放映模式时显示） */}
      {record.mode === 'playback' && (() => {
        let label = '';
        let tone: 'muted' | 'info' | 'warn' | 'danger' = 'muted';
        if (!playbackStarted) {
          label = '点击先攻表格的 ▶️ 开始放映';
          tone = 'muted';
        } else if (playbackPaused) {
          label = '⏸ 放映已暂停（脱离回合格）';
          tone = 'warn';
        } else if (currentTurn) {
          const name = record.combatants[currentTurn.combatantIdx]?.name ?? '?';
          label = `当前回合：${name}（第 ${currentTurn.round + 1} 轮）`;
          tone = 'info';
        } else {
          label = '放映已结束';
          tone = 'muted';
        }
        const toneCls =
          tone === 'warn'
            ? 'border-amber-500/50 text-amber-500 bg-amber-500/5'
            : tone === 'info'
              ? 'border-primary/40 bg-primary/5 dark:text-text-dark light:text-text-light'
              : 'border dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted dark:bg-card-dark/80 light:bg-card-light/80';
        return (
          <div className={`fixed top-20 left-6 z-40 px-4 py-2 rounded-lg backdrop-blur shadow-md ${toneCls}`}>
            <span className="text-sm font-medium whitespace-nowrap">{label}</span>
          </div>
        );
      })()}

      {/* ✅ 左下角仿显示屏状态栏：可用动作 + 移动力 + 完成回合按钮（深蓝偏紫底 + 白字等宽字体） */}
      {(() => {
        const playbackMode = record.mode === 'playback';
        let hudId: string | null = null;
        if (isPlaybackActive() && currentTurn) {
          hudId = currentTurn.combatantId;
        } else if (sandboxSelectedId) {
          hudId = sandboxSelectedId;
        }
        if (!hudId) return null;
        const c = record.combatants.find(x => x.id === hudId) ?? null;
        if (!c) return null;
        const actions = typeof c.actions === 'number' && c.actions >= 0 ? c.actions : 1;
        const totalSpeed = c.speed ?? 0;
        const remaining = combatStore.getRemainingMovement(c, playbackMode ? 'playback' : 'simulation', isPlaybackActive());
        const active = playbackMode && playbackStarted && !playbackPaused;
        const actionText = active ? (actions <= 0 ? '0' : `${actions}`) : '∞';
        const moveText = totalSpeed > 0
          ? (active ? `${remaining}/${totalSpeed}` : `${totalSpeed}`)
          : '—';
        const showEndTurn = active && !!currentTurn;
        // 仿显示屏：深蓝偏紫底 + 白字 + 等宽字体
        const screenBg = 'bg-indigo-950/90';
        const screenBorder = 'border border-indigo-400/20';
        const labelCls = (isZero: boolean) =>
          active
            ? (isZero ? 'text-red-400' : 'text-white')
            : 'text-indigo-300/60';
        return (
          <div className={`fixed bottom-6 left-6 z-30 flex items-center gap-3 px-4 py-3 rounded-lg backdrop-blur shadow-lg ${screenBorder} ${screenBg} font-mono max-w-[calc(100vw-3rem)]`}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-300/50 tracking-wider">ACT</span>
              <span className={`text-sm font-bold ${labelCls(actions <= 0)}`}>{actionText}</span>
            </div>
            <span className="text-indigo-400/30">|</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-300/50 tracking-wider">MOV</span>
              <span className={`text-sm font-bold ${labelCls(remaining <= 0)}`}>{moveText}</span>
              <span className="text-[10px] text-indigo-300/50">ft</span>
            </div>
            {showEndTurn && (
              <>
                <span className="text-indigo-400/30">|</span>
                <button
                  onClick={() => setConfirmEndTurnOpen(true)}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors flex items-center gap-1 whitespace-nowrap"
                  title="完成当前回合，进入下一个"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  完成回合
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* ✅ 回合待办展示板 —— 仅放映模式 + 已开始 + 未暂停 + 当前回合存在时显示（暂停状态不显示） */}
      {record.mode === 'playback' && playbackStarted && !playbackPaused && currentTurn && (
        <TurnTodoBoard
          record={record}
          currentTurn={currentTurn}
          combatants={record.combatants}
        />
      )}

      {/* 原内容：完全保留，一个字都没改（表格逻辑不变） */}
      <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="dark:bg-card-dark light:bg-card-light">
              <th className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-card-dark light:bg-card-light z-10 w-16 text-center">
                轮次
              </th>
              {record.combatants.map((c, idx) => {
                const downed = c.isDead || c.isUnconscious;
                return (
                <th key={c.id} className={`p-2 pt-7 border-r dark:border-border-dark light:border-border-light min-w-[120px] relative group ${downed ? 'opacity-40' : ''}`}>
                  <div className="absolute top-1 left-1 w-6 h-6 rounded-full dark:bg-gray-600 dark:text-white light:bg-gray-300 light:text-black text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                    {/* 死亡：在数字标记上打红叉 */}
                    {c.isDead && (
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 100 100"
                        style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))' }}
                      >
                        <line x1="20" y1="20" x2="80" y2="80" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" />
                        <line x1="80" y1="20" x2="20" y2="80" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" />
                      </svg>
                    )}
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
                    {/* 名称：参战者信息按钮，点击展开「双击弹窗」（CombatantInfoPanel，等价沙盘双击棋子） */}
                    <button
                      type="button"
                      onClick={() => setInfoPanelCombatant(c)}
                      className="font-medium truncate flex-1 text-left px-1.5 py-0.5 rounded-md border border-transparent
                                 dark:text-text-dark light:text-text-light
                                 dark:hover:border-primary/40 dark:hover:bg-primary/10
                                 light:hover:border-primary/40 light:hover:bg-primary/10
                                 transition-colors focus:outline-none focus:ring-1 focus:ring-primary/60
                                 hover:underline hover:underline-offset-2 hover:decoration-primary/70"
                      title="点击查看参战者详情 / 编辑信息"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Pencil className="w-3 h-3 opacity-50 shrink-0" />
                        <span>{c.name}</span>
                      </span>
                    </button>
                  </div>
                  {/* 先攻：只读显示（不可再点击编辑） */}
                  <div
                    className="text-xs opacity-60 select-none"
                    title={`先攻：${c.initiative}（只读）`}
                  >
                    先攻 {c.initiative}
                  </div>
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
                );
              })}
            </tr>
          </thead>
          <tbody>
            {record.rounds.map((round, roundIndex) => (
              <tr key={roundIndex} className="border-t dark:border-border-dark/50 light:border-border-light/50">
                <td className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-bg-dark light:bg-bg-light font-medium text-center">
                  {roundIndex === 0 ? (
                    <button
                      onClick={() => openSurpriseAttackModal(roundIndex)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-primary/10 text-primary transition-colors cursor-pointer"
                      title="设置被突袭角色"
                    >
                      {roundIndex + 1}
                    </button>
                  ) : (
                    roundIndex + 1
                  )}
                </td>
                {record.combatants.map((c) => {
                  const action = round[c.id] || '';
                  const isEditing =
                    editingCell?.round === roundIndex &&
                    editingCell?.combatantId === c.id;
                  const isSurprised = action === '被突袭';
                  const isSelected = selectedCell?.round === roundIndex && selectedCell?.combatantId === c.id;
                  // 放映模式判断
                  const isPlayback = record.mode === 'playback';
                  // 暂停放映：不高亮任何回合格（因为不处于任何参战者的回合）
                  const isCurrentTurn = isPlayback && playbackStarted && !playbackPaused && currentTurn?.round === roundIndex && currentTurn?.combatantId === c.id;
                  // 放映模式下：
                  // - 未开始放映：所有非被突袭格子可点击（用于选择放映起点）
                  // - 已开始放映：当前回合格子可记录/手动输入；其它任何已发生或后续格子也允许点击（用于回溯）
                  const cellClickable = isPlayback
                    ? (!isSurprised && (
                        !playbackStarted || true  // 已开始放映后允许点开任意格子查看并回溯
                      ))
                    : true;

                  if (isSurprised) {
                    return (
                      <td
                        key={c.id}
                        className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] dark:bg-yellow-500/10 light:bg-yellow-100/50 text-center"
                        title="被突袭：本回合被突袭，失去先攻"
                      >
                        <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">被突袭</span>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={c.id}
                      className={`p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] transition-colors relative ${
                        isSelected ? 'bg-primary/10 ring-2 ring-inset ring-primary/30' : cellClickable ? 'hover:bg-white/5 cursor-pointer' : 'opacity-60'
                      } ${isCurrentTurn ? 'ring-2 ring-yellow-400 dark:ring-yellow-300 animate-pulse bg-yellow-400/10 dark:bg-yellow-300/10' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditing) return;
                        if (isPlayback) {
                          // 放映模式：所有非被突袭格子都可被点开
                          // （未开始放映 → 显示播放按钮；已开始放映 → 当前回合显示记录/手动输入，其它显示回溯）
                          setSelectedCell({ round: roundIndex, combatantId: c.id });
                          setEditingCell(null);
                        } else {
                          setSelectedCell({ round: roundIndex, combatantId: c.id });
                          setEditingCell(null);
                        }
                      }}
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
                      ) : isSelected ? (
                        <div className="flex flex-col items-center gap-1 py-1 relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCell(null);
                            }}
                            className="absolute -top-1 -right-1 p-0.5 rounded-full bg-danger text-white hover:bg-danger/80 transition-colors z-10"
                            title="取消"
                            type="button"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <div className="whitespace-pre-wrap text-xs min-h-[2em] w-full text-center opacity-50 italic">
                            {action || '空白记录'}
                          </div>
                          {isPlayback && !playbackStarted ? (
                            // 放映模式 + 未开始放映 → 显示播放按钮（放映模式不要手动记录按钮）
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startPlayback();
                                setSelectedCell(null);
                              }}
                              className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1 text-xs"
                              title="从这里开始放映"
                            >
                              <Play className="w-3 h-3" />
                              开始放映
                            </button>
                          ) : isPlayback && playbackStarted ? (
                            // 放映模式 + 已开始放映：仅当前回合/之前的回合格支持「手动记录/手动输入」，所有回合格都支持「回溯」
                            <>
                              {(isCurrentTurn ||
                                roundIndex < (currentTurn?.round ?? Infinity) ||
                                (roundIndex === (currentTurn?.round ?? -1) &&
                                  (record.combatants.findIndex(x => x.id === c.id)) < (currentTurn?.combatantIdx ?? Infinity))
                              ) ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setManualRecordType('attack');
                                      setManualRecordOpen(true);
                                      setManualTargetId('');
                                      setManualAttackMethod('');
                                      setManualDamage('');
                                      setManualIsKill(false);
                                      setManualHealMethod('');
                                      setManualHealAmount('');
                                      setManualAttackRoll('');
                                    }}
                                    className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1 text-xs"
                                    title="手动记录"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    记录
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCell({ round: roundIndex, combatantId: c.id });
                                      setSelectedCell(null);
                                    }}
                                    className="text-xs px-2 py-0.5 rounded border dark:border-border-dark light:border-border-light hover:bg-white/5 transition-colors flex items-center gap-1"
                                    title="手动输入"
                                  >
                                    <Keyboard className="w-3 h-3" />
                                    手动输入
                                  </button>
                                </>
                              ) : null}
                              {/* 放映模式：任何已过/当前/后续回合格都提供回溯（只要不是纯占位符） */}
                              {action !== '被突袭' && action !== '昏迷中，无法行动' && action !== '死亡' && (() => {
                                const cidx = record.combatants.findIndex(x => x.id === c.id);
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // 打开回溯确认弹窗：第一次点击 firstClickDone，第二次确认
                                      setRewindModal({
                                        round: roundIndex,
                                        combatantId: c.id,
                                        combatantIdx: cidx,
                                        firstClickDone: false,
                                      });
                                    }}
                                    className="text-xs px-2 py-0.5 rounded border border-amber-500/40 text-amber-500 hover:bg-amber-500/10 transition-colors flex items-center gap-1"
                                    title="回溯到此回合（之后所有记录清空并还原生命值/沙盘）"
                                  >
                                    <Undo2 className="w-3 h-3" />
                                    回溯到此
                                  </button>
                                );
                              })()}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setManualRecordType('attack');
                                  setManualRecordOpen(true);
                                  setManualTargetId('');
                                  setManualAttackMethod('');
                                  setManualDamage('');
                                  setManualIsKill(false);
                                  setManualHealMethod('');
                                  setManualHealAmount('');
                                  setManualAttackRoll('');
                                }}
                                className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1 text-xs"
                                title="手动记录"
                              >
                                <Pencil className="w-3 h-3" />
                                记录
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCell({ round: roundIndex, combatantId: c.id });
                                  setSelectedCell(null);
                                }}
                                className="text-xs px-2 py-0.5 rounded border dark:border-border-dark light:border-border-light hover:bg-white/5 transition-colors flex items-center gap-1"
                                title="手动输入"
                              >
                                <Keyboard className="w-3 h-3" />
                                手动输入
                              </button>
                            </>
                          )}
                        </div>
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
        combatInventories={combatInventories}
        equipmentChangesMap={record.equipmentChanges}
        onUpdateChanges={(combatantId, changes) => {
          combatStore.update(record.id, {
            equipmentChanges: {
              ...(record.equipmentChanges || {}),
              [combatantId]: changes,
            },
          });
        }}
        playbackOnlyMovableId={
          isPlaybackActive()
            ? currentTurn!.combatantId
            : null
        }
        activeTurnCombatantId={
          isPlaybackActive()
            ? currentTurn!.combatantId
            : null
        }
        mode={record.mode}
        playbackActive={isPlaybackActive()}
        remainingMovementMap={(() => {
          const m: Record<string, number> = {};
          const active = isPlaybackActive();
          for (const c of record.combatants) {
            m[c.id] = combatStore.getRemainingMovement(c, record.mode, active);
          }
          return m;
        })()}
        onConsumeMovement={(combatantId, feet) => {
          if (!record.id) return false;
          const got = combatStore.consumeMovement(record.id, combatantId, feet, record.mode, isPlaybackActive());
          return got >= feet;
        }}
        onRefundMovement={(combatantId, feet) => {
          if (!record.id) return;
          combatStore.refundMovement(record.id, combatantId, feet, record.mode, isPlaybackActive());
        }}
        onSelectionChange={(id) => {
          setSandboxSelectedId(id);
        }}
        onRequestAttack={(attacker, target) => {
          // 动作校验：放映模式可用动作耗尽时禁止发起攻击
          if (!canUseAction(attacker.id)) {
            alert('该参战者本回合已没有可用动作');
            return;
          }
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
        onRequestSpell={(caster, target) => {
          // 动作校验：放映模式可用动作耗尽时禁止施法
          if (!canUseAction(caster.id)) {
            alert('该参战者本回合已没有可用动作');
            return;
          }
          // 法术按钮：打开独立法术施放弹窗
          setSpellModal({ caster, target });
        }}
        onPickupItem={(itemToken, picker) => {
          // 拾起掉落物品：体型小型及以上 + 智力4以上 + 5尺内（1格）
          if (!record) return;
          const bg = battlegroundStore.get(record.id);
          if (!bg) return;
          const pickerToken = bg.tokens.find(t => t.combatantId === picker.id);
          if (!pickerToken) {
            alert('拾取者不在沙盘上');
            return;
          }
          // 距离检查：5尺内（切比雪夫距离 ≤ 1格）
          const dist = Math.max(
            Math.abs(pickerToken.col - itemToken.col),
            Math.abs(pickerToken.row - itemToken.row),
          );
          if (dist > 1) {
            alert(`距离过远（${dist * 5}尺），需在5尺（1格）内才能拾起`);
            return;
          }
          // 体型检查：小型及以上
          let size = '中型';
          let intelligence = 10;
          if (picker.characterId) {
            const char = characterStore.get(picker.characterId);
            if (char) {
              size = char.size || '中型';
              intelligence = char.abilities?.intelligence?.score || 10;
            }
          } else if (picker.templateId) {
            const template = npcTemplateStore.getAll().find(t => t.templateId === picker.templateId);
            if (template) {
              intelligence = template.intelligence || 10;
            }
          }
          const validSizes = ['微型', '小型', '中型', '大型', '巨型', '超巨型'];
          if (!validSizes.includes(size)) size = '中型';
          const sizeIdx = validSizes.indexOf(size);
          if (sizeIdx < 1) { // 小型 = index 1
            alert(`${picker.name} 体型为${size}，需小型及以上才能拾起`);
            return;
          }
          // 智力检查：4以上
          if (intelligence < 4) {
            alert(`${picker.name} 智力为${intelligence}，需4以上才能拾起`);
            return;
          }
          
          // 拾取物品：优先复用源 childId（"丢出去的匕首捡回来还是同一把"），
          // 避免生成新 childId 导致同名武器被识别为不同实体（武器定制化越强，数据丢失越严重）；
          // 仅 NPC 掉落物（无源 childId）才生成新的临时 childId。
          const sourceChildId = (itemToken.equipmentData?.childId as string | undefined)
            || (itemToken.equipmentData?.id as string | undefined);
          const fallbackChildId = `combat-${picker.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const childIdToUse = sourceChildId || fallbackChildId;

          // 判断拾取者是否为该 childId 的源拥有者：
          //   是 → 拾取 = 撤销当初的"丢失"操作（removedChildIds 或 quantityDeltas），
          //        否则 added 会被 removedChildIds 强制置 0，导致"捡不回来"
          //   否 → 当作新增物品写入 added
          const pickerChar = picker.characterId ? characterStore.get(picker.characterId) : null;
          const pickerSrcList = (pickerChar?.equipment as any[] | undefined) || [];
          const isInPickerSrc = sourceChildId
            ? pickerSrcList.some(e => (e.childId || e.id) === sourceChildId)
            : false;

          const equipSnapshot: Record<string, unknown> = {
            ...(itemToken.equipmentData || {}),
            name: (itemToken.equipmentData?.name as string) || itemToken.name || '未命名物品',
            category: (itemToken.equipmentData?.category as string) || '杂项',
            quantity: 1,
            childId: childIdToUse,
          };
          const currentChanges = record?.equipmentChanges?.[picker.id];
          const newChanges = applyEquipmentChange(currentChanges, (ch) => {
            if (isInPickerSrc && ch.removedChildIds.includes(childIdToUse)) {
              // 当初源数量=1，整件被 removed → 撤销 removed，combatQty 自然回到 srcQty
              ch.removedChildIds = ch.removedChildIds.filter(c => c !== childIdToUse);
            } else if (isInPickerSrc && (ch.quantityDeltas[childIdToUse] || 0) < 0) {
              // 当初源数量>1，quantityDeltas -1 → +1 抵消
              const next = (ch.quantityDeltas[childIdToUse] || 0) + 1;
              if (next === 0) delete ch.quantityDeltas[childIdToUse];
              else ch.quantityDeltas[childIdToUse] = next;
            } else {
              // 非源拥有者，或源拥有者从未丢失此物（捡到同名同 childId 的他人掉落物）：当作新增
              ch.added.push({
                childId: childIdToUse,
                equipment: equipSnapshot,
              });
            }
          });
          combatStore.update(record.id, {
            equipmentChanges: {
              ...(record?.equipmentChanges || {}),
              [picker.id]: newChanges,
            },
          });

          // 从网格移除物品 token
          battlegroundStore.removeItemToken(record.id, itemToken.id);
          // 写入先攻表格
          const cell = resolveWriteCell(picker.id);
          if (cell) {
            appendRoundRecord(cell.round, cell.combatantId, `${picker.name} 拾起了 ${itemToken.name}`);
          }
        }}
        onRemoveItem={(combatantId, item) => {
          // 从战斗背包删除物品：通过变更信息漏斗
          if (!record) return;
          const slotId = item.childId || item.id;
          if (!slotId) return;
          const currentChanges = record.equipmentChanges?.[combatantId];
          const newChanges = applyEquipmentChange(currentChanges, (ch) => {
            // 判断该 childId 是源装备还是战斗中新增的
            const isInAdded = ch.added.some(a => a.childId === slotId);
            if (isInAdded) {
              // 战斗中新增的：直接从 added 移除
              ch.added = ch.added.filter(a => a.childId !== slotId);
            } else {
              // 源装备：加入 removedChildIds
              if (!ch.removedChildIds.includes(slotId)) {
                ch.removedChildIds.push(slotId);
              }
            }
          });
          combatStore.update(record.id, {
            equipmentChanges: {
              ...(record.equipmentChanges || {}),
              [combatantId]: newChanges,
            },
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
          combatantPositions={combatantPositions}
          combatInventory={getCombatInventory(record, attackModal.attacker)}
          targetCharacter={attackModal.target.characterId ? characterStore.get(attackModal.target.characterId) : null}
          targetCombatInventory={getCombatInventory(record, attackModal.target)}
          loadedWeapons={record?.loadedWeapons}
          loadingAttackedThisRound={record?.loadingAttackedThisRound}
          combatMode={currentMode()}
          playbackTurnActive={isPlaybackActive()}
          onLoadedChange={(key, loaded) => {
            if (!record) return;
            combatStore.update(record.id, {
              loadedWeapons: {
                ...(record.loadedWeapons || {}),
                [key]: loaded,
              },
              updatedAt: Date.now(),
            });
          }}
          onClose={() => setAttackModal(null)}
          onConfirmHit={(attack, info) => {
            // 攻击（无论是否命中）消耗 1 个动作
            consumeCombatantAction(attackModal.attacker.id);
            // 装填武器：标记本回合已攻击（每回合只能一次，优先级高于额外动作）
            if (attack.properties?.some(p => p.includes('装填'))) {
              markLoadingAttacked(attackModal.attacker.id);
            }
            // 命中确认：关闭攻击检定弹窗，切换至伤害结算弹窗
            // 弹药属性武器：消耗弹药（无论命中/未命中）
            if (info.ammoConsumed && record) {
              const currentChanges = record.equipmentChanges?.[attackModal.attacker.id];
              const newChanges = applyEquipmentChange(currentChanges, (ch) => {
                const ammoId = info.ammoConsumed!.ammoChildId;
                const prevDelta = ch.quantityDeltas[ammoId] || 0;
                // 若源弹药数量-1 后 ≤0 则加入 removedChildIds（整件移除）
                const srcQty = (() => {
                  const pc = attackModal.attacker.characterId ? characterStore.get(attackModal.attacker.characterId) : null;
                  const eq = pc?.equipment.find(e => (e.childId || e.id) === ammoId);
                  return eq ? (eq.quantity || 1) + prevDelta : 0;
                })();
                if (srcQty <= 1) {
                  if (!ch.removedChildIds.includes(ammoId)) ch.removedChildIds.push(ammoId);
                } else {
                  ch.quantityDeltas[ammoId] = prevDelta - 1;
                }
              });
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [attackModal.attacker.id]: newChanges,
                },
                updatedAt: Date.now(),
              });
            }
            setDamageModal({
              attacker: attackModal.attacker,
              target: attackModal.target,
              attack,
              disadvantage: info.disadvantage,
              isCritical: info.isNatural20,
              d20Rolled: info.d20Rolled,
              d20Final: info.d20Final,
              d20Bonus: info.bonus,
              d20Total: info.total,
              usageMode: info.usageMode,
              isTwoHandedWield: info.isTwoHandedWield,
            });
            setAttackModal(null);
          }}
          onAttackMiss={(missInfo) => {
            // 攻击（无论是否命中）消耗 1 个动作
            consumeCombatantAction(attackModal.attacker.id);
            // 装填武器：标记本回合已攻击（每回合只能一次，优先级高于额外动作）
            if (missInfo.attack.properties?.some(p => p.includes('装填'))) {
              markLoadingAttacked(attackModal.attacker.id);
            }
            // 未命中：写入先攻表格（简化格式）
            // 弹药属性武器：消耗弹药（无论命中/未命中）
            if (missInfo.ammoConsumed && record) {
              const currentChanges = record.equipmentChanges?.[attackModal.attacker.id];
              const newChanges = applyEquipmentChange(currentChanges, (ch) => {
                const ammoId = missInfo.ammoConsumed!.ammoChildId;
                const prevDelta = ch.quantityDeltas[ammoId] || 0;
                const srcQty = (() => {
                  const pc = attackModal.attacker.characterId ? characterStore.get(attackModal.attacker.characterId) : null;
                  const eq = pc?.equipment.find(e => (e.childId || e.id) === ammoId);
                  return eq ? (eq.quantity || 1) + prevDelta : 0;
                })();
                if (srcQty <= 1) {
                  if (!ch.removedChildIds.includes(ammoId)) ch.removedChildIds.push(ammoId);
                } else {
                  ch.quantityDeltas[ammoId] = prevDelta - 1;
                }
              });
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [attackModal.attacker.id]: newChanges,
                },
                updatedAt: Date.now(),
              });
            }
            const cell = resolveWriteCell(attackModal.attacker.id);
            if (!cell) return;
            const text = `对 ${attackModal.target.name} 的攻击未命中，${missInfo.attackName}打偏了`;
            appendRoundRecord(cell.round, cell.combatantId, text);
            // 投掷武器掉落：未命中也掉落
            if (attackModal.attackerPos && attackModal.targetPos) {
              executeThrownDrop(
                attackModal.attacker, attackModal.target,
                missInfo.attack,
                attackModal.attackerPos, attackModal.targetPos,
                false, missInfo.usageMode,
              );
            }
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
          isCritical={damageModal.isCritical}
          isTwoHandedWield={damageModal.isTwoHandedWield}
          onApplyDamage={({ damage, newHp, status }) => {
            // 1. 应用 HP / 状态
            handleApplyDamage(damageModal.target.id, newHp, status);
            // 2. 写入先攻表格（简化格式）
            const cell = resolveWriteCell(damageModal.attacker.id);
            if (cell) {
              let text = `对 ${damageModal.target.name} 的攻击命中，用${damageModal.attack.name}造成${damage}点伤害`;
              if (status === 'unconscious') text += '，将其击昏';
              else if (status === 'dead') text += '，将其杀死';
              appendRoundRecord(cell.round, cell.combatantId, text);
            }
            // 3. 投掷武器掉落：命中也掉落
            const bg = record ? battlegroundStore.get(record.id) : null;
            if (bg) {
              const attackerToken = bg.tokens.find(t => t.combatantId === damageModal.attacker.id);
              const targetToken = bg.tokens.find(t => t.combatantId === damageModal.target.id);
              if (attackerToken && targetToken) {
                executeThrownDrop(
                  damageModal.attacker, damageModal.target,
                  damageModal.attack,
                  { col: attackerToken.col, row: attackerToken.row },
                  { col: targetToken.col, row: targetToken.row },
                  true, damageModal.usageMode,
                );
              }
            }
          }}
          onClose={() => setDamageModal(null)}
        />
      )}

      {/* ✅ 新增：法术施放弹窗 —— 独立于攻击检定的交互流程 */}
      {spellModal && (
        <CombatSpellModal
          caster={spellModal.caster}
          target={spellModal.target}
          targetCharacter={spellModal.target.characterId ? characterStore.get(spellModal.target.characterId) : null}
          targetCombatInventory={getCombatInventory(record, spellModal.target)}
          combatantPositions={combatantPositions}
          onClose={() => setSpellModal(null)}
          onCastResolved={(info) => {
            // 施法时间 = "1 动作" 的法术消耗 1 个动作（无论是否命中/被豁免）
            if (isOneActionCast(info.castingTime)) {
              consumeCombatantAction(spellModal.caster.id);
            }
            // 1. 应用 HP / 状态（伤害扣血、治疗加血，handleApplyDamage 直接覆盖 newHp）
            handleApplyDamage(spellModal.target.id, info.newHp, info.status);
            // 2. 写入先攻表格：xxx 施展 xxx 成功/失败，对 xxx 造成 xxx 点伤害/恢复 xxx 点生命值
            const cell = resolveWriteCell(spellModal.caster.id);
            if (cell) {
              let text = `${spellModal.caster.name} 施展 ${info.spellName}${info.success ? '成功' : '失败'}`;
              if (info.success && info.amount > 0) {
                text += `，对 ${spellModal.target.name}${info.effectType === 'damage' ? `造成${info.amount}点伤害` : `恢复${info.amount}点生命值`}`;
                if (info.status === 'unconscious') text += '，将其击昏';
                else if (info.status === 'dead') text += '，将其杀死';
              }
              appendRoundRecord(cell.round, cell.combatantId, text);
            }
          }}
        />
      )}

      {/* ✅ 协助（Help）动作弹窗 */}
      {helpModal && record && (() => {
        const from = helpModal.from;
        // 友方：同阵营（isPc === from.isPc），未死亡，非自己
        const friendlies = record.combatants.filter(
          c => c.id !== from.id && c.isPc === from.isPc && !c.isDead,
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setHelpModal(null)}>
            <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
                  协助动作
                </h3>
                <button onClick={() => setHelpModal(null)} className="p-1 rounded hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-2">
                发出者：<span className="font-medium dark:text-text-dark light:text-text-light">{from.name}</span>
              </p>
              <ul className="text-xs dark:text-text-dark-muted light:text-text-light-muted space-y-0.5 mb-4 list-disc pl-5">
                <li>效果：优势</li>
                <li>类型：一次性</li>
                <li>有效期：{from.name} 的下一个回合前</li>
                <li>生效场景：
                  <ul className="list-[circle] pl-4">
                    <li>属性检定 / 技能检定（无条件）</li>
                    <li>攻击检定（近战/远程/投掷/法术）：仅当对方攻击目标在 {from.name} 5 尺内</li>
                  </ul>
                </li>
              </ul>
              <div className="text-xs font-medium dark:text-text-dark light:text-text-light mb-2">
                选择协助对象（友方 · {friendlies.length}）
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {friendlies.length === 0 && (
                  <div className="text-xs opacity-60 text-center py-6">当前没有可选择的友方</div>
                )}
                {friendlies.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (!record) return;
                      const scenes: { scene: CheckScene | 'any'; reason: string; distance: boolean }[] = [
                        { scene: 'ability_check', reason: `${from.name} 协助：属性检定优势`, distance: false },
                        { scene: 'skill_check', reason: `${from.name} 协助：技能检定优势`, distance: false },
                        { scene: 'attack_melee', reason: `${from.name} 协助：近战攻击优势（目标须在其 5 尺内）`, distance: true },
                        { scene: 'attack_ranged', reason: `${from.name} 协助：远程攻击优势（目标须在其 5 尺内）`, distance: true },
                        { scene: 'attack_thrown', reason: `${from.name} 协助：投掷攻击优势（目标须在其 5 尺内）`, distance: true },
                        { scene: 'spell_attack', reason: `${from.name} 协助：法术攻击优势（目标须在其 5 尺内）`, distance: true },
                      ];
                      const curRound = currentTurn?.round ?? 0;
                      for (const s of scenes) {
                        combatStore.addPendingAdvantage(record.id, f.id, {
                          fromId: from.id,
                          fromName: from.name,
                          scene: s.scene,
                          mode: 'advantage',
                          reason: s.reason,
                          kind: 'action',
                          targetId: undefined,
                          requireTargetNearFromId: s.distance,
                          expireOnCombatantId: from.id,
                          createdRound: curRound,
                          expireRound: curRound + 999, // 实际由 expireOnCombatantId 先清理
                        });
                      }
                      // 消耗 1 个动作
                      consumeCombatantAction(from.id);
                      // 写入回合记录
                      if (currentTurn) {
                        appendRoundRecord(
                          currentTurn.round,
                          from.id,
                          `${from.name} 对 ${f.name} 使用「协助」：${f.name} 的属性/技能检定获得优势；攻击检定在攻击目标位于 ${from.name} 5 尺内时获得优势（下回合前有效）。`,
                        );
                      }
                      setHelpModal(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/60 hover:bg-primary/5 transition-colors"
                  >
                    <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{f.name}</div>
                    <div className="text-xs opacity-60">
                      {f.isPc ? '玩家角色' : 'NPC'}
                      {f.initiative ? ` · 先攻 ${f.initiative}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ✅ 突袭选择弹窗 */}
      {surpriseAttackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
                突袭 · 第 {surpriseAttackRound + 1} 轮
              </h3>
              <button
                onClick={() => {
                  setSurpriseAttackOpen(false);
                  setSurprisedCombatants(new Set());
                }}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-3">
              选择在该轮被突袭的角色，被突袭角色在本回合失去先攻
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {record.combatants.map(c => {
                const isChecked = surprisedCombatants.has(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-primary bg-primary/5'
                        : 'dark:border-border-dark light:border-border-light hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        setSurprisedCombatants(prev => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        });
                      }}
                      className="rounded"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm dark:text-text-dark light:text-text-light">{c.name}</div>
                      <div className="text-xs opacity-60">
                        {c.isPc ? '玩家角色' : 'NPC'}
                        {c.initiative ? ` · 先攻 ${c.initiative}` : ''}
                      </div>
                    </div>
                    {c.isDead && <span className="text-xs text-danger">已死亡</span>}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setSurpriseAttackOpen(false);
                  setSurprisedCombatants(new Set());
                }}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmSurpriseAttack}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
              >
                确定（{surprisedCombatants.size}）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 手动记录弹窗 */}
      {manualRecordOpen && manualRecordType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
                {manualRecordType === 'attack' ? '攻击记录' : '恢复记录'}
              </h3>
              <button
                onClick={cancelManualRecord}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {manualRecordType === 'attack' && (
              <div className="space-y-4">
                {/* 目标选择 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    被攻击者
                  </label>
                  <select
                    value={manualTargetId}
                    onChange={(e) => {
                      setManualTargetId(e.target.value);
                      setManualAttackRoll('');
                    }}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  >
                    <option value="">选择目标...</option>
                    {record.combatants.map(c => {
                      const attacker = selectedCell ? record.combatants.find(x => x.id === selectedCell.combatantId) : null;
                      // ✅ 禁止选择自己 + 禁止选择同队（PC 攻击 NPC / NPC 攻击 PC）
                      if (attacker && (c.id === attacker.id || (c.id !== attacker.id && c.isPc === attacker.isPc))) {
                        return null;
                      }
                      const circle = getInitiativeCircle(c.id);
                      return (
                        <option key={c.id} value={c.id}>
                          {circle} {c.name}（先攻 {c.initiative}）
                        </option>
                      );
                    })}
                  </select>
                  {/* 显示目标 AC */}
                  {manualTargetId && (() => {
                    const target = record.combatants.find(c => c.id === manualTargetId);
                    if (!target) return null;
                    const effAc = getEffectiveAc(target);
                    if (!effAc && effAc !== 0) return null;
                    return (
                      <div className="mt-1 text-xs text-primary font-medium">
                        目标 AC：{effAc}
                      </div>
                    );
                  })()}
                </div>

                {/* 攻击检定 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    攻击检定值
                  </label>
                  <input
                    type="number"
                    value={manualAttackRoll}
                    onChange={(e) => setManualAttackRoll(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="填入攻击检定总值"
                  />
                  {/* 自动判定命中结果 */}
                  {manualTargetId && manualAttackRoll && (() => {
                    const target = record.combatants.find(c => c.id === manualTargetId);
                    if (!target) return null;
                    const effAc = getEffectiveAc(target);
                    if (!effAc && effAc !== 0) return null;
                    const roll = parseInt(manualAttackRoll, 10);
                    if (isNaN(roll)) return null;
                    const hit = roll >= effAc;
                    return (
                      <div className={`mt-1 text-xs font-medium ${hit ? 'text-green-500' : 'text-red-500'}`}>
                        {roll} {hit ? '≥' : '<'} AC {effAc} → {hit ? '命中' : '未命中'}
                      </div>
                    );
                  })()}
                </div>

                {/* 攻击方式 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    攻击方式
                  </label>
                  <input
                    type="text"
                    value={manualAttackMethod}
                    onChange={(e) => setManualAttackMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="例如：长剑挥砍"
                  />
                </div>

                {/* 伤害（根据攻击检定自动判定命中后显示） */}
                {manualTargetId && manualAttackRoll && (() => {
                  const tgt = record.combatants.find(c => c.id === manualTargetId);
                  if (!tgt) return null;
                  const effAc = getEffectiveAc(tgt);
                  if (!effAc && effAc !== 0) return null;
                  const roll = parseInt(manualAttackRoll, 10);
                  if (isNaN(roll)) return null;
                  const hit = roll >= effAc;
                  if (!hit) return null;
                  return (
                    <>
                      <div>
                        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                          伤害值（整数，不为0）
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={manualDamage}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || (parseInt(v, 10) >= 1)) {
                              setManualDamage(v);
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                          placeholder="例如：15"
                        />
                      </div>

                      {/* 干掉目标 */}
                      {manualTargetId && (() => {
                        const target = record.combatants.find(c => c.id === manualTargetId);
                        if (!target || target.currentHp === undefined) return null;
                        const dmg = parseInt(manualDamage, 10) || 0;
                        const willKill = dmg > 0 && dmg >= (target.currentHp ?? 0);
                        if (!willKill) return null;
                        return (
                          <label className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 cursor-pointer mt-3">
                            <input
                              type="checkbox"
                              checked={manualIsKill}
                              onChange={(e) => setManualIsKill(e.target.checked)}
                              className="rounded"
                            />
                            <span className="text-xs text-red-500 dark:text-red-400">
                              造成致命伤害，{target.isPc ? '使其昏迷' : '将其杀死'}
                            </span>
                          </label>
                        );
                      })()}
                    </>
                  );
                })()}

                {/* 预览文本 */}
                {manualTargetId && (() => {
                  const target = record.combatants.find(c => c.id === manualTargetId);
                  if (!target) return null;
                  let preview = '';
                  // 自动判定：攻击检定值根据 AC 自动判断
                  let autoHit: boolean | null = null;
                  if (manualAttackRoll) {
                    const effAc = getEffectiveAc(target);
                    const roll = parseInt(manualAttackRoll, 10);
                    if (!isNaN(roll)) autoHit = roll >= effAc;
                  }
                  if (autoHit === false) {
                    preview = `对 ${target.name} 的攻击未命中，${manualAttackMethod || '???'}打偏了`;
                  } else if (autoHit === true) {
                    const dmg = parseInt(manualDamage, 10) || 0;
                    preview = `对 ${target.name} 的攻击命中，用${manualAttackMethod || '???'}造成${dmg}点伤害`;
                    if (manualIsKill) preview += target.isPc ? `，将其击昏` : `，将其杀死`;
                  } else {
                    preview = '请先填写攻击检定值';
                  }
                  return (
                    <div className="p-2 rounded-lg bg-bg-dark/50 border border-border-dark text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      <span className="opacity-60">预览：</span>{preview}
                    </div>
                  );
                })()}
              </div>
            )}

            {manualRecordType === 'recovery' && (
              <div className="space-y-4">
                {/* 恢复目标 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    恢复目标（可选，默认恢复自己）
                  </label>
                  <select
                    value={manualTargetId}
                    onChange={(e) => setManualTargetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  >
                    <option value="">恢复自己</option>
                    {record.combatants.map(c => {
                      const circle = getInitiativeCircle(c.id);
                      return (
                        <option key={c.id} value={c.id}>
                          {circle} {c.name}（先攻 {c.initiative}）
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 恢复方式 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    恢复方式
                  </label>
                  <input
                    type="text"
                    value={manualHealMethod}
                    onChange={(e) => setManualHealMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="例如：治疗术、治疗药水"
                  />
                </div>

                {/* 恢复量 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    恢复量（正整数）
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={manualHealAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || (parseInt(v, 10) >= 1)) {
                        setManualHealAmount(v);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="例如：10"
                  />
                </div>

                {/* 预览 */}
                {(() => {
                  const attacker = selectedCell ? record.combatants.find(c => c.id === selectedCell.combatantId) : null;
                  const target = manualTargetId
                    ? record.combatants.find(c => c.id === manualTargetId)
                    : attacker;
                  const amount = parseInt(manualHealAmount, 10) || 0;
                  const method = manualHealMethod || '???';
                  const tName = target?.name || '自己';
                  return (
                    <div className="p-2 rounded-lg bg-bg-dark/50 border border-border-dark text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      <span className="opacity-60">预览：</span>
                      用{method}恢复了{tName} {amount}点生命值
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 切换模板 */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setManualRecordType('attack');
                  setManualTargetId('');
                  setManualAttackMethod('');
                  setManualDamage('');
                  setManualIsKill(false);
                }}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  manualRecordType === 'attack'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'dark:border-border-dark light:border-border-light'
                }`}
              >
                <Swords className="w-4 h-4 inline mr-1" />攻击模板
              </button>
              <button
                onClick={() => {
                  setManualRecordType('recovery');
                  setManualTargetId('');
                  setManualHealMethod('');
                  setManualHealAmount('');
                }}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  manualRecordType === 'recovery'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'dark:border-border-dark light:border-border-light'
                }`}
              >
                <Heart className="w-4 h-4 inline mr-1" />恢复模板
              </button>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={cancelManualRecord}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmManualRecord}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" />确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 完成回合确认弹窗 */}
      {confirmEndTurnOpen && currentTurn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">完成回合</h3>
              <button
                onClick={() => setConfirmEndTurnOpen(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              确认完成 <span className="font-bold text-primary">
                {record.combatants[currentTurn.combatantIdx]?.name ?? '?'}
              </span> 的回合（第 {currentTurn.round + 1} 轮）？
            </p>
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-4">
              系统将按先攻顺序推进到下一回合。若该轮已结束，将自动开启新一轮。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmEndTurnOpen(false)}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmEndTurn}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <SkipForward className="w-4 h-4" />完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 右上角按钮组：暂停/恢复放映 + 退出放映（悬浮按钮，统一风格） */}
      {record.mode === 'playback' && (
        <div className="fixed top-20 right-6 z-40 flex flex-col gap-2 items-end">
          {/* 暂停放映 / 恢复放映：仅放映已开始时显示 */}
          {playbackStarted && (
            playbackPaused ? (
              <button
                onClick={resumePlayback}
                className="px-3 py-2 rounded-lg bg-green-500/10 backdrop-blur border border-green-500/50 text-green-500 hover:bg-green-500/20 transition-colors text-sm flex items-center gap-1"
                title="恢复放映，回到暂停前的回合"
                type="button"
              >
                <PlayCircle className="w-4 h-4" />
                恢复放映
              </button>
            ) : (
              <button
                onClick={pausePlayback}
                className="px-3 py-2 rounded-lg bg-amber-500/10 backdrop-blur border border-amber-500/50 text-amber-500 hover:bg-amber-500/20 transition-colors text-sm flex items-center gap-1.5"
                title="暂停放映，临时脱离回合进行全局编辑"
                type="button"
              >
                <span className="leading-none" aria-hidden="true">⏸</span>
                暂停放映
              </button>
            )
          )}
          {/* 退出放映 */}
          <button
            onClick={() => setExitPlaybackModalOpen(true)}
            className="px-3 py-2 rounded-lg bg-card-dark/80 backdrop-blur border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/10 transition-colors flex items-center gap-1"
            title="退出放映模式"
            type="button"
          >
            <ArrowLeft className="w-4 h-4" />
            退出放映
          </button>
        </div>
      )}

      {/* ✅ 退出放映弹窗：保存并覆盖 / 丢弃恢复 / 取消 */}
      {exitPlaybackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onMouseDown={e => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">退出放映</h3>
              <button
                type="button"
                onClick={() => setExitPlaybackModalOpen(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              放映期间对先攻表、生命值、沙盘的操作可以选择保存或丢弃。
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => finalizeExitPlayback(true)}
                className="w-full px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" />
                保存并覆盖原版本
              </button>
              <button
                type="button"
                onClick={() => finalizeExitPlayback(false)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors flex items-center justify-center gap-1"
              >
                <Undo2 className="w-4 h-4" />
                丢弃，恢复原先状态
              </button>
              <button
                type="button"
                onClick={() => setExitPlaybackModalOpen(false)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 回溯确认弹窗：放映模式下双击确认才生效 */}
      {rewindModal && (() => {
        const rewindC = record.combatants.find(c => c.id === rewindModal.combatantId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className="w-full max-w-md rounded-xl p-5 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">回溯回合</h3>
                  <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                    第 {rewindModal.round + 1} 轮 · {rewindC?.name ?? '未知角色'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRewindModal(null)}
                  className="p-1 rounded hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-4">
                <div className="text-sm font-semibold text-amber-500 mb-1">⚠️ 此操作具有破坏性</div>
                <ul className="text-xs text-amber-400/90 space-y-1 list-disc pl-4">
                  <li>当前回合格以及之后所有先攻表格格子的内容将被清空</li>
                  <li>所有参战者的生命值、昏迷/死亡状态将还原到此回合开始时的快照</li>
                  <li>战斗沙盘上所有棋子的位置将被还原</li>
                  <li>后续自动新增的轮次也将一并删除</li>
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                {!rewindModal.firstClickDone ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRewindModal({ ...rewindModal, firstClickDone: true })
                    }
                    className={`w-full px-4 py-3 rounded-lg text-white text-sm font-medium transition-all ${
                      rewindModal.firstClickDone
                        ? 'bg-amber-600 hover:bg-amber-700 animate-pulse'
                        : 'bg-danger hover:bg-danger/90'
                    }`}
                  >
                    我已了解，请继续（再次点击确认回溯）
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => applyRollback(rewindModal.round, rewindModal.combatantIdx)}
                    className="w-full px-4 py-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-all ring-2 ring-amber-400 animate-pulse"
                  >
                    🔴 再次点击以确认回溯到此回合
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRewindModal(null)}
                  className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ✅ 参战者信息面板（点击表头名称按钮打开，等价沙盘双击弹窗） */}
      {infoPanelCombatant && (() => {
        const bg = record?.id ? battlegroundStore.get(record.id) : null;
        const tokens = bg?.tokens ?? [];
        const tokenMap: { get: (id: string) => { col: number; row: number } | undefined } = {
          get: (id: string) => {
            const t = tokens.find(x => x.combatantId === id);
            return t ? { col: t.col, row: t.row } : undefined;
          },
        };
        return (
          <CombatantInfoPanel
            combatant={infoPanelCombatant}
            onClose={() => setInfoPanelCombatant(null)}
            combatants={record?.combatants ?? []}
            tokenMap={tokenMap}
            combatInventory={combatInventories?.[infoPanelCombatant.id]}
            onRemoveItem={(item) => {
              if (!record) return;
              // 从战斗背包移除：写 EquipmentChanges.removedChildIds
              const childId = item.childId || item.id;
              const prev = record.equipmentChanges?.[infoPanelCombatant.id];
              const removed = Array.from(new Set([...(prev?.removedChildIds ?? []), childId]));
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [infoPanelCombatant.id]: {
                    added: prev?.added ?? [],
                    removedChildIds: removed,
                    quantityDeltas: prev?.quantityDeltas ?? {},
                  },
                },
              });
            }}
            equipmentChanges={record?.equipmentChanges?.[infoPanelCombatant.id]}
            onUpdateChanges={(changes) => {
              if (!record) return;
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [infoPanelCombatant.id]: changes,
                },
              });
            }}
            actions={infoPanelCombatant.actions}
            onHelpClick={() => {
              if (!record) return;
              setHelpModal({ from: infoPanelCombatant });
            }}
            onAttackClick={() => {
              if (!record) return;
              // 攻击需要目标，若已有上次选中的敌人优先；否则关闭面板等手动选择
              const potentialTarget = record.combatants.find(
                c => c.id !== infoPanelCombatant.id && !c.isDead,
              );
              if (potentialTarget) {
                const bg = battlegroundStore.get(record.id);
                const tokens = bg?.tokens ?? [];
                const aPos = tokens.find(t => t.combatantId === infoPanelCombatant.id);
                const tPos = tokens.find(t => t.combatantId === potentialTarget.id);
                setAttackModal({
                  attacker: infoPanelCombatant,
                  target: potentialTarget,
                  attackerPos: aPos ? { col: aPos.col, row: aPos.row } : undefined,
                  targetPos: tPos ? { col: tPos.col, row: tPos.row } : undefined,
                });
                setInfoPanelCombatant(null);
              } else {
                setInfoPanelCombatant(null);
              }
            }}
            onCastClick={() => {
              if (!record) return;
              const potentialTarget = record.combatants.find(
                c => c.id !== infoPanelCombatant.id && !c.isDead,
              );
              if (potentialTarget) {
                setSpellModal({
                  caster: infoPanelCombatant,
                  target: potentialTarget,
                });
                setInfoPanelCombatant(null);
              } else {
                setInfoPanelCombatant(null);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
