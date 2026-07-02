// 玩家主页 - 从 GitHub 读取角色列表供选择
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Eye, RefreshCw, AlertCircle, Users, Shield } from 'lucide-react';
import type { Character } from '@/types/character';
import { readFileFromGitHub } from '@/lib/github';

export default function PlayerHome() {
  const [players, setPlayers] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlayers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await readFileFromGitHub<Character[]>('data/players/all.json');
      const sorted = (data || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setPlayers(sorted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      if (msg.includes('404') || msg.includes('未配置')) {
        setPlayers([]);
      } else {
        setError(msg);
        setPlayers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  const hpPercentage = (char: Character) => {
    if (char.maxHp === 0) return 0;
    return Math.max(0, Math.min(100, (char.currentHp / char.maxHp) * 100));
  };

  const getHpColor = (percentage: number) => {
    if (percentage > 60) return 'bg-success';
    if (percentage > 30) return 'bg-warning';
    return 'bg-danger';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 dark:text-text-dark-muted light:text-text-light-muted">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>正在从 GitHub 加载角色列表…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="flex items-center justify-center">
          <AlertCircle className="w-12 h-12 text-danger" />
        </div>
        <h2 className="text-xl font-bold dark:text-text-dark light:text-text-light">加载失败</h2>
        <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">{error}</p>
        <button
          onClick={loadPlayers}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">玩家角色列表</h1>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              只读模式 · 数据来自 DM 同步
            </p>
          </div>
        </div>
        <button
          onClick={loadPlayers}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark-hover light:border-border-light light:text-text-light light:hover:bg-card-light-hover"
        >
          <RefreshCw className="w-4 h-4" />
          刷新列表
        </button>
      </div>

      {players.length === 0 && (
        <div className="text-center py-16 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <Users className="w-12 h-12 mx-auto mb-4 dark:text-text-dark-muted light:text-text-light-muted" />
          <p className="dark:text-text-dark-muted light:text-text-light-muted">暂无角色卡数据</p>
          <p className="text-sm mt-2 dark:text-text-dark-muted light:text-text-light-muted">
            请等待 DM 同步角色数据
          </p>
        </div>
      )}

      {players.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {players.map((player) => (
            <div
              key={player.id}
              className="group rounded-xl border overflow-hidden transition-all hover:shadow-lg dark:bg-card-dark dark:border-border-dark dark:hover:border-primary/50 light:bg-card-light light:border-border-light light:hover:border-primary/50"
            >
              <Link to={`/player/${player.id}`} className="block">
                <div className="h-24 bg-gradient-to-br from-primary/30 via-accent/20 to-transparent relative">
                  <div className="absolute bottom-3 left-4">
                    <div className="text-xl font-bold dark:text-text-dark light:text-text-light drop-shadow-lg">
                      {player.name || '未命名角色'}
                    </div>
                    <div className="text-sm dark:text-text-dark/80 light:text-text-light/80">
                      {player.race || '未知种族'} · {player.class || '未知职业'}
                    </div>
                  </div>
                  <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-black/30 text-white text-sm font-medium">
                    <Shield className="w-3.5 h-3.5" />
                    Lv.{player.level}
                  </div>
                </div>
              </Link>

              <div className="p-4 space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">生命</div>
                    <div className="font-bold dark:text-text-dark light:text-text-light">
                      {player.currentHp}/{player.maxHp}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">护甲</div>
                    <div className="font-bold dark:text-text-dark light:text-text-light">
                      {player.armorClass}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">速度</div>
                    <div className="font-bold dark:text-text-dark light:text-text-light">
                      {player.speed}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">生命值</span>
                    <span className="font-medium dark:text-text-dark light:text-text-light">
                      {player.currentHp}/{player.maxHp}
                    </span>
                  </div>
                  <div className="h-2 rounded-full dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getHpColor(hpPercentage(player))}`}
                      style={{ width: `${hpPercentage(player)}%` }}
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
                          {player.abilities?.[ability]?.modifier !== undefined
                            ? player.abilities[ability].modifier >= 0
                              ? `+${player.abilities[ability].modifier}`
                              : player.abilities[ability].modifier
                            : '+0'}
                        </div>
                      </div>
                    )
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t dark:border-border-dark light:border-border-light">
                  <Link
                    to={`/player/${player.id}`}
                    className="flex-1 text-center py-2 text-sm font-medium rounded-lg transition-colors dark:bg-bg-dark dark:hover:bg-border-dark dark:text-text-dark light:bg-bg-light-2 light:hover:bg-bg-light-3 light:text-text-light flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    查看详情
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
