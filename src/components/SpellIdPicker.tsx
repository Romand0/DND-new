// 法术 ID 选取器 —— 输入框旁附加"从法术库选取"按钮，选中后自动填入流程 ID

import { useState, useMemo, useEffect } from 'react';

import { X, Search, Sparkles } from 'lucide-react';

import type { Spell } from '@/types/spell';

interface Props {
  /** 当前 ID 值 */
  value: string;
  /** ID 变更回调 */
  onChange: (id: string) => void;
  /** 可选：选中法术后同步回填名称 */
  onNameHint?: (name: string) => void;
  /** 输入框 CSS class（与宿主保持一致） */
  className?: string;
  /** placeholder */
  placeholder?: string;
}

const levelLabels: Record<number, string> = {
  0: '戏法', 1: '1环', 2: '2环', 3: '3环', 4: '4环',
  5: '5环', 6: '6环', 7: '7环', 8: '8环', 9: '9环',
};

export default function SpellIdPicker({ value, onChange, onNameHint, className = '', placeholder = '如 spell:fireball' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all');
  const [spells, setSpells] = useState<Spell[]>([]);
  const [loading, setLoading] = useState(false);

  // 懒加载法术库（仅弹窗打开时请求）
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/spells')
      .then(r => r.json())
      .then(d => setSpells(Array.isArray(d) ? d : d.data ?? []))
      .catch(() => setSpells([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    return spells
      .filter(s => {
        if (query) {
          const q = query.toLowerCase();
          if (!s.name.toLowerCase().includes(q) && !s.id.toLowerCase().includes(q) && !s.school.toLowerCase().includes(q)) return false;
        }
        if (levelFilter !== 'all' && s.level !== levelFilter) return false;
        return true;
      })
      .sort((a, b) => a.level !== b.level ? a.level - b.level : a.name.localeCompare(b.name, 'zh-CN'));
  }, [spells, query, levelFilter]);

  const handlePick = (spell: Spell) => {
    // 约定流程 ID 格式：spell:{法术 id}
    onChange(`spell:${spell.id}`);
    onNameHint?.(spell.name);
    setOpen(false);
    setQuery('');
    setLevelFilter('all');
  };

  return (
    <>
      {/* 行内：输入框 + 小按钮 */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`flex-1 min-w-0 ${className}`}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 p-1.5 rounded border dark:border-border-dark light:border-border-light hover:bg-primary/10 hover:border-primary hover:text-primary transition-colors"
          title="从法术库选取"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 弹窗 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg max-h-[75vh] flex flex-col rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b dark:border-border-dark light:border-border-light">
              <h3 className="text-sm font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
                <Sparkles className="w-4 h-4 text-primary" />
                从法术库选取 ID
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 搜索 + 筛选 */}
            <div className="px-4 py-2 border-b dark:border-border-dark light:border-border-light flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 dark:text-text-dark-muted light:text-text-light-muted" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="搜索法术名称 / id / 学派…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border bg-transparent outline-none text-xs dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              </div>
              <select
                value={levelFilter}
                onChange={e => setLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-2 py-1.5 rounded-lg border bg-transparent outline-none text-xs dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
              >
                <option value="all">全部环级</option>
                {[0,1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>{levelLabels[l]}</option>)}
              </select>
            </div>

            {/* 列表 */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {loading ? (
                <p className="text-center py-8 text-xs dark:text-text-dark-muted light:text-text-light-muted">加载中…</p>
              ) : filtered.length === 0 ? (
                <p className="text-center py-8 text-xs dark:text-text-dark-muted light:text-text-light-muted">无匹配法术</p>
              ) : (
                <div className="space-y-1">
                  {filtered.map(spell => (
                    <button
                      key={spell.id}
                      onClick={() => handlePick(spell)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary/10 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium dark:text-text-dark light:text-text-light group-hover:text-primary">
                          {spell.name}
                        </span>
                        <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary">
                          {spell.level === 0 ? '戏法' : `${spell.level}环`}
                        </span>
                        <span className="text-[10px] px-1 py-0.5 rounded dark:bg-white/5 light:bg-black/5 dark:text-text-dark-muted light:text-text-light-muted">
                          {spell.school}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono mt-0.5 dark:text-text-dark-muted light:text-text-light-muted">
                        id: {spell.id}  →  spell:{spell.id}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
