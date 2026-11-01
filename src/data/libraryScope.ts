// 图鉴四库（装备/法术/角色选项/怪物图鉴）的团组视图过滤。
// 可见性 = 本团组私有条目 ∪ 团组规则书集内的出版物条目（出版物 campaignId 恒空）。
// rulebooks 由 CampaignContext 在加载团组后注入；种子兜底条目按玩家手册 2014 处理。

import { getCampaignId } from '@/data/campaignScope';

let currentRulebooks: string[] = [];

const listeners: (() => void)[] = [];

export function setRulebookScope(rulebooks: string[]): void {
  currentRulebooks = Array.isArray(rulebooks) ? rulebooks : [];
  listeners.forEach((fn) => fn());
}

export function getRulebookScope(): string[] {
  return currentRulebooks;
}

export function subscribeLibraryScope(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

interface LibraryEntry {
  campaignId?: string | null;
  source?: string;
}

// source 规范化：早期种子/导入数据写的是不带年份的「玩家手册」，与默认规则书集值
//「玩家手册 2014」不一致会导致图鉴被滤空——统一归并为带年份的标准名。
export function normalizeSource(source?: string): string {
  if (!source || source === '玩家手册') return '玩家手册 2014';
  return source;
}

export function filterByCampaignScope<T extends LibraryEntry>(items: T[]): T[] {
  const cid = getCampaignId();
  return items.filter((it) =>
    it.campaignId ? it.campaignId === cid : currentRulebooks.includes(normalizeSource(it.source))
  );
}
