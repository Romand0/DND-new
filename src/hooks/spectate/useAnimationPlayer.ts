// 战斗动画播放器：从事件流增量提取新事件 → 串行播放队列。
// 快照恢复（首次收到 events / 断线重连）时全部标记已播，历史不回放。
// 队列积压超过 5 条时丢弃最老的——快速推进回合时直接跳到最新动作。
// move/note 事件不生成动画：位移由棋子 CSS transition 自动完成，note 纯文本进摘要。
import { useEffect, useRef, useState } from 'react';
import type { CombatEvent } from '@/types/combat';

export type ActiveAnimation =
  | { kind: 'attack-melee'; actorId: string; targetId: string; hit: boolean; critical: boolean; id: string }
  | { kind: 'attack-ranged'; actorId: string; targetId: string; hit: boolean; critical: boolean; id: string }
  | { kind: 'cast'; actorId: string; targetId?: string; spellName?: string; id: string }
  | { kind: 'damage'; targetId: string; amount: number; damageType?: string; id: string }
  | { kind: 'heal'; targetId: string; amount: number; id: string };

/** 单个动画总时长（ms）：内部子特效用 CSS animation-delay 编排，播放器只管串行推进 */
export const ANIMATION_MS: Record<ActiveAnimation['kind'], number> = {
  'attack-melee': 750,
  'attack-ranged': 900,
  cast: 850,
  damage: 950,
  heal: 950,
};

const MAX_QUEUE = 5;

function toAnimation(ev: CombatEvent): ActiveAnimation | null {
  switch (ev.kind) {
    case 'attack':
      if (!ev.actorId || !ev.targetId) return null;
      return {
        kind: ev.ranged ? 'attack-ranged' : 'attack-melee',
        actorId: ev.actorId,
        targetId: ev.targetId,
        hit: ev.hit === true,
        critical: ev.critical === true,
        id: ev.id,
      };
    case 'cast':
      if (!ev.actorId) return null;
      return { kind: 'cast', actorId: ev.actorId, targetId: ev.targetId, spellName: ev.spellName, id: ev.id };
    case 'damage':
      if (!ev.targetId || !(ev.amount ?? 0)) return null;
      return { kind: 'damage', targetId: ev.targetId, amount: ev.amount ?? 0, damageType: ev.damageType, id: ev.id };
    case 'heal':
      if (!ev.targetId || !(ev.amount ?? 0)) return null;
      return { kind: 'heal', targetId: ev.targetId, amount: ev.amount ?? 0, id: ev.id };
    default:
      return null;
  }
}

export function useAnimationPlayer(events: CombatEvent[]): { current: ActiveAnimation | null } {
  const [current, setCurrent] = useState<ActiveAnimation | null>(null);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const queueRef = useRef<CombatEvent[]>([]);
  const timerRef = useRef<number | null>(null);
  const pumpingRef = useRef(false);

  useEffect(() => {
    // 首次收到事件流：全量标记已播（快照恢复语义），不回放历史
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(events.map((e) => e.id));
      return;
    }
    const seen = seenIdsRef.current;
    const fresh = events.filter((e) => !seen.has(e.id));
    if (fresh.length === 0) return;
    for (const e of fresh) seen.add(e.id);
    queueRef.current = [...queueRef.current, ...fresh.filter((e) => toAnimation(e))].slice(-MAX_QUEUE);

    const pump = () => {
      const ev = queueRef.current.shift();
      const anim = ev ? toAnimation(ev) : null;
      if (!anim) {
        // 队列空（或事件无动画）：直接看下一条
        if (queueRef.current.length > 0) {
          pump();
        } else {
          pumpingRef.current = false;
          setCurrent(null);
        }
        return;
      }
      setCurrent(anim);
      timerRef.current = window.setTimeout(pump, ANIMATION_MS[anim.kind]);
    };

    if (!pumpingRef.current) {
      pumpingRef.current = true;
      pump();
    }
  }, [events]);

  // 卸载清理：避免定时器在组件销毁后触发 setState
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      pumpingRef.current = false;
    };
  }, []);

  return { current };
}
