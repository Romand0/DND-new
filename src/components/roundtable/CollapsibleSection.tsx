// 圆桌记录分区容器：分类标题 + 计数 + 可折叠内容。
import { Children, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import Pagination from './Pagination';

interface Props {
  title: string;
  icon: LucideIcon;
  count?: number;
  hint?: string;
  defaultOpen?: boolean;
  /** 设置后按页收纳；不传则一次展示全部 */
  pageSize?: number;
  tone?: 'default' | 'amber' | 'emerald' | 'accent';
  children: ReactNode;
}

const TONE_ICON: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-primary',
  amber: 'text-amber-500',
  emerald: 'text-emerald-500',
  accent: 'text-accent',
};

export default function CollapsibleSection({
  title,
  icon: Icon,
  count,
  hint,
  defaultOpen = true,
  pageSize,
  tone = 'default',
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [page, setPage] = useState(1);

  const items = pageSize && pageSize > 0 ? Children.toArray(children) : null;
  const pageCount = items ? Math.max(1, Math.ceil(items.length / pageSize!)) : 1;
  const safePage = Math.min(page, pageCount);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const toggle = () => {
    if (open) setPage(1);
    setOpen(v => !v);
  };

  const visible = items
    ? items.slice((safePage - 1) * pageSize!, safePage * pageSize!)
    : children;

  return (
    <section className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Icon className={`h-4 w-4 shrink-0 ${TONE_ICON[tone]}`} />
        <span className="text-sm font-medium dark:text-text-dark light:text-text-light">{title}</span>
        {typeof count === 'number' && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">{count}</span>
        )}
        {hint && (
          <span className="ml-1 truncate text-xs dark:text-text-dark-muted light:text-text-light-muted">{hint}</span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 transition-transform dark:text-text-dark-muted light:text-text-light-muted ${
            open ? '' : '-rotate-90'
          }`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="space-y-2">{visible}</div>
          {items && (
            <Pagination page={safePage} pageCount={pageCount} total={items.length} onChange={setPage} />
          )}
        </div>
      )}
    </section>
  );
}
