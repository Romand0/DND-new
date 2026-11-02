// 前厅公开壳：未登录访客浏览出版物资料库的布局（无守卫）。
// 顶栏极简：站名 + 四库导航 + 登录态动作区（未登录 → 登录/注册；已登录 → 进入团组外主页）。
import { Outlet, NavLink, Link } from 'react-router-dom';
import { Swords, LogIn, Home } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const LIB_TABS = [
  { path: '/equipment', label: '装备库' },
  { path: '/spells', label: '法术库' },
  { path: '/monsters', label: '怪物图鉴' },
  { path: '/options', label: '角色选项' },
];

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen dark:bg-bg-dark light:bg-bg-light overflow-x-hidden">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md bg-bg-dark/90 border-border-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 shrink-0">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Swords className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold text-text-dark hidden sm:block" style={{ color: '#e8e6e3' }}>
                  DM Toolkit
                </span>
              </Link>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto touch-pan-x">
              {LIB_TABS.map((t) => (
                <NavLink
                  key={t.path}
                  to={t.path}
                  className={({ isActive }) =>
                    `px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
                      isActive
                        ? 'text-primary bg-primary/10'
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`
                  }
                >
                  {t.label}
                </NavLink>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isAuthenticated ? (
                <Link
                  to="/"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-200 bg-white/5 border border-border-dark hover:bg-white/10 transition-colors"
                >
                  <Home className="w-3.5 h-3.5" />
                  进入主页
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white bg-primary hover:bg-primary-dark transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  登录
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
