import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, ShieldCheck, Database, Upload, ChevronRight } from 'lucide-react';

const TOKEN_KEY = 'dm_token';
const VERIFIED_KEY = 'dm_token_verified';

const NAV_ITEMS = [
  {
    path: '/settings/admin',
    icon: ShieldCheck,
    label: '管理员认证',
    description: '配置并验证 DM Token，获取编辑权限',
  },
  {
    path: '/settings/migration',
    icon: Upload,
    label: '数据迁移 & 备份',
    description: '导出本地数据或从文件导入到云端',
  },
  {
    path: '/settings/data',
    icon: Database,
    label: '数据管理',
    description: '批量导入装备数据，管理游戏资料库',
  },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // 判断是否有有效的 DM Token
  const hasToken = !!localStorage.getItem(TOKEN_KEY);
  const isVerified = localStorage.getItem(VERIFIED_KEY) === 'true';
  const isOnSubPage = location.pathname !== '/settings';

  // 如果在子页面（/settings/admin 等），渲染子路由内容
  if (isOnSubPage) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <SettingsIcon className="w-7 h-7 text-primary" />
            设置
          </h1>
          <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
            配置应用程序的各种选项
          </p>
        </div>
        <Outlet />
      </div>
    );
  }

  // 主页面（/settings）：显示导航入口
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
          <SettingsIcon className="w-7 h-7 text-primary" />
          设置
        </h1>
        <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
          配置应用程序的各种选项
        </p>
      </div>

      {/* 无 Token 提示 */}
      {!hasToken && (
        <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-6">
          <div className="flex items-start gap-4">
            <ShieldCheck className="w-8 h-8 text-primary mt-1" />
            <div>
              <h2 className="text-lg font-semibold dark:text-text-dark light:text-text-light">
                尚未配置 DM Token
              </h2>
              <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                请先进行管理员认证，配置 DM Token 后才能使用数据管理和迁移功能。
              </p>
              <button
                onClick={() => navigate('/settings/admin')}
                className="mt-3 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors text-sm flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                前往认证
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 有 Token 时显示三个入口卡片 */}
      {hasToken && (
        <div className="grid gap-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-5 text-left hover:opacity-80 transition-opacity"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold dark:text-text-dark light:text-text-light">
                      {item.label}
                    </h3>
                    <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                      {item.description}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Token 已认证提示 */}
      {hasToken && isVerified && (
        <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-4">
          <p className="text-sm text-success flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            DM Token 已验证，拥有编辑权限
          </p>
        </div>
      )}
    </div>
  );
}
