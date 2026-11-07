// 战斗观战广播 hook（DM 端）：CombatRecord + 沙盘 变化 → 幂等快照广播到实时房间
// 房间名 = `combat-${recordId}`；payload 结构见 types/realtime.ts CombatDeltaPayload（唯一事实源）。
// 服务端（realtime Worker）对 payload 透传，本 hook 与玩家观战页是协议两端。
// 沙盘数据在 battlegroundStore（按 sessionId 索引），棋子移动只触发它——两个 store 的变更
// 都进入同一个防抖 flush，合并为一条快照（roster/turn/board 互为整体，避免半新半旧）。
import { useEffect, useRef, useState } from 'react';
import combatStore from '@/data/combatStore';
import battlegroundStore from '@/data/battlegroundStore';
import { CombatRoomClient } from '@/lib/combatRoomClient';
import { useAuth } from '@/contexts/AuthContext';
import type { BoardProjection, CombatDeltaPayload, CombatRosterEntry } from '@/types/realtime';
import type { CombatRecord } from '@/types/combat';

const BROADCAST_DEBOUNCE_MS = 300;

/** 沙盘 → 玩家投影：剔除 equipmentData（背包隐私）/moveHistory/hitRounds 等 DM 侧数据 */
export function buildBoardProjection(record: CombatRecord): BoardProjection | null {
  const bg = battlegroundStore.get(record.id);
  if (!bg) return null;
  const combatantIds = new Set(record.combatants.map((c) => c.id));
  return {
    size: bg.size,
    tokens: bg.tokens
      // 只投本记录参战者的棋子，避免历史脏 token 指向已删除参战者
      .filter((t) => combatantIds.has(t.combatantId))
      .map((t) => ({ combatantId: t.combatantId, col: t.col, row: t.row })),
    items: (bg.itemTokens ?? []).map((it) => ({ id: it.id, col: it.col, row: it.row, name: it.name })),
    painted: bg.paintedCells ?? [],
    zones: (bg.zones ?? []).map((z) => ({ id: z.id, cells: z.cells, color: z.color, label: z.label })),
  };
}

export function buildCombatDelta(record: CombatRecord): CombatDeltaPayload {
  const roster: CombatRosterEntry[] = record.combatants.map((c) => ({
    id: c.id,
    name: c.name,
    isPc: c.isPc ?? false,
    hp: c.currentHp ?? 0,
    maxHp: c.maxHp ?? 0,
    tempHp: c.tempHp ?? 0,
    ac: c.ac ?? null,
    initiative: c.initiative,
    downed: c.isUnconscious === true,
    incapacitated: c.isIncapacitated === true,
    concentrating: c.concentration != null,
    dead: c.isDead === true,
  }));
  const turn = record.playbackState?.started
    ? {
        round: record.playbackState.currentTurn?.round ?? 1,
        combatantId: record.playbackState.currentTurn?.combatantId ?? null,
        playback: true,
      }
    : null;
  return {
    v: 1,
    recordId: record.id,
    title: record.title,
    at: Date.now(),
    roster,
    turn,
    board: buildBoardProjection(record),
  };
}

export function useCombatBroadcast(record: CombatRecord | null): {
  connected: boolean;
  roomId: string | null;
} {
  const { token, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<CombatRoomClient | null>(null);
  const debounceRef = useRef<number | null>(null);
  const recordRef = useRef<CombatRecord | null>(record);
  recordRef.current = record;

  const roomId = record ? `combat-${record.id}` : null;

  // 连接生命周期：roomId 变化（切换战斗记录）→ 重连
  useEffect(() => {
    if (!roomId || !token) {
      clientRef.current?.disconnect();
      clientRef.current = null;
      setConnected(false);
      return;
    }
    const client = new CombatRoomClient(roomId, {
      token,
      role: user?.role === 'dm' ? 'dm' : 'player',
    });
    clientRef.current = client;
    const offConn = client.onConnectionChange(setConnected);
    client.connect();
    return () => {
      offConn();
      client.disconnect();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [roomId, token, user?.role]);

  // 广播：combatStore / battlegroundStore 任一变更 → debounce → 投影 → combat.delta
  // 连接瞬断重连期间 store 变更会被 send() 丢弃（返回 false），下次任意变更自动补发；
  // 幂等快照语义下丢消息无状态损失。
  useEffect(() => {
    if (!roomId) return;
    const flush = () => {
      const current = combatStore.get(roomId.slice('combat-'.length));
      if (!current) return;
      const payload = buildCombatDelta(current);
      clientRef.current?.send({ t: 'combat.delta', payload });
    };
    const scheduleFlush = () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        flush();
      }, BROADCAST_DEBOUNCE_MS);
    };
    const unsubCombat = combatStore.subscribe(scheduleFlush);
    const unsubBoard = battlegroundStore.subscribe(scheduleFlush);
    return () => {
      unsubCombat();
      unsubBoard();
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [roomId]);

  return { connected, roomId };
}
