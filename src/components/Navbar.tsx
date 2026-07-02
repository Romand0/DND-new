// DM Toolkit - Navigation Bar Component
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Swords,
  Coins,
  Sparkles,
  Menu,
  X,
  Sun,
  Moon,
  Download,
  Upload,
  Settings,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { characterStore } from '@/data/characterStore';

const navItems = [
  { path: '/combat', label: '战斗记录', icon: Swords },
  { path: '/inventory', label: '物资钱币', icon: Coins },
  { path: '/spells', label: '法术库', icon: Sparkles },
];

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleExport = () => {
    characterStore.exportAllWithConfirm();
  };

  const handleImport = async () => {
    const results = await characterStore.createImportDialog();
    if (results.length > 0) {
      alert(`成功导入 ${results.length} 张角色卡`);
      window.location.reload();
    }
  };

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
            <Link
              to="/settings"
              className="p-2 rounded-lg transition-colors hover:bg-white/10 text-gray-300 hover:text-white"
              title="设置"
            >
              <Settings className="w-5 h-5" />
            </Link>
            <button
              onClick={handleImport}
              className="p-2 rounded-lg transition-colors hover:bg-white/10 text-gray-300 hover:text-white"
              title="导入数据"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={handleExport}
              className="p-2 rounded-lg transition-colors hover:bg-white/10 text-gray-300 hover:text-white"
              title="导出数据"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg transition-colors hover:bg-white/10 text-gray-300 hover:text-white"
              title="切换主题"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
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
