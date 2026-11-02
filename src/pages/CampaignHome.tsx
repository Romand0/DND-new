// 团组内主页壳（/c/:campaignId/home）：URL 驱动的当前团组对齐 + 身份分流。
// URL 是进入指定团组的入口：请求的 cid 与本地当前团组记录不一致时先对齐再整页刷新，
// 保证 9 个分桶 store 落到目标团组桶；请求的团组已不含该用户时回退首个成员团组或前厅。
import { useEffect, useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { getCampaignId, setCurrentCampaignId } from '@/data/campaignScope';
import Layout from '@/components/Layout';
import PlayerLayout from '@/components/PlayerLayout';
import DmHome from '@/pages/DmHome';
import PlayerHome from '@/pages/PlayerHome';

export default function CampaignHome() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { isAdmin } = useAuth();
  // initialized 才能区分「确认无团组」与「成员列表尚未拉回」——后者直接回退会把入口弹回前厅
  const { campaigns, initialized } = useCampaign();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!initialized) return;
    if (campaigns.length === 0) {
      navigate('/', { replace: true });
      return;
    }
    const target = campaigns.find((c) => c.id === campaignId);
    if (!target) {
      // 团组已将当前用户移出（或 cid 无效）：回退首个成员团组的团组内主页
      const first = campaigns[0];
      setCurrentCampaignId(first.id);
      window.location.assign(`/c/${first.id}/home`);
      return;
    }
    if (getCampaignId() !== campaignId) {
      // URL 驱动切换：对齐本地分桶记录后整页刷新（store 为模块级单例，热刷新不可靠）
      setCurrentCampaignId(campaignId);
      window.location.reload();
      return;
    }
    setReady(true);
  }, [campaigns, initialized, campaignId, navigate]);

  if (!ready) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-gray-500 text-sm">正在进入团组...</div>
      </div>
    );
  }

  // 壳按身份选择：DM 用完整导航（Navbar 菜单+同步按钮），玩家用精简导航
  return (
    <Routes>
      {isAdmin ? (
        <Route element={<Layout />}>
          <Route path="*" element={<DmHome />} />
        </Route>
      ) : (
        <Route element={<PlayerLayout />}>
          <Route path="*" element={<PlayerHome />} />
        </Route>
      )}
    </Routes>
  );
}
