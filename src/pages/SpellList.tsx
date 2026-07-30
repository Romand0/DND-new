import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEditorState } from '@/data/editorState';
import { Sparkles, Plus, Edit2, Trash2, Search } from 'lucide-react';
import type { Spell } from '@/types/spell';
import SpellEditor from '@/components/SpellEditor';
import { fetchAllSpells, createSpell, updateSpell, deleteSpell } from '@/lib/api';

const levelLabels: Record<number, string> = {
  0: '戏法', 1: '1环', 2: '2环', 3: '3环', 4: '4环',
  5: '5环', 6: '6环', 7: '7环', 8: '8环', 9: '9环',
};

// 筛选状态持久化 key（跨导航保留，关标签页清空）
const STORAGE_KEY_SEARCH = 'spellList.search';
const STORAGE_KEY_LEVEL = 'spellList.level';
const STORAGE_KEY_CLASSES = 'spellList.classes';
const STORAGE_KEY_SCHOOL = 'spellList.school';
const STORAGE_KEY_SCROLL = 'spellList.scroll';

// 读取已保存的筛选状态；无效则返回默认值
function loadSearchQuery(): string {
  try { return sessionStorage.getItem(STORAGE_KEY_SEARCH) || ''; } catch { return ''; }
}
function loadLevelFilter(): number | 'all' {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY_LEVEL);
    if (v === null || v === 'all') return 'all';
    const n = parseInt(v, 10);
    return isNaN(n) ? 'all' : n;
  } catch { return 'all'; }
}
function loadClassesFilter(): string[] {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY_CLASSES);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}
function loadSchoolFilter(): string[] {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY_SCHOOL);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

