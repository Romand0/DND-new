import { X, Swords, Heart, Check } from 'lucide-react';
import type { AdvantageReason, Combatant, ManualMode } from '@/types/combat';
import AdvDisadvToggle from '@/components/AdvDisadvToggle';
import { DAMAGE_TYPE_OPTIONS } from '@/types/damage';
import { getCombatantAffinities } from '@/data/combatAffinities';
import {
  inferManualWeaponTraits,
  resolveManualDamage,
  type ManualAttackSource,
  type ManualWeaponTraits,
} from '@/data/manualDamage';
import { resolveManualAttackRoll } from '@/data/manualAttack';

const NO_REASONS: AdvantageReason[] = [];

const WEAPON_TRAIT_FIELDS = [
  { key: 'magical', label: '魔法武器' },
  { key: 'silvered', label: '镀银武器' },
  { key: 'adamantine', label: '精金武器' },
] as const;

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
  attackD20: string;
  onAttackD20Change: (v: string) => void;
  attackD20Second: string;
  onAttackD20SecondChange: (v: string) => void;
  attackBonus: string;
  onAttackBonusChange: (v: string) => void;
  rollMode: ManualMode;
  onRollModeChange: (m: ManualMode) => void;
  crit: boolean;
  onCritChange: (v: boolean) => void;
  damage: string;
  onDamageChange: (v: string) => void;
  isKill: boolean;
  onIsKillChange: (v: boolean) => void;
  damageType: string;
  onDamageTypeChange: (v: string) => void;
  attackSource: ManualAttackSource;
  onAttackSourceChange: (v: ManualAttackSource) => void;
  weaponTraits: ManualWeaponTraits;
  onWeaponTraitsChange: (patch: Partial<ManualWeaponTraits>) => void;
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
    attackD20, onAttackD20Change,
    attackD20Second, onAttackD20SecondChange,
    attackBonus, onAttackBonusChange,
    rollMode, onRollModeChange,
    crit, onCritChange,
    damage, onDamageChange, isKill, onIsKillChange,
    damageType, onDamageTypeChange, attackSource, onAttackSourceChange,
    weaponTraits, onWeaponTraitsChange,
    healMethod, onHealMethodChange, healAmount, onHealAmountChange,
    getEffectiveAc, getInitiativeCircle,
    onConfirm, onCancel,
  } = props;

  if (!open || !recordType) return null;

  const attacker = combatants.find(x => x.id === attackerId) || null;
  const selectedTarget = combatants.find(x => x.id === targetId) || null;
  const autoTraits = inferManualWeaponTraits(attackMethod);
  const autoTraitLabel = [
    autoTraits.magical ? '魔法' : '',
    autoTraits.silvered ? '镀银' : '',
    autoTraits.adamantine ? '精金' : '',
  ].filter(Boolean).join(' / ');
  // 与确认落账共用同一结算函数：抗性/易伤/免疫实时预览
  const damagePreview = (() => {
    const amount = parseInt(damage, 10) || 0;
    if (!selectedTarget || amount <= 0) return null;
    return resolveManualDamage({
      amount,
      damageType,
      source: attackSource,
      method: attackMethod,
      weaponTraits,
      affinities: getCombatantAffinities(selectedTarget),
    });
  })();

  // 命中判定：与确认落账共用同一结算函数（d20 + 加值 / 优劣势 / 自然 1·20 / 重击）
  const targetAc = (() => {
    if (!selectedTarget) return null;
    const ac = getEffectiveAc(selectedTarget);
    return !ac && ac !== 0 ? null : ac;
  })();
  const d20Values = [parseInt(attackD20, 10)];
  if (rollMode !== 'none') d20Values.push(parseInt(attackD20Second, 10));
  const d20Valid = d20Values.every(n => !isNaN(n) && n >= 1 && n <= 20);
  const bonusValue = attackBonus.trim() === '' ? 0 : parseInt(attackBonus, 10);
  const rollInfo = d20Valid && !isNaN(bonusValue) && targetAc !== null
    ? resolveManualAttackRoll({ d20: d20Values, bonus: bonusValue, ac: targetAc, mode: rollMode, forceCrit: crit })
    : null;

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
                  onAttackD20Change('');
                  onAttackD20SecondChange('');
                  onCritChange(false);
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

            {/* 攻击检定：d20 + 加值，优/劣势两颗骰 */}
            <div>
              <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                攻击检定（d20 + 加值）
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={attackD20}
                  onChange={(e) => onAttackD20Change(e.target.value)}
                  className="w-20 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  placeholder="d20"
                />
                {rollMode !== 'none' && (
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={attackD20Second}
                    onChange={(e) => onAttackD20SecondChange(e.target.value)}
                    className="w-24 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="第二颗 d20"
                  />
                )}
                <div className="flex items-center gap-1">
                  <span className="text-xs opacity-60">+</span>
                  <input
                    type="number"
                    value={attackBonus}
                    onChange={(e) => onAttackBonusChange(e.target.value)}
                    className="w-16 px-2 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="加值"
                  />
                </div>
                <AdvDisadvToggle
                  manualMode={rollMode}
                  onChange={onRollModeChange}
                  mode={rollMode}
                  reasons={NO_REASONS}
                />
              </div>
              {rollInfo && (
                <div className={`mt-1 text-xs font-medium ${rollInfo.hit ? 'text-green-500' : 'text-red-500'}`}>
                  {rollInfo.d20} {bonusValue >= 0 ? '+' : ''}{bonusValue} = {rollInfo.total}
                  {' '}{rollInfo.hit ? '≥' : '<'} AC {targetAc} → {rollInfo.hit ? '命中' : '未命中'}
                  {rollInfo.isNatural20 && '（自然20）'}
                  {rollInfo.isNatural1 && '（自然1 必失）'}
                  {rollInfo.critical && '（重击）'}
                </div>
              )}
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

            {/* 伤害来源与类型：决定抗性/易伤/免疫是否生效 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                  伤害来源
                </label>
                <select
                  value={attackSource}
                  onChange={(e) => onAttackSourceChange(e.target.value as ManualAttackSource)}
                  className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                >
                  <option value="weapon">武器</option>
                  <option value="spell">法术</option>
                  <option value="effect">其他效果</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                  伤害类型
                </label>
                <select
                  value={damageType}
                  onChange={(e) => onDamageTypeChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                >
                  <option value="">未声明（不应用抗性）</option>
                  {DAMAGE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 高级选项：武器材质宽松判定显式化（默认折叠） */}
            <details className="rounded-lg border dark:border-border-dark light:border-border-light">
              <summary className="px-3 py-2 text-xs font-medium cursor-pointer select-none dark:text-text-dark light:text-text-light">
                高级选项（武器材质判定）
                <span className="ml-1 font-normal opacity-60">
                  {attackSource === 'weapon' && autoTraitLabel ? `自动：${autoTraitLabel}` : '默认自动'}
                </span>
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  仅武器来源生效；显式指定优先于攻击方式文本（如「魔法长剑」）。
                </div>
                {WEAPON_TRAIT_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center justify-between gap-2">
                    <span className="text-xs dark:text-text-dark light:text-text-light">{field.label}</span>
                    <select
                      value={weaponTraits[field.key] === true ? 'true' : weaponTraits[field.key] === false ? 'false' : ''}
                      disabled={attackSource !== 'weapon'}
                      onChange={(e) => {
                        const v = e.target.value;
                        onWeaponTraitsChange({ [field.key]: v === '' ? null : v === 'true' } as Partial<ManualWeaponTraits>);
                      }}
                      className="w-28 px-2 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-xs outline-none focus:border-primary disabled:opacity-40"
                    >
                      <option value="">自动</option>
                      <option value="true">是</option>
                      <option value="false">否</option>
                    </select>
                  </div>
                ))}
              </div>
            </details>

            {/* 伤害（命中后显示） */}
            {selectedTarget && rollInfo?.hit && (() => {
              const tgt = selectedTarget;
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
                    {damagePreview && (damagePreview.breakdown || !damagePreview.damageType) && (
                      <div className={`mt-1 text-xs font-medium ${damagePreview.resolution.anyImmune ? 'text-gray-500 dark:text-gray-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {damagePreview.breakdown || '未声明伤害类型，不应用抗性'}
                      </div>
                    )}
                  </div>

                  <label className="flex items-center gap-2 p-2 rounded-lg border border-amber-500/30 bg-amber-500/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={crit || !!rollInfo?.isNatural20}
                      disabled={!!rollInfo?.isNatural20}
                      onChange={(e) => onCritChange(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      重击（伤害骰翻倍请自行结算）
                      {rollInfo?.isNatural20 ? '，自然20 已自动重击' : ''}
                    </span>
                  </label>

                  {/* 干掉目标 */}
                  {targetId && (() => {
                    const target = combatants.find(c => c.id === targetId);
                    if (!target || target.currentHp === undefined) return null;
                    const finalDmg = damagePreview?.final ?? (parseInt(damage, 10) || 0);
                    const willKill = finalDmg > 0 && finalDmg >= (target.currentHp ?? 0);
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
            {selectedTarget && (() => {
              const target = selectedTarget;
              let preview = '';
              if (!rollInfo) {
                preview = rollMode === 'none' ? '请先填写 d20 骰值' : '请填写两颗 d20 骰值';
              } else if (!rollInfo.hit) {
                preview = `对 ${target.name} 的攻击未命中（d20 ${rollInfo.d20} + ${bonusValue} = ${rollInfo.total} vs AC ${targetAc}）`;
                if (rollInfo.isNatural1) preview += '，自然1 必失';
              } else {
                const rawDmg = parseInt(damage, 10) || 0;
                const dmg = damagePreview?.final ?? rawDmg;
                const typeLabel = damagePreview?.damageType ? `${damagePreview.damageType}` : '';
                preview = `对 ${target.name} 的攻击命中（d20 ${rollInfo.d20} + ${bonusValue} = ${rollInfo.total} vs AC ${targetAc}）`;
                if (rollInfo.critical) preview += '，重击';
                preview += `，用${attackMethod || '???'}造成${dmg}点${typeLabel}伤害`;
                if (damagePreview?.breakdown) preview += `（${damagePreview.breakdown}）`;
                if (isKill && dmg > 0) preview += target.isPc ? `，将其击昏` : `，将其杀死`;
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
              onAttackD20Change('');
              onAttackD20SecondChange('');
              onAttackBonusChange('0');
              onRollModeChange('none');
              onCritChange(false);
              onDamageTypeChange('');
              onAttackSourceChange('weapon');
              onWeaponTraitsChange({ magical: null, silvered: null, adamantine: null });
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
