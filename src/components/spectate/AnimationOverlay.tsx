// 沙盘动画覆盖层：在棋盘坐标系内渲染四类特效（近战冲刺弧光 / 远程飞矢 / 伤害数字 / 恢复数字 / 施法光圈）。
// 纯 CSS keyframes + animation-delay 编排时序（播放器只推进整段时长），pointer-events-none 不挡操作。
// keyframes 用组件内 <style> 注入一次（AGENTS 约定：不建独立 CSS 文件）。
import type { ReactNode } from 'react';
import type { BoardProjection, CombatRosterEntry } from '@/types/realtime';
import type { ActiveAnimation } from '@/hooks/spectate/useAnimationPlayer';

function tokenPos(board: BoardProjection, combatantId: string | undefined) {
  if (!combatantId) return null;
  return board.tokens.find((t) => t.combatantId === combatantId) ?? null;
}

/** 棋子中心 px 坐标（棋子渲染为 col*cell+3 起、cell-6 宽，即内缩 3px） */
function centerPx(pos: { col: number; row: number }, cell: number) {
  return { x: pos.col * cell + cell / 2, y: pos.row * cell + cell / 2 };
}

export default function AnimationOverlay({
  anim,
  cell,
  board,
  roster,
}: {
  anim: ActiveAnimation | null;
  cell: number;
  board: BoardProjection;
  roster: CombatRosterEntry[];
}) {
  const byId = new Map(roster.map((r) => [r.id, r]));
  let body: ReactNode = null;

  if (anim && (anim.kind === 'attack-melee' || anim.kind === 'attack-ranged')) {
    const from = tokenPos(board, anim.actorId);
    const to = tokenPos(board, anim.targetId);
    if (from && to) {
      const a = centerPx(from, cell);
      const b = centerPx(to, cell);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      // 冲刺：向目标方向位移 35% 再回弹（CSS 变量传方向）
      const ux = (dx / dist) * dist * 0.35;
      const uy = (dy / dist) * dist * 0.35;
      if (anim.kind === 'attack-melee') {
        body = (
          <>
            <div
              key={`lunge-${anim.id}`}
              className="absolute rounded-full bg-danger/90"
              style={{
                left: a.x - cell / 2,
                top: a.y - cell / 2,
                width: cell - 6,
                height: cell - 6,
                // @ts-expect-error CSS 自定义属性
                '--m5-dx': `${ux}px`,
                '--m5-dy': `${uy}px`,
                animation: 'm5-lunge 340ms ease-in-out forwards',
              }}
            />
            <svg
              key={`slash-${anim.id}`}
              className="absolute pointer-events-none"
              style={{ left: b.x - cell, top: b.y - cell, width: cell * 2, height: cell * 2, overflow: 'visible', animation: 'm5-fade 420ms ease-out 260ms forwards', opacity: 0 }}
              viewBox="0 0 100 100"
            >
              <path
                d="M 20 65 Q 50 5 80 35"
                fill="none"
                stroke={anim.critical ? '#fbbf24' : '#fff'}
                strokeWidth="9"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="100"
                style={{ animation: 'm5-slash 380ms ease-out 260ms forwards' }}
              />
            </svg>
          </>
        );
      } else {
        // 飞矢：小箭头从攻击者直线飞向目标（linear 匀速），抵达后目标红闪
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        body = (
          <>
            <div
              key={`arrow-${anim.id}`}
              className="absolute"
              style={{
                left: a.x,
                top: a.y,
                width: Math.max(10, cell * 0.6),
                height: 3,
                background: 'linear-gradient(to right, #a16207, #fbbf24)',
                borderRadius: 2,
                transformOrigin: '0 50%',
                // 起始即朝向目标；飞行动画由 keyframes 驱动 translate
                // @ts-expect-error CSS 自定义属性
                '--m5-fx': `${dx}px`,
                '--m5-fy': `${dy}px`,
                '--m5-rot': `${angle}deg`,
                animation: 'm5-fly 520ms linear forwards, m5-fade 60ms linear 540ms forwards',
                boxShadow: '0 0 4px rgba(251,191,36,0.8)',
              }}
            />
            {anim.hit && (
              <div
                key={`hitflash-${anim.id}`}
                className="absolute rounded-full"
                style={{
                  left: b.x - cell / 2,
                  top: b.y - cell / 2,
                  width: cell,
                  height: cell,
                  background: anim.critical ? 'rgba(251,191,36,0.55)' : 'rgba(239,68,68,0.45)',
                  animation: 'm5-hitflash 340ms ease-out 530ms forwards',
                  opacity: 0,
                }}
              />
            )}
          </>
        );
      }
    }
  } else if (anim && anim.kind === 'cast') {
    const from = tokenPos(board, anim.actorId);
    if (from) {
      const a = centerPx(from, cell);
      body = (
        <div
          key={`ring-${anim.id}`}
          className="absolute rounded-full border-4 border-primary"
          style={{
            left: a.x - cell / 2,
            top: a.y - cell / 2,
            width: cell - 6,
            height: cell - 6,
            animation: 'm5-ring 800ms ease-out forwards',
          }}
        />
      );
    }
  } else if (anim && (anim.kind === 'damage' || anim.kind === 'heal')) {
    const to = tokenPos(board, anim.targetId);
    if (to) {
      const b = centerPx(to, cell);
      const isDmg = anim.kind === 'damage';
      body = (
        <div
          key={`${anim.kind}-${anim.id}`}
          className={`absolute font-black select-none ${isDmg ? 'text-red-500' : 'text-emerald-400'}`}
          style={{
            left: b.x - cell,
            top: b.y - cell * 0.9,
            width: cell * 2,
            textAlign: 'center',
            fontSize: Math.max(13, cell * 0.72),
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            animation: 'm5-floatnum 950ms ease-out forwards',
          }}
        >
          {isDmg ? `-${anim.amount}` : `+${anim.amount}`}
        </div>
      );
    }
  }

  return (
    <>
      <style>{`
        @keyframes m5-lunge {
          0% { transform: translate(0, 0); opacity: 1; }
          45% { transform: translate(var(--m5-dx), var(--m5-dy)); opacity: 0.9; }
          100% { transform: translate(0, 0); opacity: 0; }
        }
        @keyframes m5-slash {
          0% { stroke-dashoffset: 100; opacity: 1; }
          60% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes m5-fly {
          0% { transform: rotate(var(--m5-rot)) translate(0, 0); }
          100% { transform: rotate(var(--m5-rot)) translate(var(--m5-fx), var(--m5-fy)); }
        }
        @keyframes m5-hitflash {
          0% { opacity: 0; transform: scale(0.6); }
          40% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 0; transform: scale(1.4); }
        }
        @keyframes m5-ring {
          0% { opacity: 0.9; transform: scale(0.5); }
          100% { opacity: 0; transform: scale(2.1); }
        }
        @keyframes m5-floatnum {
          0% { opacity: 0; transform: translateY(6px) scale(0.8); }
          15% { opacity: 1; transform: translateY(0) scale(1.1); }
          100% { opacity: 0; transform: translateY(-22px) scale(1); }
        }
        @keyframes m5-fade {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      <div className="absolute inset-0 pointer-events-none z-30 overflow-visible">{body}</div>
    </>
  );
}
