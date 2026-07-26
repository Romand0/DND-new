import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import combatStore from '@/data/combatStore';
import type { CombatRecord } from '@/types/combat';
import { Plus, Trash2, Download, Upload, FileJson } from 'lucide-react';

export default function CombatList() {
  const { isDM } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<CombatRecord[]>([]);

  // ✅ 关键修复：把 loadRecords 提到组件作用域
  // 用 useCallback 包裹，符合 React Hooks 规范
  const loadRecords = useCallback(() => {
    setRecords(combatStore.getAll());
  }, []);

  // ✅ useEffect 里只负责调用和清理
  useEffect(() => {
    loadRecords(); // 初始加载
    const unsubscribe = combatStore.subscribe(loadRecords); // 订阅更新
    return unsubscribe;
  }, [loadRecords]); // ✅ 依赖 loadRecords

  // ✅ 修复后的 handleCreate：现在能正常访问 loadRecords 了
  const handleCreate = () => {
    const defaultTitle = `战斗记录 ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const title = prompt('请输入战斗名称', defaultTitle);
    if (!title?.trim()) {
      alert('战斗名称不能为空');
      return;
    }
    
    try {
      const newRecord = combatStore.create(title.trim(), []);
      if (newRecord?.id) {
        navigate(`/combat/${newRecord.id}`);
      } else {
        alert('创建战斗失败：未获取到战斗ID');
        loadRecords(); // ✅ 兜底刷新列表
      }
    } catch (e) {
      console.error('创建战斗失败:', e);
      alert('创建战斗失败，请重试');
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('确定删除该战斗记录？删除后不可恢复')) return;
    combatStore.delete(id);
    // loadRecords 会被 subscribe 自动触发，这里可以不写
  };

  const handleExport = () => {
    combatStore.exportToFile();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    combatStore.importFromFile(file)
      .then(() => alert('导入成功'))
      .catch(() => alert('导入失败，请检查文件格式'));
    e.target.value = '';
  };

  if (!isDM) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      {/* 顶部操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <FileJson className="w-7 h-7 text-primary" />
            战斗记录
          </h1>
          <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
            共 {records.length} 场战斗记录，支持导入/导出备份
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light rounded-lg transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出全部
          </button>
          <label className="px-4 py-2 border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light rounded-lg transition-colors flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            导入备份
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            创建战斗
          </button>
        </div>
      </div>

      {/* 战斗列表 */}
      {records.length === 0 ? (
        <div className="text-center py-12 rounded-xl border-2 border-dashed dark:border-border-dark light:border-border-light">
          <FileJson className="w-16 h-16 mx-auto mb-4 opacity-30 dark:text-text-dark-muted light:text-text-light-muted" />
          <p className="dark:text-text-dark-muted light:text-text-light-muted">暂无战斗记录，点击「创建战斗」开始</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(record => (
            <div
              key={record.id}
              className="p-4 rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold dark:text-text-dark light:text-text-light truncate">
                    {record.title}
                  </h3>
                  <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted mt-1">
                    参战者：{record.combatants.length}人 | 创建于：{new Date(record.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/combat/${record.id}`)}
                    className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors"
                  >
                    进入战斗
                  </button>
                  <button
                    onClick={() => handleDelete(record.id)}
                    className="p-2 rounded-lg hover:bg-danger/10 text-danger transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
