import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { StorageFile } from '@/utils/localStorageFiles';
import {
  TABLE_COLUMNS,
  normalizeForTable,
  getByPath,
  formatTimestamp,
  type TableColumn,
} from '@/utils/localStorageFiles';
import JsonBlock from './JsonBlock';
import FlowFileView from './FlowFileView';

const muted = 'dark:text-text-dark-muted light:text-text-light-muted';
const text = 'dark:text-text-dark light:text-text-light';

function isTimestampColumn(label: string): boolean {
  return /时间|更新|创建|快照|备份/.test(label);
}

function cellText(col: TableColumn, row: any): string {
  const raw = getByPath(row, col.path);
  if (raw === undefined || raw === null || raw === '') return '—';
  if (Array.isArray(raw)) return String(raw.length);
  if (typeof raw === 'boolean') return raw ? '是' : '否';
  if (typeof raw === 'object') return JSON.stringify(raw);
  if (isTimestampColumn(col.label) && typeof raw === 'number') return formatTimestamp(raw);
  return String(raw);
}

function TableRow({ index, row, columns }: { index: number; row: any; columns: TableColumn[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={`hover:bg-black/5 dark:hover:bg-white/5 ${text}`}>
        <td className={`px-2 py-1.5 border-b tabular-nums dark:border-border-dark/40 light:border-border-light/40 ${muted}`}>
          {index + 1}
        </td>
        {columns.map(col => (
          <td
            key={col.path}
            className={`px-2 py-1.5 border-b dark:border-border-dark/40 light:border-border-light/40 ${col.align === 'right' ? 'text-right tabular-nums' : ''}`}
            title={cellText(col, row)}
          >
            <div className="max-w-[16rem] truncate">{cellText(col, row)}</div>
          </td>
        ))}
        <td className="px-2 py-1.5 border-b dark:border-border-dark/40 light:border-border-light/40">
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:opacity-80"
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {open ? '收起' : '展开'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td
            colSpan={columns.length + 2}
            className="px-2 pb-2 pt-1 border-b dark:border-border-dark/40 light:border-border-light/40"
          >
            <JsonBlock value={row} defaultOpen />
          </td>
        </tr>
      )}
    </>
  );
}

function TableView({ file }: { file: StorageFile }) {
  const columns = TABLE_COLUMNS[file.kind] ?? [];
  const rows = normalizeForTable(file.kind, file.value);

  if (columns.length === 0) {
    return <div className={`text-sm ${muted}`}>该文件暂未定义表格格式，请切换到「结构化」或「原始」查看。</div>;
  }
  if (rows.length === 0) {
    return <div className={`text-sm ${muted}`}>文件内容为空。</div>;
  }

  return (
    <div className="overflow-auto max-h-[60vh] rounded border dark:border-border-dark light:border-border-light">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10 dark:bg-card-dark light:bg-card-light">
          <tr className={`text-left ${muted}`}>
            <th className="px-2 py-1.5 font-medium border-b dark:border-border-dark light:border-border-light">#</th>
            {columns.map(col => (
              <th
                key={col.path}
                className={`px-2 py-1.5 font-medium border-b whitespace-nowrap dark:border-border-dark light:border-border-light ${col.align === 'right' ? 'text-right' : ''}`}
              >
                {col.label}
              </th>
            ))}
            <th className="px-2 py-1.5 font-medium border-b dark:border-border-dark light:border-border-light">详情</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <TableRow key={i} index={i} row={row} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RawView({ file }: { file: StorageFile }) {
  return (
    <pre className="rounded border p-2 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed font-mono dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light">
      {file.raw}
    </pre>
  );
}

/**
 * 按文件类型选择打开格式：
 * - 有表格列定义的数据集 → 表格（可展开单条详情）
 * - 结构化对象/标量 → 结构化折叠视图
 * 表格 / 结构化 / 原始 三种视图始终可切换。
 */
export default function StorageFileDetail({ file }: { file: StorageFile }) {
  const hasFlowView = file.kind === 'flow' && Array.isArray(file.value);
  const [tab, setTab] = useState<'auto' | 'structured' | 'raw' | 'flow'>(hasFlowView ? 'flow' : 'auto');
  const hasTable = (TABLE_COLUMNS[file.kind]?.length ?? 0) > 0;

  if (file.parseError) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-warning">该键不是合法 JSON，按原始文本展示。</div>
        <RawView file={file} />
      </div>
    );
  }

  if (file.kind === 'text') {
    return (
      <pre className="rounded border p-2 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light">
        {String(file.value ?? '')}
      </pre>
    );
  }

  // 纯量数组（如已隐藏特性列表）用逐行清单打开，比 JSON 更易读
  if (Array.isArray(file.value) && file.value.every(v => v === null || typeof v !== 'object')) {
    if (file.value.length === 0) {
      return <div className={`text-sm ${muted}`}>列表为空。</div>;
    }
    return (
      <ol className={`rounded border divide-y dark:border-border-dark light:border-border-light dark:divide-border-dark/40 light:divide-border-light/40 text-sm ${text}`}>
        {file.value.map((v, i) => (
          <li key={i} className="flex items-start gap-2 px-2 py-1.5">
            <span className={`text-xs tabular-nums w-6 text-right ${muted}`}>{i + 1}</span>
            <span className="break-all">{String(v)}</span>
          </li>
        ))}
      </ol>
    );
  }

  const tabs = [
    ...(hasFlowView ? ([{ id: 'flow', label: '流程视图' }] as const) : []),
    { id: 'auto', label: hasTable ? '表格' : '结构化' },
    { id: 'structured', label: '结构化' },
    { id: 'raw', label: '原始' },
  ] as const;

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded border overflow-hidden dark:border-border-dark light:border-border-light">
        {tabs.map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              tab === item.id ? 'bg-primary text-white' : `${text} hover:bg-black/5 dark:hover:bg-white/10`
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'flow' ? (
        <FlowFileView value={file.value} />
      ) : tab === 'raw' ? (
        <RawView file={file} />
      ) : tab === 'structured' ? (
        <JsonBlock value={file.value} label={file.label} defaultOpen />
      ) : hasTable ? (
        <TableView file={file} />
      ) : (
        <JsonBlock value={file.value} label={file.label} defaultOpen />
      )}
    </div>
  );
}
