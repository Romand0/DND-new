// DM 剧情工作台：剧情线/章节/场景编辑 + 文本导入 + DM 阅读视图 + 场景账本
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  Save,
  BookOpen,
  Upload,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  X,
  FileText,
  RotateCcw,
} from 'lucide-react';
import type { Character } from '@/types/character';
import type { StoryArc, StoryChapter, StoryScene } from '@/types/story';
import storyStore from '@/data/storyStore';
import { characterStore } from '@/data/characterStore';
import { getCampaignId } from '@/data/campaignScope';
import { useAuth } from '@/contexts/AuthContext';
import { parseStoryText } from '@/lib/storyImport';
import {
  createStoryArc,
  createStoryChapter,
  createStoryScene,
  cloneArc,
  addChapter,
  addScene,
  removeChapter,
  removeScene,
  updateScene,
  sortArc,
  applyImportedChapter,
  nextOrder,
  nextSceneOrder,
  findScene,
} from '@/lib/storyModel';
import SceneEditor from '@/components/story/SceneEditor';
import LedgerPanel from '@/components/story/LedgerPanel';

const inputCls = 'w-full px-2 py-1.5 rounded-lg bg-black/20 border border-border-dark text-sm dark:text-text-dark light:text-text-light focus:border-primary outline-none';
const panelCls = 'rounded-xl border border-border-dark bg-bg-dark/40 p-3';
const btnCls = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border border-border-dark hover:border-primary/60 hover:text-primary transition-colors disabled:opacity-40';

const STATUS_LABEL: Record<StoryScene['status'], string> = {
  planned: '计划',
  active: '进行',
  done: '完成',
  skipped: '跳过',
};
const STATUS_CLS: Record<StoryScene['status'], string> = {
  planned: 'text-gray-400',
  active: 'text-yellow-400',
  done: 'text-green-400',
  skipped: 'text-gray-500 line-through',
};

