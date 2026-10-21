import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, ShieldCheck, Database, Upload, ChevronRight, Users } from 'lucide-react';
import { Workflow } from 'lucide-react';

const NAV_ITEMS = [
  {
    path: '/settings/admin',
    icon: ShieldCheck,
    label: '权限与身份',
    description: '查看当前账号的站点管理员权限与游戏身份',
  },
  {
    path: '/settings/accounts',
    icon: Users,
    label: '账号一览',
    description: '查看并管理全部注册账号、站点权限与角色绑定',
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
  {
    path: '/settings/flows',
    icon: Workflow,
    label: '流程库管理',
    description: '创建、编辑、删除 DSL 编译器流程定义',
  },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();

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

  // 主页面（/settings）：显示导航入口（路由层已限定站点管理员）
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
    </div>
  );
}
