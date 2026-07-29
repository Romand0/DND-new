// 伤害弹窗 —— 攻击命中后展示，解析伤害骰、输入各骰结果、计算伤害、影响 HP
import { useState, useMemo, Fragment } from 'react';
import { X, Swords, Dices, Calculator } from 'lucide-react';
import { rollDice } from '@/data/diceService';
import type { Combatant, NpcAttack } from '@/types/combat';
import type { Attack } from '@/types/character';

interface Props {
  attacker: Combatant;
  target: Combatant;
  attack: Attack | NpcAttack;
  /** 是否处于检定劣势（投掷武器处于最大射程段）—— 暂作展示提示 */
  disadvantage?: boolean;
  /** 应用伤害：由 main 调用 combatStore.update 写入新 HP；致命伤害（HP 归零）时附带状态决定，
   * 同时返回完整信息用于 main 写入先攻表格 */
  onApplyDamage: (payload: {
    damage: number;
    newHp: number;
    status?: 'unconscious' | 'dead';
    diceValues: number[];   // 实际输入/摇出的各骰子值
    damageBonus: number;    // 伤害加值
    isCritical: boolean;    // 是否重击（由主方传入）
  }) => void;
  onClose: () => void;
  /** 由攻击检定阶段带入，决定是否为重击 */
  isCritical?: boolean;
}

/** 解析伤害骰字符串，如 "1d6+2"、"2d8 + 3"、"d4"、"1d6" */
function parseDamage(damage: string): { count: number; sides: number; bonus: number } {
  const result = { count: 1, sides: 0, bonus: 0 };
  if (!damage) return result;

  // 先按加号分割：加号前为伤害骰，加号后为加值
  const plusIdx = damage.indexOf('+');
  let dicePart = damage;
  let bonusPart = '';
  if (plusIdx !== -1) {
    dicePart = damage.substring(0, plusIdx).trim();
    bonusPart = damage.substring(plusIdx + 1).trim();
  } else {
    dicePart = damage.trim();
  }

  // 解析加值
  if (bonusPart) {
    const b = parseInt(bonusPart, 10);
    if (!isNaN(b)) result.bonus = b;
  }

  // 解析骰子：找到 d（大小写均可），前为数目，后为面数
  const dIdx = dicePart.toLowerCase().indexOf('d');
  if (dIdx === -1) {
    // 无 d，可能是纯数字（固定伤害），退化为 count=1, sides=0
    const flat = parseInt(dicePart, 10);
    if (!isNaN(flat)) {
      result.bonus += flat;
      result.count = 0; // 无骰子需要掷
    }
    return result;
  }

  const countStr = dicePart.substring(0, dIdx).trim();
  const sidesStr = dicePart.substring(dIdx + 1).trim();

  if (countStr) {
    const c = parseInt(countStr, 10);
    if (!isNaN(c) && c > 0) result.count = c;
  }
  if (sidesStr) {
    const s = parseInt(sidesStr, 10);
    if (!isNaN(s) && s > 0) result.sides = s;
  }
  return result;
}

