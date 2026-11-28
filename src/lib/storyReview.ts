// 剧情回顾纯函数：时间线筛选、结算摘要、Markdown 导出。无 IO，探针可直接 import。
import type {
  LedgerSourceKind,
  LedgerSummary,
  StoryTimelineEntry,
} from '@/types/story';

export interface StoryReviewFilters {
  sessionNo?: number;
  dateFrom?: string;
  dateTo?: string;
  characterId?: string;
  sourceKind?: LedgerSourceKind | '';
}

export const SOURCE_KIND_LABEL: Record<LedgerSourceKind, string> = {
  check: '检定',
  item: '物资',
  treasure: '宝藏',
  spell: '施法',
  growth: '成长',
};

function fmtTimestamp(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export function filterStoryTimeline(
  entries: StoryTimelineEntry[],
  filters: StoryReviewFilters
): StoryTimelineEntry[] {
  return entries.filter(entry => {
    if (filters.sessionNo !== undefined && entry.sessionNo !== filters.sessionNo) return false;
    if (filters.characterId && entry.characterId !== filters.characterId) return false;
    if (filters.sourceKind && entry.sourceKind !== filters.sourceKind) return false;
    if (filters.dateFrom || filters.dateTo) {
      if (!entry.gameDate) return false;
      if (filters.dateFrom && entry.gameDate < filters.dateFrom) return false;
      if (filters.dateTo && entry.gameDate > filters.dateTo) return false;
    }
    return true;
  });
}

/** 场景完成时写入的一行总览；只读聚合口径，不改计划项 */
export function buildSettlementSummary(summary: LedgerSummary, entryCount: number): string {
  const parts = [`事件 ${Math.max(0, entryCount)} 条`];
  if (summary.itemCount > 0) parts.push(`物资 ${summary.itemCount} 件`);
  const money = (['pp', 'gp', 'ep', 'sp', 'cp'] as const)
    .filter(k => Number(summary.currency?.[k] ?? 0) > 0)
    .map(k => `${summary.currency[k]}${k}`);
  if (money.length) parts.push(`钱币 ${money.join(' ')}`);
  if (summary.experience > 0) parts.push(`经验 ${summary.experience}`);
  const slots = Object.entries(summary.spellSlots ?? {})
    .filter(([, n]) => Number(n) > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([lv, n]) => `${lv}环×${n}`);
  if (slots.length) parts.push(`法术位 ${slots.join(' ')}`);
  return parts.join('；');
}

export function buildStoryReviewMarkdown(
  entries: StoryTimelineEntry[],
  characterNames: Record<string, string>,
  filters: StoryReviewFilters
): string {
  const filterParts: string[] = [];
  if (filters.sessionNo !== undefined) filterParts.push(`第 ${filters.sessionNo} 场`);
  if (filters.dateFrom || filters.dateTo) {
    filterParts.push(`游戏日期 ${filters.dateFrom || '…'} ~ ${filters.dateTo || '…'}`);
  }
  if (filters.characterId) filterParts.push(`角色 ${characterNames[filters.characterId] || filters.characterId}`);
  if (filters.sourceKind) filterParts.push(`类别 ${SOURCE_KIND_LABEL[filters.sourceKind]}`);

  const lines: string[] = ['# 战役经济回顾', '', `筛选：${filterParts.length ? filterParts.join(' · ') : '全部'}`, ''];
  if (entries.length === 0) {
    lines.push('（无记录）');
    return lines.join('\n');
  }

  // 时间线按发生时间排序，同一场景的记录可能被其它场景隔开；先按场景归组，保证每组只出一个标题
  const groups = new Map<string, StoryTimelineEntry[]>();
  for (const entry of entries) {
    const key = `${entry.arcTitle} / ${entry.chapterTitle} / ${entry.sceneTitle}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  for (const group of groups.values()) {
    const first = group[0];
    const gameTime = fmtGameTime(first);
    lines.push(`## ${first.sceneTitle}`, '', `> ${first.arcTitle} / ${first.chapterTitle}${gameTime ? ` · ${gameTime}` : ''}`, '');
    for (const entry of group) {
      const character = entry.characterId ? characterNames[entry.characterId] : '';
      const detail: string[] = [];
      if (entry.amountText) detail.push(entry.amountText);
      if (character) detail.push(character);
      if (entry.note) detail.push(`备注：${entry.note}`);
      detail.push(fmtTimestamp(entry.occurredAt));
      lines.push(`- **${SOURCE_KIND_LABEL[entry.sourceKind]}** ${entry.title} — ${detail.filter(Boolean).join(' · ')}`);
    }
  }
  return lines.join('\n');
}

export function downloadStoryReview(markdown: string, filename = 'story-review.md'): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
