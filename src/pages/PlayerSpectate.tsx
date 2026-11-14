// 玩家战斗观战页：加入实时房间（combat-<recordId>）→ 只读渲染 DM 广播的幂等快照
// 协议见 types/realtime.ts CombatDeltaPayload；玩家侧只收不发（DO 端拒 player 写 combat.delta）。
// 断线自动重连由 CombatRoomClient 内置；重连成功后发 snapshot.request 取最近 delta 恢复状态
// （DM 端只在数据变化时广播，静止期没有新消息可等）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Link2, LogOut, RefreshCw, Skull, Sparkles, Ban, Moon, Swords, Wifi, WifiOff, Hand } from 'lucide-react';
import { CombatRoomClient } from '@/lib/combatRoomClient';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyCharacters, fetchCharacter } from '@/lib/api';
import SpectatorTable from '@/components/spectate/SpectatorTable';
import AnimationOverlay from '@/components/spectate/AnimationOverlay';
import RoundNarrativeBoard from '@/components/spectate/RoundNarrativeBoard';
import { MyCombatantsSection } from '@/components/spectate/MyCombatantPanel';
import MyTurnPanel from '@/components/spectate/MyTurnPanel';
import Battleground from '@/components/Battleground';
import CombatResourceHud from '@/components/combat/CombatResourceHud';
import { rosterEntryToCombatant, rosterInventoryToEquipmentList, applyPendingHandOps } from '@/components/spectate/combatantAdapter';
import type { Battleground as BattlegroundData } from '@/types/battleground';
import { useAnimationPlayer } from '@/hooks/spectate/useAnimationPlayer';
import type { BoardProjection, CombatDeltaPayload, CombatRosterEntry, PlayerActionRequest, PlayerActionResult, TurnCommitOp } from '@/types/realtime';
import type { Character } from '@/types/character';

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

function takeLatestDelta(deltas: { payload: unknown }[]): CombatDeltaPayload | null {
  // snapshot.deltas 的 payload 是透传 unknown，逐条嗅探是否有 v1 快照特征字段
  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i].payload as Partial<CombatDeltaPayload> | null;
    if (d && d.v === 1 && Array.isArray(d.roster) && d.recordId) return d as CombatDeltaPayload;
  }
  return null;
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
  // ops 提升到页面层：沙盘拖拽与回合面板共享同一操作列表
  const [pendingOps, setPendingOps] = useState<TurnCommitOp[]>([]);
  const lastOpsRoundRef = useRef<number | null>(null);

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

  // 轮次推进即作废未提交的 ops（跨回合残留会带错 round 语义）
  if (spectate?.turn && lastOpsRoundRef.current !== spectate.turn.round) {
    lastOpsRoundRef.current = spectate.turn.round;
    if (pendingOps.length > 0) setPendingOps([]);
  }
  const addOp = (op: TurnCommitOp) => setPendingOps((prev) => [...prev, op]);

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
  const myTotalSpeed = myTurnActor ? (myTurnActor.speed ?? 0) + (myTurnActor.speedModifier ?? 0) + (myTurnActor.dashExtraMovement ?? 0) : 0;
  const myRemainingMovement = myTurnActor
    ? Math.max(0, myTotalSpeed - (myTurnActor.movementUsed ?? 0) - pendingMovementFeet)
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
            向 DM 要观战房间号（DM 战斗页顶部绿点，点击可复制），粘贴后加入即可实时看到 HP、状态与回合推进。
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
                onOpsChange={setPendingOps}
                board={spectate.board ?? null}
                boardRequest={boardRequest}
                onBoardRequestHandled={() => setBoardRequest(null)}
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
                addOp({ kind: 'note', roundText: '疾走（本回合移动力翻倍）', actionCost: 'action' });
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
            <MyCombatantsSection roster={roster} myCharacterIds={myCharacterIds} playback={spectate.turn?.playback === true} />
          )}

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
