// 观战状态轮询：当前房间（玩家）/ 投送中的房间（DM）。
// 只同步「当前状态」，不拉历史投送记录。
import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/lib/api';
import type { ActiveSpectateRoom, CurrentSpectateRoom } from '@/types/roundTable';

const POLL_MS = 8000;

export function useCurrentSpectate(enabled = true) {
  const [room, setRoom] = useState<CurrentSpectateRoom | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !api.hasToken()) return;
    setLoading(true);
    try {
      const res = await api.fetchCurrentSpectate();
      setRoom(res.room ?? null);
    } catch {
      // 网络失败保留上一次状态，避免卡片闪烁消失
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setRoom(null);
      return;
    }
    let alive = true;
    const tick = () => {
      if (!alive || document.hidden) return;
      refresh();
    };
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return { room, loading, refresh };
}

export function useActiveSpectateRooms(campaignId: string | undefined, enabled = true) {
  const [rooms, setRooms] = useState<ActiveSpectateRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const campaignRef = useRef(campaignId);
  campaignRef.current = campaignId;

  const refresh = useCallback(async () => {
    if (!enabled || !api.hasToken()) return;
    setLoading(true);
    try {
      const res = await api.fetchActiveSpectateRooms(campaignRef.current);
      setRooms(res.rooms ?? []);
    } catch {
      // 保持上一次列表，下一次轮询重试
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setRooms([]);
      return;
    }
    let alive = true;
    const tick = () => {
      if (!alive || document.hidden) return;
      refresh();
    };
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return { rooms, loading, refresh };
}
