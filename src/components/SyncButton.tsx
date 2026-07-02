// DM Toolkit - 浮动同步按钮组件
import { useState, useEffect } from 'react';
import { Cloud, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import { hasToken } from '@/lib/github';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export default function SyncButton() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastResult, setLastResult] = useState<{ success: number; failed: number } | null>(null);

  useEffect(() => {
    characterStore.onSyncStatus((s) => {
      setStatus(s === 'idle' ? 'idle' : s);
      // 同步完成后 3 秒恢复 idle
      if (s === 'synced' || s === 'error') {
        setTimeout(() => setStatus('idle'), 3000);
      }
    });
  }, []);

  const handleSync = async () => {
    if (!hasToken()) {
      alert('请先在设置中配置 GitHub Token');
      return;
    }
    setStatus('syncing');
    try {
      const result = await characterStore.syncAllToGitHub();
      setLastResult(result);
      if (result.failed > 0) {
        alert(`同步完成：${result.success} 个成功，${result.failed} 个失败`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '同步失败');
    }
  };

  // 未配置 Token 时不显示按钮
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
        return <Cloud className="w-5 h-5" />;
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
    <button
      onClick={handleSync}
      disabled={status === 'syncing'}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all ${getStatusColor()} ${status === 'syncing' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      title={lastResult ? `上次同步：${lastResult.success} 成功，${lastResult.failed} 失败` : '点击同步所有角色到 GitHub'}
    >
      {getStatusIcon()}
      <span className="font-medium">
        {status === 'syncing' ? '同步中...' : status === 'synced' ? '已同步' : status === 'error' ? '同步失败' : '同步'}
      </span>
    </button>
  );
}