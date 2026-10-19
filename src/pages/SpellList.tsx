import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, memo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEditorState } from '@/data/editorState';
import { spellStore } from '@/data/spellStore';
import { Sparkles, Plus, Edit2, Trash2, Search } from 'lucide-react';
import type { Spell } from '@/types/spell';
import SpellEditor from '@/components/SpellEditor';
import { createSpell, updateSpell, deleteSpell } from '@/lib/api';
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual';

const levelLabels: Record<number, string> = {
  0: '戏法', 1: '1环', 2: '2环', 3: '3环', 4: '4环',
  5: '5环', 6: '6环', 7: '7环', 8: '8环', 9: '9环',
};

// 关键施法时间前缀：只锚定开头，后面的补充说明整句省略（注意 附赠动作 须排在 动作 之前）
const CASTING_TIME_PREFIX = /^(\d+\s*(?:附赠动作|反应|动作|回合|分钟|小时|日)|即刻|特殊)/;

// 智能施法时间显示组件：关键信息完整显示，后续文字用渐变消失的省略号代替
const SmartCastingTime = ({ castingTime }: { castingTime: string }) => {
  const text = castingTime.trim();
  const match = text.match(CASTING_TIME_PREFIX);

  if (!match) {
    // 无关键前缀：inline-block 让 overflow/max-width 生效，走渐变截断
    return <span className="mobile-ellipsis inline-block">{text}</span>;
  }

  const key = match[0];
  const rest = text.slice(key.length).trim();

  return (
    <span className="whitespace-nowrap">
      {key}
      {rest && (
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-current to-transparent">…</span>
      )}
    </span>
  );
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

// 桌面表格列模板：名称自适应，其余列与原 th 的 w-20/w-24 对齐；DM 多一列操作
const GRID_TMPL_BASE = 'minmax(0,1fr) 5rem 6rem 6rem 5rem';
const GRID_TMPL_DM = `${GRID_TMPL_BASE} 6rem`;

function getComponentAbbr(components: Spell['components']) {
  const parts: string[] = [];
  if (components.verbal) parts.push('V');
  if (components.somatic) parts.push('S');
  if (components.material) parts.push('M');
  return parts.join(',');
}

// 双树渲染（hidden md:block 两份 DOM 同时挂载）在数百行下 reconciliation 翻倍，改为单一分支渲染
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

interface ListCallbacks {
  onOpen: (id: string) => void;
  onEdit: (spell: Spell) => void;
  onDelete: (id: string) => void;
}

interface SpellRowProps extends ListCallbacks {
  spell: Spell;
  isDM: boolean;
}

// memo 化行组件：筛选/输入引发的整表重渲只重新 diff 虚拟窗口内的常驻行
const SpellRow = memo(function SpellRow(props: SpellRowProps) {
  const { spell, isDM, onOpen, onEdit, onDelete } = props;
  return (
    <div
      className="grid items-center h-12 border-b last:border-0 dark:border-border-dark/50 light:border-border-light/50 hover:bg-white/5 transition-colors"
      style={{ gridTemplateColumns: isDM ? GRID_TMPL_DM : GRID_TMPL_BASE }}
    >
      <div className="px-4 min-w-0">
        <button onClick={() => onOpen(spell.id)} className="block w-full text-left font-medium hover:text-primary dark:text-text-dark light:text-text-light truncate">
          {spell.name}
        </button>
      </div>
      <div className="justify-self-center">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${spell.level === 0 ? 'bg-gray-500/20 text-gray-400' : 'bg-primary/20 text-primary'}`}>
          {levelLabels[spell.level]}
        </span>
      </div>
      <div className="justify-self-center text-sm dark:text-text-dark light:text-text-light">{spell.school}</div>
      <div className="px-4 min-w-0">
        <span className="table-ellipsis text-sm dark:text-text-dark-muted light:text-text-light-muted inline-block">{spell.castingTime}</span>
      </div>
      <div className="justify-self-center text-xs font-mono dark:text-text-dark-muted light:text-text-light-muted">{getComponentAbbr(spell.components)}</div>
      {isDM && (
        <div className="px-4 flex items-center justify-end gap-1">
          <button onClick={() => onEdit(spell)} className="p-1.5 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted hover:text-primary" title="编辑"><Edit2 className="w-4 h-4" /></button>
          <button onClick={() => onDelete(spell.id)} className="p-1.5 rounded hover:bg-danger/20 dark:text-text-dark-muted light:text-text-light-muted hover:text-danger" title="删除"><Trash2 className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
});

interface SpellCardProps extends ListCallbacks {
  spell: Spell;
  isDM: boolean;
}

const SpellCard = memo(function SpellCard(props: SpellCardProps) {
  const { spell, isDM, onOpen, onEdit, onDelete } = props;
  return (
    <div className="p-4 rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => onOpen(spell.id)} className="text-left flex-1 min-w-0">
          <h3 className="font-medium hover:text-primary dark:text-text-dark light:text-text-light truncate">{spell.name}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${spell.level === 0 ? 'bg-gray-500/20 text-gray-400' : 'bg-primary/20 text-primary'}`}>{levelLabels[spell.level]}</span>
            <span className="text-xs dark:text-text-dark light:text-text-light">{spell.school}</span>
          </div>
        </button>
        {isDM && (
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(spell)} className="p-1.5 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted hover:text-primary" title="编辑"><Edit2 className="w-4 h-4" /></button>
            <button onClick={() => onDelete(spell.id)} className="p-1.5 rounded hover:bg-danger/20 dark:text-text-dark-muted light:text-text-light-muted hover:text-danger" title="删除"><Trash2 className="w-4 h-4" /></button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs dark:text-text-dark-muted light:text-text-light-muted">
        <span>
          施法时间: <SmartCastingTime castingTime={spell.castingTime} />
        </span>
        <span>成分: {getComponentAbbr(spell.components) || '无'}</span>
      </div>
    </div>
  );
});

interface VirtualListProps extends ListCallbacks {
  spells: Spell[];
  isDM: boolean;
}

// 桌面：CSS Grid 行 + 内部滚动容器虚拟化，500 行常驻 DOM 从 500+ 降到约 20
function DesktopSpellTable(props: VirtualListProps) {
  const { spells, isDM, onOpen, onEdit, onDelete } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  // 行高固定 h-12 = 48px（border-box 含下边框），虚拟器按整数值定位
  const rowVirtualizer = useVirtualizer({
    count: spells.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 8,
  });
  const gridTemplate = isDM ? GRID_TMPL_DM : GRID_TMPL_BASE;

  return (
    <div className="rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light overflow-hidden">
      <div className="grid items-center h-12 border-b dark:border-border-dark light:border-border-light" style={{ gridTemplateColumns: gridTemplate }}>
        <span className="px-4 text-left text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">名称</span>
        <span className="justify-self-center text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">环级</span>
        <span className="justify-self-center text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">学派</span>
        <span className="px-4 text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">施法时间</span>
        <span className="justify-self-center text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">成分</span>
        {isDM && <span className="px-4 text-right text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">操作</span>}
      </div>
      {spells.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">暂无匹配的法术</div>
      ) : (
        <div ref={scrollRef} className="overflow-y-auto overscroll-contain" style={{ height: 'calc(100dvh - 20rem)', minHeight: '16rem' }}>
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map(vi => {
              const row = spells[vi.index];
              if (!row) return null;
              return (
                <div key={row.id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}>
                  <SpellRow spell={row} isDM={isDM} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// 移动：窗口虚拟器跟随页面滚动，保留原有的滚动位置恢复体验；卡片高度不定，用 measureElement 动态测量
function MobileSpellCardList(props: VirtualListProps) {
  const { spells, isDM, onOpen, onEdit, onDelete } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // 窗口虚拟器以文档顶部为原点；筛选区高度随标签换行变化，每次提交后重测并用阈值防抖
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    setScrollMargin(prev => (Math.abs(prev - top) > 1 ? top : prev));
  });
  const virtualizer = useWindowVirtualizer({
    count: spells.length,
    estimateSize: () => 150,
    overscan: 6,
    scrollMargin,
  });

  if (spells.length === 0) {
    return (
      <div className="text-center py-12 text-sm dark:text-text-dark-muted light:text-text-light-muted rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light">
        暂无匹配的法术
      </div>
    );
  }

  return (
    <div ref={listRef} className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(vi => {
        const row = spells[vi.index];
        if (!row) return null;
        return (
          <div
            key={row.id}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`, paddingBottom: '0.75rem' }}
          >
            <SpellCard spell={row} isDM={isDM} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />
          </div>
        );
      })}
    </div>
  );
}

export default function SpellList() {
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const isDesktop = useIsDesktop();

  // 缓存优先：首帧同步读本地（含模块级解析缓存），网络请求降级为后台校准
  const [spells, setSpells] = useState<Spell[]>(() => spellStore.getAll());
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
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

  useEditorState(editorOpen);

  // store 单一数据源：后台刷新 / 增删改都经 notify 回流到本地 state
  useEffect(() => spellStore.subscribe(() => setSpells(spellStore.getAll())), []);

  // 后台校准云端数据，失败静默降级到本地缓存
  useEffect(() => {
    let alive = true;
    setSyncing(true);
    spellStore.fetchAll()
      .then(() => { if (alive) setSyncError(''); })
      .catch((e: any) => { if (alive) setSyncError(e?.message || '云端同步失败，当前展示本地缓存'); })
      .finally(() => { if (alive) setSyncing(false); });
    return () => { alive = false; };
  }, []);

  // 筛选状态写入 sessionStorage
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_SEARCH, searchQuery); } catch {} }, [searchQuery]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_LEVEL, String(levelFilter)); } catch {} }, [levelFilter]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classesFilter)); } catch {} }, [classesFilter]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_SCHOOL, JSON.stringify(schoolFilter)); } catch {} }, [schoolFilter]);

  // 滚动位置保存（窗口滚动）+ 返回时恢复；桌面表格已改为内部滚动容器，窗口滚动仅在移动端生效
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
  }, []);

  // 搜索输入保持即时响应，过滤计算吃 deferred 值避免每个按键都重算
  const deferredQuery = useDeferredValue(searchQuery);

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

  // 过滤 + 排序合一：filter 返回新数组，原地 sort 安全
  const visibleSpells = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return spells
      .filter(spell => {
        const matchesSearch = !q || spell.name.toLowerCase().includes(q) || spell.school.toLowerCase().includes(q);
        const matchesLevel = levelFilter === 'all' || spell.level === levelFilter;
        const matchesClass = classesFilter.length === 0 || classesFilter.some(c => spell.classes?.includes(c));
        const matchesSchool = schoolFilter.length === 0 || schoolFilter.includes(spell.school);
        return matchesSearch && matchesLevel && matchesClass && matchesSchool;
      })
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'zh-CN'));
  }, [spells, deferredQuery, levelFilter, classesFilter, schoolFilter]);

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

  const openDetail = useCallback((id: string) => navigate(`/spells/${id}`), [navigate]);
  const handleEdit = useCallback((spell: Spell) => {
    if (!isDM) return;
    setEditingSpell(spell);
    setEditorOpen(true);
  }, [isDM]);
  const requestDelete = useCallback((id: string) => setDeleteConfirm(id), []);

  const handleAdd = () => {
    if (!isDM) return;
    setEditingSpell(undefined);
    setEditorOpen(true);
  };

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
      // 增量写回缓存并经订阅回流，替代全量 reload
      spellStore.save([...spellStore.getAll().filter(s => s.id !== spell.id), spell]);
      setEditorOpen(false);
      setEditingSpell(undefined);
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
      spellStore.save(spellStore.getAll().filter(s => s.id !== id));
      setDeleteConfirm(null);
    } catch (e: any) {
      setError(e.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <Sparkles className="w-7 h-7 text-primary" /> 法术库
          </h1>
          <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
            共 {spells.length} 个法术{syncing ? ' · 云端同步中…' : ''}
          </p>
          {syncError && <p className="mt-1 text-xs text-danger">{syncError}</p>}
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

      {isDesktop ? (
        <DesktopSpellTable spells={visibleSpells} isDM={isDM} onOpen={openDetail} onEdit={handleEdit} onDelete={requestDelete} />
      ) : (
        <MobileSpellCardList spells={visibleSpells} isDM={isDM} onOpen={openDetail} onEdit={handleEdit} onDelete={requestDelete} />
      )}

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
