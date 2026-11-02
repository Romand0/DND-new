// 团组上下文：当前团组 + 成员团组列表 + 切换。
// 切换采用整页 reload：9 个业务 store 为模块级单例（localStorage 分桶键在模块内解析），
// 热刷新需要逐 store 重建订阅，侵入面远大于收益；reload 后 main.tsx 在渲染前重读分桶键，零残留。

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Campaign, CampaignRole } from '@/types/campaign';
import { fetchCampaigns } from '@/lib/api';
import { getCampaignId, setCurrentCampaignId } from '@/data/campaignScope';
import { setRulebookScope } from '@/data/libraryScope';
import { useAuth } from '@/contexts/AuthContext';

interface CampaignContextValue {
  campaigns: Campaign[];
  current: Campaign | null;
  campaignRole: CampaignRole | null;
  loading: boolean;
  /** 首次成员团组列表拉取已完成（登录后）：区分「确认无团组」与「列表未就绪」 */
  initialized: boolean;
  switchCampaign: (id: string) => void;
  refresh: () => Promise<void>;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  // authLoading 期间不拉取也不置 initialized：此时 isAuthenticated 恒为 false，
  // 提前跑 refresh 会把「确认无团组」的标记置真，导致登录就绪后主页误判空列表弹回前厅
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setCampaigns([]);
      setRulebookScope([]);
      setInitialized(true);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchCampaigns<Campaign[]>();
      const arr = Array.isArray(list) ? list : [];
      setCampaigns(arr);
      // 团组视图过滤源：当前团组的规则书集（四库 getAll 实时读取）
      const cur = arr.find((c) => c.id === getCampaignId()) || arr[0] || null;
      setRulebookScope(cur?.rulebooks ?? []);
    } catch {
      // 云端不可用时保持空列表：current 为 null，Navbar 显示离线状态；本地分桶数据仍可读写
      setCampaigns([]);
      setRulebookScope([]);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [refresh, authLoading]);

  // 当前 id 不在成员列表（被移出/清库）时回退首个团组
  const current = campaigns.find((c) => c.id === getCampaignId()) || campaigns[0] || null;

  const switchCampaign = useCallback(
    (id: string) => {
      if (id === getCampaignId()) return;
      setCurrentCampaignId(id);
      window.location.reload();
    },
    []
  );

  return (
    <CampaignContext.Provider
      value={{
        campaigns,
        current,
        campaignRole: current?.myRole ?? null,
        loading,
        initialized,
        switchCampaign,
        refresh,
      }}
    >
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign(): CampaignContextValue {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error('useCampaign 必须在 CampaignProvider 内使用');
  return ctx;
}
