import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEditorState } from '@/data/editorState';
import { Search, Plus, Edit2, Trash2, GripVertical } from 'lucide-react';
import type { NpcTemplate } from '@/types/combat';
import MonsterCard from '@/components/MonsterCard';
import MonsterEditor from '@/components/MonsterEditor';
import npcTemplateStore from '@/data/npcTemplateStore';

// 筛选状态持久化 key
const STORAGE_KEY_SEARCH = 'monsterList.search';
const STORAGE_KEY_TYPE = 'monsterList.type';
const STORAGE_KEY_CR = 'monsterList.cr';
const STORAGE_KEY_SIZE = 'monsterList.size';
const STORAGE_KEY_SCROLL = 'monsterList.scroll';

// 读取已保存的筛选状态
function loadSearchQuery(): string {
  try { return sessionStorage.getItem(STORAGE_KEY_SEARCH) || ''; } catch { return ''; }
}
function loadTypeFilter(): string {
  try { return sessionStorage.getItem(STORAGE_KEY_TYPE) || ''; } catch { return ''; }
}
function loadCrFilter(): number | 'all' {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY_CR);
    if (v === null || v === 'all') return 'all';
    const n = parseFloat(v);
    return isNaN(n) ? 'all' : n;
  } catch { return 'all'; }
}
function loadSizeFilter(): string {
  try { return sessionStorage.getItem(STORAGE_KEY_SIZE) || ''; } catch { return ''; }
}

