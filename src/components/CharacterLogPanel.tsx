// 角色全周期日志面板：三领域筛选（物资钱币/法术/角色成长）+ 分页列表。
// CharacterDetail 底部区块挂载（DM 端/玩家端共用），draftMode 下隐藏（草稿不入库）。

import { useState, useEffect, useCallback } from 'react';
import { History, RefreshCw } from 'lucide-react';
import type { CharacterLog, CharacterLogCategory } from '@/types/characterLog';
import { fetchCharacterLogs } from '@/lib/api';

const PAGE_SIZE = 30;

const CATEGORY_TABS: { key: CharacterLogCategory | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
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

export default function CharacterLogPanel({ characterId, draftMode = false }: {
  characterId: string;
  /** 草稿编辑态隐藏（草稿修改不入库，避免误导） */
  draftMode?: boolean;
}) {
  const [logs, setLogs] = useState<CharacterLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<CharacterLogCategory | 'all'>('all');
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const category = tab === 'all' ? '' : tab;
      const offset = reset ? 0 : logs.length;
      const list = await fetchCharacterLogs<CharacterLog[]>(characterId, category, PAGE_SIZE, offset);
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
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-xs rounded-lg bg-black/5 dark:bg-white/5 px-2.5 py-1.5">
                  <span className={`shrink-0 mt-0.5 ${CATEGORY_COLOR[log.category as CharacterLogCategory] ?? ''}`}>
                    [{SOURCE_LABEL[log.source ?? ''] ?? '记录'}]
                  </span>
                  <span className="flex-1 dark:text-text-dark light:text-text-light break-all">{log.title}</span>
                  <span className="shrink-0 dark:text-text-dark-muted light:text-text-light-muted">{formatTime(log.createdAt)}</span>
                </div>
              ))
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
