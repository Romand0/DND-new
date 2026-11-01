// 团组切换器：Navbar 内下拉，展示成员团组列表 + 创建/凭邀请码加入入口。
// 切换走 switchCampaign（整页 reload，保证全部分桶 store 重读当前团组）。

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Plus, Settings2, Users } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { createCampaign, joinCampaign } from '@/lib/api';

export default function CampaignSwitcher() {
  const { campaigns, current, switchCampaign, refresh } = useCampaign();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleCreate = async () => {
    const name = prompt('输入新团组名称（一场跑团战役）');
    if (!name || !name.trim()) return;
    setBusy(true);
    try {
      const created = await createCampaign(name.trim());
      await refresh();
      setOpen(false);
      switchCampaign(created.id);
    } catch (e) {
      alert(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const code = prompt('输入团组邀请码（向 DM 索取）');
    if (!code || !code.trim()) return;
    setBusy(true);
    try {
      const joined = await joinCampaign(code.trim());
      await refresh();
      setOpen(false);
      switchCampaign(joined.id);
      alert(`已加入团组「${joined.name}」`);
    } catch (e) {
      alert(`加入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs max-w-[180px] bg-white/5 border border-border-dark hover:bg-white/10 transition-colors"
        title="切换团组（一场跑团战役的数据空间）"
      >
        <Users className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="truncate text-gray-200">{current ? current.name : '未加入团组'}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-border-dark bg-bg-dark shadow-xl z-50 overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {campaigns.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">
                尚未加入任何团组；创建或凭邀请码加入后，角色卡、战斗记录等数据将按团组隔离
              </div>
            )}
            {campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setOpen(false);
                  switchCampaign(c.id);
                }}
                className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-white/10 transition-colors ${
                  current?.id === c.id ? 'bg-primary/10' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-200 truncate">{c.name}</div>
                  <div className="text-[10px] text-gray-500">
                    {c.myRole === 'dm' ? 'DM' : '玩家'}
                    {current?.id === c.id && ' · 当前'}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-border-dark p-1.5 flex gap-1.5">
            <button
              onClick={handleCreate}
              disabled={busy}
              className="flex-1 py-1.5 rounded-lg text-xs text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <Plus className="w-3 h-3" />
              创建团组
            </button>
            <button
              onClick={handleJoin}
              disabled={busy}
              className="flex-1 py-1.5 rounded-lg text-xs text-gray-300 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              凭邀请码加入
            </button>
          </div>
          {current && (
            <Link
              to="/campaign"
              onClick={() => setOpen(false)}
              className="border-t border-border-dark px-3 py-2 flex items-center gap-2 text-xs text-gray-400 hover:text-primary transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              团组设置（成员 / 规则书集 / 邀请码）
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
