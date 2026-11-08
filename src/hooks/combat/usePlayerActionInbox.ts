// DM 端玩家操作收件箱：接收 player.action 请求，维护待处理队列，广播回执。
// 直接放行模式（M3）：onAutoAccept 返回非 null 时跳过审核队列直接落库并回执，
// 返回 null（或未开启）进 pending 队列走审核卡。回调经 ref 取最新，避免重订阅。
import { useCallback, useEffect, useRef, useState } from 'react';
import { CombatRoomClient } from '@/lib/combatRoomClient';
import type { PlayerActionRequest, PlayerActionResult, SessionMeta } from '@/types/realtime';

export interface PlayerActionInboxItem {
  request: PlayerActionRequest;
  from: SessionMeta;
  at: number;
}

export function usePlayerActionInbox(
  client: CombatRoomClient | null,
  onAutoAccept?: (item: PlayerActionInboxItem) => { accepted: boolean; reason?: string } | null
): {
  pending: PlayerActionInboxItem[];
  /** 审核决定：广播回执并移出队列（accepted=false 时带原因） */
  resolve: (requestId: string, accepted: boolean, reason?: string) => void;
} {
  const [pending, setPending] = useState<PlayerActionInboxItem[]>([]);
  const autoAcceptRef = useRef(onAutoAccept);
  autoAcceptRef.current = onAutoAccept;

  useEffect(() => {
    if (!client) {
      setPending([]);
      return;
    }
    const off = client.onMessage((msg) => {
      // M1 诊断：DM 侧收不到确认卡时，console 一眼区分「没收到」与「收到没渲染」
      console.debug('[player-action-inbox] msg:', msg.t, msg);
      if (msg.t !== 'player.action') return;
      const item: PlayerActionInboxItem = { request: msg.request, from: msg.from, at: msg.at };
      // 直接放行：同步落库并回执，不进审核队列；失败原因作为拒绝回执带给玩家
      const outcome = autoAcceptRef.current?.(item);
      if (outcome) {
        const result: PlayerActionResult = {
          requestId: item.request.requestId,
          accepted: outcome.accepted,
          ...(outcome.reason ? { reason: outcome.reason } : {}),
        };
        client.send({ t: 'player.action.result', result });
        return;
      }
      setPending((prev) => {
        // 同一请求重发去重（玩家断线重连后可能重发）
        if (prev.some((p) => p.request.requestId === item.request.requestId)) return prev;
        return [...prev, item];
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
