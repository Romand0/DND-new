// 回合摘要面板（玩家观战，战斗沙盘上方近邻）：以自然语言展示最近发生的行动。
// 最新一条大字高亮（6 秒后沉入历史），历史保留 5 条小字；每条附回合徽标。
import { useEffect, useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import type { CombatEvent } from '@/types/combat';

const HIGHLIGHT_MS = 6000;

export default function RoundNarrativeBoard({ events }: { events: CombatEvent[] }) {
  // 事件按 at 升序存取：渲染取尾部倒序（最新在上）
  const recent = useMemo(() => events.slice(-6).reverse(), [events]);
  const latestId = recent[0]?.id ?? null;
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    if (!latestId) return;
    setHighlight(true);
    const timer = window.setTimeout(() => setHighlight(false), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [latestId]);

  return (
    <div className="rounded-xl border p-3 space-y-1.5 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
      <h3 className="flex items-center gap-2 text-sm font-bold dark:text-text-dark light:text-text-light">
        <ScrollText className="w-4 h-4 text-primary" />
        战况
      </h3>
      {recent.length === 0 ? (
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          战斗开始后，这里会实时显示每个回合的行动摘要。
        </p>
      ) : (
        <div className="space-y-1">
          {recent.map((e, i) => (
            <div
              key={e.id}
              className={`flex items-start gap-2 rounded-lg px-2 py-1 transition-colors duration-500 ${
                i === 0 && highlight ? 'bg-primary/10' : ''
              }`}
            >
              <span
                className={`shrink-0 mt-0.5 px-1.5 rounded text-[10px] font-bold font-mono ${
                  e.round > 0
                    ? 'bg-primary/15 text-primary'
                    : 'bg-neutral-500/15 dark:text-text-dark-muted light:text-text-light-muted'
                }`}
              >
                {e.round > 0 ? `R${e.round}` : '—'}
              </span>
              <span
                className={`flex-1 ${i === 0 ? 'text-sm font-semibold dark:text-text-dark light:text-text-light' : 'text-xs dark:text-text-dark-muted light:text-text-light-muted'}`}
              >
                {e.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
