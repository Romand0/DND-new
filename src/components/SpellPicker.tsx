import { useState, useMemo, useEffect } from 'react';
import { X, Search, Sparkles } from 'lucide-react';
import type { Spell } from '@/types/spell';

interface SpellPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (spell: Spell) => void;
  selectedSpellIds: string[];
  characterClass?: string;
  filterLevel?: number | 'cantrip' | 'all';
  matchByName?: boolean;
}

const levelLabels: Record<number, string> = {
  0: '戏法',
  1: '1环',
  2: '2环',
  3: '3环',
  4: '4环',
  5: '5环',
  6: '6环',
  7: '7环',
  8: '8环',
  9: '9环',
};

export default function SpellPicker({
  isOpen,
  onClose,
  onSelect,
  selectedSpellIds,
  characterClass,
  filterLevel = 'all',
  matchByName = false,
}: SpellPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | 'all'>(
    filterLevel === 'cantrip' ? 0 : (typeof filterLevel === 'number' ? filterLevel : 'all')
  );
  const [classFilter, setClassFilter] = useState<string>(
    characterClass || 'all'
  );
  const [allSpells, setAllSpells] = useState<Spell[]>([]);
  const [loading, setLoading] = useState(false);

  // 从后端获取所有法术
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/spells')
      .then(res => res.json())
      .then(data => {
        // 假设返回 { data: Spell[] } 或直接数组
        const spells = Array.isArray(data) ? data : (data.data || []);
        setAllSpells(spells);
      })
      .catch(err => console.error('获取法术列表失败', err))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const availableClasses = useMemo(() => {
    const classes = new Set<string>();
    allSpells.forEach((spell) => {
      spell.classes.forEach((cls) => classes.add(cls));
    });
    return Array.from(classes).sort();
  }, [allSpells]);

  const filteredSpells = useMemo(() => {
    return allSpells.filter((spell) => {
      if (matchByName) {
        if (selectedSpellIds.includes(spell.name)) return false;
      } else {
        if (selectedSpellIds.includes(spell.id)) return false;
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !spell.name.toLowerCase().includes(q) &&
          !spell.school.toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      if (levelFilter !== 'all' && spell.level !== levelFilter) {
        return false;
      }

      if (classFilter !== 'all' && !spell.classes.includes(classFilter)) {
        return false;
      }

      return true;
    });
  }, [searchQuery, levelFilter, classFilter, selectedSpellIds, matchByName, allSpells]);

  const sortedSpells = [...filteredSpells].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  const handleSelect = (spell: Spell) => {
    onSelect(spell);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full h-full max-w-4xl max-h-[90vh] m-4 flex flex-col rounded-2xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-border-dark light:border-border-light flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <Sparkles className="w-5 h-5 text-primary" />
            选择法术
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 border-b dark:border-border-dark light:border-border-light flex-shrink-0">
          <div className="flex flex-col gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索法术名称或学派..."
                className="w-full pl-12 pr-4 py-3 rounded-lg border bg-transparent outline-none text-base dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
            
            {/* 环级筛选 - 胶囊标签样式 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">环级</span>
              <button
                onClick={() => setLevelFilter('all')}
                className={`px-2.5 py-1 rounded-full text-xs transition-colors ${levelFilter === 'all' ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
              >
                全部
              </button>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
                <button
                  key={level}
                  onClick={() => setLevelFilter(levelFilter === level ? 'all' : level)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${levelFilter === level ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
                >
                  {levelLabels[level]}
                </button>
              ))}
            </div>

            {/* 职业筛选 - 胶囊标签样式 */}
            {availableClasses.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">职业</span>
                <button
                  onClick={() => setClassFilter('all')}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${classFilter === 'all' ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
                >
                  全部
                </button>
                {availableClasses.map((cls) => (
                  <button
                    key={cls}
                    onClick={() => setClassFilter(classFilter === cls ? 'all' : cls)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${classFilter === cls ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`}
                  >
                    {cls}
                  </button>
                ))}
              </div>
            )}

            {characterClass && (
              <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                当前角色职业：{characterClass}
                <button
                  onClick={() => setClassFilter(characterClass)}
                  className="ml-2 text-primary hover:underline font-medium"
                >
                  只显示该职业可用
                </button>
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              加载中...
            </div>
          ) : sortedSpells.length === 0 ? (
            <div className="text-center py-12 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              暂无匹配的法术
            </div>
          ) : (
            <div className="space-y-3">
              {sortedSpells.map((spell) => (
                <button
                  key={spell.id}
                  onClick={() => handleSelect(spell)}
                  className="w-full text-left p-4 rounded-xl border transition-colors hover:border-primary dark:border-border-dark dark:bg-bg-dark dark:hover:bg-white/5 light:border-border-light light:bg-bg-light-2 light:hover:bg-white/70"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-base dark:text-text-dark light:text-text-light">
                        {spell.name}
                      </div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                            spell.level === 0
                              ? 'bg-gray-500/20 text-gray-400'
                              : 'bg-primary/20 text-primary'
                          }`}
                        >
                          {levelLabels[spell.level]}
                        </span>
                        <span className="text-sm dark:text-text-dark light:text-text-light">
                          {spell.school}
                        </span>
                        <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                          {spell.castingTime}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm font-mono dark:text-text-dark-muted light:text-text-light-muted">
                      {[
                        spell.components.verbal && 'V',
                        spell.components.somatic && 'S',
                        spell.components.material && 'M',
                      ]
                        .filter(Boolean)
                        .join(',')}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
