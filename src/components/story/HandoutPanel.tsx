// 道具投送面板：DM 创建信件/地图/告示，选择单个/多个玩家或全团，查看已读人数并撤回零已读道具。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react';
import type { CampaignMember } from '@/types/campaign';
import type { HandoutKind, StoryHandout } from '@/types/story';
import { fetchCampaignMembers } from '@/lib/api';
import { getCampaignId } from '@/data/campaignScope';
import {
  createStoryHandout,
  fetchStoryHandouts,
  recallStoryHandout,
} from '@/lib/storyApi';

interface Props {
  sceneId?: string;
}

const inputCls = 'w-full px-2 py-1.5 rounded-lg bg-black/20 border border-border-dark text-sm dark:text-text-dark light:text-text-light focus:border-primary outline-none';
const labelCls = 'block text-xs text-gray-400 mb-1';
const btnCls = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-border-dark hover:border-primary/60 hover:text-primary transition-colors disabled:opacity-40';

const KIND_LABEL: Record<HandoutKind, string> = {
  letter: '信件',
  map: '地图',
  notice: '告示',
  other: '其他',
};

function fmtTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HandoutPanel({ sceneId }: Props) {
  const campaignId = getCampaignId();
  const [handouts, setHandouts] = useState<StoryHandout[]>([]);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [kind, setKind] = useState<HandoutKind>('letter');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [wholeGroup, setWholeGroup] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [hs, ms] = await Promise.all([
        fetchStoryHandouts(),
        fetchCampaignMembers<CampaignMember[]>(campaignId).catch(() => [] as CampaignMember[]),
      ]);
      setHandouts(Array.isArray(hs) ? hs : []);
      setMembers(Array.isArray(ms) ? ms : []);
    } catch (e: any) {
      setError(e.message || '道具加载失败');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const memberName = useMemo(() => {
    const map = new Map(members.map(m => [m.userId, m.username]));
    return (id: string) => map.get(id) ?? '未知玩家';
  }, [members]);

  function togglePick(userId: string) {
    setPicked(prev => (prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]));
  }

  async function handleSend() {
    setError('');
    setNotice('');
    if (!title.trim()) {
      setError('请填写道具标题');
      return;
    }
    if (!body.trim() && !imageUrl.trim()) {
      setError('正文与图片至少填写一项');
      return;
    }
    if (!wholeGroup && picked.length === 0) {
      setError('请选择至少一名目标玩家');
      return;
    }
    setSending(true);
    try {
      await createStoryHandout({
        kind,
        title: title.trim(),
        body,
        imageUrl: imageUrl.trim() || undefined,
        sceneId,
        targetUserIds: wholeGroup ? [] : picked,
      });
      setTitle('');
      setBody('');
      setImageUrl('');
      setPicked([]);
      setWholeGroup(true);
      setShowComposer(false);
      setNotice('道具已投送');
      await reload();
    } catch (e: any) {
      setError(e.message || '投送失败');
    } finally {
      setSending(false);
    }
  }

  async function handleRecall(id: string) {
    setError('');
    setNotice('');
    try {
      await recallStoryHandout(id);
      setNotice('道具已撤回');
      await reload();
    } catch (e: any) {
      setError(e.message || '撤回失败');
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1 text-xs font-semibold text-primary">
          <Package className="w-3.5 h-3.5" /> 道具投送
        </h4>
        <div className="flex items-center gap-1">
          <button className={btnCls} onClick={() => void reload()} disabled={loading} title="刷新">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button className={btnCls} onClick={() => setShowComposer(v => !v)}>
            {showComposer ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showComposer ? '收起' : '新建'}
          </button>
        </div>
      </div>

      {error && <p className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">{error}</p>}
      {notice && <p className="rounded border border-green-500/40 bg-green-500/10 px-2 py-1 text-[11px] text-green-300">{notice}</p>}

      {showComposer && (
        <div className="space-y-2 rounded-lg border border-border-dark bg-black/10 p-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>类别</label>
              <select className={inputCls} value={kind} onChange={e => setKind(e.target.value as HandoutKind)}>
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>标题</label>
              <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：染血的密信" />
            </div>
          </div>
          <div>
            <label className={labelCls}>正文</label>
            <textarea className={`${inputCls} min-h-20`} value={body} onChange={e => setBody(e.target.value)} placeholder="交给玩家阅读的内容" />
          </div>
          <div>
            <label className={labelCls}>图片链接（可选）</label>
            <input className={inputCls} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={wholeGroup} onChange={e => setWholeGroup(e.target.checked)} />
              全团可见
            </label>
            {!wholeGroup && (
              <div className="max-h-28 space-y-1 overflow-y-auto rounded border border-border-dark p-1.5">
                {members.map(m => (
                  <label key={m.userId} className="flex items-center gap-2 text-[11px] text-gray-300">
                    <input type="checkbox" checked={picked.includes(m.userId)} onChange={() => togglePick(m.userId)} />
                    <span className="truncate">{m.username}</span>
                    {m.role === 'dm' && <span className="text-[10px] text-primary">DM</span>}
                  </label>
                ))}
                {members.length === 0 && <p className="text-[11px] text-gray-500">暂无成员</p>}
              </div>
            )}
          </div>
          <button
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary/20 px-2 py-1.5 text-xs text-primary hover:bg-primary/30 disabled:opacity-40"
            onClick={() => void handleSend()}
            disabled={sending}
          >
            <Send className="w-3.5 h-3.5" /> {sending ? '投送中' : '投送'}
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {handouts.map(h => {
          const targetCount = h.targetUserIds.length === 0 ? members.length : h.targetUserIds.length;
          const targetText = h.targetUserIds.length === 0
            ? '全团'
            : h.targetUserIds.map(memberName).join('、');
          return (
            <div key={h.id} className={`rounded-lg border p-2 ${h.recalledAt ? 'border-border-dark/60 opacity-60' : 'border-border-dark'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium dark:text-text-dark light:text-text-light">
                    <span className="mr-1 text-[10px] text-primary">{KIND_LABEL[h.kind]}</span>
                    {h.title}
                  </p>
                  <p className="truncate text-[10px] text-gray-500">
                    {targetText} · 已读 {h.readCount ?? 0}/{targetCount} · {fmtTime(h.createdAt)}
                  </p>
                </div>
                {!h.recalledAt && (h.readCount ?? 0) === 0 && (
                  <button className="shrink-0 text-gray-500 hover:text-red-400" onClick={() => void handleRecall(h.id)} title="撤回">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {h.recalledAt && <p className="mt-1 text-[10px] text-yellow-400/80">已撤回</p>}
            </div>
          );
        })}
        {handouts.length === 0 && <p className="text-xs text-gray-500">尚未投送道具</p>}
      </div>
    </div>
  );
}
