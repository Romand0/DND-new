// 玩家端只读页面 - 从 GitHub Raw 加载角色卡数据
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Eye, RefreshCw, AlertCircle } from 'lucide-react';
import type { Character } from '@/types/character';
import { readFileFromGitHub } from '@/lib/github';
import CharacterDetail from '@/pages/CharacterDetail';

export default function PlayerView() {
  const { playerId } = useParams<{ playerId: string }>();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCharacter = async () => {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    try {
      const path = `data/players/${playerId}.json`;
      const data = await readFileFromGitHub<Character>(path);
      setCharacter(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setCharacter(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCharacter();
  }, [playerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 dark:text-text-dark-muted light:text-text-light-muted">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>正在从 GitHub 加载角色卡…</span>
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
          onClick={loadCharacter}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          重试
        </button>
        <div>
          <Link to="/" className="text-sm text-primary hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 只读模式标识 */}
      <div className="flex items-center justify-between px-4 py-2 rounded-lg dark:bg-bg-dark-2 light:bg-bg-light-2 dark:border dark:border-border-dark light:border light:border-border-light">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium dark:text-text-dark light:text-text-light">
            只读模式
          </span>
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
            · 数据来自 DM 同步
          </span>
        </div>
        <button
          onClick={loadCharacter}
          className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:bg-card-dark-hover light:border-border-light light:text-text-light-muted light:hover:bg-card-light-hover"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          刷新数据
        </button>
      </div>

      {character && <CharacterDetail readOnly externalCharacter={character} />}
    </div>
  );
}
