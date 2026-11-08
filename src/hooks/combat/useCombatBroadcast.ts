// 战斗观战广播 hook（DM 端）：CombatRecord + 沙盘 变化 → 幂等快照广播到实时房间
// 房间名 = `combat-${recordId}`；payload 结构见 types/realtime.ts CombatDeltaPayload（唯一事实源）。
// 服务端（realtime Worker）对 payload 透传，本 hook 与玩家观战页是协议两端。
// 沙盘数据在 battlegroundStore（按 sessionId 索引），棋子移动只触发它——两个 store 的变更
// 都进入同一个防抖 flush，合并为一条快照（roster/turn/board 互为整体，避免半新半旧）。
import { useEffect, useRef, useState } from 'react';
import combatStore, { getCombatInventory } from '@/data/combatStore';
import battlegroundStore from '@/data/battlegroundStore';
import { characterStore } from '@/data/characterStore';
import { CombatRoomClient } from '@/lib/combatRoomClient';
import { useAuth } from '@/contexts/AuthContext';
import type { BoardProjection, CombatDeltaPayload, CombatRosterEntry, RosterHandInfo, RosterInventoryItem } from '@/types/realtime';
import { TURN_TODO_TYPE_LABELS } from '@/types/combat';
import type { CombatRecord, Combatant } from '@/types/combat';
import type { HandSlot } from '@/types/character';

const BROADCAST_DEBOUNCE_MS = 300;

/** 手持槽 → 投影：从战斗背包解析武器名（combatInventory 是装备变更漏斗后的真实背包） */
function projectHand(record: CombatRecord, c: Combatant, slot: HandSlot | undefined): RosterHandInfo | null {
  const equipmentId = slot?.equipmentId;
  if (!equipmentId) return null;
  const eq = getCombatInventory(record, c).find((e) => (e.childId || e.id) === equipmentId);
  return { name: eq?.name ?? '未知装备', state: slot.state };
}

/** PC 战斗背包 → 投影：武器附带攻击属性快照（角色卡 attacks 按名匹配，玩家端零解析）。
 *  NPC 无角色卡源，返回 null。攻击属性属桌面公开信息（武器可见即骰面可见）。 */
function projectInventory(record: CombatRecord, c: Combatant): RosterInventoryItem[] | null {
  if (!c.isPc) return null;
  const character = c.characterId ? characterStore.get(c.characterId) : null;
  return getCombatInventory(record, c).map((eq) => {
    const atk = character?.attacks.find((a) => a.name === eq.name) ?? null;
    return {
      childId: eq.childId || eq.id,
      name: eq.name,
      quantity: eq.quantity ?? 1,
      category: eq.category,
      attack: atk
        ? {
            damage: atk.damage,
            damageType: atk.damageType,
            properties: atk.properties,
            normalRange: atk.normalRange,
            maxRange: atk.maxRange,
            twoHandedDamage: atk.twoHandedDamage,
            loaded: atk.loaded,
          }
        : null,
    };
  });
}

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
  const roster: CombatRosterEntry[] = record.combatants.map((c) => {
    const hasDeathSave = (c.deathSaveFailures ?? 0) > 0 || (c.deathSaveSuccesses ?? 0) > 0;
    return {
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
      characterId: c.characterId ?? null,
      heldLeft: projectHand(record, c, c.heldLeft),
      heldRight: projectHand(record, c, c.heldRight),
      actions: c.actions ?? 0,
      bonusActions: c.bonusActions ?? 0,
      concentration: c.concentration
        ? { spellName: c.concentration.spellName, startedRound: c.concentration.startedRound }
        : null,
      deathSaves: hasDeathSave
        ? { failures: c.deathSaveFailures ?? 0, successes: c.deathSaveSuccesses ?? 0 }
        : null,
      todos: (record.turnTodos ?? [])
        .filter((t) => t.combatantId === c.id)
        .map((t) => ({
          name: t.name,
          typeLabel: t.type ? TURN_TODO_TYPE_LABELS[t.type] : '提醒',
          executed: t.executed,
        })),
      inventory: projectInventory(record, c),
    };
  });
  const turn = record.playbackState?.started
    ? {
        // 1-based 轮次（与 DM 端放映状态卡显示一致）；消费方注意 rounds 数组仍是 0-based 下标
        round: (record.playbackState.currentTurn?.round ?? 0) + 1,
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
    // 放映模式是专门投给玩家看的时刻：表格随快照下发；非放映投空（玩家端清空）
    rounds: turn ? (record.rounds ?? []) : [],
  };
}

export function useCombatBroadcast(record: CombatRecord | null): {
  connected: boolean;
  roomId: string | null;
  /** 暴露底层客户端：玩家操作回执等需要复用同一 WS 连接的消费方使用 */
  client: CombatRoomClient | null;
} {
  const { token, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<CombatRoomClient | null>(null);
  const [client, setClient] = useState<CombatRoomClient | null>(null);
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
      setClient(null);
      return;
    }
    const client = new CombatRoomClient(roomId, {
      token,
      role: user?.role === 'dm' ? 'dm' : 'player',
    });
    clientRef.current = client;
    setClient(client);
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

  return { connected, roomId, client };
}
