// 玩家战斗观战页：加入实时房间（combat-<recordId>）→ 只读渲染 DM 广播的幂等快照
// 协议见 types/realtime.ts CombatDeltaPayload；玩家侧只收不发（DO 端拒 player 写 combat.delta）。
// 断线自动重连由 CombatRoomClient 内置；重连成功后发 snapshot.request 取最近 delta 恢复状态
// （DM 端只在数据变化时广播，静止期没有新消息可等）。
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Link2, LogOut, RefreshCw, Skull, Sparkles, Ban, Moon, Swords, Wifi, WifiOff } from 'lucide-react';
import { CombatRoomClient } from '@/lib/combatRoomClient';
import { useAuth } from '@/contexts/AuthContext';
import type { CombatDeltaPayload } from '@/types/realtime';

function takeLatestDelta(deltas: { payload: unknown }[]): CombatDeltaPayload | null {
  // snapshot.deltas 的 payload 是透传 unknown，逐条嗅探是否有 v1 快照特征字段
  for (let i = deltas.length - 1; i >= 0; i--) {
    const d = deltas[i].payload as Partial<CombatDeltaPayload> | null;
    if (d && d.v === 1 && Array.isArray(d.roster) && d.recordId) return d as CombatDeltaPayload;
  }
  return null;
}

