// 圆桌记录分组：同一战斗房间的观战投送合并为一组，便于折叠收纳。
import type { SpectateInvitePayload, TableMessage } from '@/types/roundTable';

export interface SpectateInviteGroup {
  roomId: string;
  title: string;
  latestAt: number;
  pendingCount: number;
  /** 最新在前 */
  messages: TableMessage[];
}

export function groupSpectateInvites(messages: TableMessage[]): SpectateInviteGroup[] {
  const byRoom = new Map<string, TableMessage[]>();
  for (const msg of messages) {
    if (msg.type !== 'spectate_invite') continue;
    const roomId = (msg.payload as SpectateInvitePayload).roomId;
    const list = byRoom.get(roomId);
    if (list) list.push(msg);
    else byRoom.set(roomId, [msg]);
  }

  const groups: SpectateInviteGroup[] = [];
  for (const [roomId, items] of byRoom) {
    const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
    const latest = sorted[0];
    groups.push({
      roomId,
      title: (latest.payload as SpectateInvitePayload).title,
      latestAt: latest.createdAt,
      pendingCount: sorted.filter(m => m.status === 'pending').length,
      messages: sorted,
    });
  }

  return groups.sort((a, b) => b.latestAt - a.latestAt);
}
