// 剧情模块请求封装：笔记树读写（服务端对玩家投影为空）
import type { HandoutKind, LedgerResponse, LedgerSourceKind, StoryArc, StoryHandout } from '@/types/story';
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

export interface StoryCandidate {
  kind: 'log' | 'check';
  id: string;
  characterId?: string;
  title: string;
  category: string;
  logKind?: string;
  sourceKind: LedgerSourceKind;
  createdAt: number;
}

export function fetchStoryCandidates(sceneId: string): Promise<{ logs: StoryCandidate[]; checks: StoryCandidate[] }> {
  return apiFetch(`/story/candidates?sceneId=${encodeURIComponent(sceneId)}`);
}

export interface HandoutInput {
  kind: HandoutKind;
  title: string;
  body: string;
  imageUrl?: string;
  sceneId?: string;
  targetUserIds: string[];
}

export function fetchStoryHandouts(): Promise<StoryHandout[]> {
  return apiFetch<StoryHandout[]>('/story/handouts');
}

export function createStoryHandout(input: HandoutInput): Promise<StoryHandout> {
  return apiFetch<StoryHandout>('/story/handout', { method: 'POST', body: JSON.stringify(input) });
}

export function recallStoryHandout(id: string): Promise<{ ok: boolean; recalledAt?: number }> {
  return apiFetch(`/story/handout?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function markStoryHandoutRead(
  handoutId: string,
  options: { read?: boolean; favorited?: boolean } = {}
): Promise<{ handoutId: string; userId: string; readAt: number; favoritedAt?: number }> {
  return apiFetch('/story/handout-read', { method: 'POST', body: JSON.stringify({ handoutId, ...options }) });
}
