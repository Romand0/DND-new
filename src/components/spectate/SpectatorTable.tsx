// 玩家观战先攻表格：只读渲染 DM 广播的回合行动记录（行=轮次，列=参战者）
// 视觉与 DM 侧 InitiativeTable 对齐：序号圆标/死亡红叉/被突袭黄底/当前格黄环脉冲/富文本行动记录
// 轮次折叠：跟随放映自动展开当前轮，其余轮折叠为摘要条，可手动展开/收起
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CombatRosterEntry, CombatTurnState, RoundsProjection } from '@/types/realtime';
import { renderLogText } from '@/lib/logRichText';

export default function SpectatorTable({
  rounds,
  roster,
  turn,
  myCharacterIds,
}: {
  rounds: RoundsProjection;
  roster: CombatRosterEntry[];
  turn: CombatTurnState | null;
  /** 当前账号绑定角色 ID：表头我方单位显示 HP 数值（敌方仅血条，符合战斗情报水平） */
  myCharacterIds?: Set<string>;
}) {
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const prevRoundRef = useRef<number | null>(null);

  // 非当前轮自动折叠：放映进入新轮次时自动展开它（已手动展开的轮次保持展开）
  // turn.round 为 1-based，rounds 数组下标为 0-based，差 1
  useEffect(() => {
    const cur = turn?.round != null ? turn.round - 1 : null;
    if (cur == null || cur === prevRoundRef.current) return;
    prevRoundRef.current = cur;
    setExpandedRounds((prev) => {
      if (prev.has(cur)) return prev;
      const next = new Set(prev);
      next.add(cur);
      return next;
    });
  }, [turn?.round]);

  // 非放映或无数据不渲染（payload 语义：rounds 空 = 不展示）
  if (!turn || rounds.length === 0) return null;

  const toggleRound = (idx: number) =>
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  return (
    <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light max-w-[900px]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="dark:bg-card-dark light:bg-card-light">
            <th className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-card-dark light:bg-card-light z-10 w-16 text-center dark:text-text-dark light:text-text-light">
              轮次
            </th>
            {roster.map((c, idx) => {
              const downed = c.dead || c.downed;
              const hpRatio = c.maxHp > 0 ? Math.max(0, Math.min(1, (c.hp + c.tempHp) / c.maxHp)) : 0;
              const isMine = !!c.characterId && myCharacterIds?.has(c.characterId);
              return (
                <th
                  key={c.id}
                  className={`p-2 border-r dark:border-border-dark light:border-border-light min-w-[110px] max-w-[200px] relative ${
                    downed ? 'opacity-40' : ''
                  }`}
                >
                  <div className="absolute top-1 left-1 w-6 h-6 rounded-full dark:bg-gray-600 dark:text-white light:bg-gray-300 light:text-black text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                    {c.dead && (
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 100 100"
                        style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))' }}
                      >
                        <line x1="20" y1="20" x2="80" y2="80" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" />
                        <line x1="80" y1="20" x2="20" y2="80" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <div className="pl-7 space-y-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="font-medium truncate dark:text-text-dark light:text-text-light">{c.name}</span>
                      {/* 我方单位显示 HP 数值；敌方仅血条（战斗情报水平） */}
                      {isMine && !c.dead && (
                        <span className="shrink-0 font-mono text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                          {c.hp}{c.tempHp > 0 ? `+${c.tempHp}` : ''}/{c.maxHp}
                        </span>
                      )}
                    </div>
                    {!c.dead && (
                      <div className="h-1 rounded-full bg-neutral-500/20 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            hpRatio > 0.5 ? 'bg-emerald-500' : hpRatio > 0.25 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${hpRatio * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rounds.map((round, roundIndex) => {
            const isCurrentRound = turn.round - 1 === roundIndex;
            if (!expandedRounds.has(roundIndex)) {
              // 折叠行：单格摘要条（该轮行动记录条数），当前轮黄环提示
              const actionCount = roster.filter((c) => (round[c.id] || '') !== '' && round[c.id] !== '被突袭').length;
              return (
                <tr
                  key={roundIndex}
                  onClick={() => toggleRound(roundIndex)}
                  className={`border-t dark:border-border-dark/50 light:border-border-light/50 cursor-pointer select-none ${
                    isCurrentRound ? 'bg-yellow-400/5 dark:bg-yellow-300/5' : 'hover:bg-white/5'
                  }`}
                >
                  <td
                    colSpan={roster.length + 1}
                    className={`p-1.5 text-xs dark:text-text-dark-muted light:text-text-light-muted ${
                      isCurrentRound ? 'ring-1 ring-inset ring-yellow-400/60' : ''
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <ChevronRight className="w-3.5 h-3.5" />
                      第 {roundIndex + 1} 轮 · {actionCount} 条行动记录
                      {isCurrentRound && <span className="text-yellow-600 dark:text-yellow-400 font-medium">（当前）</span>}
                    </span>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={roundIndex} className="border-t dark:border-border-dark/50 light:border-border-light/50">
                <td
                  onClick={() => toggleRound(roundIndex)}
                  className="p-2 border-r dark:border-border-dark light:border-border-dark dark:bg-bg-dark light:bg-bg-light font-medium text-center dark:text-text-dark light:text-text-light cursor-pointer select-none"
                  title="收起该轮"
                >
                  <span className="inline-flex items-center gap-0.5">
                    <ChevronDown className="w-3 h-3 opacity-60" />
                    {roundIndex + 1}
                  </span>
                </td>
                {roster.map((c) => {
                  const action = round[c.id] || '';
                  const isSurprised = action === '被突袭';
                  const isCurrentTurn = turn.round - 1 === roundIndex && turn.combatantId === c.id;
                  if (isSurprised) {
                    return (
                      <td
                        key={c.id}
                        className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[110px] max-w-[200px] dark:bg-yellow-500/10 light:bg-yellow-100/50 text-center"
                        title="被突袭：本回合被突袭，失去先攻"
                      >
                        <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">被突袭</span>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={c.id}
                      className={`p-2 border-r dark:border-border-dark light:border-border-light min-w-[110px] max-w-[200px] align-top ${
                        isCurrentTurn ? 'ring-2 ring-inset ring-yellow-400 dark:ring-yellow-300 bg-yellow-400/10 dark:bg-yellow-300/10' : ''
                      }`}
                    >
                      {action ? (
                        <span className="text-xs dark:text-text-dark light:text-text-light break-words">{renderLogText(action)}</span>
                      ) : (
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
