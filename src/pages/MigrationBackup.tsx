import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Download, Upload, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import * as api from '@/lib/api';
import { equipmentStore } from '@/data/equipmentStore';
import { spellStore } from '@/data/spellStore';
import { characterStore } from '@/data/characterStore';

export default function MigrationBackup() {
  const navigate = useNavigate();
  const [migrating, setMigrating] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  // 导出：优先从远程 API 获取，失败时回退到本地 store
  const handleExport = async () => {
    setExporting(true);
    try {
      const [eqs, sps, chars] = await Promise.all([
        api.fetchAllEquipments(),
        api.fetchAllSpells(),
        api.fetchAllCharacters(),
      ]);
      const data = {
        equipments: eqs,
        spells: sps,
        characters: chars,
        exportedAt: new Date().toISOString(),
      };
      downloadJson(data);
    } catch {
      // 远程失败，回退到本地 store
      const data = {
        equipments: equipmentStore.getAll(),
        spells: spellStore.getAll(),
        characters: characterStore.getAll(),
        exportedAt: new Date().toISOString(),
      };
      downloadJson(data);
    } finally {
      setExporting(false);
    }
  };

  function downloadJson(data: any) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dnd-tool-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    a.href = '';
  }

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
      {/* 返回按钮 */}
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 text-sm hover:opacity-80 dark:text-text-dark light:text-text-light"
      >
        <ArrowLeft className="w-4 h-4" />
        返回设置
      </button>

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
              disabled={exporting}
              className="flex-1 px-4 py-2 border dark:border-border-dark light:border-border-light hover:bg-primary/10 dark:text-text-dark light:text-text-light rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  导出中…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  导出备份
                </>
              )}
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
    </div>
  );
}
