import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import { editorState } from '@/data/editorState';
import * as api from '@/lib/api';
import { hasToken } from '@/lib/api';
import { stableStringify } from '@/lib/characterAdoption';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface SyncResult {
  name: string;
  status: 'success' | 'error' | 'skipped';
  count?: number;
  error?: string;
}

/** 内容比对前剥离易变/双端口径不一字段：updatedAt（本地毫秒 vs 云端秒）、campaignId（云端回填列值） */
function canonicalize(card: any): string {
  const { updatedAt: _u, campaignId: _c, ...rest } = card ?? {};
  return stableStringify(rest);
}

export default function SyncButton() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [results, setResults] = useState<SyncResult[]>([]);
  const [editorOpen, setEditorOpen] = useState(editorState.get());
  const location = useLocation();

  useEffect(() => {
    return editorState.subscribe(() => setEditorOpen(editorState.get()));
  }, []);

  if (editorOpen) return null;

  // 战斗场景隐藏同步按钮
  if (location.pathname.startsWith('/combat/')) return null;

  const handleSync = async () => {
    if (!hasToken()) {
      alert('请先登录账号');
      return;
    }
    setStatus('syncing');
    setResults([]);

    const characters = characterStore.getAllVisible();

    // 上传前先取云端版本做护栏比对：本地写路径已自动逐条 PUT 上云，
    // 手动批量上传的合法用途只剩「补传云端缺失的存量卡 / 补传离线期间的本地编辑」，
    // 直接全量 INSERT OR REPLACE 会静默冲掉云端较新的内容（如已批准的玩家变更）。
    let cloudCards: any[] | null = null;
    try {
      const list = await api.fetchAllCharacters<any[]>();
      cloudCards = Array.isArray(list) ? list : [];
    } catch {
      // 云端版本不可知时放弃上传（护栏优先于可用性），提示后终止
      setResults([{ name: '角色卡', status: 'error', error: '无法获取云端版本，已取消上传（可稍后重试）' }]);
      setStatus('error');
      setTimeout(() => { setStatus('idle'); setResults([]); }, 6000);
      return;
    }

    const cloudMap = new Map(cloudCards.map((c) => c.id && [c.id, c]).filter(Boolean) as [string, any][]);
    const toUpload: any[] = [];
    const cloudAhead: any[] = [];
    let unchanged = 0;
    for (const char of characters) {
      const cloud = cloudMap.get(char.id);
      if (!cloud) {
        toUpload.push(char); // 云端缺失：存量卡补传（本按钮的核心合法用途）
      } else if (canonicalize(cloud) === canonicalize(char)) {
        unchanged += 1; // 内容一致：上传纯属无操作，跳过避免无谓 bump updated_at
      } else if ((cloud.updatedAt ?? 0) > Math.floor((char.updatedAt ?? 0) / 1000) + 5) {
        // 内容分叉且云端时间戳显著较新（秒级 vs 本地毫秒/1000，容差 5s 抵消时钟偏差）：
        // 大概率云端含其他写方的变更（玩家批准 / 其他设备），默认跳过
        cloudAhead.push(char);
      } else {
        toUpload.push(char); // 本地较新（离线期间编辑）或分叉但无明确较新方：照常上传
      }
    }

    if (cloudAhead.length > 0) {
      const names = cloudAhead.map((c) => c.name || c.id).join('、');
      const ok = window.confirm(
        `以下 ${cloudAhead.length} 张卡云端版本较新，可能包含已批准的玩家变更或其他设备修改：\n${names}\n\n` +
        '确定要跳过这些卡、仅上传其余吗？\n（如需以本地覆盖云端，请先在角色详情页重新保存该卡）'
      );
      if (!ok) {
        setResults([{ name: '角色卡', status: 'error', error: '已取消上传（云端较新卡未处理）' }]);
        setStatus('error');
        setTimeout(() => { setStatus('idle'); setResults([]); }, 6000);
        return;
      }
    }

    const newResults: SyncResult[] = [];

    if (toUpload.length > 0) {
      try {
        const r = await api.batchUpsertCharacters(toUpload);
        newResults.push({ name: '角色卡', status: 'success', count: r.count });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        newResults.push({ name: '角色卡', status: 'error', error: msg });
      }
    }
    if (unchanged > 0) {
      newResults.push({ name: '无变化', status: 'skipped', count: unchanged });
    }
    if (cloudAhead.length > 0) {
      newResults.push({ name: '云端较新已跳过', status: 'skipped', count: cloudAhead.length });
    }
    if (newResults.length === 0) {
      newResults.push({ name: '角色卡', status: 'skipped' });
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
                {r.status === 'skipped' && (r.count ? `：${r.count} 张` : '：无数据')}
              </span>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={handleSync}
        disabled={status === 'syncing'}
        className={`flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all ${getStatusColor()} ${status === 'syncing' ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        title="将本地角色卡上传到云端（与云端内容一致或云端较新的卡自动跳过，防覆盖已批准的玩家变更）"
      >
        {getStatusIcon()}
        <span className="font-medium">
          {status === 'syncing' ? '上传中...' : status === 'synced' ? '已上传' : status === 'error' ? '部分失败' : '上传到云端'}
        </span>
      </button>
    </div>
  );
}
