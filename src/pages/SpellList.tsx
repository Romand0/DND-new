import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEditorState } from '@/data/editorState';
import { Sparkles, Plus, Edit2, Trash2, Search, Filter } from 'lucide-react';
import type { Spell } from '@/types/spell';
import SpellEditor from '@/components/SpellEditor';
import { api } from '@/lib/api';

const levelLabels: Record<number, string> = {
  0: '戏法', 1: '1环', 2: '2环', 3: '3环', 4: '4环',
  5: '5环', 6: '6环', 7: '7环', 8: '8环', 9: '9环',
};

export default function SpellList() {
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [spells, setSpells] = useState<Spell[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSpell, setEditingSpell] = useState<Spell | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEditorState(editorOpen);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchAllSpells();
      setSpells(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredSpells = useMemo(() => {
    return spells.filter(spell => {
      const matchesSearch =
        spell.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        spell.school.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLevel = levelFilter === 'all' || spell.level === levelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [spells, searchQuery, levelFilter]);

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
        await api.updateSpell(editingSpell.id, spell);
      } else {
        await api.createSpell(spell);
      }
      setEditorOpen(false);
      setEditingSpell(undefined);
      load();
    } catch (e: any) {
      setError(e.message || '保存失败');
      throw e; // SpellEditor 内部可能也要 catch
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSpell = async (id: string) => {
    if (!isDM) return;
    setSaving(true);
    setError('');
    try {
      await api.deleteSpell(id);
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索法术名称或学派..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary" />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
          <select value={levelFilter}
            onChange={e => setLevelFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="pl-10 pr-8 py-2 rounded-lg border bg-transparent outline-none appearance-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary">
            <option value="all" className="dark:bg-bg-dark light:bg-bg-light">全部环级</option>
            {[0,1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l} className="dark:bg-bg-dark light:bg-bg-light">{levelLabels[l]}</option>)}
          </select>
        </div>
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

      {/* SpellEditor —— 注意：原版 SpellEditor 只有 spell/isOpen/onClose/onSave 四个 prop，无 onDelete/loading */}
      <SpellEditor
        spell={editingSpell}
        isOpen={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingSpell(undefined); }}
        onSave={handleSaveSpell}
      />

      {/* 删除确认浮层（保留原版逻辑，不走 Editor 的 onDelete） */}
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
