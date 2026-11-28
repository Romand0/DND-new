// 玩家故事页：道具箱（信件/地图/告示）+ 自己绑定角色的经济事件与当前钱币。
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  AlertCircle,
  Coins,
  Mail,
  Map as MapIcon,
  Package,
  RefreshCw,
  ScrollText,
  Star,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import type { Character, Currency } from '@/types/character';
import type { CharacterLog, CharacterLogCategory } from '@/types/characterLog';
import type { HandoutKind, StoryHandout } from '@/types/story';
import {
  fetchCharacter,
  fetchCharacterLogs,
  fetchMyCharacters,
} from '@/lib/api';
import {
  fetchStoryHandouts,
  markStoryHandoutRead,
} from '@/lib/storyApi';

const cardCls = 'rounded-xl border border-border-dark bg-bg-dark/40 p-4';
const chipCls = 'px-2.5 py-1 rounded-lg text-xs border border-border-dark transition-colors';

const KIND_LABEL: Record<HandoutKind, string> = {
  letter: '信件',
  map: '地图',
  notice: '告示',
  other: '其他',
};
const KIND_ICON: Record<HandoutKind, typeof Mail> = {
  letter: Mail,
  map: MapIcon,
  notice: ScrollText,
  other: Package,
};
const CATEGORY_LABEL: Record<Exclude<CharacterLogCategory, 'general'>, string> = {
  item: '物资',
  spell: '法术',
  growth: '成长',
};
const CATEGORY_ICON = {
  item: Package,
  spell: Sparkles,
  growth: TrendingUp,
} as const;

type EconomyCategory = Exclude<CharacterLogCategory, 'general'>;
type LogView = CharacterLog & { characterName: string };

function fmtTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function moneyText(currency: Currency | undefined): string {
  if (!currency) return '—';
  const parts = (['pp', 'gp', 'ep', 'sp', 'cp'] as const)
    .filter(k => Number(currency[k]) > 0)
    .map(k => `${currency[k]}${k}`);
  return parts.length ? parts.join(' · ') : '—';
}

