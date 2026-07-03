// DM Toolkit - Character List Page Component
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Trash2, Heart, Shield, Copy, Download, Upload, CheckSquare, Square } from 'lucide-react';
import type { Character } from '@/types/character';
import { characterStore } from '@/data/characterStore';
import * as api from '@/lib/api';

export default function CharacterList() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    setLoading(true);
    setError(null);
    try {
      const chars = await api.fetchAllCharacters<Character[]>();
      const charsWithLevels = characterStore.calculateLevelsForCharacters(chars);
      setCharacters(charsWithLevels);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      setError(msg);
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredCharacters = characters.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.class.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.race.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddCharacter = () => {
    const newChar = characterStore.add({ name: '新角色' });
    window.location.href = `/characters/${newChar.id}`;
  };

  const handleDelete = (id: string) => {
    characterStore.delete(id);
    setShowDeleteConfirm(null);
    loadCharacters();
  };

  const handleDuplicate = (char: Character) => {
    const { id, createdAt, updatedAt, ...rest } = char;
    characterStore.add({ ...rest, name: `${char.name} (副本)` });
    loadCharacters();
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCharacters.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCharacters.map((c) => c.id)));
    }
  };

  const handleExportSelected = () => {
    characterStore.exportSelectedCharacters(Array.from(selectedIds));
  };

  const handleExportAll = () => {
    characterStore.exportAllWithConfirm();
  };

  const handleImport = async () => {
    const results = await characterStore.createImportDialog();
    if (results.length > 0) {
      loadCharacters();
      alert(`成功导入 ${results.length} 张角色卡`);
    }
  };

  const hpPercentage = (char: Character) => {
    if (char.maxHp === 0) return 0;
    return Math.max(0, Math.min(100, (char.currentHp / char.maxHp) * 100));
  };

  const getHpColor = (percentage: number) => {
    if (percentage > 60) return 'bg-success';
    if (percentage > 30) return 'bg-warning';
    return 'bg-danger';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold dark:text-text-dark light:text-text-light">角色卡库</h1>
          <p className="mt-1 dark:text-text-dark-muted light:text-text-light-muted">
            管理你的所有角色卡片
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
          >
            <Upload className="w-4 h-4" />
            导入
          </button>
          <button
            onClick={handleExportAll}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
          >
            <Download className="w-4 h-4" />
            导出全部
          </button>
          <button
            onClick={handleAddCharacter}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            新建角色
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
          <input
            type="text"
            placeholder="搜索角色名称、职业、种族..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border dark:bg-card-dark dark:border-border-dark dark:text-text-dark dark:placeholder:text-text-dark-muted light:bg-card-light light:border-border-light light:text-text-light light:placeholder:text-text-light-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {filteredCharacters.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm dark:text-text-dark-muted light:text-text-light-muted"
            >
              {selectedIds.size === filteredCharacters.length ? (
                <CheckSquare className="w-5 h-5 text-primary" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              全选
            </button>
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  已选 {selectedIds.size} 个
                </span>
                <button
                  onClick={handleExportSelected}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  导出选中
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="dark:text-text-dark-muted light:text-text-light-muted">加载中...</p>
        </div>
      ) : error ? (
        <div className="text-center py-16 rounded-xl border-2 border-dashed dark:border-border-dark light:border-border-light">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full dark:bg-danger/20 light:bg-danger/10 flex items-center justify-center">
            <Heart className="w-8 h-8 dark:text-danger light:text-danger" />
          </div>
          <h3 className="text-lg font-medium dark:text-text-dark light:text-text-light">加载失败</h3>
          <p className="mt-1 dark:text-text-dark-muted light:text-text-light-muted">{error}</p>
          <button
            onClick={loadCharacters}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition-colors"
          >
            重试
          </button>
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="text-center py-16 rounded-xl border-2 border-dashed dark:border-border-dark light:border-border-light">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full dark:bg-card-dark light:bg-card-light flex items-center justify-center">
            <Heart className="w-8 h-8 dark:text-text-dark-muted light:text-text-light-muted" />
          </div>
          <h3 className="text-lg font-medium dark:text-text-dark light:text-text-light">
            {searchQuery ? '没有找到匹配的角色' : '还没有角色卡片'}
          </h3>
          <p className="mt-1 dark:text-text-dark-muted light:text-text-light-muted">
            {searchQuery ? '试试其他搜索词' : '点击上方按钮创建你的第一个角色'}
          </p>
          {!searchQuery && (
            <button
              onClick={handleAddCharacter}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建角色
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCharacters.map((char) => {
            const isSelected = selectedIds.has(char.id);
            return (
            <div
              key={char.id}
              className={`group rounded-xl border overflow-hidden transition-all hover:shadow-lg ${
                isSelected
                  ? 'ring-2 ring-primary border-primary'
                  : 'dark:bg-card-dark dark:border-border-dark dark:hover:border-primary/50 light:bg-card-light light:border-border-light light:hover:border-primary/50'
              }`}
            >
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleSelect(char.id);
                  }}
                  className="absolute top-3 left-3 z-10 p-1 rounded-md bg-black/30 hover:bg-black/50 transition-colors"
                >
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-primary" />
                  ) : (
                    <Square className="w-5 h-5 text-white/80" />
                  )}
                </button>
                <Link to={`/characters/${char.id}`} className="block">
                <div className="h-24 bg-gradient-to-br from-primary/30 via-accent/20 to-transparent relative">
                  <div className="absolute bottom-3 left-4">
                    <div className="text-xl font-bold dark:text-text-dark light:text-text-light drop-shadow-lg">
                      {char.name}
                    </div>
                    <div className="text-sm dark:text-text-dark/80 light:text-text-light/80">
                      {char.race || '未知种族'} · {char.class || '未知职业'}
                    </div>
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/30 text-white text-sm font-medium">
                    <Shield className="w-3.5 h-3.5" />
                    Lv.{char.level}
                  </div>
                </div>
              </Link>
              </div>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">生命</div>
                    <div className="font-bold dark:text-text-dark light:text-text-light">
                      {char.currentHp}/{char.maxHp}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">护甲</div>
                    <div className="font-bold dark:text-text-dark light:text-text-light">
                      {char.armorClass}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">速度</div>
                    <div className="font-bold dark:text-text-dark light:text-text-light">
                      {char.speed}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">生命值</span>
                    <span className="font-medium dark:text-text-dark light:text-text-light">
                      {char.currentHp}/{char.maxHp}
                    </span>
                  </div>
                  <div className="h-2 rounded-full dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getHpColor(hpPercentage(char))}`}
                      style={{ width: `${hpPercentage(char)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-1">
                  {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map(
                    (ability) => (
                      <div key={ability} className="text-center">
                        <div className="text-xs uppercase dark:text-text-dark-muted light:text-text-light-muted">
                          {ability === 'strength'
                            ? '力'
                            : ability === 'dexterity'
                            ? '敏'
                            : ability === 'constitution'
                            ? '体'
                            : ability === 'intelligence'
                            ? '智'
                            : ability === 'wisdom'
                            ? '感'
                            : '魅'}
                        </div>
                        <div className="text-sm font-bold dark:text-text-dark light:text-text-light">
                          {char.abilities[ability].modifier >= 0
                            ? `+${char.abilities[ability].modifier}`
                            : char.abilities[ability].modifier}
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t dark:border-border-dark light:border-border-light">
                  <Link
                    to={`/characters/${char.id}`}
                    className="flex-1 text-center py-2 text-sm font-medium rounded-lg transition-colors dark:bg-bg-dark dark:hover:bg-border-dark dark:text-text-dark light:bg-bg-light-2 light:hover:bg-bg-light-3 light:text-text-light"
                  >
                    查看详情
                  </Link>
                  <button
                    onClick={() => characterStore.exportSingleCharacter(char.id)}
                    className="p-2 rounded-lg transition-colors dark:hover:bg-bg-dark dark:text-text-dark-muted dark:hover:text-text-dark light:hover:bg-bg-light-2 light:text-text-light-muted light:hover:text-text-light"
                    title="导出此角色"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDuplicate(char)}
                    className="p-2 rounded-lg transition-colors dark:hover:bg-bg-dark dark:text-text-dark-muted dark:hover:text-text-dark light:hover:bg-bg-light-2 light:text-text-light-muted light:hover:text-text-light"
                    title="复制角色"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(char.id)}
                    className="p-2 rounded-lg transition-colors dark:hover:bg-danger/20 dark:text-text-dark-muted dark:hover:text-danger light:hover:bg-danger/10 light:text-text-light-muted light:hover:text-danger"
                    title="删除角色"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-6 dark:bg-card-dark dark:border dark:border-border-dark light:bg-card-light light:border light:border-border-light">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-danger/20 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-danger" />
              </div>
              <div>
                <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">确认删除</h3>
                <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  此操作无法撤销
                </p>
              </div>
            </div>
            <p className="mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要删除这个角色卡片吗？所有相关数据都将被永久删除。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-lg font-medium transition-colors dark:bg-bg-dark dark:hover:bg-border-dark dark:text-text-dark light:bg-bg-light-2 light:hover:bg-bg-light-3 light:text-text-light"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 py-2.5 bg-danger hover:bg-danger/90 text-white font-medium rounded-lg transition-colors"
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
