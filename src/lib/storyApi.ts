// 剧情模块请求封装：笔记树读写（服务端对玩家投影为空）
import type { StoryArc } from '@/types/story';
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
