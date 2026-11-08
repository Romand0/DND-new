// 玩家操作审阅窗口（DM 端，战斗沙盘下方常驻区块）：
// 待审提交以 ops 可读 diff 垂直列出，通过/拒绝按钮内嵌其中；
// 「直接放行」开关从放映状态卡挪入此处，与审核动作同区管理。
import { Inbox } from 'lucide-react';
import PlayerActionReviewCard from '@/components/combat/PlayerActionReviewCard';
import type { Combatant } from '@/types/combat';
import type { PlayerActionRequest, TurnCommitOp } from '@/types/realtime';

interface PendingItem {
  request: PlayerActionRequest;
  from: { userId: string; role: string };
}

interface Props {
  pending: PendingItem[];
  combatants: Combatant[];
  /** userId → 绑定角色 ID 集合（审核归属校验；加载失败为空 Map，降级「未验证」） */
  boundByUser: Map<string, Set<string>>;
  currentRound: number;
  autoAccept: boolean;
  onToggleAutoAccept: (on: boolean) => void;
  onApply: (request: PlayerActionRequest, ops: TurnCommitOp[]) => void;
  onReject: (requestId: string, reason: string) => void;
}

export default function PlayerActionReviewPanel({
  pending,
  combatants,
  boundByUser,
  currentRound,
  autoAccept,
  onToggleAutoAccept,
  onApply,
  onReject,
}: Props) {
  return (
    <div className="rounded-xl border p-3 space-y-2 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="flex items-center gap-2 text-sm font-bold dark:text-text-dark light:text-text-light">
          <Inbox className="w-4 h-4 text-primary" />
          玩家操作审阅
          {pending.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-bold">
              {pending.length}
            </span>
          )}
        </h3>
        <label
          className="flex items-center gap-1.5 cursor-pointer select-none"
          title="开启后玩家提交的回合免审核直接入账（回合/绑定校验失败会自动拒绝并通知玩家）"
        >
          <input
            type="checkbox"
            checked={autoAccept}
            onChange={(e) => onToggleAutoAccept(e.target.checked)}
            className="w-3.5 h-3.5 accent-primary"
          />
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">直接放行</span>
        </label>
      </div>

      {pending.length === 0 ? (
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          暂无待审提交。玩家在其回合内打包操作（攻击/施法/移动/换持/备注）后提交，会出现在这里逐项审阅。
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map(({ request, from }) => {
            const actor = combatants.find((c) => c.id === request.combatantId);
            const boundIds = boundByUser.get(from.userId);
            const boundOk = boundIds ? (actor?.characterId ? boundIds.has(actor.characterId) : false) : null;
            const roundOk = request.round === currentRound;
            return (
              <PlayerActionReviewCard
                key={request.requestId}
                request={request}
                fromName={from.role === 'player' ? `玩家 ${from.userId.slice(0, 8)}…` : from.role}
                actorName={actor?.name ?? request.combatantId.slice(0, 8)}
                boundOk={boundOk}
                roundOk={roundOk}
                currentRound={currentRound}
                onApply={(ops) => onApply(request, ops)}
                onReject={(reason) => onReject(request.requestId, reason)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
