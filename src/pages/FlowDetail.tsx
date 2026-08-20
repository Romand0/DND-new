import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, GitBranch, Edit2, Trash2, Zap, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { FlowSpellBindingManager } from '@/components/FlowSpellBindingManager';
import type { FlowDefinition } from '@/types/flow';

export default function FlowDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [flow, setFlow] = useState<FlowDefinition | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bindingTab, setBindingTab] = useState(false);

  // 从后端加载单条流程
  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const data = await apiFetch(`/flows/${id}`, { method: 'GET', headers });
      setFlow(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleDelete = async () => {
    if (!isDM || !id) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await apiFetch(`/flows/${id}`, { method: 'DELETE', headers });
      navigate('/flows');
    } catch (e: any) {
      setError(e.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  if (!flow) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/flows')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        <div className="text-center py-20">
          <p className="text-lg dark:text-text-dark-muted light:text-text-light-muted">{error || '未找到该流程'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部导航 + DM 操作 */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/flows')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light">
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </button>
        {isDM && (
          <div className="flex gap-2">
            <button onClick={() => navigate(`/flow-editor/${id}`)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark hover:bg-white/10 light:border-border-light light:text-text-light">
              <Edit2 className="w-4 h-4" /> 编辑
            </button>
            <button onClick={() => setDeleteConfirm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20">
              <Trash2 className="w-4 h-4" /> 删除
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">{error}</div>
      )}

      <div className="rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light overflow-hidden">
        <div className="px-6 py-5 border-b dark:border-border-dark light:border-border-light">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
                <GitBranch className="w-6 h-6 text-primary" /> {flow.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                  {flow.category || '自定义流程'}
                </span>
                <span className="dark:text-text-dark light:text-text-light">
                  版本 {flow.version || '1.0'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* 流程描述 */}
          <div>
            <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">描述</h3>
            <div className="p-4 rounded-lg dark:bg-white/5 light:bg-white/50 text-sm leading-relaxed dark:text-text-dark light:text-text-light">
              {flow.description || '暂无描述'}
            </div>
          </div>

          {/* 流程数据 */}
          {flow.data && (
            <div>
              <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">流程数据</h3>
              <div className="p-4 rounded-lg bg-accent/10 text-sm dark:text-text-dark light:text-text-light border border-accent/20">
                <pre className="whitespace-pre-wrap">{JSON.stringify(flow.data, null, 2)}</pre>
              </div>
            </div>
          )}

          {/* 发布信息 */}
          {flow.publishedAt && (
            <div>
              <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">发布信息</h3>
              <div className="p-4 rounded-lg bg-primary/10 text-sm dark:text-text-dark light:text-text-light border border-primary/20">
                <p>发布版本: {flow.publishedVersion}</p>
                <p>发布时间: {new Date(flow.publishedAt).toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* 绑定法术管理 */}
          {isDM && (
            <div className="border-t dark:border-border-dark light:border-border-light pt-6">
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
                <div className="mt-4">
                  <FlowSpellBindingManager
                    flowId={flow.id}
                    flowName={flow.name}
                    onBindingChange={() => load()}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
              <button onClick={() => setDeleteConfirm(false)} disabled={saving}
                className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 disabled:opacity-50">
                取消
              </button>
              <button onClick={handleDelete} disabled={saving}
                className="px-4 py-2 bg-danger hover:bg-danger/80 text-white rounded-lg disabled:opacity-50">
                {saving ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}