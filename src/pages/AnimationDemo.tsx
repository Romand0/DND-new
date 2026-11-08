// 动画演示页：独立于真实战斗的特效播放器。构造假沙盘投影 + 假参战者，
// 点击按钮即以 CombatEvent 驱动 useAnimationPlayer 播放一遍，完毕自动复位。
// 动画种类随迭代增多，这里按类别补按钮即可；特效本体在 AnimationOverlay / SpectatorBoard。
import { useMemo, useRef, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import SpectatorBoard from '@/components/spectate/SpectatorBoard';
import AnimationOverlay from '@/components/spectate/AnimationOverlay';
import { useAnimationPlayer } from '@/hooks/spectate/useAnimationPlayer';
import type { CombatEvent } from '@/types/combat';
import type { BoardProjection, CombatRosterEntry } from '@/types/realtime';

const ACTOR = 'demo-actor';
const DUMMY = 'demo-dummy';
const DUMMY2 = 'demo-dummy-2';

function makeRoster(): CombatRosterEntry[] {
  const base = {
    isPc: false,
    hp: 30,
    maxHp: 30,
    tempHp: 0,
    ac: 15,
    initiative: 0,
    downed: false,
    incapacitated: false,
    concentrating: false,
    dead: false,
  };
  return [
    { id: ACTOR, name: '演示者', isPc: true, ...base },
    { id: DUMMY, name: '木桩', ...base },
    { id: DUMMY2, name: '木桩二号', ...base },
  ];
}

function makeBoard(): BoardProjection {
  return {
    size: 'small',
    tokens: [
      { combatantId: ACTOR, col: 3, row: 8 },
      { combatantId: DUMMY, col: 8, row: 8 },
      { combatantId: DUMMY2, col: 10, row: 6 },
    ],
    items: [],
    painted: [],
    zones: [],
  };
}

let demoSeq = 0;
function demoEvent(e: Omit<CombatEvent, 'id' | 'at' | 'round'>): CombatEvent {
  demoSeq += 1;
  return { ...e, id: `demo-${demoSeq}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now(), round: 0 };
}

export default function AnimationDemo() {
  const roster = useMemo(makeRoster, []);
  const [board, setBoard] = useState(makeBoard);
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const { current } = useAnimationPlayer(events);
  const resetTimerRef = useRef<number | null>(null);

  const fire = (...list: Omit<CombatEvent, 'id' | 'at' | 'round'>[]) => {
    setEvents((prev) => [...prev, ...list.map(demoEvent)]);
  };

  // 位移演示：棋子 transition 过去，900ms 后复位（回程同样带过渡）
  const fireMove = () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    setBoard((b) => ({ ...b, tokens: b.tokens.map((t) => (t.combatantId === ACTOR ? { ...t, col: t.col + 3, row: t.row - 2 } : t)) }));
    fire({ kind: 'move', actorId: ACTOR, to: { col: 6, row: 6 }, text: '演示者移动到（第 7 列，第 7 行）' });
    resetTimerRef.current = window.setTimeout(() => setBoard(makeBoard()), 900);
  };

  const fireFullCombo = () => {
    fireMove();
    fire(
      { kind: 'attack', actorId: ACTOR, targetId: DUMMY, ranged: true, hit: true, critical: false, weaponName: '短弓', text: '演示者用短弓攻击木桩：d20 16+5=21 vs AC 15 命中' },
      { kind: 'damage', targetId: DUMMY, amount: 9, damageType: '穿刺', text: '木桩 受到 9 点穿刺伤害' },
      { kind: 'cast', actorId: ACTOR, targetId: DUMMY2, spellName: '火焰箭', text: '演示者施放 火焰箭（目标 木桩二号）' },
      { kind: 'heal', targetId: DUMMY, amount: 6, text: '木桩 恢复 6 点生命' },
    );
  };

  const btn = 'px-3 py-2 rounded-lg border text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-primary/10 transition-colors';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Clapperboard className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold dark:text-text-dark light:text-text-light">动画演示</h1>
        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          特效预览播放器，与真实战斗无关；每段播完自动复位
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={btn} onClick={() => fire({ kind: 'attack', actorId: ACTOR, targetId: DUMMY, ranged: false, hit: true, critical: false, weaponName: '长剑', text: '演示者用长剑攻击木桩：命中' })}>
          近战命中
        </button>
        <button className={btn} onClick={() => fire({ kind: 'attack', actorId: ACTOR, targetId: DUMMY, ranged: false, hit: true, critical: true, weaponName: '长剑', text: '演示者用长剑攻击木桩：暴击命中' })}>
          近战暴击
        </button>
        <button className={btn} onClick={() => fire({ kind: 'attack', actorId: ACTOR, targetId: DUMMY, ranged: true, hit: true, critical: false, weaponName: '短弓', text: '演示者用短弓攻击木桩：命中' })}>
          远程命中
        </button>
        <button className={btn} onClick={() => fire({ kind: 'attack', actorId: ACTOR, targetId: DUMMY, ranged: true, hit: true, critical: true, weaponName: '长弓', text: '演示者用长弓攻击木桩：暴击命中' })}>
          远程暴击
        </button>
        <button className={btn} onClick={() => fire({ kind: 'attack', actorId: ACTOR, targetId: DUMMY, ranged: true, hit: false, critical: false, weaponName: '短弓', text: '演示者用短弓攻击木桩：未命中' })}>
          远程未命中
        </button>
        <button className={btn} onClick={() => fire({ kind: 'cast', actorId: ACTOR, targetId: DUMMY2, spellName: '火焰箭', text: '演示者施放 火焰箭' })}>
          施法光圈
        </button>
        <button className={btn} onClick={() => fire({ kind: 'damage', targetId: DUMMY, amount: 9, damageType: '穿刺', text: '木桩 受到 9 点穿刺伤害' })}>
          受到伤害
        </button>
        <button className={btn} onClick={() => fire({ kind: 'damage', targetId: DUMMY2, amount: 22, damageType: '火', text: '木桩二号 受到 22 点火伤害' })}>
          大额伤害
        </button>
        <button className={btn} onClick={() => fire({ kind: 'heal', targetId: DUMMY, amount: 6, text: '木桩 恢复 6 点生命' })}>
          获得治疗
        </button>
        <button className={btn} onClick={fireMove}>
          位移移动
        </button>
        <button
          className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={fireFullCombo}
        >
          完整连招（移动 → 射击 → 伤害 → 施法 → 治疗）
        </button>
      </div>

      <SpectatorBoard board={board} roster={roster} currentCombatantId={null}>
        {(cell) => <AnimationOverlay anim={current} cell={cell} board={board} roster={roster} />}
      </SpectatorBoard>
    </div>
  );
}
