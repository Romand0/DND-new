// 场景账本：条目时间线、汇总、从最近经济记录挂载
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Package, Sparkles, TrendingUp, Plus, Trash2, RefreshCw } from 'lucide-react';
import type { LedgerEntryView, LedgerSummary, LedgerSourceKind } from '@/types/story';
import {
  fetchStoryLedger,
  fetchStoryCandidates,
  createStoryLedgerLink,
  deleteStoryLedgerLink,
  type StoryCandidate,
} from '@/lib/storyApi';

interface Props {
  sceneId: string;
}

const KIND_LABEL: Record<LedgerSourceKind, string> = {
  check: '检定',
  item: '物资',
  treasure: '宝藏',
  spell: '施法',
  growth: '成长',
};

const EMPTY_SUMMARY: LedgerSummary = {
  itemCount: 0,
  currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  experience: 0,
  spellSlots: {},
};

function fmtTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LedgerPanel({ sceneId }: Props) {
  const [entries, setEntries] = useState<LedgerEntryView[]>([]);
  const [summary, setSummary] = useState<LedgerSummary>(EMPTY_SUMMARY);
  const [candidates, setCandidates] = useState<StoryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchStoryLedger(sceneId);
      setEntries(res.entries);
      setSummary(res.summary);
    } catch (e: any) {
      setError(e.message || '账本加载失败');
    } finally {
      setLoading(false);
    }
  }, [sceneId]);

  useEffect(() => {
    setEntries([]);
    setSummary(EMPTY_SUMMARY);
    setCandidates([]);
    setShowPicker(false);
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!showPicker) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetchStoryCandidates(sceneId);
        if (alive) setCandidates([...res.checks, ...res.logs]);
      } catch (e: any) {
        if (alive) setError(e.message || '候选加载失败');
      }
    })();
    return () => {
      alive = false;
    };
  }, [showPicker, sceneId]);

  const linked = useMemo(() => new Set(entries.map(e => e.sourceId)), [entries]);
  const available = candidates.filter(c => !linked.has(c.id));

  async function mount(c: StoryCandidate) {
    setError('');
    try {
      await createStoryLedgerLink({
        sceneId,
        sourceKind: c.sourceKind,
        sourceId: c.id,
        characterId: c.characterId,
        occurredAt: c.createdAt,
      });
      await reload();
    } catch (e: any) {
      setError(e.message || '挂载失败');
    }
  }

  async function unmount(id: string) {
    setError('');
    try {
      await deleteStoryLedgerLink(id);
      await reload();
    } catch (e: any) {
      setError(e.message || '解除失败');
    }
  }

  const currency = (['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter(k => summary.currency[k] > 0);
  const slots = Object.entries(summary.spellSlots);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-primary">经济账本</h4>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-border-dark hover:border-primary/60 hover:text-primary"
            onClick={() => setShowPicker(v => !v)}
          >
            <Plus className="w-3 h-3" /> 挂载
          </button>
          <button className="text-gray-400 hover:text-primary" onClick={() => void reload()} title="刷新">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-black/20 text-gray-300">
          <Coins className="w-3 h-3 text-yellow-500" />
          {currency.length ? currency.map(k => `${summary.currency[k]}${k}`).join(' ') : '无钱币'}
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-black/20 text-gray-300">
          <Package className="w-3 h-3 text-primary" /> 物资 {summary.itemCount}
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-black/20 text-gray-300">
          <TrendingUp className="w-3 h-3 text-green-400" /> 经验 {summary.experience}
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-black/20 text-gray-300">
          <Sparkles className="w-3 h-3 text-accent" />
          {slots.length ? slots.map(([lv, n]) => `${lv}环×${n}`).join(' ') : '无法术位'}
        </div>
      </div>

      {showPicker && (
        <div className="rounded-lg border border-border-dark p-2 space-y-1">
          <p className="text-[11px] text-gray-500">本场次最近记录（已挂载的自动隐藏）</p>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {available.map(c => (
              <button
                key={`${c.kind}:${c.id}`}
                className="flex w-full items-center gap-2 px-2 py-1 rounded text-left text-xs hover:bg-white/10"
                onClick={() => void mount(c)}
              >
                <span className="shrink-0 px-1 rounded bg-primary/10 text-primary text-[10px]">{KIND_LABEL[c.sourceKind]}</span>
                <span className="truncate dark:text-text-dark light:text-text-light">{c.title}</span>
                <span className="ml-auto shrink-0 text-[10px] text-gray-500">{fmtTime(c.createdAt)}</span>
              </button>
            ))}
            {available.length === 0 && <p className="text-xs text-gray-500 px-2 py-1">暂无可挂载记录</p>}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {entries.map(e => (
          <div key={e.linkId} className={`rounded-lg border p-2 ${e.invalid ? 'border-red-500/40' : 'border-border-dark'}`}>
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 px-1 rounded bg-primary/10 text-primary text-[10px]">{KIND_LABEL[e.sourceKind]}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs truncate ${e.invalid ? 'text-red-400' : 'dark:text-text-dark light:text-text-light'}`}>
                  {e.title}
                  {e.invalid && '（失效引用）'}
                </p>
                {e.amountText && <p className="text-[11px] text-gray-400 truncate">{e.amountText}</p>}
                {e.note && <p className="text-[11px] text-gray-500 truncate">{e.note}</p>}
                <p className="text-[10px] text-gray-500">{fmtTime(e.occurredAt)}</p>
              </div>
              <button className="text-gray-500 hover:text-red-400 shrink-0" onClick={() => void unmount(e.linkId)} title="解除挂载">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {entries.length === 0 && !loading && <p className="text-xs text-gray-500">尚未挂载经济事件</p>}
      </div>
    </div>
  );
}
