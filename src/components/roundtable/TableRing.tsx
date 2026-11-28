// 圆桌桌面：环绕展示除自己外的团组成员头像，作为检定/任务/物资的投递目标区。
// 桌面端支持真拖拽，也支持「点选投递物 → 点头像」的两步操作（触摸设备没有 HTML5 drag）。
import { useState, type CSSProperties } from 'react';
import { ClipboardList, Dices, Package } from 'lucide-react';

export type TableDeliverable = 'check' | 'task' | 'treasure';

export interface TableSeat {
  userId: string;
  username: string;
  avatar: string;
  role: string;
  characterId?: string;
  characterName?: string;
}

interface Props {
  seats: TableSeat[];
  selectedUserId?: string;
  readOnly?: boolean;
  centerLabel?: string;
  onSelectSeat?: (seat: TableSeat) => void;
  onDeliver?: (kind: TableDeliverable, seat: TableSeat) => void;
}

const DELIVERABLES: {
  kind: TableDeliverable;
  label: string;
  icon: typeof Dices;
  enabled: boolean;
  hint: string;
}[] = [
  { kind: 'check', label: '检定', icon: Dices, enabled: true, hint: '拖到成员头像上发起定向检定' },
  { kind: 'task', label: '任务', icon: ClipboardList, enabled: false, hint: '任务派发将在圆桌任务插件接入' },
  { kind: 'treasure', label: '物资', icon: Package, enabled: false, hint: '物资投送将随剧情道具接入' },
];

const DRAG_MIME = 'application/x-roundtable-deliverable';

export default function TableRing({ seats, selectedUserId, readOnly = false, centerLabel, onSelectSeat, onDeliver }: Props) {
  const [armed, setArmed] = useState<TableDeliverable | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const deliver = (kind: TableDeliverable, seat: TableSeat) => {
    setArmed(null);
    setDragOverId(null);
    onDeliver?.(kind, seat);
  };

  const handleSeatClick = (seat: TableSeat) => {
    if (readOnly) return;
    if (armed) {
      deliver(armed, seat);
      return;
    }
    onSelectSeat?.(seat);
  };

  const seatNode = (seat: TableSeat, style?: CSSProperties) => {
    const selected = selectedUserId === seat.userId;
    const droppable = armed === 'check' && Boolean(seat.characterId);
    return (
      <button
        key={seat.userId}
        type="button"
        onClick={() => handleSeatClick(seat)}
        onDragOver={e => {
          if (!armed) return;
          e.preventDefault();
          setDragOverId(seat.userId);
        }}
        onDragLeave={() => setDragOverId(prev => (prev === seat.userId ? null : prev))}
        onDrop={e => {
          e.preventDefault();
          const kind = (e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')) as TableDeliverable;
          if (kind) deliver(kind, seat);
        }}
        style={style}
        className={`flex w-20 flex-col items-center gap-1 rounded-xl px-1 py-1 transition-colors ${
          readOnly ? 'cursor-default' : armed ? 'cursor-crosshair' : ''
        } ${armed && !droppable ? 'opacity-55' : ''} ${
          dragOverId === seat.userId && droppable ? 'bg-primary/20 ring-2 ring-primary' : ''
        }`}
        title={
          armed === 'check' && !seat.characterId
            ? `${seat.username} 未绑定角色卡，无法发起检定`
            : seat.characterName
              ? `${seat.username} · ${seat.characterName}`
              : seat.username
        }
      >
        <span
          className={`relative flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-bold transition-all sm:h-14 sm:w-14 ${
            selected
              ? 'border-primary ring-2 ring-primary/40'
              : 'border-transparent dark:border-border-dark light:border-border-light'
          } ${dragOverId === seat.userId && droppable ? 'scale-110' : ''}`}
        >
          {seat.avatar ? (
            <img src={seat.avatar} alt={seat.username} className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-primary/15 text-primary">
              {seat.username.slice(0, 2)}
            </span>
          )}
          <span
            className={`absolute -bottom-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
              seat.role === 'dm' ? 'bg-amber-600 text-white' : 'bg-slate-600 text-white'
            }`}
          >
            {seat.role === 'dm' ? 'DM' : '玩家'}
          </span>
        </span>
        <span className="max-w-full truncate text-xs dark:text-text-dark light:text-text-light">{seat.username}</span>
        {seat.characterName && (
          <span className="max-w-full truncate text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
            {seat.characterName}
          </span>
        )}
      </button>
    );
  };

  const chipNode = (d: (typeof DELIVERABLES)[number]) => {
    const Icon = d.icon;
    const isArmed = armed === d.kind;
    return (
      <button
        key={d.kind}
        type="button"
        draggable={d.enabled}
        onDragStart={e => {
          if (!d.enabled) return;
          e.dataTransfer.setData(DRAG_MIME, d.kind);
          e.dataTransfer.setData('text/plain', d.kind);
          e.dataTransfer.effectAllowed = 'move';
          setArmed(d.kind);
        }}
        onDragEnd={() => setArmed(null)}
        onClick={() => d.enabled && setArmed(prev => (prev === d.kind ? null : d.kind))}
        disabled={!d.enabled}
        title={d.hint}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
          !d.enabled
            ? 'cursor-not-allowed bg-black/10 text-white/45 line-through dark:bg-white/5'
            : isArmed
              ? 'bg-white text-primary shadow'
              : 'bg-white/15 text-white hover:bg-white/25'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {d.label}
        {!d.enabled && <span className="text-[10px] no-underline">规划中</span>}
      </button>
    );
  };

  return (
    <div className="w-full">
      {seats.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-sm dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light dark:text-text-dark-muted light:text-text-light-muted">
          暂无其他团组成员，邀请玩家加入后即可围坐圆桌
        </div>
      ) : (
        <>
          {/* 桌面端：环形座位 */}
          <div className="relative mx-auto hidden h-[430px] w-full max-w-4xl sm:block">
            <div
              className="absolute rounded-[50%] border border-amber-200/20 shadow-inner"
              style={{
                inset: '23% 20%',
                background:
                  'radial-gradient(ellipse at 50% 38%, rgba(74, 122, 92, 0.95), rgba(30, 66, 47, 0.98) 62%, rgba(20, 47, 34, 0.99))',
              }}
            >
              <div className="absolute inset-3 rounded-[50%] border border-white/10" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <div className="text-xs font-medium tracking-wide text-white/70">
                  {centerLabel ?? (readOnly ? '当前围坐圆桌的伙伴' : '把投递拖到成员头像')}
                </div>
                {!readOnly && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {DELIVERABLES.map(chipNode)}
                  </div>
                )}
                {armed === 'check' && (
                  <div className="text-[11px] text-white/60">已选中检定，点击有角色卡的成员</div>
                )}
              </div>
            </div>
            {seats.map((seat, idx) => {
              const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / seats.length;
              const x = 50 + 39 * Math.cos(angle);
              const y = 50 + 37 * Math.sin(angle);
              return seatNode(seat, {
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
              });
            })}
          </div>

          {/* 移动端：头像栅格，投递语义与环形一致 */}
          <div className="space-y-3 sm:hidden">
            <div
              className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-white/70"
              style={{ background: 'radial-gradient(ellipse at center, #2f6b4f, #1e422f)' }}
            >
              {readOnly ? (
                <span className="text-xs">{centerLabel ?? '当前围坐圆桌的伙伴'}</span>
              ) : (
                DELIVERABLES.map(chipNode)
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">{seats.map(seat => seatNode(seat))}</div>
          </div>
        </>
      )}
    </div>
  );
}
