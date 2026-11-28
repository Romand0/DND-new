// 同一战斗房间的观战投送合并卡：默认展开有进行中邀请的组，其余折叠。
import { useState } from 'react';
import { Ban, ChevronDown, Eye, Hourglass } from 'lucide-react';
import type { SpectateInviteGroup } from '@/lib/roundTableGroups';

interface Props {
  group: SpectateInviteGroup;
  variant: 'dm' | 'player';
  onCancel?: (messageId: string) => void;
  onJoin?: (roomId: string) => void;
}

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function SpectateInviteGroupCard({ group, variant, onCancel, onJoin }: Props) {
  const [open, setOpen] = useState(group.pendingCount > 0);
  const active = group.pendingCount > 0;

  return (
    <div className="rounded-lg border dark:border-border-dark light:border-border-light">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Eye className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-500' : 'dark:text-text-dark-muted light:text-text-light-muted'}`} />
        <span className="min-w-0 truncate text-sm font-bold dark:text-text-dark light:text-text-light">
          {group.title}
        </span>
        <span className="shrink-0 text-[11px] dark:text-text-dark-muted light:text-text-light-muted">
          共 {group.messages.length} 次
        </span>
        {active ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-500">
            <Hourglass className="h-3.5 w-3.5" />
            {variant === 'player' ? '可加入' : `${group.pendingCount} 条有效`}
          </span>
        ) : (
          <span className="shrink-0 text-xs dark:text-text-dark-muted light:text-text-light-muted">已撤回</span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 transition-transform dark:text-text-dark-muted light:text-text-light-muted ${
            open ? '' : '-rotate-90'
          }`}
        />
      </button>

      {open && (
        <div className="space-y-1.5 border-t px-3 py-2 dark:border-border-dark light:border-border-light">
          <div className="font-mono text-[11px] dark:text-text-dark-muted light:text-text-light-muted">{group.roomId}</div>
          {group.messages.map(msg => {
            const pending = msg.status === 'pending';
            if (variant === 'player' && pending) {
              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => onJoin?.(group.roomId)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-primary/10"
                >
                  <span className="text-xs dark:text-text-dark light:text-text-light">{fmtTime(msg.createdAt)}</span>
                  <span className="text-xs text-primary">加入 →</span>
                </button>
              );
            }
            return (
              <div key={msg.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xs dark:text-text-dark light:text-text-light">{fmtTime(msg.createdAt)}</span>
                  <span className={`text-[11px] ${pending ? 'text-emerald-500' : 'dark:text-text-dark-muted light:text-text-light-muted'}`}>
                    {pending ? '进行中' : '已撤回'}
                  </span>
                </div>
                {variant === 'dm' && pending && onCancel && (
                  <button
                    type="button"
                    onClick={() => onCancel(msg.id)}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-500 hover:bg-red-500/20"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    撤回
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
