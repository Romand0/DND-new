import { useState } from 'react';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import { equipmentStore } from '@/data/equipmentStore';
import { spellStore } from '@/data/spellStore';
import * as api from '@/lib/api';
import { hasToken } from '@/lib/api';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface SyncResult {
  name: string;
  status: 'success' | 'error' | 'skipped';
  count?: number;
  error?: string;
}

export default function SyncButton() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [results, setResults] = useState<SyncResult[]>([]);

  const handleSync = async () => {
    if (!hasToken()) {
      alert('请先在设置中配置 DM Token');
      return;
    }
    setStatus('syncing');
    setResults([]);

    const characters = characterStore.getAll();
    const equipments = equipmentStore.getAll();
    const spells = spellStore.getAll();

    const newResults: SyncResult[] = [];

    // 角色卡
    if (characters.length > 0) {
      try {
        const r = await api.batchUpsertCharacters(characters);
        newResults.push({ name: '角色卡', status: 'success', count: r.count });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        newResults.push({ name: '角色卡', status: 'error', error: msg });
      }
    } else {
      newResults.push({ name: '角色卡', status: 'skipped' });
    }

    // 装备
    if (equipments.length > 0) {
      try {
        const r = await api.batchUpsertEquipments(equipments);
        newResults.push({ name: '装备', status: 'success', count: r.count });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        newResults.push({ name: '装备', status: 'error', error: msg });
      }
    } else {
      newResults.push({ name: '装备', status: 'skipped' });
    }

    // 法术
    if (spells.length > 0) {
      try {
        const r = await api.batchUpsertSpells(spells);
        newResults.push({ name: '法术', status: 'success', count: r.count });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        newResults.push({ name: '法术', status: 'error', error: msg });
      }
    } else {
      newResults.push({ name: '法术', status: 'skipped' });
    }

    setResults(newResults);
    const hasError = newResults.some((r) => r.status === 'error');
    setStatus(hasError ? 'error' : 'synced');
    setTimeout(() => {
      setStatus('idle');
      setResults([]);
    }, hasError ? 6000 : 2500);
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

  const allSuccess = results.length > 0 && results.every((r) => r.status === 'success' || r.status === 'skipped');

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {results.length > 0 && (
        <div className={`text-sm px-4 py-2 rounded-lg shadow-lg max-w-xs space-y-1 ${allSuccess ? 'bg-success text-white' : 'bg-danger text-white'}`}>
          {results.map((r) => (
            <div key={r.name} className="flex items-center gap-2">
              {r.status === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
              {r.status === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
              {r.status === 'skipped' && <span className="w-3.5 h-3.5 inline-block" />}
              <span>
                {r.name}
                {r.status === 'success' && `：已上传 ${r.count} 条`}
                {r.status === 'error' && `：${r.error}`}
                {r.status === 'skipped' && '：无数据'}
              </span>
            </div>
          ))}
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
          {status === 'syncing' ? '上传中...' : status === 'synced' ? '已上传' : status === 'error' ? '部分失败' : '上传到云端'}
        </span>
      </button>
    </div>
  );
}
