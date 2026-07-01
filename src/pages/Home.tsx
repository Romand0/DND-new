// DM Toolkit - Home Page Component
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Swords, Users, ScrollText, Coins, Sparkles, ChevronRight, Eye, Settings } from 'lucide-react';
import { hasToken } from '@/lib/github';
import PlayerHome from '@/pages/PlayerHome';

const features = [
  {
    icon: Users,
    title: '角色卡库',
    description: '管理所有玩家和NPC角色卡，完整的D&D 5e属性系统',
    path: '/characters',
    color: 'from-primary to-primary-dark',
  },
  {
    icon: Swords,
    title: '战斗记录',
    description: '追踪战斗回合、伤害、状态效果，管理战斗流程',
    path: '/combat',
    color: 'from-danger to-danger/70',
  },
  {
    icon: Coins,
    title: '物资钱币',
    description: '管理装备、货币、经验值变动记录，一目了然',
    path: '/inventory',
    color: 'from-accent to-accent-dark',
  },
  {
    icon: Sparkles,
    title: '法术管理',
    description: '法术位追踪、法术书管理、施法记录',
    path: '/spells',
    color: 'from-info to-info/70',
  },
  {
    icon: ScrollText,
    title: '剧情笔记',
    description: '记录剧情、NPC关系、世界设定，随时查阅',
    path: '/notes',
    color: 'from-success to-success/70',
  },
];

export default function Home() {
  const [isDM, setIsDM] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // 检查 Token 状态
    const checkToken = () => {
      const hasTokenValue = hasToken();
      setIsDM(hasTokenValue);
      setChecking(false);
    };
    checkToken();
    // 监听 storage 变化（其他标签页修改 token）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'github_token') {
        checkToken();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 加载中状态
  if (checking) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 rounded-full bg-primary animate-pulse" />
      </div>
    );
  }

  // 玩家模式：直接渲染 PlayerHome
  if (!isDM) {
    return <PlayerHome />;
  }

  // DM 模式：原有首页内容
  return (
    <div className="space-y-16">
      <section className="text-center py-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
          <Swords className="w-4 h-4" />
          DM Toolkit v1.0
        </div>
        <h1 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900 dark:text-white">
          地下城主的{' '}
          <span style={{ background: 'linear-gradient(to right, #e63946, #d4a574)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            终极工具
          </span>
        </h1>
        <p className="text-xl max-w-2xl mx-auto dark:text-text-dark-muted light:text-text-light-muted">
          为D&D 5e打造的完整DM工具套件，从角色管理到战斗追踪，
          让你专注于讲述精彩的故事
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            to="/characters"
            className="inline-flex items-center gap-2 px-8 py-3 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition-colors"
          >
            开始使用
            <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-center mb-10 dark:text-text-dark light:text-text-light">
          功能模块
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.path}
                to={feature.path}
                className="group p-6 rounded-xl border transition-all hover:shadow-xl hover:-translate-y-1 dark:bg-card-dark dark:border-border-dark dark:hover:border-primary/50 light:bg-card-light light:border-border-light light:hover:border-primary/50"
              >
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                >
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2 dark:text-text-dark light:text-text-light">
                  {feature.title}
                </h3>
                <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  {feature.description}
                </p>
                <div className="mt-4 flex items-center gap-1 text-sm text-primary font-medium">
                  进入模块
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl p-8 md:p-12 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent border dark:border-primary/30 light:border-primary/20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 dark:text-text-dark light:text-text-light">
            数据安全，本地存储
          </h2>
          <p className="dark:text-text-dark-muted light:text-text-light-muted mb-6">
            所有数据都保存在你的浏览器本地，支持一键导出备份和导入恢复。
            自动实时备份机制，确保你的数据不会丢失。
          </p>
          <div className="flex items-center justify-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 dark:text-text-dark-muted light:text-text-light-muted">
              <span className="w-2 h-2 rounded-full bg-success" />
              localStorage 存储
            </span>
            <span className="flex items-center gap-1.5 dark:text-text-dark-muted light:text-text-light-muted">
              <span className="w-2 h-2 rounded-full bg-info" />
              实时自动备份
            </span>
            <span className="flex items-center gap-1.5 dark:text-text-dark-muted light:text-text-light-muted">
              <span className="w-2 h-2 rounded-full bg-accent" />
              JSON 导入导出
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
