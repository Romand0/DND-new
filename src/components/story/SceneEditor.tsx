// 场景编辑器：时间/空间/团队/依赖/计划/片段/私记 + 实体引用
import { useMemo, useState } from 'react';
import { Plus, Trash2, Link2, X, Search } from 'lucide-react';
import type { Character } from '@/types/character';
import type {
  StoryArc,
  StoryEntityRef,
  StoryObjectiveKind,
  StoryObjectiveOutcome,
  StoryScene,
  StorySceneStatus,
} from '@/types/story';
import { characterStore } from '@/data/characterStore';
import { equipmentStore } from '@/data/equipmentStore';
import { spellStore } from '@/data/spellStore';
import npcTemplateStore from '@/data/npcTemplateStore';
import { createSnippet, nextSceneOrder } from '@/lib/storyModel';

interface Props {
  arc: StoryArc;
  scene: StoryScene;
  characters: Character[];
  onChange: (patch: Partial<StoryScene>) => void;
}

const inputCls = 'w-full px-2 py-1.5 rounded-lg bg-black/20 border border-border-dark text-sm dark:text-text-dark light:text-text-light focus:border-primary outline-none';
const labelCls = 'block text-xs text-gray-400 mb-1';
const btnCls = 'flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-border-dark hover:border-primary/60 hover:text-primary transition-colors';

const STATUS_LABEL: Record<StorySceneStatus, string> = {
  planned: '计划中',
  active: '进行中',
  done: '已完成',
  skipped: '已跳过',
};
const OBJECTIVE_KIND: Record<StoryObjectiveKind, string> = { main: '主线', side: '支线', personal: '个人' };
const OBJECTIVE_OUTCOME: Record<StoryObjectiveOutcome, string> = {
  pending: '待定',
  met: '达成',
  missed: '未达成',
  dropped: '放弃',
};

