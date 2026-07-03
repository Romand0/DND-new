import { useState } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import { equipmentStore } from '@/data/equipmentStore';
import { spellStore } from '@/data/spellStore';
import * as api from '@/lib/api';
import { hasToken } from '@/lib/api';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export default function SyncButton() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [result, setResult] = useState<{ characters: number; equipments: number; spells: number } | null>(null);

  const handleSync = async () => {
    if (!hasToken()) {
      alert('请先在设置中配置 DM Token');
      return;
    }
    setStatus('syncing');
    setResult(null);
    try {
      const characters = characterStore.getAll();
      const equipments = equipmentStore.getAll();
      const spells = spellStore.getAll();

      const charResult = characters.length > 0
        ? await api.batchUpsertCharacters(characters)
        : { count: 0 };
      const eqResult = equipments.length > 0
        ? await api.batchUpsertEquipments(equipments)
        : { count: 0 };
      const spResult = spells.length > 0
        ? await api.batchUpsertSpells(spells)
        : { count: 0 };

      setResult({
        characters: charResult.count,
        equipments: eqResult.count,
        spells: spResult.count,
      });
      setStatus('synced');
      setTimeout(() => {
        setStatus('idle');
        setResult(null);
      }, 4000);
    } catch (err) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  };

  if (!hasToken()) {
    return null;
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'syncing':
        return <Loader2 className="w-5 h-5 animate-spin" />;
      case 'synced':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Upload className="w-5 h-5" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'syncing':
        return 'bg-info text-white';
      case 'synced':
        return 'bg-success text-white';
      case 'error':
        return 'bg-danger text-white';
      default:
        return 'bg-primary text-white hover:bg-primary-dark';
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {status === 'synced' && result && (
        <div className="bg-success text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          已上传 {result.characters} 角色 · {result.equipments} 装备 · {result.spells} 法术
        </div>
      )}
      {status === 'error' && (
        <div className="bg-danger text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          上传失败，请检查 DM Token
        </div>
      )}
      <button
        onClick={handleSync}
        disabled={status === 'syncing'}
        className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all ${getStatusColor()} ${status === 'syncing' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        title="将本地数据上传到云端 D1 数据库"
      >
        {getStatusIcon()}
        <span className="font-medium">
          {status === 'syncing' ? '上传中...' : status === 'synced' ? '已上传' : status === 'error' ? '上传失败' : '上传到云端'}
        </span>
      </button>
    </div>
  );
}
