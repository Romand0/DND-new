// 玩家端角色卡页 - 只读渲染正式卡 + 变更请求回路（编辑草稿 / 提交 / 状态跟踪）
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { RefreshCw, AlertCircle, ArrowLeft, Pencil, Clock, CheckCircle2, XCircle, Undo2, Send } from 'lucide-react';
import type { Character } from '@/types/character';
import type { ChangeRequest } from '@/types/changeRequest';
import { fetchAllCharacters, fetchChangeRequests, withdrawChangeRequest } from '@/lib/api';
import { normalizeCharacter } from '@/data/characterStore';
import CharacterDetail from '@/pages/CharacterDetail';

const STATUS_META: Record<ChangeRequest['status'], { label: string; icon: typeof Clock; cls: string }> = {
  pending: { label: '待 DM 审批', icon: Clock, cls: 'text-amber-400' },
  approved: { label: '已批准入库', icon: CheckCircle2, cls: 'text-green-400' },
  rejected: { label: '已驳回', icon: XCircle, cls: 'text-danger' },
  withdrawn: { label: '已撤回', icon: Undo2, cls: 'dark:text-text-dark-muted light:text-text-light-muted' },
};

export default function PlayerView() {
  const { playerId } = useParams<{ playerId: string }>();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 编辑态：CharacterDetail 以 draftMode 挂载（store 写入走草稿会话）
  const [editing, setEditing] = useState(false);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);

  const loadCharacter = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    try {
      const all = await fetchAllCharacters<Character[]>();
      const found =
        (all || []).find(
          (c: any) =>
            c.id === playerId && !c.isSandbox && !String(c.name || '').startsWith('试验体·'),
        ) || null;
      if (!found) {
        setError('角色不存在或已被删除');
        setCharacter(null);
      } else {
        setCharacter(normalizeCharacter(found));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setCharacter(null);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  const loadRequests = useCallback(async () => {
    try {
      const list = await fetchChangeRequests<ChangeRequest[]>(true);
      setRequests(Array.isArray(list) ? list.filter((r) => r.characterId === playerId) : []);
    } catch {
      // 离线/云端不可用时静默：请求状态区块显示为空
      setRequests([]);
    }
  }, [playerId]);

  useEffect(() => {
    if (editing) return; // 编辑态不刷新正式卡（避免覆盖草稿基准）
    loadCharacter();
    loadRequests();
  }, [editing, loadCharacter, loadRequests]);

  const handleWithdraw = async (id: string) => {
    if (!window.confirm('撤回这条待审请求？')) return;
    try {
      await withdrawChangeRequest(id);
      await loadRequests();
    } catch (e) {
      alert(`撤回失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 dark:text-text-dark-muted light:text-text-light-muted">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>正在加载角色卡…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="flex items-center justify-center">
          <AlertCircle className="w-12 h-12 text-danger" />
        </div>
        <h2 className="text-xl font-bold dark:text-text-dark light:text-text-light">加载失败</h2>
        <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">{error}</p>
        <button
          onClick={loadCharacter}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          重试
        </button>
        <div>
          <Link to="/" className="text-sm text-primary hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const pendingReq = requests.find((r) => r.status === 'pending');
  const decidedReqs = requests.filter((r) => r.status !== 'pending').slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="p-2 rounded-lg border transition-colors dark:border-border-dark dark:text-white dark:hover:bg-card-dark-hover light:border-border-light light:text-white light:hover:bg-card-light-hover"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadCharacter(); loadRequests(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:bg-card-dark-hover light:border-border-light light:text-text-light-muted light:hover:bg-card-light-hover"
          >
            <RefreshCw className="w-4 h-4" />
            刷新数据
          </button>
          {!editing && character && (
            <button
              onClick={() => setEditing(true)}
              disabled={!!pendingReq}
              title={pendingReq ? '已有待审请求，等待 DM 审批或先撤回' : '进入草稿编辑，提交后由 DM 审批入库'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Pencil className="w-4 h-4" />
              {pendingReq ? '审批中' : '编辑角色卡'}
            </button>
          )}
        </div>
      </div>

      {/* 我的变更请求状态区块 */}
      {!editing && requests.length > 0 && (
        <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-3 space-y-2">
          <div className="text-sm font-medium dark:text-text-dark light:text-text-light">我的变更请求</div>
          {pendingReq && (
            <div className="flex items-center gap-2 text-xs rounded-lg bg-amber-500/10 px-2.5 py-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-amber-400 flex-1">
                待 DM 审批（提交于 {new Date(pendingReq.createdAt).toLocaleString('zh-CN')}）
                {pendingReq.note ? `：${pendingReq.note}` : ''}
              </span>
              <button
                onClick={() => handleWithdraw(pendingReq.id)}
                className="px-2 py-0.5 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/20 shrink-0"
              >
                撤回
              </button>
            </div>
          )}
          {decidedReqs.map((r) => {
            const meta = STATUS_META[r.status];
            const Icon = meta.icon;
            return (
              <div key={r.id} className="flex items-center gap-2 text-xs rounded-lg bg-black/5 dark:bg-white/5 px-2.5 py-2">
                <Icon className={`w-4 h-4 shrink-0 ${meta.cls}`} />
                <span className={`${meta.cls} shrink-0`}>{meta.label}</span>
                <span className="dark:text-text-dark-muted light:text-text-light-muted truncate flex-1">
                  {new Date(r.reviewedAt ?? r.createdAt).toLocaleString('zh-CN')}
                  {r.status === 'rejected' && r.reviewNote ? `：${r.reviewNote}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {character && editing && (
        <CharacterDetail
          draftMode
          externalCharacter={character}
          onExitDraft={() => setEditing(false)}
        />
      )}
      {character && !editing && <CharacterDetail readOnly externalCharacter={character} />}
    </div>
  );
}