export default function SpellList() {
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [spells, setSpells] = useState<Spell[]>([]);
  const [searchQuery, setSearchQuery] = useState(loadSearchQuery);
  const [levelFilter, setLevelFilter] = useState<number | 'all'>(loadLevelFilter);
  // 职业 / 学派筛选：多选，空数组 = 不筛
  const [classesFilter, setClassesFilter] = useState<string[]>(loadClassesFilter);
  const [schoolFilter, setSchoolFilter] = useState<string[]>(loadSchoolFilter);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSpell, setEditingSpell] = useState<Spell | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEditorState(editorOpen);

  // 筛选状态写入 sessionStorage
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_SEARCH, searchQuery); } catch {} }, [searchQuery]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_LEVEL, String(levelFilter)); } catch {} }, [levelFilter]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classesFilter)); } catch {} }, [classesFilter]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_SCHOOL, JSON.stringify(schoolFilter)); } catch {} }, [schoolFilter]);

  // 滚动位置保存（窗口滚动）+ 返回时恢复
  useEffect(() => {
    const onScroll = () => { try { sessionStorage.setItem(STORAGE_KEY_SCROLL, String(window.scrollY)); } catch {} };
    window.addEventListener('scroll', onScroll, { passive: true });
    // 恢复
    const saved = sessionStorage.getItem(STORAGE_KEY_SCROLL);
    if (saved) {
      const top = parseInt(saved, 10);
      if (!isNaN(top)) requestAnimationFrame(() => { window.scrollTo(0, top); });
    }
    return () => window.removeEventListener('scroll', onScroll);
  }, [loading]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAllSpells();
      setSpells(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // 派生：所有出现过的职业 / 学派（用于筛选标签）
  const allClasses = useMemo(() => {
    const set = new Set<string>();
    spells.forEach(s => s.classes?.forEach(c => set.add(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [spells]);
  const allSchools = useMemo(() => {
    const set = new Set<string>();
    spells.forEach(s => s.school && set.add(s.school));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [spells]);

  const filteredSpells = useMemo(() => {
    return spells.filter(spell => {
      const matchesSearch =
        spell.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        spell.school.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLevel = levelFilter === 'all' || spell.level === levelFilter;
      const matchesClass = classesFilter.length === 0 || classesFilter.some(c => spell.classes?.includes(c));
      const matchesSchool = schoolFilter.length === 0 || schoolFilter.includes(spell.school);
      return matchesSearch && matchesLevel && matchesClass && matchesSchool;
    });
  }, [spells, searchQuery, levelFilter, classesFilter, schoolFilter]);

  // 标签切换工具
  const toggleTag = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  const clearAllFilters = () => {
    setLevelFilter('all');
    setClassesFilter([]);
    setSchoolFilter([]);
    setSearchQuery('');
  };
  const hasAnyFilter = levelFilter !== 'all' || classesFilter.length > 0 || schoolFilter.length > 0 || searchQuery !== '';

  const sortedSpells = useMemo(() => {
    return [...filteredSpells].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [filteredSpells]);

  const handleSaveSpell = async (spell: Spell) => {
    if (!isDM) return;
    setSaving(true);
    setError('');
    try {
      if (editingSpell) {
        await updateSpell(editingSpell.id, spell);
      } else {
        await createSpell(spell);
      }
      setEditorOpen(false);
      setEditingSpell(undefined);
      load();
    } catch (e: any) {
      setError(e.message || '保存失败');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSpell = async (id: string) => {
    if (!isDM) return;
    setSaving(true);
    setError('');
    try {
      await deleteSpell(id);
      setDeleteConfirm(null);
      load();
    } catch (e: any) {
      setError(e.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (spell: Spell) => {
    if (!isDM) return;
    setEditingSpell(spell);
    setEditorOpen(true);
  };

  const handleAdd = () => {
    if (!isDM) return;
    setEditingSpell(undefined);
    setEditorOpen(true);
  };

  const getComponentAbbr = (components: Spell['components']) => {
    const parts: string[] = [];
    if (components.verbal) parts.push('V');
    if (components.somatic) parts.push('S');
    if (components.material) parts.push('M');
    return parts.join(',');
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <Sparkles className="w-7 h-7 text-primary" /> 法术库
          </h1>
          <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">共 {spells.length} 个法术</p>
        </div>
        {isDM && (
          <button onClick={handleAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> 新增法术
          </button>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">{error}</div>}

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索法术名称或学派..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary" />
      </div>

      {/* 筛选区：环级 / 职业 / 学派 三组标签，可叠加 */}
      <div className="space-y-2.5 rounded-xl border p-3 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light">
        {/* 环级 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">环级</span>
          <button
            onClick={() => setLevelFilter('all')}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${levelFilter === 'all' ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
          >全部</button>
          {[0,1,2,3,4,5,6,7,8,9].map(l => (
            <button
              key={l}
              onClick={() => setLevelFilter(levelFilter === l ? 'all' : l)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${levelFilter === l ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
            >{levelLabels[l]}</button>
          ))}
        </div>
        {/* 职业 */}
        {allClasses.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">职业</span>
            {allClasses.map(cls => (
              <button
                key={cls}
                onClick={() => setClassesFilter(prev => toggleTag(prev, cls))}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${classesFilter.includes(cls) ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
              >{cls}</button>
            ))}
          </div>
        )}
        {/* 学派 */}
        {allSchools.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">学派</span>
            {allSchools.map(sch => (
              <button
                key={sch}
                onClick={() => setSchoolFilter(prev => toggleTag(prev, sch))}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${schoolFilter.includes(sch) ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
              >{sch}</button>
            ))}
          </div>
        )}
        {/* 清空 */}
        {hasAnyFilter && (
          <div className="pt-1">
            <button
              onClick={clearAllFilters}
              className="text-xs text-danger hover:underline"
            >清空所有筛选</button>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b dark:border-border-dark light:border-border-light">
              <th className="text-left px-4 py-3 text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">名称</th>
              <th className="text-center px-4 py-3 text-sm font-medium w-20 dark:text-text-dark-muted light:text-text-light-muted">环级</th>
              <th className="text-center px-4 py-3 text-sm font-medium w-24 dark:text-text-dark-muted light:text-text-light-muted">学派</th>
              <th className="text-center px-4 py-3 text-sm font-medium w-24 dark:text-text-dark-muted light:text-text-light-muted">施法时间</th>
              <th className="text-center px-4 py-3 text-sm font-medium w-20 dark:text-text-dark-muted light:text-text-light-muted">成分</th>
              {isDM && <th className="text-right px-4 py-3 text-sm font-medium w-24 dark:text-text-dark-muted light:text-text-light-muted">操作</th>}
            </tr>
          </thead>
          <tbody>
            {sortedSpells.length === 0 ? (
              <tr><td colSpan={isDM ? 6 : 5} className="px-4 py-12 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">暂无匹配的法术</td></tr>
            ) : (
              sortedSpells.map(spell => (
                <tr key={spell.id} className="border-b last:border-0 dark:border-border-dark/50 light:border-border-light/50 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/spells/${spell.id}`)} className="text-left font-medium hover:text-primary dark:text-text-dark light:text-text-light">
                      {spell.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${spell.level === 0 ? 'bg-gray-500/20 text-gray-400' : 'bg-primary/20 text-primary'}`}>
                      {levelLabels[spell.level]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm dark:text-text-dark light:text-text-light">{spell.school}</td>
                  <td className="px-4 py-3 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">{spell.castingTime}</td>
                  <td className="px-4 py-3 text-center text-xs font-mono dark:text-text-dark-muted light:text-text-light-muted">{getComponentAbbr(spell.components)}</td>
                  {isDM && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(spell)} className="p-1.5 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted hover:text-primary" title="编辑"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteConfirm(spell.id)} className="p-1.5 rounded hover:bg-danger/20 dark:text-text-dark-muted light:text-text-light-muted hover:text-danger" title="删除"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {sortedSpells.length === 0 ? (
          <div className="text-center py-12 text-sm dark:text-text-dark-muted light:text-text-light-muted rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light">
            暂无匹配的法术
          </div>
        ) : (
          sortedSpells.map(spell => (
            <div key={spell.id} className="p-4 rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => navigate(`/spells/${spell.id}`)} className="text-left flex-1">
                  <h3 className="font-medium hover:text-primary dark:text-text-dark light:text-text-light">{spell.name}</h3>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${spell.level === 0 ? 'bg-gray-500/20 text-gray-400' : 'bg-primary/20 text-primary'}`}>{levelLabels[spell.level]}</span>
                    <span className="text-xs dark:text-text-dark light:text-text-light">{spell.school}</span>
                  </div>
                </button>
                {isDM && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleEdit(spell)} className="p-1.5 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted hover:text-primary" title="编辑"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => setDeleteConfirm(spell.id)} className="p-1.5 rounded hover:bg-danger/20 dark:text-text-dark-muted light:text-text-light-muted hover:text-danger" title="删除"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                <span>施法时间: {spell.castingTime}</span>
                <span>成分: {getComponentAbbr(spell.components) || '无'}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <SpellEditor
        spell={editingSpell}
        isOpen={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingSpell(undefined); }}
        onSave={handleSaveSpell}
      />

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-xl border p-6 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">确认删除</h3>
            <p className="text-sm mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要删除法术「{spells.find(s => s.id === deleteConfirm)?.name}」吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} disabled={saving}
                className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 disabled:opacity-50">
                取消
              </button>
              <button onClick={() => handleDeleteSpell(deleteConfirm)} disabled={saving}
                className="px-4 py-2 bg-danger hover:bg-danger/80 text-white rounded-lg disabled:opacity-50">
                {saving ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
