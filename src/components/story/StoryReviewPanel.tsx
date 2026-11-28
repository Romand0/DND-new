// 战役回顾：按场次/游戏日期/角色/类别筛选账本时间线，并导出 Markdown。
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, RefreshCw, X } from 'lucide-react';
import type { Character } from '@/types/character';
import type { LedgerSourceKind, StoryTimelineEntry } from '@/types/story';
import { fetchStoryTimeline } from '@/lib/storyApi';
import {
  SOURCE_KIND_LABEL,
  buildStoryReviewMarkdown,
  downloadStoryReview,
  filterStoryTimeline,
  type StoryReviewFilters,
} from '@/lib/storyReview';

interface Props {
  characters: Character[];
  onClose: () => void;
}

const inputCls = 'w-full px-2 py-1.5 rounded-lg bg-black/20 border border-border-dark text-sm dark:text-text-dark light:text-text-light focus:border-primary outline-none';
const labelCls = 'block text-xs text-gray-400 mb-1';
const btnCls = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-border-dark hover:border-primary/60 hover:text-primary transition-colors disabled:opacity-40';

function fmtTimestamp(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtGameTime(entry: StoryTimelineEntry): string {
  const parts: string[] = [];
  if (entry.gameDate) {
    const minute = entry.gameMinute ?? 0;
    parts.push(`${entry.gameDate} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  }
  if (entry.sessionNo !== undefined) parts.push(`第 ${entry.sessionNo} 场`);
  return parts.join(' · ');
}

export default function StoryReviewPanel({ characters, onClose }: Props) {
  const [entries, setEntries] = useState<StoryTimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [sourceKind, setSourceKind] = useState<LedgerSourceKind | ''>('');

  const characterNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of characters) map[c.id] = c.name;
    return map;
  }, [characters]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetchStoryTimeline();
      setEntries(Array.isArray(res?.entries) ? res.entries : []);
    } catch (e: any) {
      setError(e?.message || '回顾加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const sessions = useMemo(() => {
    const values = new Set<number>();
    for (const entry of entries) {
      if (entry.sessionNo !== undefined) values.add(entry.sessionNo);
    }
    return Array.from(values).sort((a, b) => a - b);
  }, [entries]);

  const filters = useMemo<StoryReviewFilters>(() => ({
    ...(session ? { sessionNo: Number(session) } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(characterId ? { characterId } : {}),
    ...(sourceKind ? { sourceKind } : {}),
  }), [session, dateFrom, dateTo, characterId, sourceKind]);

  const filtered = useMemo(() => filterStoryTimeline(entries, filters), [entries, filters]);

  function resetFilters() {
    setSession('');
    setDateFrom('');
    setDateTo('');
    setCharacterId('');
    setSourceKind('');
  }

  function handleExport() {
    const md = buildStoryReviewMarkdown(filtered, characterNames, filters);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadStoryReview(md, `story-review-${stamp}.md`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div
        className="my-4 w-full max-w-5xl space-y-3 rounded-xl border border-border-dark bg-bg-dark p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold dark:text-text-dark light:text-text-light">战役经济回顾</h2>
            <p className="text-[11px] text-gray-500">{filtered.length} / {entries.length} 条事件</p>
          </div>
          <div className="flex items-center gap-2">
            <button className={btnCls} onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
            </button>
            <button className={btnCls} onClick={handleExport} disabled={loading || filtered.length === 0}>
              <Download className="w-3.5 h-3.5" /> 导出 Markdown
            </button>
            <button onClick={onClose} title="关闭"><X className="w-5 h-5 text-gray-400" /></button>
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4" /> {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div>
            <label className={labelCls}>场次</label>
            <select className={inputCls} value={session} onChange={e => setSession(e.target.value)}>
              <option value="">全部场次</option>
              {sessions.map(n => <option key={n} value={n}>第 {n} 场</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>游戏日期起</label>
            <input type="date" className={inputCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>游戏日期止</label>
            <input type="date" className={inputCls} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>角色</label>
            <select className={inputCls} value={characterId} onChange={e => setCharacterId(e.target.value)}>
              <option value="">全部角色</option>
              {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>类别</label>
            <select className={inputCls} value={sourceKind} onChange={e => setSourceKind(e.target.value as LedgerSourceKind | '')}>
              <option value="">全部类别</option>
              {(Object.keys(SOURCE_KIND_LABEL) as LedgerSourceKind[]).map(k => (
                <option key={k} value={k}>{SOURCE_KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <button className={btnCls} onClick={resetFilters}>重置筛选</button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
          {filtered.map(entry => (
            <div key={entry.linkId} className={`rounded-lg border p-2 ${entry.invalid ? 'border-red-500/40' : 'border-border-dark'}`}>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1 text-[10px] text-primary">
                  {SOURCE_KIND_LABEL[entry.sourceKind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-xs ${entry.invalid ? 'text-red-400' : 'dark:text-text-dark light:text-text-light'}`}>
                    {entry.title}
                    {entry.invalid && '（失效引用）'}
                  </p>
                  {entry.amountText && <p className="truncate text-[11px] text-gray-400">{entry.amountText}</p>}
                  {entry.note && <p className="truncate text-[11px] text-gray-500">{entry.note}</p>}
                  <p className="text-[10px] text-gray-500">
                    {entry.sceneTitle} · {entry.chapterTitle}
                    {fmtGameTime(entry) ? ` · ${fmtGameTime(entry)}` : ''}
                    {entry.characterId ? ` · ${characterNames[entry.characterId] || '未知角色'}` : ''}
                    {' · '}{fmtTimestamp(entry.occurredAt)}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && <p className="py-8 text-center text-sm text-gray-500">没有符合筛选条件的事件</p>}
        </div>
      </div>
    </div>
  );
}
