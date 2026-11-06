// 战斗房间实时客户端（骨架）：WS 连接 + 重连退避 + 消息分发
// 生产直连独立 Worker；本地 dev 由 vite 代理 /realtime 到 wrangler dev（见 vite.config.ts）
import type { ClientMessage, ServerMessage } from '@/types/realtime';

const REALTIME_BASE: string = (import.meta as any).env?.VITE_REALTIME_URL || '';
const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000, 15000];

export interface RoomIdentity {
  token: string;
  role: 'dm' | 'player';
}

export class CombatRoomClient {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private listeners = new Set<(msg: ServerMessage) => void>();
  private stateListeners = new Set<(connected: boolean) => void>();

  private readonly roomId: string;
  private readonly identity: RoomIdentity;

  constructor(roomId: string, identity: RoomIdentity) {
    this.roomId = roomId;
    this.identity = identity;
  }

  connect(): void {
    this.closedByUser = false;
    const base = REALTIME_BASE || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/realtime`;
    const url = `${base}/room/${encodeURIComponent(this.roomId)}?token=${encodeURIComponent(this.identity.token)}&role=${this.identity.role}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.stateListeners.forEach((l) => l(true));
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.listeners.forEach((l) => l(msg));
    };
    ws.onclose = () => {
      this.stateListeners.forEach((l) => l(false));
      this.ws = null;
      if (!this.closedByUser) this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }

  disconnect(): void {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }

  send(msg: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  onMessage(listener: (msg: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser) this.connect();
    }, delay);
  }
}
