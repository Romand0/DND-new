// 玩家圆桌信箱：检定任务列表（pending 待答复 / answered 已答复 / cancelled 已撤回）+ 检定弹窗
// 另接收 DM 的观战邀请（spectate_invite）：一键跳 /player/spectate?room= 加入实时战斗房间
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Clock, CheckCircle2, Ban, Eye, History } from 'lucide-react';
import type { Character } from '@/types/character';
import type { TableMessage, CheckRequestPayload } from '@/types/roundTable';
import type { CampaignMember } from '@/types/campaign';
import { useRoundTableInbox } from '@/hooks/useRoundTableInbox';
import { characterStore } from '@/data/characterStore';
import * as api from '@/lib/api';
import CheckRequestDialog from '@/components/roundtable/CheckRequestDialog';
import TableRing, { type TableSeat } from '@/components/roundtable/TableRing';
import CollapsibleSection from '@/components/roundtable/CollapsibleSection';
import SpectateInviteGroupCard from '@/components/roundtable/SpectateInviteGroupCard';
import { groupSpectateInvites } from '@/lib/roundTableGroups';
import { useCampaign } from '@/contexts/CampaignContext';
import { useAuth } from '@/contexts/AuthContext';

export default function PlayerRoundTable() {
  const { messages, connectionLost, refresh } = useRoundTableInbox();
  const [activeMessage, setActiveMessage] = useState<TableMessage | null>(null);
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const { current: campaign } = useCampaign();
  const { user } = useAuth();
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!campaign?.id) { setMembers([]); return; }
    api.fetchCampaignMembers<CampaignMember[]>(campaign.id)
      .then(list => setMembers(Array.isArray(list) ? list : []))
      .catch(() => setMembers([]));
  }, [campaign?.id]);

  const seats = useMemo<TableSeat[]>(
    () => members
      .filter(m => m.userId !== user?.id)
      .map(m => ({
        userId: m.userId,
        username: m.username || '未知账号',
        avatar: m.avatar || '',
        role: m.role,
      })),
    [members, user?.id]
  );

  const requests = useMemo(
    () => messages.filter(m => m.type === 'check_request'),
    [messages]
  );
  const pending = requests.filter(m => m.status === 'pending');
  const closed = requests.filter(m => m.status !== 'pending').sort((a, b) => b.updatedAt - a.updatedAt);

  // 观战邀请按战斗房间合并：同房间多次抛送只占一张折叠卡
  const inviteGroups = useMemo(() => groupSpectateInvites(messages), [messages]);

  // 打开弹窗时确保本地有角色卡数据（玩家端 characterStore 缺卡时从云端拉一次，不入库）
  const openDialog = async (msg: TableMessage) => {
    const payload = msg.payload as CheckRequestPayload;
    const local = characterStore.get(payload.characterId);
    if (local) {
      setActiveCharacter(local);
    } else {
      try {
        const remote = await api.fetchCharacter<Character>(payload.characterId);
        setActiveCharacter(remote ?? null);
      } catch {
        setActiveCharacter(null);
      }
    }
    setActiveMessage(msg);
  };

  // 无 pending 且当前弹窗任务已答复 → 自动关闭弹窗
  useEffect(() => {
    if (activeMessage && requests.find(m => m.id === activeMessage.id)?.status !== 'pending') {
      setActiveMessage(null);
    }
  }, [requests, activeMessage]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">圆桌</h1>
          <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mt-1">
            DM 抛送的检定任务在此接收与答复
            {connectionLost && <span className="ml-2 text-xs text-red-500">（连接中断，重试中）</span>}
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-xs px-2.5 py-1.5 rounded-lg border dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted hover:text-primary transition-colors"
        >
          刷新
        </button>
      </div>

      <div className="rounded-xl border p-3 sm:p-4 dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light">
        <TableRing seats={seats} readOnly />
      </div>

      {pending.length === 0 && closed.length === 0 && inviteGroups.length === 0 && (
        <div className="rounded-xl border p-10 text-center dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light">
          <Inbox className="mx-auto h-10 w-10 opacity-40 dark:text-text-dark-muted light:text-text-light-muted" />
          <div className="mt-3 text-sm dark:text-text-dark-muted light:text-text-light-muted">
            暂无检定任务，DM 发起后会出现在这里
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <CollapsibleSection title="待答复" icon={Clock} count={pending.length} tone="amber">
          {pending.map(msg => {
            const payload = msg.payload as CheckRequestPayload;
            return (
              <button
                key={msg.id}
                onClick={() => openDialog(msg)}
                className="w-full rounded-lg border p-4 text-left transition-colors hover:border-primary dark:border-border-dark light:border-border-light"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold dark:text-text-dark light:text-text-light">
                    {payload.checkLabel}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    等待答复
                  </span>
                </div>
                <div className="mt-1 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  {payload.characterName} · DC {payload.dcMode === 'open' ? payload.dc : payload.dcMode === 'hidden_dc' ? '已隐藏' : '无需判定'}
                  {payload.note ? ` · ${payload.note}` : ''}
                </div>
                <div className="mt-0.5 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
            );
          })}
        </CollapsibleSection>
      )}

      {inviteGroups.length > 0 && (
        <CollapsibleSection
          title="观战邀请"
          icon={Eye}
          count={inviteGroups.length}
          tone="emerald"
          hint={`${inviteGroups.reduce((n, g) => n + g.messages.length, 0)} 条记录按战斗合并`}
        >
          {inviteGroups.map(group => (
            <SpectateInviteGroupCard
              key={group.roomId}
              group={group}
              variant="player"
              onJoin={roomId => navigate(`/player/spectate?room=${encodeURIComponent(roomId)}`)}
            />
          ))}
        </CollapsibleSection>
      )}

      {closed.length > 0 && (
        <CollapsibleSection
          title="历史记录"
          icon={History}
          count={closed.length}
          defaultOpen={false}
          hint="已答复 / 已撤回"
        >
          {closed.map(msg => {
            const payload = msg.payload as CheckRequestPayload;
            return (
              <div
                key={msg.id}
                className="rounded-lg border p-4 opacity-70 dark:border-border-dark light:border-border-light"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm dark:text-text-dark light:text-text-light">
                    {payload.checkLabel}
                  </div>
                  {msg.status === 'answered' ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-500 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      已答复
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs shrink-0 dark:text-text-dark-muted light:text-text-light-muted">
                      <Ban className="w-3.5 h-3.5" />
                      已撤回
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </CollapsibleSection>
      )}

      {activeMessage && (
        <CheckRequestDialog
          message={activeMessage}
          payload={activeMessage.payload as CheckRequestPayload}
          character={activeCharacter}
          onSubmitted={refresh}
          onClose={() => { setActiveMessage(null); refresh(); }}
        />
      )}
    </div>
  );
}
