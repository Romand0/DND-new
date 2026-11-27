// 剧情树构造与不可变更新（纯函数）
import type {
  StoryArc,
  StoryChapter,
  StoryScene,
  StorySnippet,
  StoryTime,
} from '@/types/story';

function uid(): string {
  return crypto.randomUUID();
}

export function createStoryArc(campaignId: string, userId: string, title = '未命名剧情线'): StoryArc {
  const ts = Date.now();
  return {
    id: uid(),
    campaignId,
    title,
    summary: '',
    status: 'planned',
    chapters: [],
    createdBy: userId,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function createStoryChapter(order: number): StoryChapter {
  const ts = Date.now();
  return {
    id: uid(),
    title: `第 ${order + 1} 章`,
    summary: '',
    order,
    scenes: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

export function createStoryScene(chapterId: string, order: number): StoryScene {
  const ts = Date.now();
  return {
    id: uid(),
    chapterId,
    title: `场景 ${order + 1}`,
    status: 'planned',
    time: { order },
    location: { name: '' },
    roster: { characterIds: [], npcIds: [], absentCharacterIds: [] },
    snippets: [],
    plannedObjectives: [],
    plannedReward: {},
    dependsOn: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

export function createSnippet(text = ''): StorySnippet {
  return { id: uid(), text };
}

export function nextOrder(items: { order: number }[]): number {
  return items.reduce((max, it) => Math.max(max, it.order), -1) + 1;
}

export function nextSceneOrder(scenes: StoryScene[]): number {
  return scenes.reduce((max, sc) => Math.max(max, sc.time.order), -1) + 1;
}

export function findScene(arc: StoryArc | null, sceneId: string): StoryScene | null {
  if (!arc) return null;
  for (const ch of arc.chapters) {
    const sc = ch.scenes.find(s => s.id === sceneId);
    if (sc) return sc;
  }
  return null;
}

export function findChapterOfScene(arc: StoryArc | null, sceneId: string): StoryChapter | null {
  if (!arc) return null;
  return arc.chapters.find(ch => ch.scenes.some(s => s.id === sceneId)) ?? null;
}

/** 深拷贝并刷新 updatedAt，编辑草稿与已保存数据隔离 */
export function cloneArc(arc: StoryArc): StoryArc {
  return { ...structuredClone(arc), updatedAt: Date.now() };
}

export function updateScene(arc: StoryArc, sceneId: string, patch: Partial<StoryScene> | ((sc: StoryScene) => Partial<StoryScene>)): StoryArc {
  return {
    ...arc,
    chapters: arc.chapters.map(ch => ({
      ...ch,
      scenes: ch.scenes.map(sc => {
        if (sc.id !== sceneId) return sc;
        const delta = typeof patch === 'function' ? patch(sc) : patch;
        return { ...sc, ...delta, updatedAt: Date.now() };
      }),
    })),
  };
}

export function addChapter(arc: StoryArc, chapter: StoryChapter): StoryArc {
  return { ...arc, chapters: [...arc.chapters, chapter] };
}

export function removeChapter(arc: StoryArc, chapterId: string): StoryArc {
  return { ...arc, chapters: arc.chapters.filter(ch => ch.id !== chapterId) };
}

export function addScene(arc: StoryArc, chapterId: string, scene: StoryScene): StoryArc {
  return {
    ...arc,
    chapters: arc.chapters.map(ch => (ch.id === chapterId ? { ...ch, scenes: [...ch.scenes, scene] } : ch)),
  };
}

export function removeScene(arc: StoryArc, sceneId: string): StoryArc {
  return {
    ...arc,
    chapters: arc.chapters.map(ch => ({ ...ch, scenes: ch.scenes.filter(sc => sc.id !== sceneId) })),
  };
}

export function sortArc(arc: StoryArc): StoryArc {
  return {
    ...arc,
    chapters: [...arc.chapters]
      .sort((a, b) => a.order - b.order)
      .map(ch => ({ ...ch, scenes: [...ch.scenes].sort((a, b) => a.time.order - b.time.order) })),
  };
}

export function applyImportedChapter(arc: StoryArc, title: string, parsed: { title: string; text: string }[]): StoryArc {
  const chapter = createStoryChapter(nextOrder(arc.chapters));
  chapter.title = title || chapter.title;
  chapter.scenes = parsed.map((p, idx) => {
    const scene = createStoryScene(chapter.id, idx);
    scene.title = p.title;
    scene.snippets = p.text ? [{ id: uid(), text: p.text }] : [];
    return scene;
  });
  return addChapter(arc, chapter);
}

export function timeLabel(time: StoryTime, sessionNo?: number): string {
  const parts: string[] = [];
  if (time.gameDate) {
    const hh = Math.floor((time.gameMinute ?? 0) / 60);
    const mm = (time.gameMinute ?? 0) % 60;
    parts.push(`${time.gameDate} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  if (sessionNo !== undefined) parts.push(`第 ${sessionNo} 场`);
  return parts.join(' · ');
}
