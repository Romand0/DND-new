// DM Toolkit - Navigation Bar Component
import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Swords,
  Users,
  ScrollText,
  Coins,
  Sparkles,
  Menu,
  X,
  Sun,
  Moon,
  Clock,
  Calendar,
  BookOpen,
  Dices,
  UserCircle,
  GitBranch,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import CampaignSwitcher from '@/components/CampaignSwitcher';
import { getCampaignId } from '@/data/campaignScope';

const allNavItems = [
  { path: '/characters', label: '角色卡库', icon: Users },
  { path: '/combat', label: '战斗记录', icon: Swords },
  { path: '/inventory', label: '物资钱币', icon: Coins },
  { path: '/spells', label: '法术库', icon: Sparkles },
  { path: '/options', label: '角色选项', icon: BookOpen },
  { path: '/monsters', label: '怪物图鉴', icon: Swords },
  { path: '/notes', label: '剧情笔记', icon: ScrollText },
  { path: '/flows', label: '流程库', icon: GitBranch },
  { path: '/clock', label: '游戏时钟', icon: Clock },
  { path: '/calendar', label: '日历', icon: Calendar },
  { path: '/dice', label: '骰子', icon: Dices },
];

const playerNavItems = [
  { path: '/player/combat', label: '战斗记录', icon: Swords },
  { path: '/player/inventory', label: '物资钱币', icon: Coins },
  { path: '/player/spells', label: '法术库', icon: Sparkles },
];

// 移动端菜单顶部「剧情工具」领域：DM 专属页面（玩家路由无此三页）
const toolItems = [
  { path: '/clock', label: '游戏时钟', icon: Clock },
  { path: '/calendar', label: '日历', icon: Calendar },
  { path: '/dice', label: '骰子', icon: Dices },
];

export default function Navbar({ variant = 'dm' }: { variant?: 'dm' | 'player' }) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const isPlayerPath = location.pathname.startsWith('/player/');
  const navItems = variant === 'player' || isPlayerPath ? playerNavItems : allNavItems;




  // 当前路由的导航项若被横向滚动出可视区，则把它滚回视野内。
  // 直接改 scrollLeft，避免 scrollIntoView 连带滚动文档。
  useEffect(() => {
    const container = navScrollRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>('[data-nav-active="true"]');
    if (!active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    const padding = 8;
    if (left < container.scrollLeft + padding) {
      container.scrollTo({ left: Math.max(0, left - padding), behavior: 'smooth' });
    } else if (right > container.scrollLeft + container.clientWidth - padding) {
      container.scrollTo({
        left: right - container.clientWidth + padding,
        behavior: 'smooth',
      });
    }
  }, [location.pathname, navItems]);



  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md bg-bg-dark/90 border-border-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2 shrink-0">
            {/* 网站图标按上下文回主页：团组内回团组内主页，团组外（前厅）回团组外主页 */}
            <Link to={location.pathname === '/' ? '/' : `/c/${getCampaignId()}/home`} className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Swords className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-text-dark hidden sm:block" style={{ color: '#e8e6e3' }}>
                DM Toolkit
              </span>
            </Link>
            <CampaignSwitcher />
          </div>

          {/* 导航项横向可滑动：overflow-x-auto + touch-pan-x 让横向手势滚动导航条本身，
              纵向手势不再穿透到下方页面。隐藏滚动条保持顶栏整洁。 */}
          <div
            ref={navScrollRef}
            className="hidden md:flex flex-1 min-w-0 items-center gap-1 mx-2 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  data-nav-active={isActive ? 'true' : undefined}
                  className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary/20 text-primary'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 用户信息入口：头像 + 用户名，点击进入账号页（设置页与修改密码入口已收进账号页） */}
            {user && (
              <button
                onClick={() => navigate(variant === 'dm' ? '/account' : '/player/account')}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
                title="账号设置"
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="w-7 h-7 rounded-full object-cover border border-border-dark"
                  />
                ) : (
                  <UserCircle className="w-7 h-7 text-gray-300" />
                )}
                <span className="hidden sm:inline text-sm font-medium text-gray-200 max-w-[120px] truncate">
                  {user.username}
                </span>
              </button>
            )}

            {/* 主题切换（DM 和玩家端都可用） */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg transition-colors hover:bg-white/10 text-gray-300 hover:text-white"
              title="切换主题"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* 移动端菜单开关 */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg transition-colors hover:bg-white/10 text-gray-300 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-border-dark bg-bg-dark">
          <div className="px-4 py-3 space-y-3">
            {/* 剧情工具领域：三个仅图标按钮并排挤满一行（玩家端无对应路由，隐藏） */}
            {!(variant === 'player' || isPlayerPath) && (
              <div className="grid grid-cols-3 gap-2">
              {toolItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    title={item.label}
                    className={`flex items-center justify-center py-4 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                  </Link>
                );
              })}
              </div>
            )}

            {/* 跳转栏：两列网格，一行两项，缩短扫视距离 */}
            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}