export default function CombatDamageModal({
  attacker,
  target,
  attack,
  disadvantage,
  onApplyDamage,
  onClose,
  isCritical = false,
}: Props) {
  const parsed = useMemo(() => parseDamage(attack.damage || ''), [attack.damage]);

  // n 个骰子输入框，默认空字符串
  const [diceValues, setDiceValues] = useState<string[]>(() =>
    Array.from({ length: parsed.count }).map(() => '')
  );
  const [calculated, setCalculated] = useState<number | null>(null);
  // NPC 致命伤害时的状态决定：昏迷 / 死亡
  const [downedStatus, setDownedStatus] = useState<'unconscious' | 'dead' | null>(null);

  // 计算总伤害
  const computeTotal = (): number => {
    let sum = parsed.bonus;
    for (const v of diceValues) {
      const n = parseInt(v, 10);
      if (!isNaN(n)) sum += n;
    }
    return sum;
  };

  const handleCalc = () => {
    setCalculated(computeTotal());
    setDownedStatus(null);
  };

  // 摇骰：一键摇全部骰子
  const handleRollAll = () => {
    if (parsed.count === 0 || parsed.sides === 0) return;
    const result = rollDice({
      sides: parsed.sides as 4 | 6 | 8 | 10 | 12 | 20,
      count: parsed.count,
      mode: 'independent',
    });
    setDiceValues(result.values.map(String));
    setCalculated(null);
    setDownedStatus(null);
  };

  const updateDie = (idx: number, val: string) => {
    setDiceValues((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
    setCalculated(null);
    setDownedStatus(null);
  };

  // HP 计算
  const maxHp = target.maxHp ?? 0;
  const currentHp = target.currentHp ?? 0;
  const damage = calculated ?? 0;
  const newHp = Math.max(0, currentHp - damage);
  const actuallyLost = currentHp - newHp; // 实际扣血（不会超过当前血量）
  // 致命伤害：伤害值 ≥ 当前剩余 HP（即新 HP 归零）
  const isLethal = calculated !== null && damage >= currentHp && currentHp > 0;
  // 仅 NPC 需要决定昏迷/死亡（角色机制暂不考虑）
  const needDownedDecision = isLethal && !target.isPc;

  // HP 条颜色：依据剩余血量百分比
  const newHpPercent = maxHp > 0 ? (newHp / maxHp) * 100 : 0;
  const getHpColor = (): string => {
    if (newHp <= 0) return 'bg-red-500';
    if (newHpPercent > 50) return 'bg-green-500';
    if (newHpPercent > 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  // 扣除量颜色：扣至 0 时显示红色，否则与剩余血条同色（半透明）
  const getDeductColor = (): string => {
    if (newHp <= 0) return 'bg-red-500';
    return getHpColor();
  };

  const handleConfirm = () => {
    // NPC 致命伤害必须先做状态决定；PC 致命伤害不附带状态（角色机制暂不考虑）
    if (needDownedDecision && !downedStatus) return;
    const diceNums = diceValues.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
    onApplyDamage({
      damage,
      newHp,
      status: needDownedDecision ? downedStatus! : undefined,
      diceValues: diceNums,
      damageBonus: parsed.bonus,
      isCritical,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="dark:bg-card-dark light:bg-card-light rounded-xl shadow-2xl w-[90vw] max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-border-dark light:border-border-light shrink-0">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-danger" />
            <span className="font-bold dark:text-text-dark light:text-text-light">伤害结算</span>
            {disadvantage && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">检定劣势</span>
            )}
            {isCritical && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500">重击</span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 攻击者/目标信息 */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">攻击者</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{attacker.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">目标</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{target.name}</span>
            </div>
          </div>

          {/* 伤害骰信息 */}
          <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
            <div className="font-medium text-sm dark:text-text-dark light:text-text-light">{attack.name}</div>
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1 flex flex-wrap gap-x-3">
              <span>伤害骰 {attack.damage || '-'}</span>
              {attack.damageType && <span>{attack.damageType}</span>}
            </div>
          </div>

          {/* 解析结果提示 */}
          {parsed.count > 0 && (
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted text-center">
              解析为：{parsed.count}d{parsed.sides}{parsed.bonus !== 0 && ` + ${parsed.bonus}`}
            </div>
          )}

          {/* 骰子输入：每行 3 个，加号连接 */}
          {parsed.count > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium dark:text-text-dark light:text-text-light">
                  输入各 d{parsed.sides} 结果
                </label>
                <button
                  onDoubleClick={handleRollAll}
                  className="px-2.5 py-1 rounded-lg bg-primary text-white flex items-center gap-1 hover:bg-primary/90 active:scale-90 active:bg-primary/80 transition-all text-xs shrink-0 select-none"
                  title="双击摇骰"
                >
                  <Dices className="w-3.5 h-3.5" />
                  <span>摇骰</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {diceValues.map((v, i) => (
                  <Fragment key={i}>
                    <input
                      type="number"
                      min={1}
                      max={parsed.sides}
                      value={v}
                      onChange={(e) => updateDie(i, e.target.value)}
                      placeholder={`d${parsed.sides}`}
                      className="w-16 px-2 py-1.5 text-center rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    />
                    {/* 加号连接：最后一个骰子后若还有加值则继续显示加号 */}
                    {i < diceValues.length - 1 && (
                      <span className="dark:text-text-dark-muted light:text-text-light-muted">+</span>
                    )}
                  </Fragment>
                ))}
                {/* 末尾的伤害加值 */}
                {parsed.bonus !== 0 && (
                  <>
                    {parsed.count > 0 && (
                      <span className="dark:text-text-dark-muted light:text-text-light-muted">+</span>
                    )}
                    <span className="px-2 py-1.5 text-sm font-medium text-primary rounded-lg bg-primary/10">
                      {parsed.bonus}
                    </span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted text-center py-2">
              该攻击方式无伤害骰，仅有固定加值 {parsed.bonus}
            </div>
          )}

          {/* 计算按钮 */}
          <button
            onClick={handleCalc}
            className="w-full py-2.5 rounded-lg bg-danger text-white font-medium hover:bg-danger/90 transition-colors flex items-center justify-center gap-1.5"
          >
            <Calculator className="w-4 h-4" />
            计算
          </button>

          {/* 伤害结果 */}
          {calculated !== null && (
            <div className="space-y-3 pt-2 border-t dark:border-border-dark light:border-border-light animate-in fade-in slide-in-from-bottom duration-200">
              {/* 伤害数值 */}
              <div className="text-center pt-2">
                <div className="text-lg font-bold text-danger">{damage}</div>
                <div className="text-sm dark:text-text-dark light:text-text-light mt-1">
                  <span className="font-medium">{attacker.name}</span>
                  <span className="dark:text-text-dark-muted light:text-text-light-muted"> 对 </span>
                  <span className="font-medium">{target.name}</span>
                  <span className="dark:text-text-dark-muted light:text-text-light-muted"> 造成了 </span>
                  <span className="font-bold text-danger">{damage}</span>
                  <span className="dark:text-text-dark-muted light:text-text-light-muted"> 点伤害</span>
                </div>
              </div>

              {/* HP 影响 */}
              <div className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 p-3">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="dark:text-text-dark-muted light:text-text-light-muted">
                    {target.name} HP
                  </span>
                  <span className="font-medium dark:text-text-dark light:text-text-light">
                    {currentHp} → {newHp}
                    {actuallyLost > 0 && (
                      <span className="text-danger ml-1">-{actuallyLost}</span>
                    )}
                  </span>
                </div>
                {/* HP 条：剩余（实色） + 扣除（半透明） */}
                {maxHp > 0 && (
                  <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex">
                    {/* 剩余血条 */}
                    <div
                      className={`h-full ${getHpColor()} transition-all`}
                      style={{ width: `${(newHp / maxHp) * 100}%` }}
                    />
                    {/* 扣除量：半透明 */}
                    <div
                      className={`h-full ${getDeductColor()} opacity-40 transition-all`}
                      style={{ width: `${(actuallyLost / maxHp) * 100}%` }}
                    />
                  </div>
                )}
                <div className="flex justify-between text-xs mt-1">
                  <span className="dark:text-text-dark-muted light:text-text-light-muted">
                    最大 {maxHp}
                  </span>
                  {newHp <= 0 && (
                    <span className="text-red-500 font-medium">已倒下</span>
                  )}
                </div>
              </div>

              {/* NPC 致命伤害：昏迷 / 死亡 决定 */}
              {needDownedDecision && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2 animate-in fade-in slide-in-from-bottom duration-200">
                  <div className="text-sm font-medium text-amber-400">该 NPC 已倒下，请决定其状态</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDownedStatus('unconscious')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        downedStatus === 'unconscious'
                          ? 'bg-amber-500 text-white ring-2 ring-amber-400'
                          : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-amber-500/10'
                      }`}
                    >
                      昏迷
                    </button>
                    <button
                      onClick={() => setDownedStatus('dead')}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        downedStatus === 'dead'
                          ? 'bg-red-500 text-white ring-2 ring-red-400'
                          : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-red-500/10'
                      }`}
                    >
                      死亡
                    </button>
                  </div>
                  {downedStatus === 'unconscious' && (
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      昏迷：先攻表格表头黯淡，棋子变灰，留在原地
                    </div>
                  )}
                  {downedStatus === 'dead' && (
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      死亡：表头黯淡并在数字标记上打红叉，棋子变灰并打红叉，留在原地
                    </div>
                  )}
                </div>
              )}

              {/* 确认按钮：NPC 致命伤害未决定时禁用 */}
              <button
                onClick={handleConfirm}
                disabled={needDownedDecision && !downedStatus}
                className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
                  needDownedDecision && !downedStatus
                    ? 'bg-gray-400/60 text-white/70 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/90'
                }`}
              >
                {needDownedDecision && !downedStatus ? '请先决定状态' : '确认伤害'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
