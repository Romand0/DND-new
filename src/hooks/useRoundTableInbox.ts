// src/hooks/useRoundTableInbox.ts
// 圆桌信箱轮询 hook（双端共用）：游标增量拉取 + 退避策略
// 聚焦 3s / 页面隐藏 15s / 连续 5 次空轮询退避至 10s / 新消息重置 3s
import { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '@/lib/api';
import type { TableMessage } from '@/types/roundTable';

const FOCUSED_INTERVAL_MS = 3000;
const HIDDEN_INTERVAL_MS = 15000;
const IDLE_INTERVAL_MS = 10000;
const IDLE_AFTER_EMPTY_ROUNDS = 5;
const PAGE_LIMIT = 50;

interface Options {
  /** true = 拉自己发起的消息（DM 查发起状态），false = 拉收到的消息（默认） */
  outbox?: boolean;
  /** false = 停止轮询（未登录 / 页面不需要时） */
  enabled?: boolean;
}

interface State {
  messages: TableMessage[];
  /** 连续失败标记（UI 显示连接中断） */
  connectionLost: boolean;
}

export function useRoundTableInbox(options: Options = {}): State & { refresh: () => void } {
  const { outbox = false, enabled = true } = options;
  const [messages, setMessages] = useState<TableMessage[]>([]);
  const [connectionLost, setConnectionLost] = useState(false);
  const cursorRef = useRef<string>('');
  const emptyRoundsRef = useRef<number>(0);
  const hiddenRef = useRef<boolean>(typeof document !== 'undefined' ? document.hidden : false);
  const fetchingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const messagesRef = useRef<TableMessage[]>([]);
  messagesRef.current = messages;

  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;

  /** 增量拉取：循环直到不足一页（防一次增量超过 limit 漏消息） */
  const fetchOnce = useCallback(async (): Promise<number> => {
    if (fetchingRef.current || !api.hasToken()) return 0;
    fetchingRef.current = true;
    let received = 0;
    try {
      for (let round = 0; round < 5; round++) {
        const res = await api.fetchRoundTableInbox(cursorRef.current, { outbox: outboxRef.current, limit: PAGE_LIMIT });
        const batch = (res.messages ?? []) as TableMessage[];
        received += batch.length;
        cursorRef.current = res.cursor || cursorRef.current;
        if (batch.length > 0) {
          // 按 id 去重合并（游标回退或重复拉取兜底）
          setMessages(prev => {
            const seen = new Set(prev.map(m => m.id));
            const fresh = batch.filter(m => !seen.has(m.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
        if (batch.length < PAGE_LIMIT) break;
      }
      emptyRoundsRef.current = received === 0 ? emptyRoundsRef.current + 1 : 0;
      setConnectionLost(false);
    } catch {
      setConnectionLost(true);
    } finally {
      fetchingRef.current = false;
    }
    return received;
  }, []);

  /** 当前周期：隐藏 15s > 空轮退避 10s > 聚焦 3s */
  const currentInterval = useCallback((): number => {
    if (hiddenRef.current) return HIDDEN_INTERVAL_MS;
    if (emptyRoundsRef.current >= IDLE_AFTER_EMPTY_ROUNDS) return IDLE_INTERVAL_MS;
    return FOCUSED_INTERVAL_MS;
  }, []);

  const scheduleNext = useCallback((delayMs: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      if (!api.hasToken()) return;
      await fetchOnce();
      scheduleNext(currentInterval());
    }, delayMs);
  }, [fetchOnce, currentInterval]);

  // 轮询主循环：enabled 切换 / visibilitychange 重排
  useEffect(() => {
    if (!enabled) {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }
    const onVisibility = () => {
      const nowHidden = document.hidden;
      if (hiddenRef.current && !nowHidden) {
        // 从隐藏恢复：立即拉一次 + 重置为聚焦节奏
        emptyRoundsRef.current = 0;
        fetchOnce();
      }
      hiddenRef.current = nowHidden;
      scheduleNext(0);
    };
    document.addEventListener('visibilitychange', onVisibility);
    // 首次立即拉
    fetchOnce();
    scheduleNext(currentInterval());
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, outbox, fetchOnce, scheduleNext, currentInterval]);

  /** 手动刷新（提交后 / 撤回后调用） */
  const refresh = useCallback(() => {
    fetchOnce();
  }, [fetchOnce]);

  return { messages, connectionLost, refresh };
}
