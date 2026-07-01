// 玩家主页 - 从 GitHub 读取角色列表供选择
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Eye, RefreshCw, AlertCircle, Users } from 'lucide-react';
import { readFileFromGitHub } from '@/lib/github';

interface PlayerIndexItem {
  id: string;
  name: string;
  class: string;
  level: number;
  race: string;
  updatedAt: number;
}

export default function PlayerHome() {
  const [players, setPlayers] = useState<PlayerIndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlayerIndex = async () => {
    setLoading(true);
    setError(null);
    try {
      const path = 'data/players/index.json';
      const data = await readFileFromGitHub<PlayerIndexItem[]>(path);
      // 按更新时间倒序排列
      const sorted = (data || []).sort((a, b) => b.updatedAt - a.updatedAt);
      setPlayers(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlayerIndex();
  }, []);

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
          onClick={loadPlayerIndex}
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
      {/* 标题区域 */}
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
          onClick={loadPlayerIndex}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark-hover light:border-border-light light:text-text-light light:hover:bg-card-light-hover"
        >
          <RefreshCw className="w-4 h-4" />
          刷新列表
        </button>
      </div>

      {/* 空状态 */}
      {players.length === 0 && (
        <div className="text-center py-16 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <Users className="w-12 h-12 mx-auto mb-4 dark:text-text-dark-muted light:text-text-light-muted" />
          <p className="dark:text-text-dark-muted light:text-text-light-muted">暂无角色卡数据</p>
          <p className="text-sm mt-2 dark:text-text-dark-muted light:text-text-light-muted">
            请等待 DM 同步角色数据
          </p>
        </div>
      )}

      {/* 角色列表 */}
      {players.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {players.map((player) => (
            <Link
              key={player.id}
              to={`/player/${player.id}`}
              className="group p-4 rounded-xl border transition-all hover:shadow-lg hover:-translate-y-1 dark:bg-card-dark dark:border-border-dark dark:hover:border-primary/50 light:bg-card-light light:border-border-light light:hover:border-primary/50"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold dark:text-text-dark light:text-text-light group-hover:text-primary transition-colors">
                  {player.name || '未命名角色'}
                </h3>
                <Eye className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted group-hover:text-primary transition-colors" />
              </div>
              <div className="space-y-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                {player.class && (
                  <p>
                    <span className="font-medium dark:text-text-dark light:text-text-light">{player.class}</span>
                    {player.level && <span> · Lv.{player.level}</span>}
                  </p>
                )}
                {player.race && <p>{player.race}</p>}
                {player.updatedAt && (
                  <p className="text-xs">
                    更新于 {new Date(player.updatedAt).toLocaleDateString('zh-CN')}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}