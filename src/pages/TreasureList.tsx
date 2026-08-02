// 宝藏列表页
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Gem, Trash2, Edit3, HandCoins, Search } from 'lucide-react';
import treasureStore from '@/data/treasureStore';
import type { Treasure } from '@/types/treasure';

function formatCurrency(c: { pp: number; gp: number; sp: number; cp: number }): string {
  const parts: string[] = [];
  if (c.pp > 0) parts.push(`${c.pp}pp`);
  if (c.gp > 0) parts.push(`${c.gp}gp`);
  if (c.sp > 0) parts.push(`${c.sp}sp`);
  if (c.cp > 0) parts.push(`${c.cp}cp`);
  return parts.length > 0 ? parts.join(' ') : '无钱币';
}

export default function TreasureList() {
  const navigate = useNavigate();
  const [treasures, setTreasures] = useState<Treasure[]>([]);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setTreasures(treasureStore.getAll());
    load();
    return treasureStore.subscribe(load);
  }, []);

  const filtered = treasures.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    const t = treasureStore.create('');
    navigate(`/inventory/treasures/${t.id}/edit`);
  };

  const handleDelete = (id: string) => {
    treasureStore.delete(id);
    setDeleteId(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 顶栏 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/inventory')}
          className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">宝藏</h1>
        <button
          onClick={handleCreate}
          className="ml-auto px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          创建宝藏
        </button>
      </div>

      {/* 搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索宝藏..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
        />
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 dark:text-text-dark-muted light:text-text-light-muted">
          <Gem className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{treasures.length === 0 ? '暂无宝藏，点击上方按钮创建' : '没有匹配的宝藏'}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(t => (
            <div
              key={t.id}
              className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold dark:text-text-dark light:text-text-light truncate">
                    {t.title}
                  </h3>
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                    <span>{formatCurrency(t.currency)}</span>
                    <span className="mx-2">·</span>
                    <span>{t.items.length} 件物品</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => navigate(`/inventory/treasures/${t.id}/distribute`)}
                    className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                    title="分配"
                  >
                    <HandCoins className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate(`/inventory/treasures/${t.id}/edit`)}
                    className="p-2 rounded-lg hover:bg-accent/10 text-accent transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteId(t.id)}
                    className="p-2 rounded-lg hover:bg-danger/10 text-danger transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="dark:bg-card-dark light:bg-card-light rounded-xl p-6 max-w-sm w-full">
            <h3 className="font-bold dark:text-text-dark light:text-text-light mb-2">确认删除</h3>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              删除后无法恢复，是否继续？
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 rounded-lg border dark:border-border-dark light:border-border-light text-sm"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 py-2 rounded-lg bg-danger text-white text-sm"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
