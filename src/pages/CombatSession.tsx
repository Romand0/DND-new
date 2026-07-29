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
import { Plus, Trash2, ArrowLeft, Users, X, GripVertical, Pencil, Swords, Heart, Target, Check, Keyboard, Play, SkipForward, Pause, Undo2 } from 'lucide-react';
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
    isCritical: boolean;
    // 用于写入先攻表格的攻击检定过程信息
    d20Rolled: number[];
    d20Final: number;
    d20Bonus: number;
    d20Total: number;
    usageMode?: 'melee' | 'thrown';
  } | null>(null);
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
  // 回合快照集合（key = `${round}:${combatantId}`）
  type TurnSnapshot = {
    combatants: Combatant[];   // 所有角色 HP / 状态
    rounds: RoundAction[];     // 先攻表（回合开始时的内容，回溯时把此格及之后清空恢复到此）
    battleground: any[];       // 沙盘 tokens 快照
  };
  const rollbackSnapshotRef = useRef<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>({ initial: null, snapshots: {} });

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
  // status: 'unconscious' 昏迷 / 'dead' 死亡（NPC 致命伤害时附带）
  const handleApplyDamage = (targetId: string, newHp: number, status?: 'unconscious' | 'dead') => {
    const updatedCombatants = record.combatants.map(c => {
      if (c.id !== targetId) return c;
      if (newHp <= 0 && status === 'dead') {
        return { ...c, currentHp: newHp, isDead: true, isUnconscious: false };
      }
      if (newHp <= 0 && status === 'unconscious') {
        return { ...c, currentHp: newHp, isDead: false, isUnconscious: true };
      }
      return { ...c, currentHp: newHp, isDead: false, isUnconscious: false };
    });
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });
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
      playbackSnapshotRef.current = (bg?.tokens ?? []).map(t => ({ ...t }));
      rollbackSnapshotRef.current = {
        initial: {
          combatants: record.combatants.map(c => ({ ...c })),
          rounds: record.rounds.map(r => ({ ...r })),
          battleground: (bg?.tokens ?? []).map(t => ({ ...t })),
        },
        snapshots: {},
      };
    }
  };

  // ✅ 退出放映：保存覆盖 or 丢弃恢复（由 exit modal 按钮调用）
  const finalizeExitPlayback = (preserveChanges: boolean) => {
    if (record?.mode !== 'playback') {
      setExitPlaybackModalOpen(false);
      return;
    }
    if (!preserveChanges) {
      // 「丢弃，恢复原先状态」：完整还原 combatants / rounds / 沙盘 到进入放映模式时的快照
      const init = rollbackSnapshotRef.current.initial;
      if (init) {
        combatStore.update(record.id, {
          combatants: init.combatants.map(c => ({ ...c })),
          rounds: init.rounds.map(r => ({ ...r })),
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
    setCurrentTurn(null);
    playbackSnapshotRef.current = null;
    rollbackSnapshotRef.current = { initial: null, snapshots: {} };
    setExitPlaybackModalOpen(false);
    commitModeChange('simulation');
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
    setCurrentTurn(firstTurn);
    setPlaybackStarted(true);
    // 进入第一回合时立即拍快照（takeTurnSnapshot 直接读 combatStore 最新值，无需等渲染）
    if (firstTurn) {
      takeTurnSnapshot(firstTurn.round, firstTurn.combatantId);
    }
  };

  // ✅ 给已昏迷/死亡角色在所有未填写的后续轮次中填入「昏迷」/「死亡」占位
  const autoFillDownedMarkers = () => {
    if (!record) return;
    let updatedRounds = record.rounds.map(r => ({ ...r }));
    let changed = false;
    record.combatants.forEach(c => {
      if (!c.isDead && !c.isUnconscious) return;
      const marker = c.isDead ? '死亡' : '昏迷';
      updatedRounds = updatedRounds.map(round => {
        const cur = round[c.id];
        if (cur && cur !== '被突袭' && cur !== '昏迷' && cur !== '死亡') {
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

  // ✅ 找到下一个有效回合（跳过被突袭/昏迷/死亡）
  // 从指定位置（行、列）开始，向右→下一行扫描，遇到第一个非占位的格子
  // 可选传入 roundsOverride：当本帧刚 combatStore.update 新增了轮次、record 还没重新渲染时使用
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
        if (v === '被突袭' || v === '昏迷' || v === '死亡') continue;
        return { round: r, combatantIdx: i, combatantId: c.id };
      }
    }
    return null;
  };

  // ✅ 推进到下一个回合
  const advanceTurn = () => {
    if (!currentTurn || !record) return;
    const next = findNextValidTurn(currentTurn.round, currentTurn.combatantIdx + 1);
    if (next) {
      setCurrentTurn(next);
      takeTurnSnapshot(next.round, next.combatantId);
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
      // 自动新开一轮
      const newRound: RoundAction = {};
      record.combatants.forEach(c => {
        if (c.isDead) newRound[c.id] = '死亡';
        else if (c.isUnconscious) newRound[c.id] = '昏迷';
        else newRound[c.id] = '';
      });
      const updatedRounds = [...record.rounds, newRound];
      combatStore.update(record.id, { rounds: updatedRounds, updatedAt: Date.now() });
      // 用 updatedRounds 覆盖参数避免读到旧 record
      const firstInNew = findNextValidTurn(nextRound, 0, updatedRounds);
      if (firstInNew) {
        setCurrentTurn(firstInNew);
        takeTurnSnapshot(firstInNew.round, firstInNew.combatantId);
      } else {
        setCurrentTurn(null);
        setPlaybackStarted(false);
      }
    } else {
      const firstInNext = findNextValidTurn(nextRound, 0);
      if (firstInNext) {
        setCurrentTurn(firstInNext);
        takeTurnSnapshot(firstInNext.round, firstInNext.combatantId);
      } else {
        setCurrentTurn(null);
        setPlaybackStarted(false);
      }
    }
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
  // 放映模式 → 当前回合；模拟模式 → 最后一轮
  const resolveWriteCell = (attackerId: string): { round: number; combatantId: string } | null => {
    if (!record) return null;
    if (record.mode === 'playback' && playbackStarted && currentTurn) {
      // 放映模式下强制写入当前回合（保证回合正确归属）
      return { round: currentTurn.round, combatantId: currentTurn.combatantId };
    }
    // 模拟模式：最后一轮（不存在则创建第一轮）
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
  const takeTurnSnapshot = (round: number, combatantId: string) => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const bg = battlegroundStore.get(record.id);
    const snap: TurnSnapshot = {
      combatants: latest.combatants.map(c => ({ ...c })),
      rounds: latest.rounds.map(r => ({ ...r })),
      battleground: (bg?.tokens ?? []).map(t => ({ ...t })),
    };
    const key = `${round}:${combatantId}`;
    // 只在第一次拍（始终回到该回合最初状态）
    if (!rollbackSnapshotRef.current.snapshots[key]) {
      rollbackSnapshotRef.current.snapshots[key] = snap;
    }
  };

  // ✅ 回溯到指定回合开始：还原该回合及其之后所有记录为空，并把战斗数据整体还原到快照
  const applyRollback = (round: number, combatantIdx: number) => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const combatantId = latest.combatants[combatantIdx]?.id;
    if (!combatantId) return;
    const key = `${round}:${combatantId}`;
    const snap = rollbackSnapshotRef.current.snapshots[key] ?? rollbackSnapshotRef.current.initial;
    if (!snap) {
      alert('回溯失败：未找到该回合的快照，请先至少推进一个回合后再回溯');
      return;
    }
    // 1) 还原 combatants（HP / 状态）到快照
    const restoredCombatants = snap.combatants.map(c => ({ ...c }));
    // 2) 还原 rounds：
    //    - 从快照拿回合结构（避免保留放映期间自动新增的轮次）
    //    - 然后把"目标格之后"的所有格子清空（保留 被突袭/昏迷/死亡 占位）
    const restoredRounds = snap.rounds.map(r => ({ ...r }));
    const totalCombatants = restoredCombatants.length;
    const totalRounds = restoredRounds.length;
    for (let r = 0; r < totalRounds; r++) {
      for (let c = 0; c < totalCombatants; c++) {
        const cid = restoredCombatants[c].id;
        const isAfter =
          r > round ||
          (r === round && c > combatantIdx);
        if (isAfter) {
          const cur = restoredRounds[r]?.[cid];
          if (cur && cur !== '被突袭' && cur !== '昏迷' && cur !== '死亡') {
            restoredRounds[r] = { ...restoredRounds[r], [cid]: '' };
          }
        }
      }
    }
    // 3) 应用还原
    combatStore.update(record.id, {
      combatants: restoredCombatants,
      rounds: restoredRounds,
      updatedAt: Date.now(),
    });
    // 4) 还原沙盘
    battlegroundStore.setTokens(record.id, snap.battleground.map(t => ({ ...t })));
    // 5) 当前回合跳到此回合格
    setCurrentTurn({ round, combatantIdx, combatantId });
    // 6) 此回合格在回溯后需要重新拍快照（旧的快照里此格"之后"已被清空，再次进入会重新写入）
    //    清掉旧快照让下次进入时重拍
    delete rollbackSnapshotRef.current.snapshots[key];
    setRewindModal(null);
  };

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
      if (!manualAttackMethod.trim()) { alert('请填写攻击方式'); return; }
      if (!target) { alert('请选择目标'); return; }
      if (!manualAttackRoll) { alert('请填写攻击检定值'); return; }

      // 自动判定：攻击检定值根据目标 AC 自动判断命中
      const roll = parseInt(manualAttackRoll, 10);
      if (isNaN(roll)) { alert('攻击检定值必须是数字'); return; }
      if (target.ac === undefined) { alert('目标缺少 AC，无法判定命中'); return; }
      const hit = roll >= target.ac;

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

      {/* ✅ 模式切换栏 —— 模拟模式 / 放映模式 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light">
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
        {record.mode === 'playback' && (
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
            {playbackStarted
              ? currentTurn
                ? `当前回合：${record.combatants[currentTurn.combatantIdx]?.name ?? '?'}（第 ${currentTurn.round + 1} 轮）`
                : '放映已结束'
              : '点击先攻表格的 ▶️ 开始放映'}
          </span>
        )}
      </div>

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
                  const isCurrentTurn = isPlayback && playbackStarted && currentTurn?.round === roundIndex && currentTurn?.combatantId === c.id;
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
                              {action !== '被突袭' && action !== '昏迷' && action !== '死亡' && (() => {
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
        playbackOnlyMovableId={
          record.mode === 'playback' && playbackStarted && currentTurn
            ? currentTurn.combatantId
            : null
        }
        activeTurnCombatantId={
          record.mode === 'playback' && playbackStarted && currentTurn
            ? currentTurn.combatantId
            : null
        }
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
          onConfirmHit={(attack, info) => {
            // 命中确认：关闭攻击检定弹窗，切换至伤害结算弹窗
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
            });
            setAttackModal(null);
          }}
          onAttackMiss={(missInfo) => {
            // 未命中：写入先攻表格（简化格式）
            const cell = resolveWriteCell(attackModal.attacker.id);
            if (!cell) return;
            const text = `对 ${attackModal.target.name} 的攻击未命中，${missInfo.attackName}打偏了`;
            appendRoundRecord(cell.round, cell.combatantId, text);
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
          }}
          onClose={() => setDamageModal(null)}
        />
      )}

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
                    if (!target || target.ac === undefined) return null;
                    return (
                      <div className="mt-1 text-xs text-primary font-medium">
                        目标 AC：{target.ac}
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
                    if (!target || target.ac === undefined) return null;
                    const roll = parseInt(manualAttackRoll, 10);
                    if (isNaN(roll)) return null;
                    const hit = roll >= target.ac;
                    return (
                      <div className={`mt-1 text-xs font-medium ${hit ? 'text-green-500' : 'text-red-500'}`}>
                        {roll} {hit ? '≥' : '<'} AC {target.ac} → {hit ? '命中' : '未命中'}
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
                  if (!tgt || tgt.ac === undefined) return null;
                  const roll = parseInt(manualAttackRoll, 10);
                  if (isNaN(roll)) return null;
                  const hit = roll >= tgt.ac;
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
                  if (manualAttackRoll && target.ac !== undefined) {
                    const roll = parseInt(manualAttackRoll, 10);
                    if (!isNaN(roll)) autoHit = roll >= target.ac;
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

      {/* ✅ 完成回合悬浮按钮 —— 放映模式已开始时显示 */}
      {record.mode === 'playback' && playbackStarted && currentTurn && (
        <button
          onClick={() => setConfirmEndTurnOpen(true)}
          className="fixed bottom-6 right-6 z-40 px-5 py-3 rounded-full bg-primary text-white font-medium shadow-2xl hover:bg-primary/90 transition-all hover:scale-105 flex items-center gap-2"
          title="完成当前回合，进入下一个"
        >
          <SkipForward className="w-5 h-5" />
          <span>完成回合</span>
        </button>
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

      {/* ✅ 退出放映按钮 —— 浮动在右上角（仅放映模式显示） */}
      {record.mode === 'playback' && (
        <button
          onClick={() => setExitPlaybackModalOpen(true)}
          className="fixed top-20 right-6 z-40 px-3 py-2 rounded-lg bg-card-dark/80 backdrop-blur border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/10 transition-colors flex items-center gap-1"
          title="退出放映模式"
          type="button"
        >
          <Pause className="w-4 h-4" />
          退出放映
        </button>
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
    </div>
  );
}
