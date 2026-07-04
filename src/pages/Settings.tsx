import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Link, Save, Check, AlertCircle, LogOut, Database, ShieldCheck, Upload, Loader2, Download } from 'lucide-react';
import * as api from '@/lib/api';
import { equipmentStore } from '@/data/equipmentStore';
import { spellStore } from '@/data/spellStore';
import { characterStore } from '@/data/characterStore';

const TOKEN_KEY = 'dm_token';
const VERIFIED_KEY = 'dm_token_verified';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [persistedVerified, setPersistedVerified] = useState(() => localStorage.getItem(VERIFIED_KEY) === 'true');
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ equipments: number; spells: number; characters: number } | null>(null);
  const [migrateError, setMigrateError] = useState('');

  const [equipmentCount, setEquipmentCount] = useState(0);
  const [spellCount, setSpellCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const chars = await api.fetchAllCharacters();
        const eqs = await api.fetchAllEquipments();
        const sps = await api.fetchAllSpells();
        setCharacterCount(chars.length);
        setEquipmentCount(eqs.length);
        setSpellCount(sps.length);
      } catch {
        setCharacterCount(characterStore.getAll().length);
        setEquipmentCount(equipmentStore.getAll().length);
        setSpellCount(spellStore.getAll().length);
      }
    };
    fetchCounts();
  }, []);

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
    setPersistedVerified(false);
    localStorage.removeItem(VERIFIED_KEY);
    window.dispatchEvent(new CustomEvent('dm-token-change'));
    navigate('/');
  };

  const handleVerify = async () => {
    if (!token.trim()) return;
    setVerifying(true);
    setVerified(null);
    api.setToken(token.trim());
    try {
      const valid = await api.verifyToken();
      setVerified(valid);
      if (valid) {
        setPersistedVerified(true);
        localStorage.setItem(VERIFIED_KEY, 'true');
      } else {
        setPersistedVerified(false);
        localStorage.removeItem(VERIFIED_KEY);
      }
    } catch {
      setVerified(false);
      setPersistedVerified(false);
      localStorage.removeItem(VERIFIED_KEY);
    }
    setVerifying(false);
  };

  const handleExport = () => {
    const data = {
      equipments: equipmentStore.getAll(),
      spells: spellStore.getAll(),
      characters: characterStore.getAll(),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dnd-tool-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    a.href = '';
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!api.hasToken()) {
      setMigrateError('请先配置并验证 DM Token');
      return;
    }

    setMigrating(true);
    setMigrateError('');
    setMigrateResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      let eqCount = 0;
      let spCount = 0;
      let chCount = 0;

      if (data.equipments && Array.isArray(data.equipments) && data.equipments.length > 0) {
        const result = await api.batchUpsertEquipments(data.equipments);
        eqCount = result.count;
        equipmentStore.save(data.equipments);
      }

      if (data.spells && Array.isArray(data.spells) && data.spells.length > 0) {
        const result = await api.batchUpsertSpells(data.spells);
        spCount = result.count;
        spellStore.save(data.spells);
      }

      if (data.characters && Array.isArray(data.characters) && data.characters.length > 0) {
        const result = await api.batchUpsertCharacters(data.characters);
        chCount = result.count;
        characterStore.save(data.characters);
      }

      setMigrateResult({ equipments: eqCount, spells: spCount, characters: chCount });
    } catch (err) {
      setMigrateError(err instanceof Error ? err.message : '导入失败，请检查文件格式');
    } finally {
      setMigrating(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
                    setPersistedVerified(false);
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
              {(verified !== null || persistedVerified) && (
                <span className={`text-sm flex items-center gap-1 ${verified === false ? 'text-danger' : 'text-success'}`}>
                  {verified === false ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  {verified === false ? 'Token 无效或后端未配置' : 'Token 有效'}
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

      <div className="rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 dark:text-text-dark light:text-text-light">
            <Database className="w-5 h-5" />
            数据迁移 & 备份
          </h2>
          <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
            导出本地数据为 JSON 文件备份，或从 JSON 文件导入数据到云端 D1 数据库。
            从旧版本迁移时：先在旧网站导出，再在新网站导入。
          </p>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2 text-center">
              <div className="text-2xl font-bold dark:text-text-dark light:text-text-light">{equipmentCount}</div>
              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">装备</div>
            </div>
            <div className="p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2 text-center">
              <div className="text-2xl font-bold dark:text-text-dark light:text-text-light">{spellCount}</div>
              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">法术</div>
            </div>
            <div className="p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2 text-center">
              <div className="text-2xl font-bold dark:text-text-dark light:text-text-light">{characterCount}</div>
              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">角色</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 px-4 py-2 border dark:border-border-dark light:border-border-light hover:bg-primary/10 dark:text-text-dark light:text-text-light rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              导出备份
            </button>
            <button
              onClick={handleImportClick}
              disabled={migrating || !api.hasToken()}
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {migrating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  导入中…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  导入到云端
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>

          {migrateResult && (
            <div className="mt-3 p-3 rounded-lg border border-success/30 bg-success/5 text-sm text-success">
              <div className="font-medium mb-1">导入完成！</div>
              <div>已导入 {migrateResult.equipments} 个装备、{migrateResult.spells} 个法术、{migrateResult.characters} 个角色到云端</div>
            </div>
          )}

          {migrateError && (
            <div className="mt-3 p-3 rounded-lg border border-danger/30 bg-danger/5 text-sm text-danger flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {migrateError}
            </div>
          )}
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
