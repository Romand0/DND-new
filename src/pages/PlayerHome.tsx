// 玩家主页  -  从后端 API 读取角色列表供选择
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Eye, RefreshCw, AlertCircle, Users, Shield, Inbox, BookOpen, Package, Sparkles, ChevronRight } from 'lucide-react';
import type { Character } from '@/types/character';
import { fetchAllCharacters } from '@/lib/api';
import { useCampaign } from '@/contexts/CampaignContext';
import { characterStore } from '@/data/characterStore';
import { useRoundTableInbox } from '@/hooks/useRoundTableInbox';

export default function PlayerHome() {
  const { current } = useCampaign();
  const [players, setPlayers] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { messages: tableMessages } = useRoundTableInbox();
  const pendingChecks = tableMessages.filter(
    (m) => m.type === 'check_request' && m.status === 'pending',
  ).length;

  const loadPlayers = async () => {
    setError(null);
    // 首屏即时：先渲染本地缓存（同步读），云端结果到达后增量刷新
    try {
      const localVisible = (characterStore.getAllVisible() || []).filter(
        (c: any) => !c.isSandbox && !String(c.name || '').startsWith('试验体·'),
      );
      setPlayers(localVisible.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    } catch { /* 本地异常继续走云端 */ }
    setLoading(false);
    try {
      const data = await fetchAllCharacters<Character[]>();
      // 云端历史数据可能残留试验场影子卡（缺 isSandbox 标记），按名字前缀兜底过滤
      const visible = (data || []).filter(
        (c: any) => !c.isSandbox && !String(c.name || '').startsWith('试验体·'),
      );
      const sorted = visible.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setPlayers(sorted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      if (msg.includes('404') || msg.includes('未配置')) {
        setPlayers([]);
      } else if (players.length === 0) {
        setError(msg);
        setPlayers([]);
      }
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
          <span>正在加载角色列表…</span>
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
              {current ? `团组「${current.name}」 · 只读模式 · 数据来自 DM 同步` : '只读模式 · 数据来自 DM 同步'}
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

      {/* 圆桌入口：显眼横幅，有待答复检定时高亮计数 */}
      <Link
        to="/player/table"
        className="group flex items-center justify-between p-5 rounded-xl border transition-all hover:scale-[1.01] bg-gradient-to-r from-primary/15 via-accent/10 to-transparent dark:border-primary/40 dark:hover:border-primary/70 light:border-primary/40 light:hover:border-primary/70"
      >
        <div className="flex items-center gap-4">
          <div className="relative p-3 rounded-lg bg-primary/20">
            <Inbox className="w-6 h-6 text-primary" />
            {pendingChecks > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center">
                {pendingChecks}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold dark:text-text-dark light:text-text-light group-hover:text-primary transition-colors">
              圆桌 · 通用检定
            </h2>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              {pendingChecks > 0
                ? `${pendingChecks} 条检定等待你掷骰答复`
                : 'DM 发起的检定与答复都在这里'}
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted group-hover:text-primary transition-colors" />
      </Link>

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
                      {player.race || '未知种族'} · {player.profession?.class || '未知职业'}
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

      {/* 图鉴区：三库只读浏览入口 */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold dark:text-text-dark light:text-text-light">图鉴</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              to: '/options',
              icon: BookOpen,
              title: '角色选项',
              desc: '种族、背景、职业与特性',
              tone: 'bg-primary/10 text-primary',
            },
            {
              to: '/equipment',
              icon: Package,
              title: '装备图鉴',
              desc: '武器、护甲与冒险装备',
              tone: 'bg-warning/15 text-warning',
            },
            {
              to: '/player/spells',
              icon: Sparkles,
              title: '法术图鉴',
              desc: '全部法术详述与环节',
              tone: 'bg-accent/15 text-accent',
            },
          ].map(({ to, icon: Icon, title, desc, tone }) => (
            <Link
              key={to}
              to={to}
              className="group p-5 rounded-xl border transition-all hover:scale-[1.02] dark:bg-card-dark dark:border-border-dark dark:hover:border-primary/50 light:bg-card-light light:border-border-light light:hover:border-primary/50"
            >
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-lg ${tone}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted group-hover:text-primary transition-colors" />
              </div>
              <h3 className="mt-3 font-semibold dark:text-text-dark light:text-text-light group-hover:text-primary transition-colors">
                {title}
              </h3>
              <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
