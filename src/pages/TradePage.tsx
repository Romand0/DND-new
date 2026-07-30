// 交易页面：从角色库选择交易主体角色，进入交易/物资分配弹窗
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Coins, Search, Users, X } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import type { Character, Currency } from '@/types/character';
import TradeModal from '@/components/TradeModal';

// 格式化货币展示
function formatCurrency(c: Currency): string {
  const parts: string[] = [];
  if (c.pp > 0) parts.push(`${c.pp}pp`);
  if (c.gp > 0) parts.push(`${c.gp}gp`);
  if (c.sp > 0) parts.push(`${c.sp}sp`);
  if (c.cp > 0) parts.push(`${c.cp}cp`);
  return parts.length > 0 ? parts.join(' ') : '0cp';
}

export default function TradePage() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 加载角色库（characterStore 内部会从后端同步，这里读取本地缓存）
  useEffect(() => {
    setCharacters(characterStore.getAll());
  }, []);

  const filteredCharacters = useMemo(() => {
    if (!searchQuery) return characters;
    const q = searchQuery.toLowerCase();
    return characters.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.class || '').toLowerCase().includes(q) ||
      (c.race || '').toLowerCase().includes(q)
    );
  }, [characters, searchQuery]);

  const selectedCharacter = useMemo(
    () => (selectedId ? characterStore.get(selectedId) : null),
    [selectedId, characters]
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 顶栏 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/inventory')}
          className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">交易</h1>
      </div>

      <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
        选择一名角色作为交易主体，可进行买入（从装备库）、卖出（背包换货币）或分配（物资/现金转移给他人）。
      </p>

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索角色名称、职业或种族..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
        />
      </div>

      {/* 角色列表 */}
      {filteredCharacters.length === 0 ? (
        <div className="text-center py-12 dark:text-text-dark-muted light:text-text-light-muted flex flex-col items-center gap-2">
          <Users className="w-10 h-10 opacity-40" />
          <span>{characters.length === 0 ? '角色库为空' : '没有匹配的角色'}</span>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredCharacters.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="w-full text-left p-4 rounded-xl border transition-all hover:scale-[1.01] dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light hover:border-primary group"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold dark:text-text-dark light:text-text-light group-hover:text-primary transition-colors truncate">
                        {c.name}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded dark:bg-white/10 light:bg-white/60 dark:text-text-dark-muted light:text-text-light-muted">
                        Lv.{c.level || 1}
                      </span>
                    </div>
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5 truncate">
                      {[c.race, c.class].filter(Boolean).join(' · ') || '未设定职业'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-sm font-bold text-accent">
                    <Coins className="w-3.5 h-3.5" />
                    {formatCurrency(c.currency || { pp: 0, gp: 0, sp: 0, cp: 0 })}
                  </div>
                  <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                    {(c.equipment || []).length} 件物资
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 交易弹窗 */}
      {selectedId && selectedCharacter && (
        <TradeModal
          characterId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* 角色未找到兜底 */}
      {selectedId && !selectedCharacter && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="dark:bg-card-dark light:bg-card-light rounded-xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold dark:text-text-dark light:text-text-light">角色未找到</span>
              <button onClick={() => setSelectedId(null)} className="p-1 rounded hover:bg-white/10">
                <X className="w-4 h-4 dark:text-text-dark light:text-text-light" />
              </button>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="mt-2 w-full px-4 py-2 bg-primary text-white rounded-lg"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
