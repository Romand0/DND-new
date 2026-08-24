import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, GitBranch, Trash2, Edit3, Search, Download, Upload, Zap, CloudUpload, CloudDownload, CloudOff, Zap as ZapIcon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import flowStore from '@/data/flowStore';
import type { FlowDefinition } from '@/types/flow';

export default function FlowList() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [flows, setFlows] = useState<FlowDefinition[]>([]);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 订阅 store
  useEffect(() => {
    const load = () => setFlows(flowStore.getAll());
    load();
    flowStore.fetchRemote();
    return flowStore.subscribe(load);
  }, []);

  const filtered = flows.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.tags || []).some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCreate = () => {
    const f = flowStore.create('');
    navigate(`/flow-editor/${f.id}`);
  };

  const handleDelete = () => {
    if (deleteId) {
      flowStore.delete(deleteId);
      setDeleteId(null);
    }
  };

  const handleExport = (flow: FlowDefinition) => {
    const blob = new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flow.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const json = e.target?.result as string;
      const imported = flowStore.import(json);
      if (!imported) {
        alert('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);
  };

  const handlePublish = async (flow: FlowDefinition) => {
    try {
      await flowStore.publish(flow.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '发布失败');
    }
  };

  const handlePullRemote = async (flow: FlowDefinition) => {
    const remote = await flowStore.pullRemote(flow.id);
    if (!remote) alert('拉取失败：正式版不存在');
  };

  const handleUnpublish = async (flow: FlowDefinition) => {
    if (confirm(`确定要撤下"${flow.name}"吗？撤下后将变为草稿状态。`)) {
      try {
        await flowStore.unpublish(flow.id);
        alert('流程已成功撤下并转为草稿状态');
      } catch (err) {
        alert(err instanceof Error ? err.message : '撤下失败');
      }
    }
  };

  const formatDate = (ts?: number) =>
    ts ? new Date(ts).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 顶栏 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">流程库</h1>
        <button
          onClick={handleCreate}
          className="ml-auto px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新建流程
        </button>
      </div>

      {/* 搜索 + 导入 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索流程名称、描述或标签..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
          />
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/5 flex items-center gap-1.5"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">导入</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 dark:text-text-dark-muted light:text-text-light-muted">
          <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{flows.length === 0 ? '暂无流程，点击上方按钮新建' : '没有匹配的流程'}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(f => (
            <div
              key={f.id}
              className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold dark:text-text-dark light:text-text-light truncate">
                      {f.name || '未命名流程'}
                    </h3>
                    {(() => {
                      if (!f.publishedVersion || f.publishedVersion === 0) {
                        return (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] dark:bg-white/10 light:bg-gray-100 dark:text-text-dark-muted light:text-text-light-muted">
                            草稿
                          </span>
                        );
                      }
                      return (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] bg-green-500/10 text-green-500">
                          已发布 v{f.publishedVersion}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1 flex flex-wrap items-center gap-x-2">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />{f.nodes.length} 节点
                    </span>
                    <span>·</span>
                    <span>{f.edges.length} 连线</span>
                    {f.tags && f.tags.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{f.tags.join(', ')}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => handlePublish(f)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      title="发布为正式版"
                    >
                      <CloudUpload className="w-3 h-3" />
                      发布
                    </button>
                    <button
                      onClick={() => handlePullRemote(f)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
                      title="用正式版覆盖本地草稿"
                    >
                      <CloudDownload className="w-3 h-3" />
                      拉取正式版
                    </button>
                    <button
                      onClick={() => handleUnpublish(f)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-red-400 hover:bg-red-400/10 transition-colors"
                      title="从正式库撤下"
                    >
                      <CloudOff className="w-3 h-3" />
                      撤下
                    </button>
                  </div>
                  {f.description && (
                    <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1 truncate">
                      {f.description}
                    </p>
                  )}
                  <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mt-1">
                    更新于 {formatDate(f.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleExport(f)}
                    className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light transition-colors"
                    title="导出"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/flow-editor/${f.id}`)}
                    className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/flow-editor/${f.id}`)}
                    className="p-2 rounded-lg hover:bg-accent/10 text-accent transition-colors"
                    title="查看详情"
                  >
                    <ZapIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteId(f.id)}
                    className="p-2 rounded-lg hover:bg-red-400/10 text-red-400 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="dark:bg-card-dark light:bg-card-light rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-bold dark:text-text-dark light:text-text-light mb-2">确认删除</h3>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              删除后无法恢复，是否继续？
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 rounded-lg border dark:border-border-dark light:border-border-light text-sm"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
