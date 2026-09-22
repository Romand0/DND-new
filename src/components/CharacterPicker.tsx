import { useState, useMemo, useEffect } from 'react';
import { X, Search, Users } from 'lucide-react';
import type { Character } from '@/types/character';
import { fetchAllCharacters } from '@/lib/api';

interface CharacterPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (character: Character) => void;
  /** 已绑定的角色 id，选择器中排除 */
  selectedCharacterIds: string[];
}

export default function CharacterPicker({
  isOpen,
  onClose,
  onSelect,
  selectedCharacterIds,
}: CharacterPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 从后端角色库获取所有角色卡
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    fetchAllCharacters<Character[]>()
      .then((data) => setAllCharacters(Array.isArray(data) ? data : []))
      .catch((err) => setError(err?.message || '获取角色列表失败'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const filteredCharacters = useMemo(() => {
    return allCharacters.filter((character) => {
      if (selectedCharacterIds.includes(character.id)) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !(character.name || '').toLowerCase().includes(q) &&
          !(character.class || '').toLowerCase().includes(q) &&
          !(character.race || '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allCharacters, searchQuery, selectedCharacterIds]);

  const handleSelect = (character: Character) => {
    onSelect(character);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full h-full max-w-4xl max-h-[90vh] m-4 flex flex-col rounded-2xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-border-dark light:border-border-light flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <Users className="w-5 h-5 text-primary" />
            选择角色
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 border-b dark:border-border-dark light:border-border-light flex-shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索角色名称、职业或种族..."
              className="w-full pl-12 pr-4 py-3 rounded-lg border bg-transparent outline-none text-base dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              加载中...
            </div>
          ) : error ? (
            <div className="text-center py-12 text-sm text-danger">{error}</div>
          ) : filteredCharacters.length === 0 ? (
            <div className="text-center py-12 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              暂无匹配的角色
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCharacters.map((character) => (
                <button
                  key={character.id}
                  onClick={() => handleSelect(character)}
                  className="w-full text-left p-4 rounded-xl border transition-colors hover:border-primary dark:border-border-dark dark:bg-bg-dark dark:hover:bg-white/5 light:border-border-light light:bg-bg-light-2 light:hover:bg-white/70"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-base dark:text-text-dark light:text-text-light">
                        {character.name || '未命名角色'}
                      </div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-primary/20 text-primary">
                          Lv.{character.level ?? 1}
                        </span>
                        <span className="text-sm dark:text-text-dark light:text-text-light">
                          {character.class || '未知职业'}
                        </span>
                        <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                          {character.race || '未知种族'}
                        </span>
                      </div>
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
