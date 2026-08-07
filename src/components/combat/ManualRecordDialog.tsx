import { X, Swords, Heart, Check } from 'lucide-react';
import type { Combatant } from '@/types/combat';

interface Props {
  open: boolean;
  recordType: 'attack' | 'recovery' | null;
  combatants: Combatant[];
  attackerId: string;
  onSetType: (t: 'attack' | 'recovery' | null) => void;
  targetId: string;
  onTargetIdChange: (v: string) => void;
  attackMethod: string;
  onAttackMethodChange: (v: string) => void;
  attackRoll: string;
  onAttackRollChange: (v: string) => void;
  damage: string;
  onDamageChange: (v: string) => void;
  isKill: boolean;
  onIsKillChange: (v: boolean) => void;
  healMethod: string;
  onHealMethodChange: (v: string) => void;
  healAmount: string;
  onHealAmountChange: (v: string) => void;
  getEffectiveAc: (c: Combatant) => number;
  getInitiativeCircle: (id: string) => string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ManualRecordDialog(props: Props) {
  const {
    open, recordType, combatants, attackerId,
    onSetType,
    targetId, onTargetIdChange,
    attackMethod, onAttackMethodChange,
    attackRoll, onAttackRollChange,
    damage, onDamageChange, isKill, onIsKillChange,
    healMethod, onHealMethodChange, healAmount, onHealAmountChange,
    getEffectiveAc, getInitiativeCircle,
    onConfirm, onCancel,
  } = props;

  if (!open || !recordType) return null;

  const attacker = combatants.find(x => x.id === attackerId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
            {recordType === 'attack' ? '攻击记录' : '恢复记录'}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {recordType === 'attack' && (
          <div className="space-y-4">
            {/* 目标选择 */}
            <div>
              <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                被攻击者
              </label>
              <select
                value={targetId}
                onChange={(e) => {
                  onTargetIdChange(e.target.value);
                  onAttackRollChange('');
                }}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
              >
                <option value="">选择目标...</option>
                {combatants.map(c => {
                  // 禁止选择自己 + 禁止选择同队（PC 攻击 NPC / NPC 攻击 PC）
                  if (attacker && (c.id === attacker.id || (c.id !== attacker.id && c.isPc === attacker.isPc))) {
                    return null;
                  }
                  const circle = getInitiativeCircle(c.id);
                  return (
                    <option key={c.id} value={c.id}>
                      {circle} {c.name}（先攻 {c.initiative}）
                    </option>
                  );
                })}
              </select>
              {/* 显示目标 AC */}
              {targetId && (() => {
                const target = combatants.find(c => c.id === targetId);
                if (!target) return null;
                const effAc = getEffectiveAc(target);
                if (!effAc && effAc !== 0) return null;
                return (
                  <div className="mt-1 text-xs text-primary font-medium">
                    目标 AC：{effAc}
                  </div>
                );
              })()}
            </div>

            {/* 攻击检定 */}
            <div>
              <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                攻击检定值
              </label>
              <input
                type="number"
                value={attackRoll}
                onChange={(e) => onAttackRollChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                placeholder="填入攻击检定总值"
              />
              {/* 自动判定命中结果 */}
              {targetId && attackRoll && (() => {
                const target = combatants.find(c => c.id === targetId);
                if (!target) return null;
                const effAc = getEffectiveAc(target);
                if (!effAc && effAc !== 0) return null;
                const roll = parseInt(attackRoll, 10);
                if (isNaN(roll)) return null;
                const hit = roll >= effAc;
                return (
                  <div className={`mt-1 text-xs font-medium ${hit ? 'text-green-500' : 'text-red-500'}`}>
                    {roll} {hit ? '≥' : '<'} AC {effAc} → {hit ? '命中' : '未命中'}
                  </div>
                );
              })()}
            </div>

            {/* 攻击方式 */}
            <div>
              <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                攻击方式
              </label>
              <input
                type="text"
                value={attackMethod}
                onChange={(e) => onAttackMethodChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                placeholder="例如：长剑挥砍"
              />
            </div>

            {/* 伤害（根据攻击检定自动判定命中后显示） */}
            {targetId && attackRoll && (() => {
              const tgt = combatants.find(c => c.id === targetId);
              if (!tgt) return null;
              const effAc = getEffectiveAc(tgt);
              if (!effAc && effAc !== 0) return null;
              const roll = parseInt(attackRoll, 10);
              if (isNaN(roll)) return null;
              const hit = roll >= effAc;
              if (!hit) return null;
              return (
                <>
                  <div>
                    <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                      伤害值（整数，不为0）
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={damage}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || (parseInt(v, 10) >= 1)) {
                          onDamageChange(v);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                      placeholder="例如：15"
                    />
                  </div>

                  {/* 干掉目标 */}
                  {targetId && (() => {
                    const target = combatants.find(c => c.id === targetId);
                    if (!target || target.currentHp === undefined) return null;
                    const dmg = parseInt(damage, 10) || 0;
                    const willKill = dmg > 0 && dmg >= (target.currentHp ?? 0);
                    if (!willKill) return null;
                    return (
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 cursor-pointer mt-3">
                        <input
                          type="checkbox"
                          checked={isKill}
                          onChange={(e) => onIsKillChange(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-xs text-red-500 dark:text-red-400">
                          造成致命伤害，{target.isPc ? '使其昏迷' : '将其杀死'}
                        </span>
                      </label>
                    );
                  })()}
                </>
              );
            })()}

            {/* 预览文本 */}
            {targetId && (() => {
              const target = combatants.find(c => c.id === targetId);
              if (!target) return null;
              let preview = '';
              // 自动判定：攻击检定值根据 AC 自动判断
              let autoHit: boolean | null = null;
              if (attackRoll) {
                const effAc = getEffectiveAc(target);
                const roll = parseInt(attackRoll, 10);
                if (!isNaN(roll)) autoHit = roll >= effAc;
              }
              if (autoHit === false) {
                preview = `对 ${target.name} 的攻击未命中，${attackMethod || '???'}打偏了`;
              } else if (autoHit === true) {
                const dmg = parseInt(damage, 10) || 0;
                preview = `对 ${target.name} 的攻击命中，用${attackMethod || '???'}造成${dmg}点伤害`;
                if (isKill) preview += target.isPc ? `，将其击昏` : `，将其杀死`;
              } else {
                preview = '请先填写攻击检定值';
              }
              return (
                <div className="p-2 rounded-lg bg-bg-dark/50 border border-border-dark text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  <span className="opacity-60">预览：</span>{preview}
                </div>
              );
            })()}
          </div>
        )}

        {recordType === 'recovery' && (
          <div className="space-y-4">
            {/* 恢复目标 */}
            <div>
              <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                恢复目标（可选，默认恢复自己）
              </label>
              <select
                value={targetId}
                onChange={(e) => onTargetIdChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
              >
                <option value="">恢复自己</option>
                {combatants.map(c => {
                  const circle = getInitiativeCircle(c.id);
                  return (
                    <option key={c.id} value={c.id}>
                      {circle} {c.name}（先攻 {c.initiative}）
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 恢复方式 */}
            <div>
              <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                恢复方式
              </label>
              <input
                type="text"
                value={healMethod}
                onChange={(e) => onHealMethodChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                placeholder="例如：治疗术、治疗药水"
              />
            </div>

            {/* 恢复量 */}
            <div>
              <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                恢复量（正整数）
              </label>
              <input
                type="number"
                min={1}
                value={healAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || (parseInt(v, 10) >= 1)) {
                    onHealAmountChange(v);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                placeholder="例如：10"
              />
            </div>

            {/* 预览 */}
            {(() => {
              const target = targetId
                ? combatants.find(c => c.id === targetId)
                : attacker;
              const amount = parseInt(healAmount, 10) || 0;
              const method = healMethod || '???';
              const tName = target?.name || '自己';
              return (
                <div className="p-2 rounded-lg bg-bg-dark/50 border border-border-dark text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  <span className="opacity-60">预览：</span>
                  用{method}恢复了{tName} {amount}点生命值
                </div>
              );
            })()}
          </div>
        )}

        {/* 切换模板 */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => {
              onSetType('attack');
              onTargetIdChange('');
              onAttackMethodChange('');
              onDamageChange('');
              onIsKillChange(false);
            }}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
              recordType === 'attack'
                ? 'border-primary bg-primary/10 text-primary'
                : 'dark:border-border-dark light:border-border-light'
            }`}
          >
            <Swords className="w-4 h-4 inline mr-1" />攻击模板
          </button>
          <button
            onClick={() => {
              onSetType('recovery');
              onTargetIdChange('');
              onHealMethodChange('');
              onHealAmountChange('');
            }}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
              recordType === 'recovery'
                ? 'border-primary bg-primary/10 text-primary'
                : 'dark:border-border-dark light:border-border-light'
            }`}
          >
            <Heart className="w-4 h-4 inline mr-1" />恢复模板
          </button>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
          >
            <Check className="w-4 h-4" />确认
          </button>
        </div>
      </div>
    </div>
  );
}
