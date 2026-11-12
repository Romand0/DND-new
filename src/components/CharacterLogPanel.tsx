// 角色全周期日志面板：三领域筛选（物资钱币/法术/角色成长）+ 分页列表。
// CharacterDetail 底部区块挂载（DM 端/玩家端共用），draftMode 下隐藏（草稿不入库）。

import { useState, useEffect, useCallback } from 'react';
import { History, RefreshCw, Swords } from 'lucide-react';
import type { CharacterLog, CharacterLogCategory } from '@/types/characterLog';
import { fetchCharacterLogs } from '@/lib/api';

const PAGE_SIZE = 30;

const CATEGORY_TABS: { key: CharacterLogCategory | 'all' | 'battle'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'battle', label: '战斗' },
  { key: 'item', label: '物资钱币' },
  { key: 'spell', label: '法术' },
  { key: 'growth', label: '角色成长' },
];

const CATEGORY_COLOR: Record<CharacterLogCategory, string> = {
  item: 'text-amber-400',
  spell: 'text-violet-400',
  growth: 'text-green-400',
  general: 'dark:text-text-dark-muted light:text-text-light-muted',
};

const SOURCE_LABEL: Record<string, string> = {
  battle: '战斗',
  change_request: '变更请求',
  store: '日常',
  import: '导入',
  growth_task: '成长任务',
};

function formatTime(sec: number): string {
  return new Date(sec * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** detail JSON 里提取战斗名（打包时写入） */
function battleNameOf(log: CharacterLog): string {
  try {
    const d = JSON.parse(log.detail || '{}');
    return typeof d?.battleName === 'string' && d.battleName ? d.battleName : '未命名战斗';
  } catch {
    return '未命名战斗';
  }
}

export default function CharacterLogPanel({ characterId, draftMode = false }: {
  characterId: string;
  /** 草稿编辑态隐藏（草稿修改不入库，避免误导） */
  draftMode?: boolean;
}) {
  const [logs, setLogs] = useState<CharacterLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<CharacterLogCategory | 'all' | 'battle'>('all');
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const category = tab === 'all' || tab === 'battle' ? '' : tab;
      const offset = reset ? 0 : logs.length;
      const list = await fetchCharacterLogs<CharacterLog[]>(characterId, category, PAGE_SIZE, offset, tab === 'battle');
      setLogs(reset ? (Array.isArray(list) ? list : []) : [...logs, ...(Array.isArray(list) ? list : [])]);
      setLoaded(true);
    } catch {
      if (reset) setLogs([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [characterId, tab, logs.length]);

  // 折叠态不拉取；展开时首拉，切 tab 重置
  useEffect(() => {
    if (!expanded) return;
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, tab, characterId]);

  if (draftMode) return null;

  const hasMore = logs.length > 0 && logs.length % PAGE_SIZE === 0;

  // 战斗版块：按 battleId 聚合成「场」组（组头 = 战斗名，组内 = 该场全部变更条目）
  const battleGroups = tab === 'battle'
    ? (() => {
        const m = new Map<string, CharacterLog[]>();
        for (const log of logs) {
          const bid = log.battleId || 'unknown';
          const arr = m.get(bid) ?? [];
          arr.push(log);
          m.set(bid, arr);
        }
        return [...m.entries()];
      })()
    : [];

  const renderLogRow = (log: CharacterLog) => (
    <div key={log.id} className="flex items-start gap-2 text-xs rounded-lg bg-black/5 dark:bg-white/5 px-2.5 py-1.5">
      <span className={`shrink-0 mt-0.5 ${CATEGORY_COLOR[log.category as CharacterLogCategory] ?? ''}`}>
        [{SOURCE_LABEL[log.source ?? ''] ?? '记录'}]
      </span>
      <span className="flex-1 dark:text-text-dark light:text-text-light break-all">{log.title}</span>
      <span className="shrink-0 dark:text-text-dark-muted light:text-text-light-muted">{formatTime(log.createdAt)}</span>
    </div>
  );

  return (
    <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-2 text-sm font-medium dark:text-text-dark light:text-text-light"
        >
          <History className="w-4 h-4 text-primary" />
          全周期日志
          {logs.length > 0 && <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">（已载 {logs.length} 条）</span>}
        </button>
        {expanded && (
          <button
            onClick={() => load(true)}
            className="p-1.5 rounded-lg hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {expanded && (
        <>
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {CATEGORY_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${tab === t.key
                  ? 'bg-primary text-white'
                  : 'border dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted hover:bg-white/10'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {!loaded ? (
              <div className="text-center py-4 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                {loading ? '加载中…' : ''}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-4 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                暂无日志（升级决策任务等成长事件将在此记录）
              </div>
            ) : tab === 'battle' ? (
              battleGroups.map(([bid, groupLogs]) => (
                <div key={bid} className="rounded-lg border dark:border-border-dark light:border-border-light p-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium dark:text-text-dark light:text-text-light px-0.5">
                    <Swords className="w-3.5 h-3.5 text-primary" />
                    <span>{battleNameOf(groupLogs[0])}</span>
                    <span className="font-normal dark:text-text-dark-muted light:text-text-light-muted">
                      · {formatTime(groupLogs[0].createdAt)} · {groupLogs.length} 条
                    </span>
                  </div>
                  {groupLogs.map(renderLogRow)}
                </div>
              ))
            ) : (
              logs.map(renderLogRow)
            )}
            {hasMore && loaded && (
              <button
                onClick={() => load(false)}
                disabled={loading}
                className="w-full text-center py-2 text-xs text-primary hover:underline disabled:opacity-40"
              >
                {loading ? '加载中…' : '加载更多'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