export default function StoryBoard() {
  const { user } = useAuth();
  const campaignId = getCampaignId();
  const [arcs, setArcs] = useState<StoryArc[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [arcId, setArcId] = useState('');
  const [draft, setDraft] = useState<StoryArc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sceneId, setSceneId] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const [importText, setImportText] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [importDelimiter, setImportDelimiter] = useState('---');

  useEffect(() => {
    setArcs(storyStore.getAll());
    const unsub = storyStore.subscribe(() => setArcs(storyStore.getAll()));
    void storyStore.pull().catch(() => undefined);
    setCharacters(characterStore.getAll());
    return unsub;
  }, []);

  const selectedScene = useMemo(() => findScene(draft, sceneId), [draft, sceneId]);

  const selectArc = useCallback((id: string) => {
    const arc = storyStore.get(id);
    if (!arc) return;
    setArcId(id);
    setDraft(cloneArc(arc));
    setDirty(false);
    setSceneId('');
    setExpanded(Object.fromEntries(arc.chapters.map(ch => [ch.id, true])));
    setError('');
  }, []);

  useEffect(() => {
    if (!arcId && arcs.length) selectArc(arcs[0].id);
  }, [arcs, arcId, selectArc]);

  function mutate(next: StoryArc) {
    setDraft(next);
    setDirty(true);
  }

  async function handleCreateArc() {
    if (!user?.id) return;
    setError('');
    try {
      const arc = createStoryArc(campaignId, user.id);
      const saved = await storyStore.saveArc(arc);
      setArcs(storyStore.getAll());
      selectArc(saved.id);
    } catch (e: any) {
      setError(e.message || '新建剧情线失败');
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const saved = await storyStore.saveArc(sortArc(draft));
      setDraft(cloneArc(saved));
      setDirty(false);
      setArcs(storyStore.getAll());
    } catch (e: any) {
      setError(e.message || '保存失败，草稿已保留');
    } finally {
      setSaving(false);
    }
  }

  function handleRevert() {
    if (!arcId) return;
    selectArc(arcId);
  }

  async function handleDeleteArc(id: string) {
    if (!window.confirm('删除整条剧情线及其账本索引？')) return;
    try {
      await storyStore.removeArc(id);
      setArcs(storyStore.getAll());
      if (arcId === id) {
        setArcId('');
        setDraft(null);
        setSceneId('');
      }
    } catch (e: any) {
      setError(e.message || '删除失败');
    }
  }

  function handleAddChapter() {
    if (!draft) return;
    const chapter = createStoryChapter(nextOrder(draft.chapters));
    mutate(addChapter(draft, chapter));
    setExpanded(v => ({ ...v, [chapter.id]: true }));
  }

  function handleAddScene(chapter: StoryChapter) {
    if (!draft) return;
    const scene = createStoryScene(chapter.id, nextSceneOrder(chapter.scenes));
    mutate(addScene(draft, chapter.id, scene));
    setSceneId(scene.id);
    setExpanded(v => ({ ...v, [chapter.id]: true }));
  }

  function handleDeleteScene(id: string) {
    if (!draft || !window.confirm('删除该场景？')) return;
    mutate(removeScene(draft, id));
    if (sceneId === id) setSceneId('');
  }

  function handleDeleteChapter(id: string) {
    if (!draft || !window.confirm('删除该章节及其全部场景？')) return;
    const chapter = draft.chapters.find(c => c.id === id);
    if (chapter?.scenes.some(s => s.id === sceneId)) setSceneId('');
    mutate(removeChapter(draft, id));
  }

  function handleImport() {
    if (!draft) return;
    const parsed = parseStoryText(importText, importDelimiter);
    if (!parsed.length) {
      setError('未解析出场景，请检查分隔符');
      return;
    }
    const next = sortArc(applyImportedChapter(draft, importTitle, parsed));
    mutate(next);
    setShowImport(false);
    setImportText('');
    setImportTitle('');
    setError('');
  }

  function patchScene(patch: Partial<StoryScene>) {
    if (!draft || !sceneId) return;
    mutate(updateScene(draft, sceneId, patch));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" /> 剧情工作台
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <button className={btnCls} onClick={() => void handleCreateArc()}>
            <Plus className="w-3.5 h-3.5" /> 新建剧情线
          </button>
          <button className={btnCls} onClick={() => { void storyStore.pull(true).then(() => setArcs(storyStore.getAll())); }}>
            <RefreshCw className="w-3.5 h-3.5" /> 刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <aside className={`${panelCls} col-span-12 lg:col-span-3 space-y-3`}>
          <h2 className="text-xs font-semibold text-primary">剧情线</h2>
          <div className="space-y-1">
            {arcs.map(arc => (
              <div key={arc.id} className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 ${arcId === arc.id ? 'bg-primary/15' : 'hover:bg-white/5'}`}>
                <button className="min-w-0 flex-1 text-left text-sm truncate" onClick={() => selectArc(arc.id)}>
                  <span className={arcId === arc.id ? 'text-primary' : 'dark:text-text-dark light:text-text-light'}>{arc.title}</span>
                </button>
                <button className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400" onClick={() => void handleDeleteArc(arc.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {arcs.length === 0 && <p className="text-xs text-gray-500">尚无剧情线</p>}
          </div>

          {draft && (
            <div className="border-t border-border-dark pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-primary">章节 / 场景</h2>
                <button className={btnCls} onClick={handleAddChapter}><Plus className="w-3 h-3" /> 章节</button>
              </div>
              <div className="space-y-1">
                {sortArc(draft).chapters.map(ch => (
                  <div key={ch.id}>
                    <div className="group flex items-center gap-1 px-1 py-1 rounded hover:bg-white/5">
                      <button className="text-gray-500" onClick={() => setExpanded(v => ({ ...v, [ch.id]: !v[ch.id] }))}>
                        {expanded[ch.id] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <span className="min-w-0 flex-1 truncate text-xs dark:text-text-dark light:text-text-light">{ch.title}</span>
                      <button className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-primary" onClick={() => handleAddScene(ch)} title="添加场景">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400" onClick={() => handleDeleteChapter(ch.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {expanded[ch.id] && (
                      <div className="ml-5 space-y-0.5">
                        {[...ch.scenes].sort((a, b) => a.time.order - b.time.order).map(sc => (
                          <div key={sc.id} className={`group flex items-center gap-1 rounded px-2 py-1 ${sceneId === sc.id ? 'bg-primary/15' : 'hover:bg-white/5'}`}>
                            <button className="min-w-0 flex-1 text-left text-xs truncate" onClick={() => setSceneId(sc.id)}>
                              <span className={sceneId === sc.id ? 'text-primary' : 'dark:text-text-dark light:text-text-light'}>{sc.title}</span>
                              <span className={`ml-1.5 text-[10px] ${STATUS_CLS[sc.status]}`}>{STATUS_LABEL[sc.status]}</span>
                            </button>
                            <button className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400" onClick={() => handleDeleteScene(sc.id)}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {ch.scenes.length === 0 && <p className="px-2 text-[11px] text-gray-500">暂无场景</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className={`${panelCls} col-span-12 lg:col-span-5 space-y-4`}>
          {!draft ? (
            <p className="text-sm text-gray-500">选择或新建一条剧情线</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${inputCls} flex-1 min-w-40`} value={draft.title} onChange={e => mutate({ ...draft, title: e.target.value })} placeholder="剧情线标题" />
                <select className={`${inputCls} w-24`} value={draft.status} onChange={e => mutate({ ...draft, status: e.target.value as StoryArc['status'] })}>
                  <option value="planned">计划</option>
                  <option value="active">进行</option>
                  <option value="closed">完结</option>
                </select>
                <button className={btnCls} onClick={handleSave} disabled={!dirty || saving}>
                  <Save className="w-3.5 h-3.5" /> {saving ? '保存中' : '保存'}
                </button>
                <button className={btnCls} onClick={handleRevert} disabled={!dirty}>
                  <RotateCcw className="w-3.5 h-3.5" /> 还原
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnCls} onClick={() => setShowImport(true)}><Upload className="w-3.5 h-3.5" /> 导入文本</button>
                <button className={btnCls} onClick={() => setShowRead(true)}><FileText className="w-3.5 h-3.5" /> 阅读视图</button>
                {dirty && <span className="self-center text-[11px] text-yellow-400">有未保存修改</span>}
              </div>
              <textarea className={`${inputCls} min-h-14`} value={draft.summary} onChange={e => mutate({ ...draft, summary: e.target.value })} placeholder="剧情线概要" />

              <div className="border-t border-border-dark pt-3">
                {selectedScene ? (
                  <SceneEditor arc={draft} scene={selectedScene} characters={characters} onChange={patchScene} />
                ) : (
                  <p className="text-sm text-gray-500">从左侧选择一个场景开始编辑</p>
                )}
              </div>
            </>
          )}
        </main>

        <aside className={`${panelCls} col-span-12 lg:col-span-4`}>
          {selectedScene ? (
            dirty ? (
              <div className="text-xs text-gray-500">
                <p className="mb-2">账本挂载需要场景已保存到云端。</p>
                <button className={btnCls} onClick={() => void handleSave()} disabled={saving}><Save className="w-3.5 h-3.5" /> 先保存</button>
              </div>
            ) : (
              <LedgerPanel sceneId={selectedScene.id} />
            )
          ) : (
            <p className="text-sm text-gray-500">选择场景后查看经济账本</p>
          )}
        </aside>
      </div>

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowImport(false)}>
          <div className="w-full max-w-3xl rounded-xl border border-border-dark bg-bg-dark p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light">导入既有剧情文本</h3>
              <button onClick={() => setShowImport(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <p className="text-[11px] text-gray-500">按分隔行切分为场景；每个场景首行 <code># 标题</code> 作为场景名，其余作为讲述片段。</p>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="章节标题" value={importTitle} onChange={e => setImportTitle(e.target.value)} />
              <input className={inputCls} placeholder="分隔符（默认 ---）" value={importDelimiter} onChange={e => setImportDelimiter(e.target.value)} />
            </div>
            <textarea className={`${inputCls} min-h-64 font-mono`} placeholder={'# 港口之夜\n海风裹着咸腥…\n---\n# 地窖\n…'} value={importText} onChange={e => setImportText(e.target.value)} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">解析出 {parseStoryText(importText, importDelimiter).length} 个场景</span>
              <div className="flex gap-2">
                <button className={btnCls} onClick={() => setShowImport(false)}>取消</button>
                <button className={btnCls} onClick={handleImport}><Upload className="w-3.5 h-3.5" /> 导入为新章节</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRead && draft && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4" onClick={() => setShowRead(false)}>
          <div className="mx-auto max-w-4xl rounded-xl border border-border-dark bg-bg-dark p-6 space-y-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold dark:text-text-dark light:text-text-light">{draft.title}</h2>
                {draft.summary && <p className="text-sm text-gray-400 mt-1">{draft.summary}</p>}
              </div>
              <button onClick={() => setShowRead(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {sortArc(draft).chapters.map(ch => (
              <section key={ch.id} className="space-y-4">
                <h3 className="text-lg font-semibold text-primary border-b border-border-dark pb-1">{ch.title}</h3>
                {[...ch.scenes].sort((a, b) => a.time.order - b.time.order).map(sc => (
                  <article key={sc.id} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold dark:text-text-dark light:text-text-light">{sc.title}</h4>
                      <span className={`text-[11px] ${STATUS_CLS[sc.status]}`}>{STATUS_LABEL[sc.status]}</span>
                      {sc.location.name && <span className="text-[11px] text-gray-500">{sc.location.name}</span>}
                    </div>
                    {sc.snippets.map(sn => (
                      <div key={sn.id} className="text-sm leading-relaxed whitespace-pre-wrap dark:text-text-dark light:text-text-light">
                        {sn.text}
                        {(sn.refs ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(sn.refs ?? []).map(r => (
                              <span key={`${r.kind}:${r.id}`} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">{r.label}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {sc.dmNotes && <p className="rounded border-l-2 border-yellow-500/60 pl-2 text-xs text-yellow-200/80 whitespace-pre-wrap">DM：{sc.dmNotes}</p>}
                    {sc.plannedObjectives.length > 0 && (
                      <p className="text-xs text-gray-500">目标：{sc.plannedObjectives.map(o => `${o.title}（${o.outcome}）`).join('；')}</p>
                    )}
                  </article>
                ))}
                {ch.scenes.length === 0 && <p className="text-xs text-gray-500">本章暂无场景</p>}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
