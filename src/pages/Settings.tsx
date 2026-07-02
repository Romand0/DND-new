import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Link, Save, Check, AlertCircle, LogOut, Database, ShieldCheck } from 'lucide-react';
import * as api from '@/lib/api';

const TOKEN_KEY = 'dm_token';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY) || '';
    setToken(storedToken);
  }, []);

  const handleSave = () => {
    setError('');
    if (!token.trim()) {
      setError('请输入 DM Token');
      return;
    }
    api.setToken(token.trim());
    window.dispatchEvent(new CustomEvent('dm-token-change'));
    setSaved(true);
    setVerified(null);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearToken = () => {
    api.setToken('');
    setToken('');
    setVerified(null);
    window.dispatchEvent(new CustomEvent('dm-token-change'));
    navigate('/');
  };

  const handleVerify = async () => {
    if (!token.trim()) return;
    setVerifying(true);
    setVerified(null);
    api.setToken(token.trim());
    const valid = await api.verifyToken();
    setVerified(valid);
    setVerifying(false);
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
            DM 认证设置
          </h2>
          <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
            输入 DM Token 以启用编辑权限。玩家端无需 Token 即可查看数据。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                DM Token
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setVerified(null);
                  }}
                  placeholder="输入 DM Token"
                  className="flex-1 px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
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
                  {token && (
                    <button
                      onClick={handleClearToken}
                      className="px-4 py-2 border border-danger/50 text-danger hover:bg-danger/10 rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                      title="清空 Token 并切换到玩家模式"
                    >
                      <LogOut className="w-4 h-4" />
                      清空
                    </button>
                  )}
                </div>
              </div>
              {error && (
                <div className="mt-2 flex items-center gap-2 text-sm text-danger">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleVerify}
                disabled={!token.trim() || verifying}
                className="px-4 py-2 text-sm border border-primary/50 text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldCheck className="w-4 h-4" />
                {verifying ? '验证中…' : '验证 Token'}
              </button>
              {verified === true && (
                <span className="text-sm text-success flex items-center gap-1">
                  <Check className="w-4 h-4" /> Token 有效
                </span>
              )}
              {verified === false && (
                <span className="text-sm text-danger flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Token 无效或后端未配置
                </span>
              )}
            </div>

            <div className="p-4 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-2 dark:text-text-dark light:text-text-light">
                <Database className="w-4 h-4" />
                后端架构说明
              </h3>
              <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                数据存储在 Cloudflare D1 数据库中，通过 Pages Functions API 访问。
                DM Token 在 Cloudflare 环境变量 <code className="px-1 rounded dark:bg-bg-dark light:bg-bg-light font-mono">DM_TOKEN</code> 中配置。
                配置 Token 后获得编辑权限，未配置时为玩家只读模式。
              </p>
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
            数据存储在 Cloudflare D1 数据库中，通过 Pages Functions API 访问。配置 DM Token 后可编辑数据。
          </p>
        </div>
      </div>
    </div>
  );
}
