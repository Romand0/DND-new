// src/pages/CombatList.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sword, Trash2, Download, Upload } from 'lucide-react';
import combatStore from '@/data/combatStore'; // ✅ 默认导入
import type { CombatRecord } from '@/types/combat';

export default function CombatList() {
  const [records, setRecords] = useState<CombatRecord[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setRecords(combatStore.getAll());
    const unsub = combatStore.subscribe(() => {
      setRecords(combatStore.getAll());
    });
    return unsub;
  }, []);

  const handleCreate = () => {
  const defaultTitle = `战斗记录 ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const title = prompt('请输入战斗名称', defaultTitle);
  if (!title?.trim()) {
    alert('战斗名称不能为空');
    return;
  }
  
  try {
    // combatStore.create 返回新创建的战斗记录，包含 id
    const newRecord = combatStore.create(title.trim(), []);
    
    // ✅ 关键修复：创建成功后立即跳转
    if (newRecord?.id) {
      navigate(`/combat/${newRecord.id}`);
    } else {
      alert('创建战斗失败：未获取到战斗ID');
      loadRecords(); // 兜底：重新加载列表
    }
  } catch (e) {
    console.error('创建战斗失败:', e);
    alert('创建战斗失败，请重试');
  }
};


  const handleExport = () => {
    const data = JSON.stringify(records, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'combat_records.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result as string);
          if (Array.isArray(imported)) {
            // 合并导入：覆盖同名 id，新增不同 id
            const existing = combatStore.getAll();
            const merged = [...existing];
            imported.forEach((rec: CombatRecord) => {
              const idx = merged.findIndex((r) => r.id === rec.id);
              if (idx >= 0) merged[idx] = rec;
              else merged.push(rec);
            });
            localStorage.setItem('combat_records', JSON.stringify(merged));
            combatStore.subscribe(() => setRecords(combatStore.getAll()))(); // 强制刷新
            setRecords(combatStore.getAll());
          }
        } catch {
          alert('导入文件格式错误');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">战斗记录</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:opacity-80"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleImport}
            className="px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:opacity-80"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            新建战斗
          </button>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-16 text-sm opacity-50">暂无战斗记录</div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <div
              key={record.id}
              className="flex items-center justify-between p-4 rounded-lg border dark:border-border-dark dark:bg-card-dark light:border-border-light light:bg-card-light cursor-pointer hover:opacity-80"
              onClick={() => navigate(`/combat/${record.id}`)}
            >
              <div>
                <div className="font-medium dark:text-text-dark light:text-text-light">{record.title}</div>
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                  {record.combatants.length} 人参战 · 已进行 {record.rounds.length} 轮 · 创建于 {new Date(record.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  combatStore.delete(record.id);
                }}
                className="p-2 rounded hover:bg-danger/20 text-danger"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateBattleModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function CreateBattleModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onCreate(title.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6">
        <h2 className="text-lg font-bold mb-4 dark:text-text-dark light:text-text-light">新建战斗</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="战斗名称（如：地精洞穴遭遇战）"
            className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
            autoFocus
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-lg bg-primary text-white"
            >
              创建并进入
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
