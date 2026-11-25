// 玩家战斗观战页：加入实时房间（combat-<recordId>）→ 只读渲染 DM 广播的幂等快照
// 协议见 types/realtime.ts CombatDeltaPayload；玩家侧只收不发（DO 端拒 player 写 combat.delta）。
// 断线自动重连由 CombatRoomClient 内置；重连成功后发 snapshot.request 取最近 delta 恢复状态
// （DM 端只在数据变化时广播，静止期没有新消息可等）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Link2, LogOut, RefreshCw, Skull, Sparkles, Ban, Moon, Swords, Wifi, WifiOff, Hand } from 'lucide-react';
import { CombatRoomClient } from '@/lib/combatRoomClient';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyCharacters, fetchCharacter, sendDecisionRequest } from '@/lib/api';
import { useRoundTableInbox } from '@/hooks/useRoundTableInbox';
import type { DecisionResultPayload } from '@/types/roundTable';
import SpectatorTable from '@/components/spectate/SpectatorTable';
import AnimationOverlay from '@/components/spectate/AnimationOverlay';
import RoundNarrativeBoard from '@/components/spectate/RoundNarrativeBoard';
import { MyCombatantsSection } from '@/components/spectate/MyCombatantPanel';
import MyTurnPanel from '@/components/spectate/MyTurnPanel';
import Battleground from '@/components/Battleground';
import CombatResourceHud from '@/components/combat/CombatResourceHud';
import AoETargetStep from '@/components/combat/AoETargetStep';
import { parseAoeSpec } from '@/data/aoeShapes';
import { GRID_PRESETS } from '@/types/battleground';
import type { Bearing } from '@/data/battleGeometry';
import { rosterEntryToCombatant, rosterInventoryToEquipmentList, applyPendingHandOps } from '@/components/spectate/combatantAdapter';
import { resolveFeatureCapability, type FeatureCapability } from '@/data/featureCapabilities';
import { planHealAmount } from '@/data/engines/healEngine';
import { CONV_TARGET_LABELS } from '@/data/engines/resourceConvEngine';
import FeatureConvTargetModal from '@/components/combat/FeatureConvTargetModal';
import HealRollModal from '@/components/combat/HealRollModal';
import DiceInputModal from '@/components/combat/DiceInputModal';
import type { Battleground as BattlegroundData } from '@/types/battleground';
import { useAnimationPlayer } from '@/hooks/spectate/useAnimationPlayer';
import type { BoardProjection, CombatDeltaPayload, CombatRosterEntry, PlayerActionRequest, PlayerActionResult, RosterActiveFeature, TurnCommitOp } from '@/types/realtime';
import type { Character } from '@/types/character';
import FeatureCheckModifierModal from '@/components/combat/FeatureCheckModifierModal';

// 观战投影 → DM 侧沙盘数据结构（Battleground 投影模式入参）：棋子/掉落物/边界墙/地形区域一一映射
function projectionToBg(board: BoardProjection, sessionId: string): BattlegroundData {
  return {
    sessionId,
    size: board.size,
    tokens: board.tokens.map((t) => ({ combatantId: t.combatantId, col: t.col, row: t.row })),
    itemTokens: board.items.map((i) => ({ id: i.id, col: i.col, row: i.row, name: i.name, equipmentData: {} })),
    paintedCells: board.painted,
    zones: board.zones.map((z) => ({ id: z.id, type: 'custom' as const, label: z.label, cells: z.cells, color: z.color })),
    updatedAt: 0,
  };
}

/** aoe_save op 朝向中文标签（审核卡/记录行展示） */
const BEARING_LABELS: Record<string, string> = {
  NW: '西北', N: '北', NE: '东北', W: '西', E: '东', SW: '西南', S: '南', SE: '东南',
};

function takeLatestDelta(deltas: { payload: unknown }[]): CombatDeltaPayload | null {
  // snapshot.deltas 的 payload 是透传 unknown，逐条嗅探是否有 v1 快照特征字段
  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i].payload as Partial<CombatDeltaPayload> | null;
    if (d && d.v === 1 && Array.isArray(d.roster) && d.recordId) return d as CombatDeltaPayload;
  }
  return null;
}

/** 未提交回合操作缓存键：记录 + 轮次 + 参战者三者任一变化即视为新回合上下文 */
const OPS_CACHE_PREFIX = 'dnd:player-pending-ops';
const opsCacheKey = (recordId: string, round: number, combatantId: string) =>
  `${OPS_CACHE_PREFIX}:${recordId}:${round}:${combatantId}`;
function readCachedOps(key: string): TurnCommitOp[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TurnCommitOp[]) : [];
  } catch {
    return [];
  }
}

