import { useCallback, useMemo, useState } from 'react';
import {
  ChevronRight,
  Copy,
  Database,
  Download,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import StorageFileDetail from '@/components/local-storage/StorageFileDetail';
import {
  STORAGE_FOLDERS,
  KIND_LABELS,
  readStorageFiles,
  formatBytes,
  countUnit,
  type StorageFile,
  type StorageFolderId,
} from '@/utils/localStorageFiles';

const muted = 'dark:text-text-dark-muted light:text-text-light-muted';
const text = 'dark:text-text-dark light:text-text-light';
const card = 'rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light';

type FolderFilter = StorageFolderId | 'all';

export default function LocalStorageManager() {
  const [files, setFiles] = useState<StorageFile[]>(() => readStorageFiles());
  const [folder, setFolder] = useState<FolderFilter>('all');
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setFiles(readStorageFiles());
    setOpenKey(prev => (prev && localStorage.getItem(prev) !== null ? prev : null));
  }, []);

  const notify = (msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 2500);
  };

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const folderStats = useMemo(() => {
    const map = new Map<StorageFolderId, { count: number; size: number }>();
    for (const def of STORAGE_FOLDERS) map.set(def.id, { count: 0, size: 0 });
    for (const f of files) {
      const cur = map.get(f.folderId) ?? { count: 0, size: 0 };
      map.set(f.folderId, { count: cur.count + 1, size: cur.size + f.size });
    }
    return map;
  }, [files]);

  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter(f => {
      if (folder !== 'all' && f.folderId !== folder) return false;
      if (!q) return true;
      return (
        f.key.toLowerCase().includes(q) ||
        f.label.toLowerCase().includes(q) ||
        KIND_LABELS[f.kind].toLowerCase().includes(q)
      );
    });
  }, [files, folder, query]);

  const openedFile = useMemo(
    () => files.find(f => f.key === openKey) ?? null,
    [files, openKey]
  );

  const copyRaw = async (file: StorageFile) => {
    try {
      await navigator.clipboard.writeText(file.raw);
      notify(`已复制 ${file.key}`);
    } catch {
      notify('剪贴板不可用');
    }
  };

  const downloadJson = (file: StorageFile) => {
    const blob = new Blob([file.raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.key.replace(/[^\w.-]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeKey = (file: StorageFile) => {
    if (!confirm(`确定删除 ${file.key} 吗？此操作不可恢复。`)) return;
    try {
      localStorage.removeItem(file.key);
      if (openKey === file.key) setOpenKey(null);
      refresh();
      notify(`已删除 ${file.key}`);
    } catch {
      notify('删除失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold flex items-center gap-2 ${text}`}>
            <Database className="w-6 h-6 text-primary" />
            LocalStorage 缓存管理
          </h1>
          <p className={`mt-1 text-sm ${muted}`}>
            共 {files.length} 个缓存文件 · {formatBytes(totalSize)} · 按目录浏览，点击文件用对应格式打开
          </p>
        </div>
        <button
          onClick={refresh}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${text} dark:border-border-dark light:border-border-light hover:bg-black/5 dark:hover:bg-white/10`}
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {message && (
        <div className="px-3 py-2 rounded-lg text-sm bg-success/10 text-success border border-success/30">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4">
        {/* 目录树 */}
        <aside className={`${card} p-2 h-fit`}>
          <button
            onClick={() => setFolder('all')}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
              folder === 'all' ? 'bg-primary/15 text-primary' : `${text} hover:bg-black/5 dark:hover:bg-white/10`
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span className="flex-1 text-left">全部文件</span>
            <span className={`text-xs tabular-nums ${muted}`}>{files.length}</span>
          </button>
          <div className="my-1 border-t dark:border-border-dark light:border-border-light" />
          {STORAGE_FOLDERS.map(def => {
            const stat = folderStats.get(def.id) ?? { count: 0, size: 0 };
            const active = folder === def.id;
            return (
              <button
                key={def.id}
                onClick={() => setFolder(def.id)}
                disabled={stat.count === 0}
                title={def.description}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-primary/15 text-primary'
                    : stat.count === 0
                      ? `${muted} opacity-50 cursor-default`
                      : `${text} hover:bg-black/5 dark:hover:bg-white/10`
                }`}
              >
                <Folder className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left truncate">{def.label}</span>
                <span className={`text-xs tabular-nums ${muted}`}>{stat.count}</span>
              </button>
            );
          })}
        </aside>

        {/* 文件列表 */}
        <section className={`${card} p-4 space-y-3 min-w-0`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[12rem]">
              <Search className={`w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 ${muted}`} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="按键名 / 名称 / 类型筛选"
                className={`w-full pl-8 pr-2 py-1.5 rounded-lg border bg-transparent text-sm outline-none ${text} dark:border-border-dark light:border-border-light`}
              />
            </div>
            <span className={`text-xs ${muted}`}>{visibleFiles.length} 项</span>
          </div>

          {visibleFiles.length === 0 ? (
            <div className={`py-12 text-center text-sm ${muted}`}>该目录下没有缓存文件</div>
          ) : (
            <ul className="divide-y dark:divide-border-dark/40 light:divide-border-light/40">
              {visibleFiles.map(file => (
                <li key={file.key} className="py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOpenKey(file.key)}
                      className={`flex-1 min-w-0 flex items-center gap-2 text-left group`}
                    >
                      <ChevronRight className={`w-4 h-4 flex-shrink-0 ${muted} group-hover:text-primary`} />
                      <div className="min-w-0">
                        <div className={`text-sm font-medium truncate ${text}`}>
                          {file.label}
                          <span className={`ml-2 text-xs font-normal ${muted}`}>{KIND_LABELS[file.kind]}</span>
                        </div>
                        <div className={`text-xs font-mono truncate ${muted}`}>
                          {file.key}
                          {file.campaignId && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/10 text-primary font-sans">
                              团组 {file.campaignId}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className={`flex items-center gap-2 text-xs whitespace-nowrap ${muted}`}>
                      <span className="tabular-nums">{formatBytes(file.size)}</span>
                      {countUnit(file.kind) && (
                        <span className="tabular-nums">{file.itemCount} {countUnit(file.kind)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => copyRaw(file)}
                        title="复制原始 JSON"
                        className={`p-1.5 rounded ${muted} hover:bg-black/5 dark:hover:bg-white/10`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => downloadJson(file)}
                        title="下载为文件"
                        className={`p-1.5 rounded ${muted} hover:bg-black/5 dark:hover:bg-white/10`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeKey(file)}
                        title="删除该键"
                        className={`p-1.5 rounded ${muted} hover:bg-danger/10 hover:text-danger`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 文件详情 */}
      {openedFile && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setOpenKey(null)}>
          <div
            className={`w-full max-w-5xl my-8 rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-4 border-b dark:border-border-dark light:border-border-light">
              <div className="min-w-0">
                <h2 className={`text-lg font-semibold flex items-center gap-2 ${text}`}>
                  {openedFile.label}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary`}>
                    {KIND_LABELS[openedFile.kind]}
                  </span>
                </h2>
                <p className={`mt-1 text-xs font-mono break-all ${muted}`}>{openedFile.key}</p>
                <p className={`mt-0.5 text-xs ${muted}`}>
                  {formatBytes(openedFile.size)}
                  {countUnit(openedFile.kind) ? ` · ${openedFile.itemCount} ${countUnit(openedFile.kind)}` : ''}
                  {openedFile.campaignId ? ` · 团组 ${openedFile.campaignId}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copyRaw(openedFile)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${text} dark:border-border-dark light:border-border-light hover:bg-black/5 dark:hover:bg-white/10`}
                >
                  <Copy className="w-3.5 h-3.5" /> 复制
                </button>
                <button
                  onClick={() => downloadJson(openedFile)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${text} dark:border-border-dark light:border-border-light hover:bg-black/5 dark:hover:bg-white/10`}
                >
                  <Download className="w-3.5 h-3.5" /> 下载
                </button>
                <button
                  onClick={() => setOpenKey(null)}
                  className={`p-1.5 rounded-lg ${muted} hover:bg-black/5 dark:hover:bg-white/10`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <StorageFileDetail key={openedFile.key} file={openedFile} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
