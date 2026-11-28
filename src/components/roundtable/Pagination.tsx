// 圆桌记录分页条：收纳区按页展示，避免长历史撑高消息流。
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, pageCount, total, onChange }: Props) {
  if (pageCount <= 1) return null;

  const btn =
    'flex h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:opacity-35 disabled:cursor-not-allowed dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:border-primary hover:text-primary';

  return (
    <div className="flex items-center justify-between gap-2 border-t pt-2 dark:border-border-dark light:border-border-light">
      <span className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted">
        共 {total} 条 · 第 {page} / {pageCount} 页
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className={btn} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="上一页">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="下一页"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
