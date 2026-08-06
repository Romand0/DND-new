import type { Combatant } from '@/types/combat';

interface Props {
  open: boolean;
  recordType: 'attack' | 'recovery' | null;
  combatants: Combatant[];
  attackerName: string;
  onSetType: (t: 'attack' | 'recovery' | null) => void;
  // 攻击字段
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
  targetAc: number | null;
  // 恢复字段
  healMethod: string;
  onHealMethodChange: (v: string) => void;
  healAmount: string;
  onHealAmountChange: (v: string) => void;
  // 动作数
  actionsLeft: number;
  // 按钮
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ManualRecordDialog(props: Props) {
  const {
    open, recordType, combatants, attackerName,
    onSetType,
    targetId, onTargetIdChange,
    attackMethod, onAttackMethodChange,
    attackRoll, onAttackRollChange,
    damage, onDamageChange, isKill, onIsKillChange, targetAc,
    healMethod, onHealMethodChange, healAmount, onHealAmountChange,
    actionsLeft, onConfirm, onCancel,
  } = props;

  if (!open) return null;

  const roll = parseInt(attackRoll, 10);
  const acDisplay = targetAc ?? '—';
  const hitPreview = (!isNaN(roll) && targetAc !== null)
    ? (roll >= targetAc ? '✅ 命中' : '❌ 未命中')
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">手动记录回合</h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          为 <span className="font-medium text-gray-900 dark:text-gray-100">{attackerName}</span> 的回合添加操作记录（{actionsLeft >= 0 ? `剩余动作数：${actionsLeft}` : ''}）
        </p>
        {!recordType ? (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => onSetType('attack')}
              className="rounded-xl border-2 border-gray-200 p-4 text-left hover:border-red-400 hover:bg-red-50 dark:border-gray-700 dark:hover:bg-red-900/20"
            >
              <div className="mb-1 text-lg">⚔️</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">攻击</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">对目标造成伤害或判定未命中</div>
            </button>
            <button
              onClick={() => onSetType('recovery')}
              className="rounded-xl border-2 border-gray-200 p-4 text-left hover:border-green-400 hover:bg-green-50 dark:border-gray-700 dark:hover:bg-green-900/20"
            >
              <div className="mb-1 text-lg">💊</div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">恢复</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">恢复生命值或治疗</div>
            </button>
          </div>
        ) : (
          <>
            {recordType === 'attack' && (
              <>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">目标</label>
                <select
                  value={targetId}
                  onChange={(e) => onTargetIdChange(e.target.value)}
                  className="mb-3 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">-- 选择目标 --</option>
                  {combatants.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}（HP: {c.currentHp}/{c.maxHp ?? '?'}, AC: {c.ac ?? '?'}）
                    </option>
                  ))}
                </select>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">攻击方式</label>
                <input
                  value={attackMethod}
                  onChange={(e) => onAttackMethodChange(e.target.value)}
                  placeholder="例如：巨剑挥砍 / 短剑偷袭"
                  className="mb-3 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">攻击检定</label>
                    <input
                      value={attackRoll}
                      onChange={(e) => onAttackRollChange(e.target.value)}
                      placeholder="1~30+"
                      className="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">目标 AC</label>
                    <div className="flex h-[42px] items-center rounded-lg border border-gray-300 bg-gray-100 px-2.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white">
                      {acDisplay} {hitPreview && <span className="ml-2 text-xs">{hitPreview}</span>}
                    </div>
                  </div>
                </div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">伤害值（命中时必填）</label>
                <input
                  value={damage}
                  onChange={(e) => onDamageChange(e.target.value)}
                  placeholder="例如 15"
                  className="mb-3 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <label className="mb-4 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={isKill}
                    onChange={(e) => onIsKillChange(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  此攻击判定击杀 / 击昏（0 HP 后不再写入恢复）
                </label>
              </>
            )}
            {recordType === 'recovery' && (
              <>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">目标（留空则治疗自己）</label>
                <select
                  value={targetId}
                  onChange={(e) => onTargetIdChange(e.target.value)}
                  className="mb-3 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">—— 自己 ——</option>
                  {combatants.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}（HP: {c.currentHp}/{c.maxHp ?? '?'}）
                    </option>
                  ))}
                </select>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">恢复方式</label>
                <input
                  value={healMethod}
                  onChange={(e) => onHealMethodChange(e.target.value)}
                  placeholder="例如：治疗药水 / 治疗真言"
                  className="mb-3 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">恢复量</label>
                <input
                  value={healAmount}
                  onChange={(e) => onHealAmountChange(e.target.value)}
                  placeholder="例如 12"
                  className="mb-3 block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </>
            )}
          </>
        )}

        <div className="flex justify-between gap-3">
          {recordType && (
            <button
              onClick={() => onSetType(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >← 返回选择</button>
          )}
          <div className="ml-auto flex gap-3">
            <button
              onClick={onCancel}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >取消</button>
            <button
              onClick={onConfirm}
              disabled={!recordType}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
            >确认记录</button>
          </div>
        </div>
      </div>
    </div>
  );
}
