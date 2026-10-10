import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, GitBranch, Edit2, Trash2, Zap, ListTree, Network,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import flowStore from '@/data/flowStore';
import { FlowSpellBindingManager } from '@/components/FlowSpellBindingManager';
import FlowGraphView from '@/components/flow-editor/presentation/canvas/FlowGraphView';
import FlowStructureOutline from '@/components/flow-editor/presentation/FlowStructureOutline';
import type { FlowDefinition } from '@/types/flow';
import { FLOW_CATEGORIES } from '@/types/flow';

type ViewTab = 'graph' | 'outline';

function categoryLabel(category?: string): string {
  if (!category) return '自定义流程';
  return FLOW_CATEGORIES.find(c => c.value === category)?.label ?? '自定义流程';
}

export default function FlowView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();

  const [flow, setFlow] = useState<FlowDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bindingTab, setBindingTab] = useState(false);
  const [tab, setTab] = useState<ViewTab>('graph');

  const load = useCallback(async () => {
    if (!id) return;
    const local = flowStore.getById(id);
    if (local) {
      setFlow(local);
      setLoading(false);
      return;
    }
    try {
      await flowStore.fetchRemote();
      setFlow(flowStore.getById(id) ?? null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setError('');
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    return flowStore.subscribe(() => {
      const latest = flowStore.getById(id);
      if (latest) setFlow(latest);
    });
  }, [id]);

  const handleDelete = () => {
    if (!isDM || !id) return;
    setSaving(true);
    flowStore.delete(id);
    navigate('/flows');
  };

  if (loading) {
    return <div className="p-8 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">加载中...</div>;
  }

  if (!flow) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/flows')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
        >
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        <div className="text-center py-20">
          <p className="text-lg dark:text-text-dark-muted light:text-text-light-muted">
            {error || '未找到该流程'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部导航 + DM 操作 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/flows')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
        >
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        {isDM && (
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/flow-editor/${id}`)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark hover:bg-white/10 light:border-border-light light:text-text-light"
            >
              <Edit2 className="w-4 h-4" /> 编辑
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 rounded-lg"
            >
              <Trash2 className="w-4 h-4" /> 删除
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">{error}</div>
      )}

      <div className="rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light overflow-hidden">
        {/* 头部信息 */}
        <div className="px-6 py-5 border-b dark:border-border-dark light:border-border-light">
          <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <GitBranch className="w-6 h-6 text-primary" /> {flow.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
              {categoryLabel(flow.category)}
            </span>
            <span className="dark:text-text-dark-muted light:text-text-light-muted">
              {flow.nodes.length} 节点 · {flow.edges.length} 连线
            </span>
            {flow.publishedVersion && flow.publishedVersion > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                已发布 v{flow.publishedVersion}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium dark:bg-white/10 light:bg-gray-100 dark:text-text-dark-muted light:text-text-light-muted">
                草稿
              </span>
            )}
          </div>
          {flow.description && (
            <p className="mt-3 text-sm leading-relaxed dark:text-text-dark light:text-text-light">
              {flow.description}
            </p>
          )}
        </div>

        {/* 视图切换 */}
        <div className="px-6 pt-4">
          <div className="inline-flex rounded-lg border overflow-hidden dark:border-border-dark light:border-border-light">
            <button
              onClick={() => setTab('graph')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'graph'
                  ? 'bg-primary text-white'
                  : 'dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <Network className="w-4 h-4" /> 结构图
            </button>
            <button
              onClick={() => setTab('outline')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === 'outline'
                  ? 'bg-primary text-white'
                  : 'dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <ListTree className="w-4 h-4" /> 结构大纲
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {tab === 'graph' ? (
            <FlowGraphView flow={flow} />
          ) : (
            <div className="rounded-xl border p-5 dark:border-border-dark light:border-border-light">
              <FlowStructureOutline flow={flow} />
            </div>
          )}
        </div>
      </div>

      {/* 法术绑定管理（DM） */}
      {isDM && (
        <div className="rounded-xl border p-6 dark:border-border-dark light:border-border-light">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 dark:text-text-dark light:text-text-light">
              <Zap className="w-5 h-5 text-primary" />
              法术绑定管理
            </h3>
            <button
              onClick={() => setBindingTab(!bindingTab)}
              className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
            >
              {bindingTab ? '隐藏' : '显示'}
            </button>
          </div>
          {bindingTab && (
            <FlowSpellBindingManager
              flowId={flow.id}
              flowName={flow.name}
              status={flow.status}
              onBindingChange={load}
            />
          )}
        </div>
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm rounded-xl border p-6 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">确认删除</h3>
            <p className="text-sm mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要删除流程「{flow.name}」吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2 bg-danger hover:bg-danger/80 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
