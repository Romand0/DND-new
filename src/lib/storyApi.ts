// 剧情模块请求封装：笔记树读写（服务端对玩家投影为空）
import type { LedgerResponse, LedgerSourceKind, StoryArc } from '@/types/story';
import { apiFetch } from './api';

export function fetchStoryArcs(): Promise<StoryArc[]> {
  return apiFetch<StoryArc[]>('/story');
}

export function saveStoryArc(arc: StoryArc, baseUpdatedAt?: number): Promise<StoryArc> {
  return apiFetch<StoryArc>('/story', {
    method: 'PUT',
    body: JSON.stringify({ arc, baseUpdatedAt }),
  });
}

export function deleteStoryArc(arcId: string): Promise<{ ok: boolean; removedScenes: number }> {
  return apiFetch(`/story?arcId=${encodeURIComponent(arcId)}`, { method: 'DELETE' });
}

export function fetchStoryLedger(sceneId: string): Promise<LedgerResponse> {
  return apiFetch<LedgerResponse>(`/story/ledger?sceneId=${encodeURIComponent(sceneId)}`);
}

export interface LedgerLinkInput {
  sceneId: string;
  sourceKind: LedgerSourceKind;
  sourceId: string;
  characterId?: string;
  note?: string;
  occurredAt?: number;
}

export function createStoryLedgerLink(input: LedgerLinkInput): Promise<unknown> {
  return apiFetch('/story/ledger', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteStoryLedgerLink(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/story/ledger?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
