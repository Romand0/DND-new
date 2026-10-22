import { useEffect, useState } from 'react';
import {
  Eraser, PenLine, Swords, Heart, Sparkles, Package, Footprints,
  Activity, ScrollText,
} from 'lucide-react';
import type { Combatant, CombatRecord, OperationLogEntry } from '@/types/combat';
import combatStore from '@/data/combatStore';

interface Props {
  record: CombatRecord;
  combatants: Combatant[];
  onOpenManualRecord: () => void;
}

const KIND_META: Record<OperationLogEntry['kind'], { icon: typeof Swords; cls: string; label: string }> = {
  attack: { icon: Swords, cls: 'text-orange-400 bg-orange-400/10 border-orange-400/30', label: '攻击' },
  damage: { icon: Swords, cls: 'text-red-400 bg-red-400/10 border-red-400/30', label: '伤害' },
  heal: { icon: Heart, cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', label: '恢复' },
  spell: { icon: Sparkles, cls: 'text-violet-400 bg-violet-400/10 border-violet-400/30', label: '法术' },
  status: { icon: Activity, cls: 'text-sky-400 bg-sky-400/10 border-sky-400/30', label: '状态' },
  move: { icon: Footprints, cls: 'text-teal-400 bg-teal-400/10 border-teal-400/30', label: '移动' },
  loot: { icon: Package, cls: 'text-amber-400 bg-amber-400/10 border-amber-400/30', label: '拾取' },
  record: { icon: PenLine, cls: 'text-gray-400 bg-gray-400/10 border-gray-400/30', label: '记录' },
};

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export default function OperationLogPanel(props: Props) {
  const { record, combatants, onOpenManualRecord } = props;
  // 订阅 store：日志写入后实时刷新（record prop 快照可能滞后一次渲染）
  const [log, setLog] = useState<OperationLogEntry[]>(record.operationLog ?? []);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const latest = combatStore.get(record.id);
      setLog(latest?.operationLog ?? []);
    };
    refresh();
    return combatStore.subscribe(refresh);
  }, [record.id]);

  const nameOf = (combatantId?: string) =>
    combatants.find(c => c.id === combatantId)?.name ?? '未知';

  // 倒序展示：最新操作在最上，DM 无需滚动即可看到刚刚发生的事
  const entries = [...log].reverse();

  return (
    <div className="rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light overflow-hidden">
      {/* 工具条 */}
      <div className="flex items-center justify-between px-3 py-2 border-b dark:border-border-dark light:border-border-light">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
          <span className="text-sm font-bold dark:text-text-dark light:text-text-light">战斗日志</span>
          <span className="text-xs opacity-50">{log.length} 条</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenManualRecord}
            className="px-2 py-1.5 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-xs flex items-center gap-1 hover:bg-white/5 transition-colors"
          >
            <PenLine className="w-3.5 h-3.5" />
            手动记录
          </button>
          {log.length > 0 && (
            confirmClear ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    combatStore.clearOperationLog(record.id);
                    setConfirmClear(false);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-danger text-white text-xs hover:bg-danger/90 transition-colors"
                >
                  确认清空
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-2 py-1.5 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-xs hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                title="清空日志"
                className="p-1.5 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5 transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* 日志列表（倒序） */}
      <div className="max-h-[420px] overflow-y-auto">
        {entries.length === 0 ? (
          <div className="py-10 text-center text-sm opacity-50">
            暂无操作记录
            <div className="text-xs mt-1 opacity-70">攻击、施法、拾取等操作会自动记录在这里</div>
          </div>
        ) : (
          <ul className="divide-y dark:divide-border-dark/60 light:divide-border-light/60">
            {entries.map(e => {
              const meta = KIND_META[e.kind] ?? KIND_META.record;
              const Icon = meta.icon;
              return (
                <li key={e.id} className="flex items-start gap-2.5 px-3 py-2">
                  <span
                    className={`shrink-0 mt-0.5 w-7 h-7 rounded-lg border flex items-center justify-center ${meta.cls}`}
                    title={meta.label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-xs font-mono opacity-50 shrink-0">{fmtTime(e.timestamp)}</span>
                      {e.combatantId && (
                        <span className="text-xs font-bold dark:text-text-dark light:text-text-light">
                          {nameOf(e.combatantId)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm dark:text-text-dark light:text-text-light break-words">{e.text}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