export default function SceneEditor({ arc, scene, characters, onChange }: Props) {
  const [refSearch, setRefSearch] = useState('');
  const [refSnippetId, setRefSnippetId] = useState<string | null>(null);
  const scenes = arc.chapters.flatMap(ch => ch.scenes).filter(s => s.id !== scene.id);

  const refResults = useMemo<StoryEntityRef[]>(() => {
    const q = refSearch.trim().toLowerCase();
    if (q.length < 1) return [];
    const out: StoryEntityRef[] = [];
    for (const e of equipmentStore.getAll()) {
      if (out.length >= 12) break;
      if (e.name.toLowerCase().includes(q)) out.push({ kind: 'equipment', id: e.id, label: e.name });
    }
    for (const s of spellStore.getAll()) {
      if (out.length >= 12) break;
      if (s.name.toLowerCase().includes(q)) out.push({ kind: 'spell', id: s.id, label: s.name });
    }
    for (const m of npcTemplateStore.getAll()) {
      if (out.length >= 12) break;
      if (m.name.toLowerCase().includes(q)) out.push({ kind: 'monster', id: m.id, label: m.name });
    }
    return out;
  }, [refSearch]);

  function toggleRoster(kind: 'present' | 'absent', id: string) {
    const present = scene.roster.characterIds.filter(x => x !== id);
    const absent = scene.roster.absentCharacterIds.filter(x => x !== id);
    if (kind === 'present') {
      const on = scene.roster.characterIds.includes(id);
      onChange({ roster: { ...scene.roster, characterIds: on ? present : [...present, id], absentCharacterIds: absent } });
    } else {
      const on = scene.roster.absentCharacterIds.includes(id);
      onChange({ roster: { ...scene.roster, characterIds: present, absentCharacterIds: on ? absent : [...absent, id] } });
    }
  }

  function addRef(snippetId: string, ref: StoryEntityRef) {
    onChange({
      snippets: scene.snippets.map(s =>
        s.id === snippetId ? { ...s, refs: [...(s.refs ?? []), ref] } : s
      ),
    });
    setRefSnippetId(null);
    setRefSearch('');
  }

  function removeRef(snippetId: string, ref: StoryEntityRef) {
    onChange({
      snippets: scene.snippets.map(s =>
        s.id === snippetId ? { ...s, refs: (s.refs ?? []).filter(r => !(r.kind === ref.kind && r.id === ref.id)) } : s
      ),
    });
  }

  const planned = scene.plannedReward;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>场景标题</label>
          <input className={inputCls} value={scene.title} onChange={e => onChange({ title: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>状态</label>
          <select className={inputCls} value={scene.status} onChange={e => onChange({ status: e.target.value as StorySceneStatus })}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>章节内顺序</label>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={scene.time.order}
            onChange={e => onChange({ time: { ...scene.time, order: Math.max(0, Number(e.target.value) || 0) } })}
          />
        </div>
        {scene.status === 'skipped' && (
          <div className="col-span-2">
            <label className={labelCls}>跳过原因（必填）</label>
            <input className={inputCls} value={scene.skipReason ?? ''} onChange={e => onChange({ skipReason: e.target.value })} />
          </div>
        )}
      </div>

      <section>
        <h4 className="text-xs font-semibold text-primary mb-2">时间 / 地点</h4>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>游戏日期</label>
            <input type="date" className={inputCls} value={scene.time.gameDate ?? ''} onChange={e => onChange({ time: { ...scene.time, gameDate: e.target.value || undefined } })} />
          </div>
          <div>
            <label className={labelCls}>时刻</label>
            <input
              type="time"
              className={inputCls}
              value={`${String(Math.floor((scene.time.gameMinute ?? 0) / 60)).padStart(2, '0')}:${String((scene.time.gameMinute ?? 0) % 60).padStart(2, '0')}`}
              onChange={e => {
                const [h, m] = e.target.value.split(':').map(Number);
                onChange({ time: { ...scene.time, gameMinute: (h || 0) * 60 + (m || 0) } });
              }}
            />
          </div>
          <div>
            <label className={labelCls}>跑团场次</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={scene.time.sessionNo ?? ''}
              onChange={e => onChange({ time: { ...scene.time, sessionNo: e.target.value === '' ? undefined : Number(e.target.value) } })}
            />
          </div>
          <div>
            <label className={labelCls}>地点名</label>
            <input className={inputCls} value={scene.location.name} onChange={e => onChange({ location: { ...scene.location, name: e.target.value } })} />
          </div>
          <div>
            <label className={labelCls}>区域</label>
            <input className={inputCls} value={scene.location.region ?? ''} onChange={e => onChange({ location: { ...scene.location, region: e.target.value || undefined } })} />
          </div>
          <div>
            <label className={labelCls}>沙盘 ID</label>
            <input className={inputCls} value={scene.location.battlegroundId ?? ''} onChange={e => onChange({ location: { ...scene.location, battlegroundId: e.target.value || undefined } })} />
          </div>
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-primary mb-2">在场 / 缺席</h4>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border-dark divide-y divide-border-dark/60">
          {characters.map(c => (
            <div key={c.id} className="flex items-center justify-between px-2 py-1.5 text-sm">
              <span className="truncate dark:text-text-dark light:text-text-light">{c.name}</span>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scene.roster.characterIds.includes(c.id)}
                    onChange={() => toggleRoster('present', c.id)}
                  />
                  在场
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scene.roster.absentCharacterIds.includes(c.id)}
                    onChange={() => toggleRoster('absent', c.id)}
                  />
                  缺席
                </label>
              </div>
            </div>
          ))}
          {characters.length === 0 && <p className="px-2 py-2 text-xs text-gray-500">当前团组暂无角色</p>}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-primary mb-2">前置场景</h4>
        <div className="flex flex-wrap gap-2">
          {scenes.map(s => {
            const on = scene.dependsOn.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() =>
                  onChange({ dependsOn: on ? scene.dependsOn.filter(id => id !== s.id) : [...scene.dependsOn, s.id] })
                }
                className={`px-2 py-1 rounded-lg text-xs border ${on ? 'border-primary text-primary bg-primary/10' : 'border-border-dark text-gray-400'}`}
              >
                {s.title}
              </button>
            );
          })}
          {scenes.length === 0 && <span className="text-xs text-gray-500">暂无其他场景</span>}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-primary">计划目标</h4>
          <button
            className={btnCls}
            onClick={() =>
              onChange({
                plannedObjectives: [
                  ...scene.plannedObjectives,
                  { id: crypto.randomUUID(), kind: 'main', title: '', assigneeIds: [], outcome: 'pending' },
                ],
              })
            }
          >
            <Plus className="w-3 h-3" /> 目标
          </button>
        </div>
        <div className="space-y-2">
          {scene.plannedObjectives.map(obj => (
            <div key={obj.id} className="flex items-center gap-2">
              <select
                className={`${inputCls} w-20`}
                value={obj.kind}
                onChange={e => onChange({ plannedObjectives: scene.plannedObjectives.map(o => (o.id === obj.id ? { ...o, kind: e.target.value as StoryObjectiveKind } : o)) })}
              >
                {Object.entries(OBJECTIVE_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input
                className={inputCls}
                placeholder="目标描述"
                value={obj.title}
                onChange={e => onChange({ plannedObjectives: scene.plannedObjectives.map(o => (o.id === obj.id ? { ...o, title: e.target.value } : o)) })}
              />
              <select
                className={`${inputCls} w-24`}
                value={obj.outcome}
                onChange={e => onChange({ plannedObjectives: scene.plannedObjectives.map(o => (o.id === obj.id ? { ...o, outcome: e.target.value as StoryObjectiveOutcome } : o)) })}
              >
                {Object.entries(OBJECTIVE_OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button
                className="text-gray-500 hover:text-red-400"
                onClick={() => onChange({ plannedObjectives: scene.plannedObjectives.filter(o => o.id !== obj.id) })}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-semibold text-primary mb-2">计划奖励</h4>
        <div className="grid grid-cols-5 gap-2">
          {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map(k => (
            <div key={k}>
              <label className={labelCls}>{k.toUpperCase()}</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={planned.currency?.[k] ?? 0}
                onChange={e =>
                  onChange({
                    plannedReward: {
                      ...planned,
                      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0, ...(planned.currency ?? {}), [k]: Math.max(0, Number(e.target.value) || 0) },
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className={labelCls}>经验</label>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={planned.experience ?? 0}
              onChange={e => onChange({ plannedReward: { ...planned, experience: Math.max(0, Number(e.target.value) || 0) } })}
            />
          </div>
          <div>
            <label className={labelCls}>奖励备注</label>
            <input
              className={inputCls}
              value={planned.notes ?? ''}
              onChange={e => onChange({ plannedReward: { ...planned, notes: e.target.value || undefined } })}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-primary">讲述片段（仅 DM 可见）</h4>
          <button className={btnCls} onClick={() => onChange({ snippets: [...scene.snippets, createSnippet()] })}>
            <Plus className="w-3 h-3" /> 片段
          </button>
        </div>
        <div className="space-y-3">
          {scene.snippets.map((sn, idx) => (
            <div key={sn.id} className="rounded-lg border border-border-dark p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">片段 {idx + 1}</span>
                <div className="flex items-center gap-2">
                  <button className={btnCls} onClick={() => setRefSnippetId(refSnippetId === sn.id ? null : sn.id)}>
                    <Link2 className="w-3 h-3" /> 引用
                  </button>
                  <button className="text-gray-500 hover:text-red-400" onClick={() => onChange({ snippets: scene.snippets.filter(s => s.id !== sn.id) })}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <textarea
                className={`${inputCls} min-h-24`}
                placeholder="粘贴或撰写讲述文本"
                value={sn.text}
                onChange={e => onChange({ snippets: scene.snippets.map(s => (s.id === sn.id ? { ...s, text: e.target.value } : s)) })}
              />
              {(sn.refs ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(sn.refs ?? []).map(r => (
                    <span key={`${r.kind}:${r.id}`} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">
                      {r.label}
                      <button onClick={() => removeRef(sn.id, r)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              {refSnippetId === sn.id && (
                <div className="rounded-lg border border-border-dark p-2 space-y-2">
                  <div className="flex items-center gap-1">
                    <Search className="w-3.5 h-3.5 text-gray-500" />
                    <input
                      autoFocus
                      className={inputCls}
                      placeholder="搜索装备 / 法术 / 怪物"
                      value={refSearch}
                      onChange={e => setRefSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {refResults.map(r => (
                      <button key={`${r.kind}:${r.id}`} className="block w-full text-left px-2 py-1 rounded text-xs hover:bg-white/10" onClick={() => addRef(sn.id, r)}>
                        <span className="text-gray-500 mr-2">{[r.kind]}</span>{r.label}
                      </button>
                    ))}
                    {refSearch && refResults.length === 0 && <p className="text-xs text-gray-500">无匹配</p>}
                  </div>
                </div>
              )}
            </div>
          ))}
          {scene.snippets.length === 0 && <p className="text-xs text-gray-500">尚未添加片段</p>}
        </div>
      </section>

      <section>
        <label className={labelCls}>DM 私记（玩家永不可见）</label>
        <textarea className={`${inputCls} min-h-20`} value={scene.dmNotes ?? ''} onChange={e => onChange({ dmNotes: e.target.value || undefined })} />
      </section>

      <section className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>结果备注</label>
          <textarea className={`${inputCls} min-h-16`} value={scene.resultNotes ?? ''} onChange={e => onChange({ resultNotes: e.target.value || undefined })} />
        </div>
        <div>
          <label className={labelCls}>战斗记录 ID</label>
          <input className={inputCls} value={scene.combatRecordId ?? ''} onChange={e => onChange({ combatRecordId: e.target.value || undefined })} />
          <label className={`${labelCls} mt-2`}>下一场景顺序参考</label>
          <p className="text-xs text-gray-500">当前章节下一个空位：{nextSceneOrder(arc.chapters.flatMap(c => c.scenes))}</p>
        </div>
      </section>
    </div>
  );
}
