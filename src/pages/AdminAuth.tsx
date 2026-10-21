import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, User as UserIcon, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminAuth() {
  const navigate = useNavigate();
  const { user, isAdmin, isDM } = useAuth();

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-sm hover:opacity-80 dark:text-text-dark light:text-text-light"
      >
        <ArrowLeft className="w-4 h-4" />
        返回设置
      </button>

      <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <ShieldCheck className="w-5 h-5 text-primary" />
            权限与身份
          </h2>
          <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
            站点权限绑定账号，登录后立即生效；游戏身份只表示你在本场游戏中的扮演角色。
          </p>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
          <UserIcon className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="font-medium truncate dark:text-text-dark light:text-text-light">
              {user?.username || '未登录'}
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-xs">
              <span className={`px-2 py-0.5 rounded-full ${isAdmin ? 'bg-amber-500/15 text-amber-500' : 'bg-info/15 text-info'}`}>
                站点{isAdmin ? '管理员' : '成员'}
              </span>
              <span className={`px-2 py-0.5 rounded-full ${isDM ? 'bg-danger/15 text-danger' : 'bg-info/15 text-info'}`}>
                游戏身份 {isDM ? 'DM' : '玩家'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg dark:bg-bg-dark light:bg-bg-light-2 space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <Info className="w-4 h-4" />
            权限说明
          </h3>
          <ul className="text-sm space-y-1.5 list-disc pl-5 dark:text-text-dark-muted light:text-text-light-muted">
            <li>站点管理员可编辑资料库、角色卡、战斗与流程，并进入设置后台。</li>
            <li>游戏身份（DM/玩家）只影响角色扮演层面的标识，不授予站点权限。</li>
            <li>管理员权限由其他管理员在「账号一览」中按账号授予或撤销，变更后需重新登录。</li>
            <li>DM Token 仅保留为服务端应急通道，日常使用无需配置。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