export default function MonsterList() {
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [templates, setTemplates] = useState<NpcTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState(loadSearchQuery);
  const [typeFilter, setTypeFilter] = useState(loadTypeFilter);
  const [crFilter, setCrFilter] = useState<number | 'all'>(loadCrFilter);
  const [sizeFilter, setSizeFilter] = useState(loadSizeFilter);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NpcTemplate | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEditorState(editorOpen);

  // 筛选状态写入 sessionStorage
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_SEARCH, searchQuery); } catch {} }, [searchQuery]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_TYPE, typeFilter); } catch {} }, [typeFilter]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_CR, String(crFilter)); } catch {} }, [crFilter]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_SIZE, sizeFilter); } catch {} }, [sizeFilter]);

  // 滚动位置保存 + 返回时恢复
  useEffect(() => {
    const onScroll = () => { try { sessionStorage.setItem(STORAGE_KEY_SCROLL, String(window.scrollY)); } catch {} };
    window.addEventListener('scroll', onScroll, { passive: true });
    const saved = sessionStorage.getItem(STORAGE_KEY_SCROLL);
    if (saved) {
      const top = parseInt(saved, 10);
      if (!isNaN(top)) requestAnimationFrame(() => { window.scrollTo(0, top); });
    }
    return () => window.removeEventListener('scroll', onScroll);
  }, [loading]);

  const load = () => {
    setLoading(true);
    setError('');
    try {
      setTemplates(npcTemplateStore.getAll());
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // 派生:所有出现的类型和尺寸
  const allTypes = useMemo(() => {
    const set = new Set<string>();
    templates.forEach(t => t.type && set.add(t.type));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [templates]);
  const allSizes = useMemo(() => {
    const set = new Set<string>();
    templates.forEach(t => t.size && set.add(t.size));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.templateId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.type?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || t.type === typeFilter;
      const matchesCr = crFilter === 'all' ||         t.cr === crFilter?.toString();
      const matchesSize = sizeFilter === 'all' || t.size === sizeFilter;
      return matchesSearch && matchesType && matchesCr && matchesSize;
    });
  }, [templates, searchQuery, typeFilter, crFilter, sizeFilter]);

  const clearAllFilters = () => {
    setTypeFilter('all');
    setCrFilter('all');
    setSizeFilter('all');
    setSearchQuery('');
  };
  const hasAnyFilter = typeFilter !== 'all' || crFilter !== 'all' || sizeFilter !== 'all' || searchQuery !== '';

  const sortedTemplates = useMemo(() => {
    return [...filteredTemplates].sort((a, b) => {
      // 先按 CR 升序,再按名称拼音序
      if (a.cr !== undefined && b.cr !== undefined) {
        const aCr = parseFloat(a.cr) || 0;
        const bCr = parseFloat(b.cr) || 0;
        if (aCr !== bCr) return aCr - bCr;
      }
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [filteredTemplates]);

  const handleSaveTemplate = (template: NpcTemplate) => {
    if (!isDM) return;
    setSaving(true);
    setError('');
    try {
      if (editingTemplate) {
        npcTemplateStore.update(editingTemplate.id, template);
      } else {
        npcTemplateStore.create(template);
      }
      setEditorOpen(false);
      setEditingTemplate(undefined);
      load();
    } catch (e: any) {
      setError(e.message || '保存失败');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = (id: string) => {
    if (!isDM) return;
    setSaving(true);
    setError('');
    try {
      npcTemplateStore.delete(id);
      setDeleteConfirm(null);
      load();
    } catch (e: any) {
      setError(e.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (template: NpcTemplate) => {
    if (!isDM) return;
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleAdd = () => {
    if (!isDM) return;
    setEditingTemplate(undefined);
    setEditorOpen(true);
  };

  const crLabels: Record<number, string> = {
    0: '0',
    0.25: '1⁄4',
    0.5: '1⁄2',
    1: '1',
    2: '2',
    3: '3',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
    9: '9',
    10: '10',
    11: '11',
    12: '12',
    13: '13',
    14: '14',
    15: '15',
    16: '16',
    17: '17',
    18: '18',
    19: '19',
    20: '20',
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <span className="text-3xl">👹</span> 怪物图鉴
          </h1>
          <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">共 {templates.length} 个怪物模板</p>
        </div>
        {isDM && (
          <button onClick={handleAdd} className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> 新建怪物
          </button>
        )}
      </div>

      {error && <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">{error}</div>}

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索怪物名称、模板 ID 或种类..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
        />
      </div>

      {/* 筛选区 */}
      <div className="space-y-2.5 rounded-xl border p-3 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light">
        {/* 种类 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">种类</span>
          <button
            onClick={() => setTypeFilter(typeFilter === 'all' ? '' : 'all')}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${typeFilter === 'all' ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
          >全部</button>
          {allTypes.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${typeFilter === type ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
            >{type}</button>
          ))}
        </div>
        {/* CR */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">CR</span>
          <button
            onClick={() => setCrFilter(crFilter === 'all' ? 0 : 'all')}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${crFilter === 'all' ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
          >全部</button>
          {[0, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(cr => (
            <button
              key={cr}
              onClick={() => setCrFilter(crFilter === cr ? 'all' : cr)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${crFilter === cr ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
            >{crLabels[cr] || cr}</button>
          ))}
        </div>
        {/* 尺寸 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">尺寸</span>
          <button
            onClick={() => setSizeFilter(sizeFilter === 'all' ? '' : 'all')}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${sizeFilter === 'all' ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
          >全部</button>
          {allSizes.map(size => (
            <button
              key={size}
              onClick={() => setSizeFilter(sizeFilter === size ? 'all' : size)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${sizeFilter === size ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
            >{size}</button>
          ))}
        </div>
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
              <th className="text-center px-4 py-3 text-sm font-medium w-16 dark:text-text-dark-muted light:text-text-light-muted">CR</th>
              <th className="text-center px-4 py-3 text-sm font-medium w-20 dark:text-text-dark-muted light:text-text-light-muted">尺寸·种类</th>
              <th className="text-center px-4 py-3 text-sm font-medium w-16 dark:text-text-dark-muted light:text-text-light-muted">AC</th>
              <th className="text-center px-4 py-3 text-sm font-medium w-16 dark:text-text-dark-muted light:text-text-light-muted">HP</th>
              <th className="text-center px-4 py-3 text-sm font-medium w-20 dark:text-text-dark-muted light:text-text-light-muted">速度</th>
              <th className="text-center px-4 py-3 text-sm font-medium w-20 dark:text-text-dark-muted light:text-text-light-muted">攻击</th>
              {isDM && <th className="text-right px-4 py-3 text-sm font-medium w-24 dark:text-text-dark-muted light:text-text-light-muted">操作</th>}
            </tr>
          </thead>
          <tbody>
            {sortedTemplates.length === 0 ? (
              <tr><td colSpan={isDM ? 7 : 6} className="px-4 py-12 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">暂无匹配的怪物</td></tr>
            ) : (
              sortedTemplates.map(template => (
                <tr key={template.id} className="border-b last:border-0 dark:border-border-dark/50 light:border-border-light/50 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/monsters/${template.id}`)} className="text-left font-medium hover:text-primary dark:text-text-dark light:text-text-light">
                      {template.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${template.cr === undefined ? 'bg-gray-500/20 text-gray-400' : 'bg-primary/20 text-primary'}`}>
                      {template.cr === undefined ? '—' : crLabels[template.cr] || template.cr}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm dark:text-text-dark light:text-text-light">
                    {template.size && template.type ? `${template.size}·${template.type}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm dark:text-text-dark light:text-text-light">{template.ac}</td>
                  <td className="px-4 py-3 text-center text-sm dark:text-text-dark light:text-text-light">{template.maxHp}</td>
                  <td className="px-4 py-3 text-center text-sm dark:text-text-dark light:text-text-light">{template.speed}尺</td>
                  <td className="px-4 py-3 text-center text-sm dark:text-text-dark light:text-text-light">{template.attacks.length}</td>
                  {isDM && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(template)} className="p-1.5 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted hover:text-primary" title="编辑"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteConfirm(template.id)} className="p-1.5 rounded hover:bg-danger/20 dark:text-text-dark-muted light:text-text-light-muted hover:text-danger" title="删除"><Trash2 className="w-4 h-4" /></button>
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
        {sortedTemplates.length === 0 ? (
          <div className="text-center py-12 text-sm dark:text-text-dark-muted light:text-text-light-muted rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light">
            暂无匹配的怪物
          </div>
        ) : (
          sortedTemplates.map(template => (
            <MonsterCard key={template.id} template={template} />
          ))
        )}
      </div>

      <MonsterEditor
        initialTemplate={editingTemplate}
        isOpen={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingTemplate(undefined); }}
        onSave={handleSaveTemplate}
      />

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-sm rounded-xl border p-6 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">确认删除</h3>
            <p className="text-sm mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要删除怪物「{templates.find(t => t.id === deleteConfirm)?.name}」吗?此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} disabled={saving}
                className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 disabled:opacity-50">
                取消
              </button>
              <button onClick={() => handleDeleteTemplate(deleteConfirm)} disabled={saving}
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
