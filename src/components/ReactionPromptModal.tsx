// 通用反应提示弹窗（非攻击解决方式）：展示声明式反应（法术/特性），
// 只做「行使 / 放弃」与资源扣减，具体效果由 DM 走既有法术流程或状态库结算。
// 不内置任何具体法术逻辑：文案与成本全部来自 ReactionDefinition（可派生自法术数据）。
import type { Combatant, ReactionPrompt } from '@/types/combat';
import type { ReactionDefinition } from '@/data/reactionDefinitions';
import { ShieldAlert, Sparkles } from 'lucide-react';

interface Props {
  prompt: ReactionPrompt;
  definition: ReactionDefinition | null;
  owner: Combatant;
  /** 事件目标名（被攻击/被施法方） */
  targetName: string;
  /** 法术位环级（0 = 不耗环） */
  slotLevel: number;
  /** 法术位是否足够（slotLevel > 0 时有效） */
  slotAvailable: boolean;
  onConfirm: () => void;
  onSkip: () => void;
}

export default function ReactionPromptModal({
  prompt, definition, owner, targetName, slotLevel, slotAvailable, onConfirm, onSkip,
}: Props) {
  const reactionSpent = owner.reactionUsed === true;
  const name = definition?.name ?? prompt.definitionName ?? '反应';
  const body = definition?.prompt?.body;
  const blocked = reactionSpent || (slotLevel > 0 && !slotAvailable);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onSkip}>
      <div
        className="dark:bg-card-dark light:bg-card-light rounded-xl shadow-2xl w-[90vw] max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b dark:border-border-dark light:border-border-light">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <span className="font-semibold dark:text-text-dark light:text-text-light">{name}</span>
        </div>

        <div className="px-4 py-3 space-y-3 text-sm">
          <div className="dark:text-text-dark light:text-text-light">
            <span className="font-medium">{owner.name}</span> 可对 <span className="font-medium">{targetName}</span> 的处境行使反应。
          </div>
          {body && (
            <div className="rounded-lg border px-3 py-2 text-xs leading-relaxed dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light">
              {body}
            </div>
          )}
          <div className="text-xs space-y-1 dark:text-text-dark light:text-text-light">
            <div>消耗：反应 ×1{slotLevel > 0 ? ` · ${slotLevel} 环法术位 ×1` : ''}</div>
            {reactionSpent && <div className="text-red-500">本回合反应已用尽</div>}
            {slotLevel > 0 && !slotAvailable && <div className="text-red-500">{slotLevel} 环法术位不足</div>}
          </div>
          <div className="text-xs text-muted-dark dark:text-text-dark/60 light:text-text-light/60">
            行使后请按法术流程结算效果（引擎只负责扣反应与法术位）。
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t dark:border-border-dark light:border-border-light">
          <button
            onClick={onSkip}
            className="px-3 py-1.5 rounded-lg text-sm border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
          >
            放弃（保留反应）
          </button>
          <button
            onClick={onConfirm}
            disabled={blocked}
            className="px-3 py-1.5 rounded-lg text-sm bg-primary text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            行使
          </button>
        </div>
      </div>
    </div>
  );
}
