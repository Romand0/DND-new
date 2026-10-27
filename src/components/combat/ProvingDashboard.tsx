// 试验场·精密仪表盘：只读展示参战者各项「实际生效」数值，数据源与战斗引擎
// 同一函数（computeCombatantAc / computeSaveBonus / getCombatantAffinities /
// globalStatusManager），保证展示值与真实结算严格同源可信任。
// 豁免项支持快捷掷骰（d20 + 加值，含优劣势检测——与检定弹窗同一 advantageRules 引擎）。
import { useEffect, useMemo, useState } from 'react';
import { Dices, Gauge } from 'lucide-react';
import { computeCombatantAc } from '@/data/combatStore';
import { getCombatantAffinities, getCombatRoundCtx } from '@/data/combatAffinities';
import { globalStatusManager } from '@/data/statusManager';
import { detectAdvantage, resolveRollMode } from '@/data/advantageRules';
import { rollDice } from '@/data/diceService';
import { computeSaveBonus, fmtBonus, SAVE_ABILITY_KEYS, ABILITY_LABEL_MAP } from '@/lib/saveBonus';
import type { AbilityKey } from '@/types/character';
import type { Character, Equipment } from '@/types/character';
import type { CombatRecord, Combatant } from '@/types/combat';

interface Props {
  record: CombatRecord;
  combatant: Combatant;
  character: Character | null;
  combatInventory?: Equipment[] | null;
}

interface RollResult {
  abilityKey: AbilityKey;
  d20: number;
  bonus: number;
  total: number;
  mode: 'none' | 'advantage' | 'disadvantage';
  formula: string;
}