export default function PlayerStory() {
  const [handouts, setHandouts] = useState<StoryHandout[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [logs, setLogs] = useState<LogView[]>([]);
  const [openId, setOpenId] = useState('');
  const [category, setCategory] = useState<EconomyCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [handoutRes, mineRes] = await Promise.all([
        fetchStoryHandouts(),
        fetchMyCharacters(),
      ]);
      setHandouts(Array.isArray(handoutRes) ? handoutRes : []);
      const mineList = Array.isArray(mineRes?.characters) ? mineRes.characters : [];
      const ids = (mineList as { id: string }[]).map(c => c.id);
      const [fullRes, logRes] = await Promise.all([
        Promise.all(ids.map(id => fetchCharacter<Character>(id).catch(() => null))),
        Promise.all(ids.map(id => fetchCharacterLogs<CharacterLog[]>(id, '', 200, 0).catch(() => []))),
      ]);
      const full = fullRes.filter((c): c is Character => !!c);
      setCharacters(full);
      const nameById = new Map(full.map(c => [c.id, c.name]));
      const merged: LogView[] = [];
      logRes.forEach(list => {
        for (const log of list) {
          if (log.category === 'general') continue;
          merged.push({ ...log, characterName: nameById.get(log.characterId) ?? '未知角色' });
        }
      });
      merged.sort((a, b) => b.createdAt - a.createdAt);
      setLogs(merged);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const sortedHandouts = useMemo(
    () => [...handouts].sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt) || b.createdAt - a.createdAt),
    [handouts]
  );
  const filteredLogs = useMemo(
    () => (category === 'all' ? logs : logs.filter(l => l.category === category)),
    [logs, category]
  );
  const totalCurrency = useMemo(() => {
    const total: Currency = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    for (const c of characters) {
      for (const k of ['pp', 'gp', 'ep', 'sp', 'cp'] as const) total[k] += Number(c.currency?.[k] ?? 0);
    }
    return total;
  }, [characters]);

  async function openHandout(h: StoryHandout) {
    const next = openId === h.id ? '' : h.id;
    setOpenId(next);
    if (!next || h.readAt) return;
    try {
      const saved = await markStoryHandoutRead(h.id);
      setHandouts(prev => prev.map(x => (x.id === h.id ? { ...x, readAt: saved.readAt || Date.now() } : x)));
    } catch (e: any) {
      setError(e?.message || '标记已读失败');
    }
  }

  async function toggleFavorite(e: MouseEvent, h: StoryHandout) {
    e.stopPropagation();
    try {
      const saved = await markStoryHandoutRead(h.id, { read: true, favorited: !h.favoritedAt });
      setHandouts(prev => prev.map(x => (
        x.id === h.id
          ? { ...x, readAt: saved.readAt || x.readAt, favoritedAt: saved.favoritedAt }
          : x
      )));
    } catch (e: any) {
      setError(e?.message || '收藏状态保存失败');
    }
  }

  const unreadCount = handouts.filter(h => !h.readAt).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold dark:text-text-dark light:text-text-light">故事与物资</h1>
          <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
            接收 DM 投送的道具，回顾自己角色的经济事件
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 rounded-lg border border-border-dark px-3 py-1.5 text-xs hover:border-primary/60 hover:text-primary transition-colors disabled:opacity-40"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <section className={`${cardCls} space-y-3`}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold dark:text-text-dark light:text-text-light">
            <Package className="w-4 h-4 text-primary" /> 道具箱
          </h2>
          <span className="text-xs text-gray-500">{unreadCount} 件未读</span>
        </div>
        {sortedHandouts.length === 0 ? (
          <p className="text-sm text-gray-500">暂无道具</p>
        ) : (
          <div className="space-y-2">
            {sortedHandouts.map(h => {
              const Icon = KIND_ICON[h.kind];
              const open = openId === h.id;
              return (
                <article
                  key={h.id}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    open ? 'border-primary/60 bg-primary/5' : 'border-border-dark hover:border-primary/40'
                  }`}
                  onClick={() => void openHandout(h)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <Icon className="w-4 h-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium dark:text-text-dark light:text-text-light">
                          {!h.readAt && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />}
                          {h.title}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {KIND_LABEL[h.kind]} · {fmtTime(h.createdAt)}
                        </p>
                      </div>
                    </div>
                    <button
                      className={`shrink-0 ${h.favoritedAt ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}
                      onClick={e => void toggleFavorite(e, h)}
                      title={h.favoritedAt ? '取消收藏' : '收藏'}
                    >
                      <Star className="w-4 h-4" fill={h.favoritedAt ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  {open && (
                    <div className="mt-3 space-y-2 border-t border-border-dark pt-2">
                      {h.body && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed dark:text-text-dark light:text-text-light">
                          {h.body}
                        </p>
                      )}
                      {h.imageUrl && (
                        <img src={h.imageUrl} alt={h.title} className="max-h-80 rounded-lg border border-border-dark object-contain" />
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className={`${cardCls} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold dark:text-text-dark light:text-text-light">
            <Coins className="w-4 h-4 text-primary" /> 经济事件
          </h2>
          <span className="text-xs text-gray-500">合计 {moneyText(totalCurrency)}</span>
        </div>

        {characters.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {characters.map(c => (
              <div key={c.id} className="rounded-lg border border-border-dark bg-black/10 p-2.5">
                <p className="truncate text-sm font-medium dark:text-text-dark light:text-text-light">{c.name}</p>
                <p className="text-[11px] text-gray-500">
                  {c.profession?.class || '未知职业'} · {c.level} 级
                </p>
                <p className="mt-1 text-xs text-primary">{moneyText(c.currency)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            className={`${chipCls} ${category === 'all' ? 'border-primary/60 text-primary' : 'text-gray-400 hover:text-primary'}`}
            onClick={() => setCategory('all')}
          >
            全部 {logs.length}
          </button>
          {(Object.keys(CATEGORY_LABEL) as EconomyCategory[]).map(key => {
            const Icon = CATEGORY_ICON[key];
            return (
              <button
                key={key}
                className={`${chipCls} flex items-center gap-1 ${category === key ? 'border-primary/60 text-primary' : 'text-gray-400 hover:text-primary'}`}
                onClick={() => setCategory(key)}
              >
                <Icon className="w-3 h-3" /> {CATEGORY_LABEL[key]} {logs.filter(l => l.category === key).length}
              </button>
            );
          })}
        </div>

        {filteredLogs.length === 0 ? (
          <p className="text-sm text-gray-500">暂无经济事件</p>
        ) : (
          <ol className="space-y-2">
            {filteredLogs.map(log => {
              const Icon = CATEGORY_ICON[log.category as EconomyCategory] ?? Package;
              return (
                <li key={log.id} className="flex items-start gap-2 rounded-lg border border-border-dark p-2.5">
                  <Icon className="mt-0.5 w-4 h-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm dark:text-text-dark light:text-text-light">{log.title}</p>
                    <p className="text-[11px] text-gray-500">
                      {log.characterName} · {CATEGORY_LABEL[log.category as EconomyCategory] ?? log.category} · {fmtTime(log.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