export default function PlayerSpectate() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [roomIdInput, setRoomIdInput] = useState('');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [spectate, setSpectate] = useState<CombatDeltaPayload | null>(null);
  const [notice, setNotice] = useState('');
  const clientRef = useRef<CombatRoomClient | null>(null);
  // join 回调引用：自动加入（?room=）与手动加入共用
  const joinRef = useRef<(room: string) => void>(() => {});
  // 我的绑定角色：识别「自身参战者」以显示战斗面板
  // 保留完整角色卡：沙盘双击面板要读装备/属性（本地 store 没有同团角色卡）
  const [myCharacters, setMyCharacters] = useState<Character[]>([]);
  const myCharacterIds = new Set(myCharacters.map((c) => c.id));
  // 回合提交（回合批提交模型）：最近收到的 combat.delta seq（提交时携带，DM 端校验状态是否过期）
  const lastDeltaSeqRef = useRef(0);
  const [lastResult, setLastResult] = useState<(PlayerActionResult & { at: number }) | null>(null);
  // checkModifier 通道目标选择（激励骰等）：选定受益人后打包 feature-use op（携带 targetId）
  const [checkModifierPick, setCheckModifierPick] = useState<{ combatant: CombatRosterEntry; feature: RosterActiveFeature } | null>(null);
  // aoe_save 通道方向拾取（吐息武器等）：玩家选朝向 → 伤害骰值环节（线下骰）→ 打包 feature-use op
  const [aoePick, setAoePick] = useState<{ combatant: CombatRosterEntry; feature: RosterActiveFeature } | null>(null);
  const [aoeDamagePending, setAoeDamagePending] = useState<{ feature: RosterActiveFeature; diceText: string; direction: string; roundText: string } | null>(null);
  // resource_conv convert 多目标选择（灵巧动作类）：选定动作项后打包 feature-use op（携带 convertTarget）
  const [convTargetPick, setConvTargetPick] = useState<{ combatant: CombatRosterEntry; feature: RosterActiveFeature; targets: string[] } | null>(null);
  // heal 骰值环节（线下骰口径）：填入线下掷骰结果后打包 feature-use op（携带 healAmount 合计）
  const [healRollPick, setHealRollPick] = useState<{ combatant: CombatRosterEntry; feature: RosterActiveFeature; cap: FeatureCapability } | null>(null);
  // ops 提升到页面层：沙盘拖拽与回合面板共享同一操作列表
  const [pendingOps, setPendingOps] = useState<TurnCommitOp[]>([]);
  // 决策点（R5）：回合中途躲藏裁定请求——待审批期间展示等待标记，DM 裁定后自动记入操作序列
  const [hideDecision, setHideDecision] = useState<{ id: string } | null>(null);
  const [hideDecisionResult, setHideDecisionResult] = useState<{ approved: boolean; reason?: string } | null>(null);
  const decisionInbox = useRoundTableInbox({ outbox: true, enabled: !!hideDecision });
  const lastOpsRoundRef = useRef<number | null>(null);
  // 未提交 ops 的缓存键（刷新/断线重连后据此恢复）
  const opsKeyRef = useRef<string | null>(null);

  // 绑定关系与房间无关，登录后拉一次即可
  useEffect(() => {
    if (!token) return;
    let alive = true;
    // my-characters 只返回摘要（id/name/class…），双击面板与换持需要完整卡（装备/特性/法术）
    fetchMyCharacters()
      .then(async (res) => {
        const ids = ((res.characters ?? []) as { id: string }[]).map((c) => c.id);
        const full = await Promise.all(
          ids.map(async (id) => {
            try {
              return await fetchCharacter<Character>(id);
            } catch {
              return null;
            }
          })
        );
        if (!alive) return;
        setMyCharacters(full.filter((c): c is Character => !!c));
      })
      .catch((e) => {
        if (!alive) return;
        setMyCharacters([]);
        setNotice(`绑定角色查询失败：${String(e?.message ?? e)}（无法识别你的参战者）`);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const leave = () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setConnected(false);
    setActiveRoomId(null);
    setSpectate(null);
  };

  useEffect(() => leave, []);

  // 圆桌邀请链接带 ?room=combat-xxx：登录态就绪后自动加入一次
  const autoRoom = searchParams.get('room') || '';
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoinedRef.current || !autoRoom || !token) return;
    autoJoinedRef.current = true;
    joinRef.current(autoRoom);
  }, [autoRoom, token]);

  const join = (roomRaw?: string) => {
    const room = (roomRaw ?? roomIdInput).trim();
    if (!room) {
      setNotice('请输入房间号（问 DM 要，形如 combat-xxxx）');
      return;
    }
    if (!token) {
      setNotice('登录已失效，请重新登录');
      return;
    }
    clientRef.current?.disconnect();
    setSpectate(null);
    setNotice('');
    const client = new CombatRoomClient(room, { token, role: 'player' });
    clientRef.current = client;
    client.onConnectionChange((ok) => setConnected(ok));
    client.onMessage((msg) => {
      if (msg.t === 'welcome') {
        client.send({ t: 'snapshot.request' });
        return;
      }
      if (msg.t === 'combat.delta') {
        lastDeltaSeqRef.current = msg.seq;
        setSpectate(msg.payload);
        return;
      }
      if (msg.t === 'snapshot') {
        const latest = takeLatestDelta(msg.deltas);
        if (latest) setSpectate(latest);
        return;
      }
      if (msg.t === 'player.action.result') {
        // DM 对我方回合提交的审核回执（全房广播，按 requestId 匹配）
        setLastResult({ ...msg.result, at: msg.at });
        return;
      }
      if (msg.t === 'error') {
        setNotice(`服务器提示：${msg.message}`);
      }
    });
    client.connect();
    setActiveRoomId(room);
  };
  joinRef.current = join;

  // 参战者排序：先攻降序，与 DM 端表格一致
  const roster = spectate ? [...spectate.roster].sort((a, b) => b.initiative - a.initiative) : [];

  // 动画播放器：从事件流增量提取新事件，串行驱动沙盘覆盖层特效
  const { current: activeAnim } = useAnimationPlayer(spectate?.events ?? []);

  // 未提交 ops 落本地缓存：DM 入账前刷新页面不丢（键含轮次/参战者，跨上下文自动作废）
  const persistOps = (ops: TurnCommitOp[]) => {
    const key = opsKeyRef.current;
    if (!key) return;
    try {
      if (ops.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(ops));
    } catch {
      // 隐私模式下 localStorage 不可写：仅本次会话生效
    }
  };
  const updateOps = (updater: (prev: TurnCommitOp[]) => TurnCommitOp[]) => {
    setPendingOps((prev) => {
      const next = updater(prev);
      persistOps(next);
      return next;
    });
  };

  // 回合上下文变化：清旧缓存、按新键恢复（刷新后首条 delta 到达即恢复未提交操作）
  useEffect(() => {
    const rid = spectate?.recordId;
    const turn = spectate?.turn;
    if (!rid || !turn?.combatantId) return;
    const key = opsCacheKey(rid, turn.round, turn.combatantId);
    if (opsKeyRef.current === key) return;
    const prevKey = opsKeyRef.current;
    opsKeyRef.current = key;
    if (prevKey && prevKey !== key) {
      try {
        localStorage.removeItem(prevKey);
      } catch {
        // ignore
      }
    }
    setPendingOps(readCachedOps(key));
  }, [spectate?.recordId, spectate?.turn?.round, spectate?.turn?.combatantId]);

  // 轮次推进即作废未提交的 ops（跨回合残留会带错 round 语义）
  if (spectate?.turn && lastOpsRoundRef.current !== spectate.turn.round) {
    lastOpsRoundRef.current = spectate.turn.round;
    if (pendingOps.length > 0) {
      try {
        const key = opsKeyRef.current;
        if (key) localStorage.removeItem(key);
      } catch {
        // ignore
      }
      setPendingOps([]);
    }
  }
  const addOp = (op: TurnCommitOp) => updateOps((prev) => [...prev, op]);

  // 决策点回填：轮询发件箱找到本次请求的裁定结果
  useEffect(() => {
    if (!hideDecision) return;
    const reply = decisionInbox.messages.find(
      (m) => m.type === 'decision_result' && (m.payload as DecisionResultPayload).replyTo === hideDecision.id
    );
    if (!reply) return;
    const payload = reply.payload as DecisionResultPayload;
    setHideDecisionResult({ approved: payload.approved, ...(payload.reason ? { reason: payload.reason } : {}) });
    setHideDecision(null);
  }, [decisionInbox.messages, hideDecision]);

  // 决策点落地：批准 → 记入操作序列；驳回 → 提示理由（不影响已记录的其他操作）
  useEffect(() => {
    if (!hideDecisionResult) return;
    if (hideDecisionResult.approved) {
      addOp({ kind: 'hide', roundText: '躲藏（DM 已批准：未被定位前攻击劣势/己方优势，一攻揭晓）' });
      setNotice('DM 已批准躲藏，已记入操作序列');
    } else {
      setNotice(`DM 驳回躲藏${hideDecisionResult.reason ? `：${hideDecisionResult.reason}` : ''}`);
    }
    setHideDecisionResult(null);
  }, [hideDecisionResult]);

  const requestHideDecision = async (characterId: string) => {
    if (hideDecision) return;
    try {
      const { id } = await sendDecisionRequest({
        characterId,
        decisionKind: 'hide',
        decisionLabel: '躲藏',
        note: '回合中途请求裁定：躲藏（隐匿检定对抗观察者被动察觉）',
      });
      setHideDecision({ id });
      setNotice('已提交躲藏裁定请求，等待 DM 回填…');
    } catch (e: any) {
      setNotice(e?.message || '提交决策请求失败');
    }
  };

  // 我的参战者：当前回合且绑定自身角色 —— 沙盘仅它可移动（与 DM 端 playbackOnlyMovableId 同语义）
  const myTurnActor = spectate?.turn?.combatantId
    ? roster.find((r) => r.id === spectate.turn?.combatantId && r.characterId && myCharacterIds.has(r.characterId)) ?? null
    : null;
  // 沙盘投影换算（delta 是完整快照，整块重建即可）
  const bgData = useMemo(
    () => (spectate?.board ? projectionToBg(spectate.board, spectate.recordId) : null),
    [spectate?.board, spectate?.recordId]
  );
  // 战斗背包投影：本团所有自己的参战者都提供（面板换持/背包不只在当前回合可用）
  const combatInventories = useMemo(() => {
    const map: Record<string, ReturnType<typeof rosterInventoryToEquipmentList>> = {};
    for (const r of roster) {
      if (r.characterId && myCharacters.some((c) => c.id === r.characterId)) {
        map[r.id] = rosterInventoryToEquipmentList(r);
      }
    }
    return map;
  }, [roster, myCharacters]);
  // 双击信息面板：把「我的角色卡」按参战者投给面板（面板自身只读本地 store 拿不到云端卡）
  const panelCharacters = useMemo(() => {
    const map: Record<string, Character | null> = {};
    for (const r of roster) {
      const card = r.characterId ? myCharacters.find((c) => c.id === r.characterId) : null;
      if (card) map[r.id] = card;
    }
    return map;
  }, [roster, myCharacters]);
  // 双击信息面板：法术位只读投影（玩家不能手动改环位）
  const panelSpellSlots = useMemo(() => {
    const map: Record<string, { level: number; label: string; used: number; max: number }[]> = {};
    for (const r of roster) {
      if (r.characterId && myCharacters.some((c) => c.id === r.characterId) && r.spellSlots) {
        map[r.id] = r.spellSlots.map((s) => ({ level: s.level, label: s.label, used: s.used, max: s.max }));
      }
    }
    return map;
  }, [roster, myCharacters]);
  // 投影参战者 → Combatant 形状（沙盘渲染与双击信息面板读它）；自己的手持叠加未提交 ops
  const combatantsForBoard = useMemo(
    () =>
      roster.map((r) => {
        const c = rosterEntryToCombatant(r, panelCharacters[r.id] ?? null);
        return r.id === myTurnActor?.id ? applyPendingHandOps(c, pendingOps) : c;
      }),
    [roster, panelCharacters, myTurnActor?.id, pendingOps]
  );
  // 本回合资源（动作/附赠/移动力）：投影快照 + 未提交 ops 乐观扣减（DM 入账后才回 delta）
  const pendingActionUse = useMemo(() => {
    let action = 0;
    let bonus = 0;
    let attackSeen = false;
    for (const op of pendingOps) {
      if (op.kind === 'attack') {
        if (!attackSeen) {
          action = 1;
          attackSeen = true;
        }
      } else if (op.kind === 'dash') {
        action = 1;
      } else if (op.kind === 'feature-use') {
        if (op.activation === 'action') action = 1;
        else if (op.activation === 'bonus') bonus = 1;
      } else if (op.kind === 'cast' || op.kind === 'note') {
        if (op.actionCost === 'action') action = 1;
        else if (op.actionCost === 'bonus') bonus = 1;
      }
    }
    return { action, bonus };
  }, [pendingOps]);

  // 未提交的移动：按落点顺序累加切比雪夫距离（5 尺/格）
  const pendingMovementFeet = useMemo(() => {
    if (!myTurnActor) return 0;
    const start = spectate?.board?.tokens.find((t) => t.combatantId === myTurnActor.id);
    if (!start) return 0;
    let pos = { col: start.col, row: start.row };
    let feet = 0;
    for (const op of pendingOps) {
      if (op.kind !== 'move') continue;
      feet += Math.max(Math.abs(op.to.col - pos.col), Math.abs(op.to.row - pos.row)) * 5;
      pos = op.to;
    }
    return feet;
  }, [spectate?.board, myTurnActor, pendingOps]);

  const turnActive = spectate?.turn?.playback === true && !spectate?.turn?.paused;
  const myBaseSpeed = myTurnActor ? (myTurnActor.speed ?? 0) + (myTurnActor.speedModifier ?? 0) : 0;
  // 未提交的疾走：额外移动力 = 战斗速度（与 DM 端疾走一致）
  const pendingDash = pendingOps.some((op) => op.kind === 'dash');
  const myTotalSpeed = myTurnActor
    ? myBaseSpeed + (myTurnActor.dashExtraMovement ?? 0) + (pendingDash ? myBaseSpeed : 0)
    : 0;
  // 暂停/未开始时资源不生效：展示与范围按满移动力（与 DM 端 getRemainingMovement 同语义）
  const myRemainingMovement = myTurnActor
    ? turnActive
      ? Math.max(0, myTotalSpeed - (myTurnActor.movementUsed ?? 0) - pendingMovementFeet)
      : myTotalSpeed
    : 0;
  const myActions = Math.max(0, (myTurnActor?.actions ?? 0) - pendingActionUse.action);
  const myBonusActions = Math.max(0, (myTurnActor?.bonusActions ?? 0) - pendingActionUse.bonus);

  // 白圈「攻击/施法」按钮 → 我的回合面板弹窗（seq 去重）
  const [boardRequest, setBoardRequest] = useState<{ kind: 'attack' | 'cast'; targetId?: string; seq: number } | null>(null);
  const boardReqSeq = useRef(0);
  const openBoardRequest = (kind: 'attack' | 'cast', targetId?: string) => {
    boardReqSeq.current += 1;
    setBoardRequest({ kind, targetId, seq: boardReqSeq.current });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Eye className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold dark:text-text-dark light:text-text-light">战斗观战</h1>
      </div>

      {!activeRoomId && (
        <div className="p-5 rounded-xl border space-y-4 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
            等 DM 在战斗页顶部点「抛送观战」，圆桌页会出现邀请卡片，点击即可加入；也可向 DM 要房间号（combat-xxxx）在此粘贴加入。
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="combat-xxxxxxxx"
              className="flex-1 min-w-56 px-4 py-2.5 rounded-lg border font-mono text-sm dark:bg-card-dark-hover dark:border-border-dark dark:text-text-dark light:bg-card-light-hover light:border-border-light light:text-text-light"
            />
            <button
              onClick={() => join()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Link2 className="w-4 h-4" />
              加入观战
            </button>
          </div>
          {notice && <p className="text-sm text-danger">{notice}</p>}
        </div>
      )}

      {activeRoomId && (
        <>
          {notice && <p className="text-sm text-danger px-1">{notice}</p>}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                  connected
                    ? 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-600/15 text-amber-600 dark:text-amber-400'
                }`}
              >
                {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {connected ? '已连接' : '重连中…'}
              </span>
              <span className="font-mono text-xs truncate dark:text-text-dark-muted light:text-text-light-muted">
                {activeRoomId}
              </span>
            </div>
            <button
              onClick={leave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:opacity-80 transition-opacity"
            >
              <LogOut className="w-4 h-4" />
              退出观战
            </button>
          </div>

          {spectate && (
            <div className="flex items-center justify-between gap-2 flex-wrap p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
              <h2 className="text-lg font-bold dark:text-text-dark light:text-text-light truncate">{spectate.title}</h2>
              {spectate.turn ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 text-primary text-sm font-bold shrink-0">
                  <Swords className="w-4 h-4" />
                  第 {spectate.turn.round} 回合
                </span>
              ) : (
                <span className="px-3 py-1.5 rounded-full bg-neutral-500/15 dark:text-text-dark-muted light:text-text-light-muted text-sm shrink-0">
                  未开始放映
                </span>
              )}
            </div>
          )}

          {spectate && spectate.turn && spectate.turn.combatantId && (
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted px-1">
              当前行动：
              <span className="font-semibold text-primary">
                {roster.find((r) => r.id === spectate.turn?.combatantId)?.name ?? '—'}
              </span>
            </p>
          )}

          {/* 我的回合操作面板：当前回合的参战者是绑定角色时显示 */}
          {spectate && spectate.turn && spectate.turn.combatantId && connected && (() => {
            const actor = roster.find(
              (c) => c.id === spectate.turn?.combatantId && c.characterId && myCharacterIds.has(c.characterId)
            );
            if (!actor) return null;
            const sendRequest = (request: PlayerActionRequest) =>
              clientRef.current?.send({ t: 'player.action', request }) ?? false;
            return (
              <MyTurnPanel
                key={actor.id}
                actor={actor}
                roster={roster}
                round={spectate.turn.round}
                baseSeq={lastDeltaSeqRef.current}
                send={sendRequest}
                result={lastResult}
                onNotice={setNotice}
                ops={pendingOps}
                onOpsChange={updateOps}
                board={spectate.board ?? null}
                boardRequest={boardRequest}
                onBoardRequestHandled={() => setBoardRequest(null)}
                hideDecisionPending={!!hideDecision}
                onRequestHideDecision={
                  actor.characterId ? () => requestHideDecision(actor.characterId as string) : undefined
                }
              />
            );
          })()}

          {spectate && (
            <SpectatorTable
              rounds={spectate.rounds ?? []}
              roster={roster}
              turn={spectate.turn}
              myCharacterIds={myCharacterIds}
            />
          )}

          {spectate && (
            <RoundNarrativeBoard events={spectate.events ?? []} />
          )}

          {spectate && spectate.board && bgData && (
            <Battleground
              sessionId={spectate.recordId}
              bgData={bgData}
              combatants={combatantsForBoard}
              readOnly={!myTurnActor}
              mode="playback"
              playbackActive={turnActive}
              activeTurnCombatantId={spectate.turn?.combatantId ?? null}
              playbackOnlyMovableId={myTurnActor?.id ?? null}
              remainingMovementMap={myTurnActor && myTotalSpeed > 0 ? { [myTurnActor.id]: myRemainingMovement } : undefined}
              combatInventories={combatInventories}
              panelCharacters={panelCharacters}
              panelSpellSlots={panelSpellSlots}
              onRequestHandChange={(combatantId, side, item) => {
                if (combatantId !== myTurnActor?.id) return;
                addOp({
                  kind: 'ready-item',
                  slot: side,
                  childId: item ? item.childId ?? item.id : null,
                  itemName: item?.name ?? null,
                  roundText: item
                    ? `${side === 'left' ? '左手' : '右手'}换持为 ${item.name}`
                    : `放下${side === 'left' ? '左手' : '右手'}物品`,
                });
              }}
              onRequestHandState={(combatantId, side, state) => {
                if (combatantId !== myTurnActor?.id) return;
                const label = state === 'action' ? '进入动作中' : state === 'unavailable' ? '标记不可用' : '恢复待用';
                addOp({
                  kind: 'hand-state',
                  slot: side,
                  state,
                  roundText: `${side === 'left' ? '左手' : '右手'}${label}`,
                });
              }}
              onRequestStopConcentration={(combatantId) => {
                if (combatantId !== myTurnActor?.id) return;
                addOp({ kind: 'stop-concentration', roundText: '主动停止专注' });
              }}
              onPanelAttackClick={(c) => {
                if (c.id !== myTurnActor?.id) return;
                openBoardRequest('attack');
              }}
              onPanelCastClick={(c) => {
                if (c.id !== myTurnActor?.id) return;
                openBoardRequest('cast');
              }}
              onPanelDashClick={(c) => {
                if (c.id !== myTurnActor?.id) return;
                addOp({ kind: 'dash', roundText: '疾走（+移动力）' });
              }}
              onPanelDodgeClick={(c) => {
                if (c.id !== myTurnActor?.id) return;
                addOp({ kind: 'dodge', roundText: '回避（至下回合开始，攻击对己劣势、敏捷豁免优势）' });
              }}
              onPanelHideClick={(c) => {
                if (c.id !== myTurnActor?.id) return;
                addOp({ kind: 'hide', roundText: '躲藏（未被定位前攻击劣势/己方优势，一攻揭晓）' });
              }}
              onPanelHelpClick={(c) => {
                if (c.id !== myTurnActor?.id) return;
                addOp({ kind: 'note', roundText: '协助（为同伴创造优势）', actionCost: 'action' });
              }}
              onRequestMoveToken={(combatantId, to) => {
                const r = roster.find((x) => x.id === combatantId);
                addOp({
                  kind: 'move',
                  to,
                  roundText: `${r?.name ?? '我'}移动到（第 ${to.col + 1} 列，第 ${to.row + 1} 行）`,
                });
              }}
              onRequestAttack={(attacker, target) => {
                if (attacker.id !== myTurnActor?.id) return;
                openBoardRequest('attack', target.id);
              }}
              onRequestSpell={(caster, target) => {
                if (caster.id !== myTurnActor?.id) return;
                openBoardRequest('cast', target.id);
              }}
              projectionOverlay={(cell) => (
                <AnimationOverlay anim={activeAnim} cell={cell} board={spectate.board!} roster={roster} />
              )}
            />
          )}

          {/* 资源悬浮面板：与 DM 端同款（读投影 + 未提交 ops 乐观扣减） */}
          {myTurnActor && (
            <CombatResourceHud
              actions={myActions}
              bonusActions={myBonusActions}
              remainingMovement={myTotalSpeed > 0 ? myRemainingMovement : null}
              totalSpeed={myTotalSpeed}
              active={turnActive}
            />
          )}

          {spectate && (
            <MyCombatantsSection
              roster={roster}
              myCharacterIds={myCharacterIds}
              playback={spectate.turn?.playback === true}
              onFeatureUse={(combatant, feature) => {
                // 主动技能属回合内动作：仅当前回合行动者可提交，打包进回合包统一审核
                if (combatant.id !== myTurnActor?.id) {
                  setNotice('只有当前回合行动的参战者可以使用主动技能');
                  return;
                }
                if (pendingOps.some((op) => op.kind === 'feature-use' && op.featureName === feature.name)) {
                  setNotice(`「${feature.name}」已在本回合操作列表中，提交后由 DM 审核`);
                  return;
                }
                // 命中触发类（至圣斩/震慑拳）：仅声明，池/法术位由 DM 在命中时于伤害弹窗结算
                if (resolveFeatureCapability(feature.name).channel === 'attack_rider') {
                  addOp({
                    kind: 'feature-use',
                    featureName: feature.name,
                    activation: feature.activation,
                    roundText: `发动《${feature.name}》（命中时 DM 结算）`,
                  });
                  return;
                }
                // checkModifier 通道（激励骰等）：先选受益人再打包 op，资源由 DM 入账时扣
                if (resolveFeatureCapability(feature.name).channel === 'checkModifier') {
                  setCheckModifierPick({ combatant, feature });
                  return;
                }
                // aoe_save 通道（吐息武器等）：先选朝向再打包 op，几何/豁免/伤害由 DM 入账时全自动结算
                if (resolveFeatureCapability(feature.name).channel === 'aoe_save') {
                  setAoePick({ combatant, feature });
                  return;
                }
                // heal 通道（回气类）：spec 带 dice 先走骰值环节（线下骰口径），填入结果随 op 提交（决策③）；
                // 无 dice 直接按固定+等级打包
                {
                  const cap = resolveFeatureCapability(feature.name);
                  if (cap.channel === 'heal' && cap.heal) {
                    if (cap.heal.dice) {
                      setHealRollPick({ combatant, feature, cap });
                      return;
                    }
                    const char = panelCharacters[combatant.id] ?? null;
                    const plan = planHealAmount(cap.heal, char?.level ?? 1);
                    addOp({
                      kind: 'feature-use',
                      featureName: feature.name,
                      ...(feature.poolKey ? { poolKey: feature.poolKey, cost: feature.cost ?? 1 } : {}),
                      healAmount: plan.amount,
                      activation: feature.activation,
                      roundText: `发动《${feature.name}》→ ${cap.heal.type === 'temp' ? '获得临时生命' : '恢复'}【${plan.amount}】（${plan.detail}）${feature.poolKey ? `，【${feature.cost ?? 1}】点` : ''}`,
                    });
                    return;
                  }
                  // resource_conv convert 多目标（灵巧动作类）：先选动作项再打包 op（携带 convertTarget）
                  if (cap.channel === 'resource_conv' && cap.resourceConv?.convert && cap.resourceConv.convert.to.length > 1) {
                    setConvTargetPick({ combatant, feature, targets: cap.resourceConv.convert.to });
                    return;
                  }
                }
                addOp({
                  kind: 'feature-use',
                  featureName: feature.name,
                  ...(feature.poolKey ? { poolKey: feature.poolKey, cost: feature.cost ?? 1 } : {}),
                  activation: feature.activation,
                  roundText: `发动《${feature.name}》${feature.poolKey ? `（【${feature.cost ?? 1}】点）` : ''}`,
                });
              }}
            />
          )}

          {checkModifierPick && spectate && (() => {
            const from = rosterEntryToCombatant(checkModifierPick.combatant, panelCharacters[checkModifierPick.combatant.id] ?? null);
            const friendlies = combatantsForBoard.filter(c => c.id !== from.id && c.isPc === from.isPc && !c.isDead);
            return (
              <FeatureCheckModifierModal
                from={from}
                featureName={checkModifierPick.feature.name}
                friendlies={friendlies}
                onConfirm={(targetId) => {
                  const targetName = combatantsForBoard.find(c => c.id === targetId)?.name ?? '目标';
                  addOp({
                    kind: 'feature-use',
                    featureName: checkModifierPick.feature.name,
                    ...(checkModifierPick.feature.poolKey ? { poolKey: checkModifierPick.feature.poolKey, cost: checkModifierPick.feature.cost ?? 1 } : {}),
                    targetId,
                    activation: checkModifierPick.feature.activation,
                    roundText: `发动《${checkModifierPick.feature.name}》→ ${targetName}${checkModifierPick.feature.poolKey ? `（【${checkModifierPick.feature.cost ?? 1}】点）` : ''}`,
                  });
                  setCheckModifierPick(null);
                }}
                onClose={() => setCheckModifierPick(null)}
              />
            );
          })()}

          {convTargetPick && spectate && (() => {
            const from = rosterEntryToCombatant(convTargetPick.combatant, panelCharacters[convTargetPick.combatant.id] ?? null);
            return (
              <FeatureConvTargetModal
                from={from}
                featureName={convTargetPick.feature.name}
                targets={convTargetPick.targets}
                onConfirm={(target) => {
                  addOp({
                    kind: 'feature-use',
                    featureName: convTargetPick.feature.name,
                    ...(convTargetPick.feature.poolKey ? { poolKey: convTargetPick.feature.poolKey, cost: convTargetPick.feature.cost ?? 1 } : {}),
                    convertTarget: target,
                    activation: convTargetPick.feature.activation,
                    roundText: `发动《${convTargetPick.feature.name}》→ ${CONV_TARGET_LABELS[target] ?? target}${convTargetPick.feature.poolKey ? `（【${convTargetPick.feature.cost ?? 1}】点）` : ''}`,
                  });
                  setConvTargetPick(null);
                }}
                onClose={() => setConvTargetPick(null)}
              />
            );
          })()}

          {/* aoe 伤害骰值环节（线下骰）：填入玩家线下掷的伤害骰合计后打包 op（aoeDamage） */}
          {aoeDamagePending && (
            <DiceInputModal
              title={`掷骰 · ${aoeDamagePending.feature.name}`}
              diceText={aoeDamagePending.diceText}
              hint="同一骰值对范围内所有目标生效"
              confirmLabel="提交 DM 结算"
              onConfirm={(aoeDamage) => {
                addOp({
                  kind: 'feature-use',
                  featureName: aoeDamagePending.feature.name,
                  ...(aoeDamagePending.feature.poolKey ? { poolKey: aoeDamagePending.feature.poolKey, cost: aoeDamagePending.feature.cost ?? 1 } : {}),
                  direction: aoeDamagePending.direction,
                  aoeDamage,
                  activation: aoeDamagePending.feature.activation,
                  roundText: `${aoeDamagePending.roundText}，掷 ${aoeDamagePending.diceText}=【${aoeDamage}】`,
                });
                setAoeDamagePending(null);
              }}
              onClose={() => setAoeDamagePending(null)}
            />
          )}

          {/* heal 骰值环节（线下骰）：填入线下掷骰结果后打包 op，healAmount=填入骰值+固定+等级合计 */}
          {healRollPick && spectate && (() => {
            const from = rosterEntryToCombatant(healRollPick.combatant, panelCharacters[healRollPick.combatant.id] ?? null);
            const cap = healRollPick.cap;
            return (
              <HealRollModal
                featureName={healRollPick.feature.name}
                spec={cap.heal!}
                casterLevel={panelCharacters[healRollPick.combatant.id]?.level ?? 1}
                onConfirm={(rolledDice) => {
                  const plan = planHealAmount(cap.heal!, panelCharacters[healRollPick.combatant.id]?.level ?? 1, rolledDice);
                  addOp({
                    kind: 'feature-use',
                    featureName: healRollPick.feature.name,
                    ...(healRollPick.feature.poolKey ? { poolKey: healRollPick.feature.poolKey, cost: healRollPick.feature.cost ?? 1 } : {}),
                    healAmount: plan.amount,
                    activation: healRollPick.feature.activation,
                    roundText: `发动《${healRollPick.feature.name}》→ ${cap.heal!.type === 'temp' ? '获得临时生命' : '恢复'}【${plan.amount}】（${plan.detail}）${healRollPick.feature.poolKey ? `，【${healRollPick.feature.cost ?? 1}】点` : ''}`,
                  });
                  setHealRollPick(null);
                }}
                onClose={() => setHealRollPick(null)}
              />
            );
          })()}

          {aoePick && spectate && (() => {
            const from = rosterEntryToCombatant(aoePick.combatant, panelCharacters[aoePick.combatant.id] ?? null);
            const spec = parseAoeSpec(aoePick.feature.description);
            const positions: Record<string, { col: number; row: number }> = {};
            (spectate.board?.tokens ?? []).forEach((t) => { positions[t.combatantId] = { col: t.col, row: t.row }; });
            const preset = GRID_PRESETS[spectate.board?.size ?? 'small'];
            const packOp = (_msg: string, data: Record<string, unknown>) => {
              const direction = (data.direction as Bearing) ?? 'E';
              const diceText = resolveFeatureCapability(aoePick.feature.name).aoeSave?.damage?.dice;
              const baseText = `发动《${aoePick.feature.name}》（${data.shapeLabel ?? '范围'}，朝向${BEARING_LABELS[direction] ?? direction}）${aoePick.feature.poolKey ? `（【${aoePick.feature.cost ?? 1}】点）` : ''}`;
              // aoe 骰值环节（线下骰口径）：spec 带伤害骰 → 先填玩家线下掷骰结果再打包；无骰式直接提交
              if (diceText) {
                setAoeDamagePending({
                  feature: aoePick.feature,
                  diceText,
                  direction,
                  roundText: baseText,
                });
                setAoePick(null);
                return;
              }
              addOp({
                kind: 'feature-use',
                featureName: aoePick.feature.name,
                ...(aoePick.feature.poolKey ? { poolKey: aoePick.feature.poolKey, cost: aoePick.feature.cost ?? 1 } : {}),
                direction,
                activation: aoePick.feature.activation,
                roundText: baseText,
              });
              setAoePick(null);
            };
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setAoePick(null)}>
                <div
                  className="dark:bg-card-dark light:bg-card-light rounded-xl shadow-2xl w-[92vw] max-w-lg max-h-[85vh] overflow-y-auto p-4 space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h4 className="font-bold dark:text-text-dark light:text-text-light">
                    {aoePick.feature.name}
                    <span className="ml-2 text-xs font-normal dark:text-text-dark-muted light:text-text-light-muted">
                      选择呼出朝向，结算由 DM 完成
                    </span>
                  </h4>
                  {spec ? (
                    <AoETargetStep
                      aoeSpec={spec}
                      rangeFeet={null}
                      lockSelfOriginated
                      caster={from}
                      combatants={combatantsForBoard}
                      combatantPositions={positions}
                      bounds={{ cols: preset.cols, rows: preset.rows }}
                      confirmLabel="确认朝向，提交 DM 结算"
                      onConfirm={packOp}
                      onForce={packOp}
                    />
                  ) : (
                    <p className="text-sm text-amber-400">
                      无法从特性描述解析范围形状（需含「15尺锥状」等表述），请联系 DM 修正特性描述。
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {connected && !spectate && (
            <div className="text-center py-10 dark:text-text-dark-muted light:text-text-light-muted">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
              <p className="text-sm">已连接，等待 DM 端数据…</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
