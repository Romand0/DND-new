// 玩家圆桌信箱：检定任务列表（pending 待答复 / answered 已答复 / cancelled 已撤回）+ 检定弹窗
// 另接收 DM 的观战邀请（spectate_invite）：一键跳 /player/spectate?room= 加入实时战斗房间
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Clock, CheckCircle2, Ban, Eye } from 'lucide-react';
import type { Character } from '@/types/character';
import type { TableMessage, CheckRequestPayload, SpectateInvitePayload } from '@/types/roundTable';
import { useRoundTableInbox } from '@/hooks/useRoundTableInbox';
import { characterStore } from '@/data/characterStore';
import * as api from '@/lib/api';
import CheckRequestDialog from '@/components/roundtable/CheckRequestDialog';

export default function PlayerRoundTable() {
  const { messages, connectionLost, refresh } = useRoundTableInbox();
  const [activeMessage, setActiveMessage] = useState<TableMessage | null>(null);
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const navigate = useNavigate();

  const requests = useMemo(
    () => messages.filter(m => m.type === 'check_request'),
    [messages]
  );
  const pending = requests.filter(m => m.status === 'pending');
  const closed = requests.filter(m => m.status !== 'pending').sort((a, b) => b.updatedAt - a.updatedAt);

  // 观战邀请：pending 按 roomId 去重（DM 重发会产生多条，只显示最新一条）
  const invites = useMemo(() => {
    const byRoom = new Map<string, TableMessage>();
    for (const m of messages) {
      if (m.type !== 'spectate_invite' || m.status !== 'pending') continue;
      const roomId = (m.payload as SpectateInvitePayload).roomId;
      const prev = byRoom.get(roomId);
      if (!prev || m.createdAt > prev.createdAt) byRoom.set(roomId, m);
    }
    return [...byRoom.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [messages]);

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

      {invites.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">
            观战邀请
          </h2>
          {invites.map(msg => {
            const payload = msg.payload as SpectateInvitePayload;
            return (
              <button
                key={msg.id}
                onClick={() => navigate(`/player/spectate?room=${encodeURIComponent(payload.roomId)}`)}
                className="w-full text-left rounded-xl border p-4 flex items-center justify-between gap-2 dark:border-primary/50 dark:bg-card-dark light:border-primary/50 light:bg-card-light hover:border-primary transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-emerald-600/15 shrink-0">
                    <Eye className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold dark:text-text-dark light:text-text-light truncate">
                      DM 邀请你观战「{payload.title}」
                    </div>
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      点击加入实时观战 · {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                <span className="text-xs text-primary shrink-0">加入 →</span>
              </button>
            );
          })}
        </section>
      )}

      {pending.length === 0 && closed.length === 0 && invites.length === 0 && (
        <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-10 text-center">
          <Inbox className="w-10 h-10 mx-auto dark:text-text-dark-muted light:text-text-light-muted opacity-40" />
          <div className="mt-3 text-sm dark:text-text-dark-muted light:text-text-light-muted">
            暂无检定任务，DM 发起后会出现在这里
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">
            待答复（{pending.length}）
          </h2>
          {pending.map(msg => {
            const payload = msg.payload as CheckRequestPayload;
            return (
              <button
                key={msg.id}
                onClick={() => openDialog(msg)}
                className="w-full text-left rounded-xl border p-4 dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light hover:border-primary transition-colors"
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
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                  {payload.characterName} · DC {payload.dcMode === 'open' ? payload.dc : payload.dcMode === 'hidden_dc' ? '已隐藏' : '无需判定'}
                  {payload.note ? ` · ${payload.note}` : ''}
                </div>
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                  {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
            );
          })}
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted">
            历史记录
          </h2>
          {closed.map(msg => {
            const payload = msg.payload as CheckRequestPayload;
            return (
              <div
                key={msg.id}
                className="rounded-xl border p-4 dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light opacity-70"
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
                    <span className="flex items-center gap-1 text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">
                      <Ban className="w-3.5 h-3.5" />
                      已撤回
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
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
