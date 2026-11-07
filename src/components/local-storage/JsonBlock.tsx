import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';

interface JsonBlockProps {
  value: any;
  label?: string;
  defaultOpen?: boolean;
}

/**
 * 结构化值展示：对象/数组折叠成可展开的 JSON 片段，字符串按纯文本换行展示。
 * 供文件详情与原始视图共用。
 */
export default function JsonBlock({ value, label, defaultOpen = false }: JsonBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const isStructured = value !== null && typeof value === 'object';
  const text = isStructured ? JSON.stringify(value, null, 2) : String(value ?? '—');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // 剪贴板不可用时静默失败
    }
  };

  if (!isStructured) {
    return (
      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-mono dark:text-text-dark light:text-text-light">
        {text}
      </pre>
    );
  }

  const summary = Array.isArray(value) ? `数组 · ${value.length} 项` : `对象 · ${Object.keys(value).length} 字段`;

  return (
    <div className="rounded border dark:border-border-dark light:border-border-light">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs font-medium dark:text-text-dark light:text-text-light hover:opacity-80"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {label ?? '结构'}
          <span className="font-normal dark:text-text-dark-muted light:text-text-light-muted">（{summary}）</span>
        </button>
        <button
          onClick={copy}
          title="复制 JSON"
          className="p-1 rounded dark:text-text-dark-muted light:text-text-light-muted hover:bg-black/5 dark:hover:bg-white/10"
        >
          {copied ? <span className="text-[10px] text-success">已复制</span> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      {open && (
        <pre className="px-2 pb-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed font-mono dark:text-text-dark light:text-text-light">
          {text}
        </pre>
      )}
    </div>
  );
}
