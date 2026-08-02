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
  Settings,
  Clock,
  Calendar,
  ChevronDown,
  BookOpen,
  Dices,
  UserCircle,
} from 'lucide-react';
import gameTimeStore from '@/data/gameTimeStore';
import calendarStore from '@/data/calendarStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

const allNavItems = [
  { path: '/characters', label: '角色卡库', icon: Users },
  { path: '/combat', label: '战斗记录', icon: Swords },
  { path: '/inventory', label: '物资钱币', icon: Coins },
  { path: '/spells', label: '法术库', icon: Sparkles },
  { path: '/notes', label: '剧情笔记', icon: ScrollText },
];

const playerNavItems = [
  { path: '/player/combat', label: '战斗记录', icon: Swords },
  { path: '/player/inventory', label: '物资钱币', icon: Coins },
  { path: '/player/spells', label: '法术库', icon: Sparkles },
];

export default function Navbar({ variant = 'dm' }: { variant?: 'dm' | 'player' }) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [gameTime, setGameTime] = useState({ hour: 8, minute: 0 });
  const [calendarDate, setCalendarDate] = useState('');
  const toolsRef = useRef<HTMLDivElement>(null);
  const isPlayerPath = location.pathname.startsWith('/player/');
  const navItems = variant === 'player' || isPlayerPath ? playerNavItems : allNavItems;

  useEffect(() => {
    const updateTime = () => {
      const t = gameTimeStore.get();
      setGameTime({ hour: t.hour, minute: t.minute });
    };
    const updateCalendar = () => {
      const info = calendarStore.getDateInfo();
      const m = ['一','二','三','四','五','六','七','八','九','十','十一','十二'][info.month - 1];
      setCalendarDate(info.isFestival ? `${m}月·${info.festivalName}` : `${m}月${info.day}日`);
    };
    updateTime();
    updateCalendar();
    const unsubTime = gameTimeStore.subscribe(updateTime);
    const unsubCal = calendarStore.subscribe(updateCalendar);
    return () => {
      unsubTime();
      unsubCal();
    };
  }, []);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 路由变化时关闭下拉
  useEffect(() => {
    setToolsOpen(false);
  }, [location.pathname]);

  const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(gameTime.minute).padStart(2, '0')}`;
  const isAM = gameTime.hour < 12;

  // 迷你时针角度（12小时制）
  const miniHourAngle = ((gameTime.hour % 12) * 30 + gameTime.minute * 0.5);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md bg-bg-dark/90 border-border-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Swords className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-text-dark hidden sm:block" style={{ color: '#e8e6e3' }}>
                DM Toolkit
              </span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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

          <div className="flex items-center gap-2">
            {/* DM 专属工具栏：设置 */}
            {variant === 'dm' && (
              <Link
                to="/settings"
                className="p-2 rounded-lg transition-colors hover:bg-white/10 text-gray-300 hover:text-white"
                title="设置"
              >
                <Settings className="w-5 h-5" />
              </Link>
            )}

            {/* 用户信息入口：头像 + 用户名，点击进入账号页 */}
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

            {/* 剧情工具统合下拉 */}
            <div ref={toolsRef} className="relative">
              <button
                onClick={() => setToolsOpen(!toolsOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  toolsOpen || location.pathname === '/clock' || location.pathname === '/calendar' || location.pathname === '/dice'
                    ? 'bg-primary/20 text-primary'
                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
                title="剧情工具"
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">剧情工具</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${toolsOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* 下拉面板 */}
              {toolsOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border-dark bg-bg-dark shadow-xl shadow-black/40 overflow-hidden">
                  {/* 时钟入口 — 含迷你表盘 */}
                  <Link
                    to="/clock"
                    onClick={() => setToolsOpen(false)}
                    className={`flex items-center gap-3 p-3 transition-colors ${
                      location.pathname === '/clock'
                        ? 'bg-primary/10'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {/* 迷你表盘 */}
                    <div className="relative w-12 h-12 rounded-full border-2 border-border-dark bg-bg-dark-2 flex items-center justify-center flex-shrink-0">
                      <svg width="48" height="48" viewBox="0 0 48 48" className="absolute inset-0">
                        {/* 12点刻度 */}
                        <line x1="24" y1="5" x2="24" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                        {/* 3点刻度 */}
                        <line x1="43" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                        {/* 6点刻度 */}
                        <line x1="24" y1="43" x2="24" y2="40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                        {/* 9点刻度 */}
                        <line x1="5" y1="24" x2="8" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                        {/* 时针 */}
                        <line
                          x1="24" y1="24" x2="24" y2="12"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                          transform={`rotate(${miniHourAngle} 24 24)`}
                        />
                        {/* 中心点 */}
                        <circle cx="24" cy="24" r="2" fill="currentColor" />
                      </svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-200">游戏时钟</span>
                      <span className="text-xs text-gray-400">
                        {timeStr} · {isAM ? 'AM' : 'PM'}
                      </span>
                    </div>
                  </Link>

                  {/* 分割线 */}
                  <div className="border-t border-border-dark" />

                  {/* 日历入口 */}
                  <Link
                    to="/calendar"
                    onClick={() => setToolsOpen(false)}
                    className={`flex items-center gap-3 p-3 transition-colors ${
                      location.pathname === '/calendar'
                        ? 'bg-primary/10'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-border-dark bg-bg-dark-2 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-200">哈普托斯历</span>
                      <span className="text-xs text-gray-400">{calendarDate}</span>
                    </div>
                  </Link>

                  {/* 分割线 */}
                  <div className="border-t border-border-dark" />

                  {/* 骰子入口 */}
                  <Link
                    to="/dice"
                    onClick={() => setToolsOpen(false)}
                    className={`flex items-center gap-3 p-3 transition-colors ${
                      location.pathname === '/dice'
                        ? 'bg-primary/10'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-border-dark bg-bg-dark-2 flex items-center justify-center flex-shrink-0">
                      <Dices className="w-5 h-5 text-gray-300" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-200">线上骰子</span>
                      <span className="text-xs text-gray-400">d4 · d6 · d8 · d10 · d12 · d20</span>
                    </div>
                  </Link>
                </div>
              )}
            </div>

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
        <div className="md:hidden border-t border-border-dark bg-bg-dark">
          <div className="px-4 py-3 space-y-1">
            {/* 剧情工具组 */}
            <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
              剧情工具
            </div>
            <Link
              to="/clock"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/clock'
                  ? 'bg-primary/20 text-primary'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Clock className="w-5 h-5" />
              游戏时间 ({timeStr})
            </Link>
            <Link
              to="/calendar"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/calendar'
                  ? 'bg-primary/20 text-primary'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Calendar className="w-5 h-5" />
              游戏日历 ({calendarDate})
            </Link>
            <Link
              to="/dice"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === '/dice'
                  ? 'bg-primary/20 text-primary'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Dices className="w-5 h-5" />
              线上骰子
            </Link>

            {/* 主导航组 */}
            <div className="px-4 py-2 pt-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
              导航
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/20 text-primary'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}