export default function ProvingDashboard({ record, combatant, character, combatInventory }: Props) {
  const [tick, setTick] = useState(0);
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);

  // 轮询兜底：状态过期倒计时与父组件订阅之外的数据变化（3s 轻量刷新）
  useEffect(() => {
    const timer = window.setInterval(() => setTick(t => t + 1), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const ac = useMemo(() => computeCombatantAc(combatant, character, combatInventory), [combatant, character, combatInventory]);

  const speed = useMemo(() => {
    void tick;
    return (combatant.speed ?? 0) + (combatant.speedModifier ?? 0);
  }, [combatant, tick]);

  const activeCount = useMemo(() => {
    void tick;
    return globalStatusManager.getActiveStatuses(combatant.id, 'combat', getCombatRoundCtx(record.id)).length;
  }, [combatant.id, record.id, tick]);

  const affinities = useMemo(() => {
    void tick;
    return getCombatantAffinities(combatant, record.id);
  }, [combatant, record.id, tick]);

  const pendingSources = combatant.pendingAdvantageSources?.filter(p => !p.consumed) ?? [];

  const saveRows = useMemo(
    () => SAVE_ABILITY_KEYS.map(key => ({ key, data: computeSaveBonus(combatant, character, key) })),
    [combatant, character],
  );

  const handleQuickRoll = (key: AbilityKey) => {
    const row = computeSaveBonus(combatant, character, key);
    if (!row) return;
    // 优劣势检测与检定弹窗同源：只读检测 + 手动优先合并（此处手动恒 none）
    const auto = detectAdvantage({
      scene: 'saving_throw',
      currentRound: record.rounds.length,
      attacker: combatant,
      attackerCharacter: character,
      saveAbility: key,
      recordId: record.id,
      roundCtx: getCombatRoundCtx(record.id),
    });
    const { mode } = resolveRollMode('none', auto);
    // 优势 = 2d20 取高；劣势 = 2d20 取低
    const first = rollDice({ sides: 20, count: mode === 'none' ? 1 : 2, mode: 'independent' });
    let d20 = first.values[0];
    if (first.values.length === 2) {
      d20 = mode === 'advantage' ? Math.max(...first.values) : Math.min(...first.values);
    }
    const bonus = row.total;
    setLastRoll({
      abilityKey: key,
      d20,
      bonus,
      total: d20 + bonus,
      mode,
      formula: row.formula,
    });
  };

  const affinitySummary = useMemo(() => {
    const parts: string[] = [];
    const fmt = (label: string, entries: { types?: string[]; raw?: string }[] | undefined) => {
      if (!entries || entries.length === 0) return;
      const types = [...new Set(entries.flatMap(e => e.types ?? []))];
      const raws = entries.map(e => e.raw).filter(Boolean);
      parts.push(`${label}: ${types.length > 0 ? types.join('、') : raws.length > 0 ? raws.join('、') : '全部'}`);
    };
    fmt('抗性', affinities?.resistances);
    fmt('免疫', affinities?.immunities);
    fmt('易伤', affinities?.vulnerabilities);
    return parts;
  }, [affinities]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold dark:text-text-dark light:text-text-light">
        <Gauge size={13} className="text-accent" /> 实际生效数值
      </div>

      {/* 顶层关键值 */}
      <div className="grid grid-cols-4 gap-1.5">
        <Stat label="AC" value={String(ac)} />
        <Stat label="速度" value={`${speed}${combatant.speedModifier ? '*' : ''}`} />
        <Stat label="动作" value={String(combatant.actions ?? 1)} />
        <Stat label="附赠" value={String(combatant.bonusActions ?? 1)} />
      </div>
      {combatant.speedModifier ? (
        <p className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
          * 速度含调整值 {fmtBonus(combatant.speedModifier)}（基础 {combatant.speed ?? 0}）
        </p>
      ) : null}
      <p className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
        激活状态 {activeCount} 项 · 待消费优劣势 {pendingSources.length} 项
        {pendingSources.length > 0 && `（${pendingSources.map(p => p.reason).join('、')}）`}
      </p>

      {/* 六属性 + 豁免 */}
      <div className="rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
        {saveRows.map(({ key, data }) => {
          const score = data?.score;
          const mod = data?.mod ?? 0;
          return (
            <div key={key} className="flex items-center justify-between px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium dark:text-text-dark light:text-text-light shrink-0">
                  {ABILITY_LABEL_MAP[key]}
                </span>
                <span className="dark:text-text-dark-muted light:text-text-light-muted">
                  {typeof score === 'number' ? `${score}（${fmtBonus(mod)}）` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`font-semibold ${data ? 'dark:text-text-dark light:text-text-light' : 'dark:text-text-dark-muted light:text-text-light-muted'}`}>
                  {data ? fmtBonus(data.total) : '—'}
                </span>
                <button
                  onClick={() => handleQuickRoll(key)}
                  disabled={!data}
                  className="p-1 rounded text-accent hover:bg-accent/10 disabled:opacity-30"
                  title={`${ABILITY_LABEL_MAP[key]}豁免快捷掷骰`}
                >
                  <Dices size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 最近掷骰结果 */}
      {lastRoll && (
        <div className="rounded bg-accent/10 border border-accent/30 px-2 py-1.5 text-xs space-y-0.5">
          <div className="font-medium dark:text-text-dark light:text-text-light">
            {ABILITY_LABEL_MAP[lastRoll.abilityKey]}豁免掷骰：
            <span className="ml-1 text-accent font-bold">
              {lastRoll.total}
            </span>
            <span className="ml-1 dark:text-text-dark-muted light:text-text-light-muted">
              （d20={lastRoll.d20} {fmtBonus(lastRoll.bonus)}
              {lastRoll.mode === 'advantage' && ' · 优势'}
              {lastRoll.mode === 'disadvantage' && ' · 劣势'}）
            </span>
          </div>
          <div className="dark:text-text-dark-muted light:text-text-light-muted">{lastRoll.formula}</div>
        </div>
      )}

      {/* 伤害亲和合集 */}
      <div>
        <h5 className="text-xs font-semibold dark:text-text-dark light:text-text-light mb-1">伤害亲和（合集）</h5>
        {affinitySummary.length === 0 ? (
          <p className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted">无</p>
        ) : (
          <div className="space-y-0.5">
            {affinitySummary.map(line => (
              <p key={line} className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted">{line}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-center">
      <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">{label}</div>
      <div className="text-sm font-bold dark:text-text-dark light:text-text-light">{value}</div>
    </div>
  );
}