export default function PlayerSpectate() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [roomIdInput, setRoomIdInput] = useState('');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [spectate, setSpectate] = useState<CombatDeltaPayload | null>(null);
  const [notice, setNotice] = useState('');
  const clientRef = useRef<CombatRoomClient | null>(null);
  // join 回调引用：自动加入（?room=）与手动加入共用
  const joinRef = useRef<(room: string) => void>(() => {});

  const leave = () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setConnected(false);
    setActiveRoomId(null);
    setSpectate(null);
  };

  useEffect(() => leave, []);

  // 圆桌邀请链接带 ?room=combat-xxx：登录态就绪后自动加入一次
  const autoRoom = searchParams.get('room') || '';
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoinedRef.current || !autoRoom || !token) return;
    autoJoinedRef.current = true;
    joinRef.current(autoRoom);
  }, [autoRoom, token]);

  const join = (roomRaw?: string) => {
    const room = (roomRaw ?? roomIdInput).trim();
    if (!room) {
      setNotice('请输入房间号（问 DM 要，形如 combat-xxxx）');
      return;
    }
    if (!token) {
      setNotice('登录已失效，请重新登录');
      return;
    }
    clientRef.current?.disconnect();
    setSpectate(null);
    setNotice('');
    const client = new CombatRoomClient(room, { token, role: 'player' });
    clientRef.current = client;
    client.onConnectionChange((ok) => setConnected(ok));
    client.onMessage((msg) => {
      if (msg.t === 'welcome') {
        client.send({ t: 'snapshot.request' });
        return;
      }
      if (msg.t === 'combat.delta') {
        setSpectate(msg.payload);
        return;
      }
      if (msg.t === 'snapshot') {
        const latest = takeLatestDelta(msg.deltas);
        if (latest) setSpectate(latest);
        return;
      }
      if (msg.t === 'error') {
        setNotice(`服务器提示：${msg.message}`);
      }
    });
    client.connect();
    setActiveRoomId(room);
  };
  joinRef.current = join;

  // 参战者排序：先攻降序，与 DM 端表格一致
  const roster = spectate ? [...spectate.roster].sort((a, b) => b.initiative - a.initiative) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Eye className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold dark:text-text-dark light:text-text-light">战斗观战</h1>
      </div>

      {!activeRoomId && (
        <div className="p-5 rounded-xl border space-y-4 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
            向 DM 要观战房间号（DM 战斗页顶部绿点，点击可复制），粘贴后加入即可实时看到 HP、状态与回合推进。
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="combat-xxxxxxxx"
              className="flex-1 min-w-56 px-4 py-2.5 rounded-lg border font-mono text-sm dark:bg-card-dark-hover dark:border-border-dark dark:text-text-dark light:bg-card-light-hover light:border-border-light light:text-text-light"
            />
            <button
              onClick={() => join()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Link2 className="w-4 h-4" />
              加入观战
            </button>
          </div>
          {notice && <p className="text-sm text-danger">{notice}</p>}
        </div>
      )}

      {activeRoomId && (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                  connected
                    ? 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-amber-600/15 text-amber-600 dark:text-amber-400'
                }`}
              >
                {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {connected ? '已连接' : '重连中…'}
              </span>
              <span className="font-mono text-xs truncate dark:text-text-dark-muted light:text-text-light-muted">
                {activeRoomId}
              </span>
            </div>
            <button
              onClick={leave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:opacity-80 transition-opacity"
            >
              <LogOut className="w-4 h-4" />
              退出观战
            </button>
          </div>

          {spectate && (
            <div className="flex items-center justify-between gap-2 flex-wrap p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
              <h2 className="text-lg font-bold dark:text-text-dark light:text-text-light truncate">{spectate.title}</h2>
              {spectate.turn ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 text-primary text-sm font-bold shrink-0">
                  <Swords className="w-4 h-4" />
                  第 {spectate.turn.round} 回合
                </span>
              ) : (
                <span className="px-3 py-1.5 rounded-full bg-neutral-500/15 dark:text-text-dark-muted light:text-text-light-muted text-sm shrink-0">
                  未开始放映
                </span>
              )}
            </div>
          )}

          {spectate && spectate.turn && spectate.turn.combatantId && (
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted px-1">
              当前行动：
              <span className="font-semibold text-primary">
                {roster.find((r) => r.id === spectate.turn?.combatantId)?.name ?? '—'}
              </span>
            </p>
          )}

          {spectate && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {roster.map((c) => {
                const hpRatio = c.maxHp > 0 ? Math.max(0, Math.min(1, (c.hp + c.tempHp) / c.maxHp)) : 0;
                const isCurrent = spectate.turn?.combatantId === c.id;
                return (
                  <div
                    key={c.id}
                    className={`p-4 rounded-xl border space-y-3 transition-all ${
                      c.dead
                        ? 'opacity-50 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light'
                        : isCurrent
                          ? 'ring-2 ring-primary dark:bg-card-dark dark:border-primary/60 light:bg-card-light light:border-primary/60'
                          : 'dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold truncate dark:text-text-dark light:text-text-light">{c.name}</span>
                      <span className="shrink-0 text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">
                        先攻 {c.initiative}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-mono font-bold dark:text-text-dark light:text-text-light">
                          {c.hp}
                          {c.tempHp > 0 && <span className="text-amber-500"> +{c.tempHp}</span>}
                          <span className="dark:text-text-dark-muted light:text-text-light-muted"> / {c.maxHp}</span>
                        </span>
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                          AC {c.ac ?? '—'}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-500/20 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            c.dead ? 'bg-neutral-500' : hpRatio > 0.5 ? 'bg-emerald-500' : hpRatio > 0.25 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${hpRatio * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex gap-1.5 flex-wrap min-h-6">
                      {c.dead && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-neutral-600/20 text-neutral-400">
                          <Skull className="w-3 h-3" /> 死亡
                        </span>
                      )}
                      {!c.dead && c.downed && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-600/15 text-red-500">
                          <Moon className="w-3 h-3" /> 昏迷
                        </span>
                      )}
                      {c.incapacitated && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-600/15 text-orange-500">
                          <Ban className="w-3 h-3" /> 失能
                        </span>
                      )}
                      {c.concentrating && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-violet-600/15 text-violet-500">
                          <Sparkles className="w-3 h-3" /> 专注
                        </span>
                      )}
                      {!c.dead && !c.downed && !c.incapacitated && !c.concentrating && (
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">状态正常</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {connected && !spectate && (
            <div className="text-center py-10 dark:text-text-dark-muted light:text-text-light-muted">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
              <p className="text-sm">已连接，等待 DM 端数据…</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
