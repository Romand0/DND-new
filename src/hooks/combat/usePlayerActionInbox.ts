// DM 端玩家操作收件箱：接收 player.action 请求，维护待处理队列，广播回执
// 语义校验（回合归属/绑定关系/状态过期）在 M2 落地；M1 只做通道与确认 UI
import { useCallback, useEffect, useState } from 'react';
import { CombatRoomClient } from '@/lib/combatRoomClient';
import type { PlayerActionRequest, PlayerActionResult, SessionMeta } from '@/types/realtime';

export interface PlayerActionInboxItem {
  request: PlayerActionRequest;
  from: SessionMeta;
  at: number;
}

export function usePlayerActionInbox(client: CombatRoomClient | null): {
  pending: PlayerActionInboxItem[];
  /** 审核决定：广播回执并移出队列（accepted=false 时带原因） */
  resolve: (requestId: string, accepted: boolean, reason?: string) => void;
} {
  const [pending, setPending] = useState<PlayerActionInboxItem[]>([]);

  useEffect(() => {
    if (!client) {
      setPending([]);
      return;
    }
    const off = client.onMessage((msg) => {
      if (msg.t !== 'player.action') return;
      setPending((prev) => {
        // 同一请求重发去重（玩家断线重连后可能重发）
        if (prev.some((p) => p.request.requestId === msg.request.requestId)) return prev;
        return [...prev, { request: msg.request, from: msg.from, at: msg.at }];
      });
    });
    return off;
  }, [client]);

  const resolve = useCallback(
    (requestId: string, accepted: boolean, reason?: string) => {
      setPending((prev) => prev.filter((p) => p.request.requestId !== requestId));
      const result: PlayerActionResult = { requestId, accepted, ...(reason ? { reason } : {}) };
      client?.send({ t: 'player.action.result', result });
    },
    [client],
  );

  return { pending, resolve };
}
