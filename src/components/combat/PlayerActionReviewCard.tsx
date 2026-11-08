// 玩家回合提交审核卡（DM 端）：ops 可读 diff + 伤害金额可改 → 应用落库或拒绝回执。
// 绑定校验（boundOk）与回合校验（roundOk）由父组件算好传入；应用失败原因走回执广播。
import { useState } from 'react';
import { Swords, ShieldAlert, ShieldCheck, ShieldQuestion, Send, Ban } from 'lucide-react';
import type { PlayerActionRequest, TurnCommitOp } from '@/types/realtime';

interface Props {
  request: PlayerActionRequest;
  fromName: string;
  actorName: string;
  /** null = 绑定映射未加载（降级提示）；true/false = 绑定匹配校验结果 */
  boundOk: boolean | null;
  roundOk: boolean;
  currentRound: number;
  onApply: (ops: TurnCommitOp[]) => void;
  onReject: (reason: string) => void;
}

function opText(op: TurnCommitOp): string {
  if (op.kind === 'end-turn') return '结束回合';
  if (op.kind === 'note') {
    const cost = op.actionCost === 'action' ? '（主动作）' : op.actionCost === 'bonus' ? '（附赠动作）' : '';
    return `行动：${op.roundText}${cost}`;
  }
  if (op.kind === 'move') {
    return `移动：到（第 ${op.to.col + 1} 列，第 ${op.to.row + 1} 行）`;
  }
  if (op.kind === 'cast') {
    const cost = op.actionCost === 'action' ? '（主动作）' : op.actionCost === 'bonus' ? '（附赠动作）' : '';
    const slot = op.slotLevel > 0 ? `${op.slotLevel} 环` : '戏法';
    const conc = op.concentration ? '，专注' : '';
    return `施法：${op.spellName}（${slot}${conc}）${op.targetName ? ` → ${op.targetName}` : ''}${cost}`;
  }
  if (op.kind === 'ready-item') {
    return op.itemName ? `换持：${op.slot === 'left' ? '左手' : '右手'} → ${op.itemName}` : `放下${op.slot === 'left' ? '左手' : '右手'}物品`;
  }
  const roll = `d20 ${op.d20}+${op.bonus}=${op.d20 + op.bonus}`;
  const verdict = op.critical ? '暴击命中' : op.hit ? '命中' : '未命中';
  const ammo = op.ammoCount ? `，弹药 -${op.ammoCount}` : '';
  const dmg = op.hit && op.damage ? `，${op.damage.amount} 点${op.damage.type}` : '';
  return `攻击：${op.weaponName} → ${op.targetName}（${roll} vs AC）${verdict}${dmg}${ammo}`;
}

export default function PlayerActionReviewCard({ request, fromName, actorName, boundOk, roundOk, currentRound, onApply, onReject }: Props) {
  const ops = request.action?.ops ?? [];
  // 伤害金额可编辑：按 op 下标存编辑值（未编辑的 op 用原始 amount）
  const [damageEdits, setDamageEdits] = useState<Record<number, number>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const applyEdits = () => {
    const edited = ops.map((op, i) => {
      if (op.kind === 'attack' && op.damage && damageEdits[i] !== undefined) {
        return { ...op, damage: { ...op.damage, amount: damageEdits[i] } };
      }
      return op;
    });
    onApply(edited);
  };

  return (
    <div className="p-3 rounded-xl border shadow-lg space-y-2 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
      <div className="flex items-center gap-1.5 text-sm font-bold dark:text-text-dark light:text-text-light">
        <Swords className="w-4 h-4 text-primary shrink-0" />
        玩家回合提交
        {boundOk === true && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
        {boundOk === false && <ShieldAlert className="w-3.5 h-3.5 text-red-500" />}
        {boundOk === null && <ShieldQuestion className="w-3.5 h-3.5 opacity-50" />}
      </div>
      <div className="text-xs space-y-0.5 dark:text-text-dark-muted light:text-text-light-muted">
        <p>
          行动者：{actorName} · 发起者：{fromName}
          {boundOk === true && <span className="text-emerald-500">（绑定已验证）</span>}
          {boundOk === false && <span className="text-red-500">（绑定不匹配，谨慎处理）</span>}
          {boundOk === null && <span className="opacity-60">（绑定未验证）</span>}
        </p>
        {!roundOk && (
          <p className="text-red-500">
            回合已推进（提交时第 {request.round} 轮，当前第 {currentRound} 轮）——应用会被拒绝，请让玩家重新提交
          </p>
        )}
      </div>

      {/* ops 可读列表 + 伤害编辑 */}
      <div className="space-y-1">
        {ops.map((op, i) => (
          <div key={i} className="rounded-lg px-2 py-1.5 text-xs space-y-1 dark:bg-bg-dark light:bg-bg-light-2">
            <div className="dark:text-text-dark light:text-text-light">{opText(op)}</div>
            {op.kind === 'attack' && op.damage && (
              <div className="flex items-center gap-1.5">
                <span className="dark:text-text-dark-muted light:text-text-light-muted">伤害改为</span>
                <input
                  type="number"
                  value={damageEdits[i] ?? op.damage.amount}
                  onChange={(e) => setDamageEdits((prev) => ({ ...prev, [i]: Number(e.target.value) || 0 }))}
                  className="w-20 px-1.5 py-0.5 rounded border text-xs font-mono dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
                />
                <span className="dark:text-text-dark-muted light:text-text-light-muted">点{op.damage.type}（可在此做抗性减免）</span>
              </div>
            )}
          </div>
        ))}
        {ops.length === 0 && <div className="text-xs opacity-60">（无操作，仅结束回合）</div>}
      </div>

      {showRejectInput ? (
        <div className="flex gap-1.5">
          <input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="拒绝原因（可选）"
            className="flex-1 px-2 py-1 rounded border text-xs dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
          />
          <button
            onClick={() => onReject(rejectReason.trim() || 'DM 拒绝了该回合提交')}
            className="px-3 py-1 text-xs rounded-lg bg-danger text-white hover:opacity-90 transition-opacity shrink-0"
          >
            确认拒绝
          </button>
          <button
            onClick={() => setShowRejectInput(false)}
            className="px-2 py-1 text-xs rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light shrink-0"
          >
            取消
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={applyEdits}
            disabled={!roundOk}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            应用并广播
          </button>
          <button
            onClick={() => setShowRejectInput(true)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <Ban className="w-3.5 h-3.5" />
            拒绝
          </button>
        </div>
      )}
    </div>
  );
}
