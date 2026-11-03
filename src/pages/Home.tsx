// 团组外主页（/，前厅枢纽）：团组卡片墙 + 资料库入口 + 账号区。
// 卡片点击整页导航到团组内主页 /c/:campaignId/home（DM/玩家分流在主页壳内完成）。
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Swords, Plus, UserRound, BookOpen, Crown, ChevronRight, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { createCampaign, joinCampaign } from '@/lib/api';

const LIB_ENTRIES = [
  { path: '/equipment', label: '装备库', description: '武器、护甲与冒险装备出版物条目' },
  { path: '/spells', label: '法术库', description: '全环阶法术出版物条目' },
  { path: '/monsters', label: '怪物图鉴', description: '怪物图鉴 2014 全量模板' },
  { path: '/options', label: '角色选项', description: '种族、职业与背景选项' },
];

export default function Home() {
  const { isAuthenticated, isAdmin } = useAuth();
  const { campaigns, current, refresh, initialized } = useCampaign();
  const [busy, setBusy] = useState(false);

  const enterCampaign = (id: string) => {
    window.location.assign(`/c/${id}/home`);
  };

  // 四库快捷入口卡片（登录/未登录两种视图共用）
  const libGrid = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {LIB_ENTRIES.map((e) => (
        <Link
          key={e.path}
          to={e.path}
          className="group p-4 rounded-xl border border-border-dark bg-card-dark hover:border-primary/50 transition-all"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <BookOpen className="w-4.5 h-4.5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-gray-200 mb-1">{e.label}</h3>
          <p className="text-[11px] text-gray-500">{e.description}</p>
        </Link>
      ))}
    </div>
  );

  // 未登录着陆视图：介绍 + 注册/登录引导 + 四库快捷入口（PublicLayout 顶栏亦有导航）
  if (!isAuthenticated) {
    return (
      <div className="space-y-12">
        <section className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-6">
            <Swords className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold dark:text-text-dark light:text-text-light mb-3">DM Toolkit</h1>
          <p className="text-sm text-gray-400 max-w-xl mx-auto mb-8 leading-relaxed">
            龙与地下城 5e 跑团工作台：团组管理、角色卡、战斗追踪与法术流程编排。
            公共资料库对访客全量开放，注册后即可创建团组开始跑团。
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm text-white bg-primary hover:bg-primary-dark transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              注册账号
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm text-gray-200 bg-white/5 border border-border-dark hover:bg-white/10 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              登录
            </Link>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold dark:text-text-dark light:text-text-light">公共资料库</h2>
            <span className="text-xs text-gray-500">出版物全量开放，无需登录即可浏览</span>
          </div>
          {libGrid}
        </section>
      </div>
    );
  }

  const handleCreate = async () => {
    const name = prompt('输入新团组名称（一场跑团战役）');
    if (!name || !name.trim()) return;
    setBusy(true);
    try {
      const created = await createCampaign(name.trim());
      await refresh();
      enterCampaign(created.id);
    } catch (e) {
      alert(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const code = prompt('输入团组邀请码（向 DM 索取）');
    if (!code || !code.trim()) return;
    setBusy(true);
    try {
      const joined = await joinCampaign(code.trim());
      await refresh();
      enterCampaign(joined.id);
    } catch (e) {
      alert(`加入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* 团组卡片墙 */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">我的团组</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              创建团组
            </button>
            <button
              onClick={handleJoin}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-300 bg-white/5 border border-border-dark hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              凭邀请码加入
            </button>
          </div>
        </div>

        {!initialized ? (
          <div className="rounded-xl border border-border-dark bg-card-dark p-10 text-center">
            <p className="text-gray-500 text-sm">正在加载团组列表...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-xl border border-border-dark bg-card-dark p-10 text-center">
            <Swords className="w-10 h-10 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">尚未加入任何团组</p>
            <p className="text-xs text-gray-500">
              创建团组成为 DM，或向你的 DM 索取邀请码加入；加入后即可使用角色卡、战斗记录等团组功能
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => enterCampaign(c.id)}
                className={`group text-left p-5 rounded-xl border transition-all hover:shadow-xl hover:-translate-y-0.5 bg-card-dark border-border-dark hover:border-primary/50 ${
                  current?.id === c.id ? 'ring-1 ring-primary/60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-base font-semibold text-gray-200 truncate">{c.name}</h3>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${
                      c.myRole === 'dm' ? 'bg-primary/15 text-primary' : 'bg-white/10 text-gray-300'
                    }`}
                  >
                    {c.myRole === 'dm' ? <Crown className="w-3 h-3" /> : <UserRound className="w-3 h-3" />}
                    {c.myRole === 'dm' ? 'DM' : '玩家'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {c.rulebooks.length > 0 ? c.rulebooks.join('、') : '未选择规则书'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{current?.id === c.id ? '上次使用的团组' : ''}</span>
                  <span className="inline-flex items-center gap-1 text-primary font-medium">
                    进入团组
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 公共资料库入口 */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold dark:text-text-dark light:text-text-light">公共资料库</h2>
          <span className="text-xs text-gray-500">出版物全量开放，访客亦可浏览</span>
        </div>
        {libGrid}
      </section>

      {/* 账号区 */}
      <section className="rounded-xl border border-border-dark bg-card-dark p-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-200 mb-1">账号</h2>
          <p className="text-xs text-gray-500">个人资料、头像与密码管理</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-primary/15 text-primary">
              <Crown className="w-3 h-3" />
              站点管理员
            </span>
          )}
          <Link
            to="/account"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-300 bg-white/5 border border-border-dark hover:bg-white/10 transition-colors"
          >
            <UserRound className="w-3.5 h-3.5" />
            个人设置
          </Link>
        </div>
      </section>
    </div>
  );
}
