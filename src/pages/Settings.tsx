import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Link, Save, Check, AlertCircle, LogOut } from 'lucide-react';

const GITHUB_TOKEN_KEY = 'github_token';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const storedToken = localStorage.getItem(GITHUB_TOKEN_KEY) || '';
    setToken(storedToken);
  }, []);

  const handleSave = () => {
    setError('');
    if (token && !token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      setError('Token 格式看起来不正确，GitHub Personal Access Token 通常以 ghp_ 或 github_pat_ 开头');
      return;
    }
    if (token) {
      localStorage.setItem(GITHUB_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(GITHUB_TOKEN_KEY);
    }
    // 通知其他组件 token 已变化
    window.dispatchEvent(new CustomEvent('github-token-change'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearToken = () => {
    localStorage.removeItem(GITHUB_TOKEN_KEY);
    setToken('');
    window.dispatchEvent(new CustomEvent('github-token-change'));
    // 跳转到玩家端首页
    navigate('/');
  };

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

      <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 dark:text-text-dark light:text-text-light">
            <Link className="w-5 h-5" />
            GitHub 同步设置
          </h2>
          <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
            为了将装备库和法术库的更改同步到 GitHub，你需要提供 GitHub Personal Access Token。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                GitHub Personal Access Token
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="flex-1 px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  {saved ? (
                    <>
                      <Check className="w-4 h-4" />
                      已保存
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      保存
                    </>
                  )}
                </button>
              </div>
              {token && (
                <button
                  onClick={handleClearToken}
                  className="px-4 py-2 border border-danger/50 text-danger hover:bg-danger/10 rounded-lg transition-colors flex items-center gap-2"
                  title="清空 Token 并切换到玩家模式"
                >
                  <LogOut className="w-4 h-4" />
                  清空 Token 切换玩家模式
                </button>
              )}
              {error && (
                <div className="mt-2 flex items-center gap-2 text-sm text-danger">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
              <h3 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                如何获取 GitHub Token：
              </h3>
              <ol className="text-sm dark:text-text-dark-muted light:text-text-light-muted space-y-1 list-decimal list-inside">
                <li>登录 GitHub，点击右上角头像 → Settings</li>
                <li>在左侧菜单找到 "Developer settings"</li>
                <li>点击 "Personal access tokens" → "Tokens (classic)"</li>
                <li>点击 "Generate new token"，勾选 <span className="px-1 rounded dark:bg-bg-dark light:bg-bg-light font-mono">repo</span> 权限</li>
                <li>生成后复制 token 并粘贴到上方输入框</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-text-dark light:text-text-light">
          关于
        </h2>
        <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted space-y-2">
          <p>
            <strong>DM Toolkit</strong> - D&amp;D 角色管理工具
          </p>
          <p>
            装备库和法术库数据保存在本地浏览器中（localStorage），配置 GitHub Token 后可同步到 GitHub 仓库。
          </p>
        </div>
      </div>
    </div>
  );
}
