// 试验场·状态附加面板：为任意参战者附加/解除状态库任意状态。
// 数据源 statusLibrary.list() 与 globalStatusManager，与战斗引擎同一状态机。
// damage_affinity 通用伤害修饰按 flowCompiler status 分支同构的 Effect 注入（实例级）。
import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Zap } from 'lucide-react';
import statusLibrary from '@/data/statusLibrary';
import { globalStatusManager } from '@/data/statusManager';
import { GENERIC_AFFINITY_STATUS_ID } from '@/lib/flowCompiler';
import { getCombatRoundCtx } from '@/data/combatAffinities';
import combatStore from '@/data/combatStore';
import type { Combatant } from '@/types/combat';
import type { Effect, StatusDefinition, StatusInstance } from '@/types/status';

const AFFINITY_KINDS = [
  { kind: 'resistance', label: '抗性', effectType: 'damage_resistance' as const },
  { kind: 'immunity', label: '免疫', effectType: 'damage_immunity' as const },
  { kind: 'vulnerability', label: '易伤', effectType: 'damage_vulnerability' as const },
];

const DAMAGE_TYPES = [
  { key: 'bludgeoning', label: '钝击' },
  { key: 'piercing', label: '穿刺' },
  { key: 'slashing', label: '挥砍' },
  { key: 'fire', label: '火焰' },
  { key: 'cold', label: '冷冻' },
  { key: 'lightning', label: '闪电' },
  { key: 'thunder', label: '雷鸣' },
  { key: 'acid', label: '强酸' },
  { key: 'poison', label: '毒素' },
  { key: 'necrotic', label: '死灵' },
  { key: 'radiant', label: '光耀' },
  { key: 'force', label: '力场' },
  { key: 'psychic', label: '心灵' },
];

const SOURCE_KINDS = [
  { key: '', label: '全部来源' },
  { key: 'weapon', label: '武器' },
  { key: 'spell', label: '法术' },
  { key: 'effect', label: '效果' },
];

interface Props {
  recordId: string;
  combatant: Combatant;
}

export default function StatusAttachPanel({ recordId, combatant }: Props) {
  const [tick, setTick] = useState(0);
  const [affinityKind, setAffinityKind] = useState<'resistance' | 'immunity' | 'vulnerability'>('resistance');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['fire']);
  const [sourceKind, setSourceKind] = useState('');
  const [durationRounds, setDurationRounds] = useState(0);
  const [untilNextTurn, setUntilNextTurn] = useState(false);
  const [turnCount, setTurnCount] = useState(1);
  const [error, setError] = useState('');

  // 状态实例无订阅通道：操作后手动 tick + 轮询兜底过期/倒计时刷新
  useEffect(() => {
    const timer = window.setInterval(() => setTick(t => t + 1), 3000);
    return () => window.clearInterval(timer);
  }, []);

  const activeInstances = useMemo(() => {
    void tick;
    return globalStatusManager.getActiveStatuses(combatant.id, 'combat', getCombatRoundCtx(recordId));
  }, [combatant.id, recordId, tick]);

  const isPlayback = useMemo(
    () => combatStore.get(recordId)?.mode === 'playback',
    [recordId, tick],
  );

  const allDefinitions = useMemo(() => statusLibrary.list(), []);
  const activeDefIds = useMemo(
    () => new Set(activeInstances.map(i => i.definitionId)),
    [activeInstances],
  );

  const handleAttach = (def: StatusDefinition) => {
    try {
      globalStatusManager.applyEffect(combatant.id, def.id, 'combat', recordId);
      setTick(t => t + 1);
    } catch (e) {
      setError(`附加「${def.name}」失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDetach = (instance: StatusInstance) => {
    globalStatusManager.declareEnd(instance.instanceId);
    setTick(t => t + 1);
  };

  const handleAttachAffinity = () => {
    setError('');
    if (selectedTypes.length === 0) {
      setError('请至少选择一种伤害类型');
      return;
    }
    const kindMeta = AFFINITY_KINDS.find(k => k.kind === affinityKind)!;
    const effect: Effect = {
      id: `proving.damage_affinity.${affinityKind}`,
      type: kindMeta.effectType,
      target: 'self',
      config: {
        types: [...selectedTypes],
        ...(sourceKind ? { sourceKind } : {}),
      },
      description:
        `${kindMeta.label}：${selectedTypes.map(t => DAMAGE_TYPES.find(d => d.key === t)?.label ?? t).join('、')}` +
        (sourceKind ? `（来源：${SOURCE_KINDS.find(s => s.key === sourceKind)?.label}）` : ''),
    };
    try {
      const playback = combatStore.get(recordId)?.mode === 'playback';
      const durationSpecified = durationRounds > 0 || untilNextTurn;
      globalStatusManager.applyEffect(
        combatant.id,
        GENERIC_AFFINITY_STATUS_ID,
        'combat',
        recordId,
        {
          instanceEffects: [effect],
          ...(durationRounds > 0 ? { durationRounds } : {}),
          ...(durationSpecified && playback
            ? {
                combatMode: 'playback' as const,
                startRound: getCombatRoundCtx(recordId).currentRound ?? 0,
                // 锚定目标自身：「持续到其下一回合」= 持续到该参战者下一次回合开始
                ...(untilNextTurn
                  ? { untilNextTurn: true, anchorCombatantId: combatant.id, turnCount: Math.max(1, Math.floor(turnCount) || 1) }
                  : {}),
              }
            : durationSpecified
              ? { combatMode: 'simulation' as const }
              : {}),
        },
      );
      setTick(t => t + 1);
    } catch (e) {
      setError(`附加伤害${kindMeta.label}失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remainingText = (instance: StatusInstance): string => {
    if (instance.expirePolicy === 'manual') {
      return instance.durationRounds ? `模拟模式·不限回合（配置 ${instance.durationRounds} 回合）` : '手动取消';
    }
    if (instance.expirePolicy === 'combatantTurn') {
      // 锚定参战者回合：轮到锚定者第 N 个回合时，查询层会判定过期
      const ctx = getCombatRoundCtx(recordId);
      const turnRound = ctx.turnRound ?? ctx.currentRound ?? 0;
      const n = instance.turnCount ?? 1;
      if (ctx.turnCombatantId != null && ctx.turnCombatantId === instance.anchorCombatantId && turnRound >= (instance.startRound ?? 0) + n) {
        return '本次行动后结束';
      }
      return n === 1 ? '到其下一回合' : `到其下 ${n} 个回合`;
    }
    if (instance.expirePolicy === 'rounds' && instance.expiresAtRound != null) {
      const ctx = getCombatRoundCtx(recordId);
      if (ctx.currentRound == null) return `持续 ${instance.durationRounds} 回合`;
      const left = instance.expiresAtRound - ctx.currentRound;
      return left <= 0 ? '本回合结束' : `剩 ${left} 回合`;
    }
    if (!instance.expiresAt) return '永久';
    const ms = instance.expiresAt - Date.now();
    if (ms <= 0) return '即将过期';
    if (ms < 60000) return `剩 ${Math.ceil(ms / 6000)} 回合`;
    return `剩 ${Math.ceil(ms / 60000)} 分钟`;
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
          {error}
        </div>
      )}

      {/* 当前生效清单 */}
      <div>
        <h4 className="text-xs font-semibold dark:text-text-dark light:text-text-light mb-2">
          当前生效（{activeInstances.length}）
        </h4>
        {activeInstances.length === 0 ? (
          <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">无激活状态</p>
        ) : (
          <div className="space-y-1.5">
            {activeInstances.map(instance => {
              const def = statusLibrary.get(instance.definitionId);
              const metaEffects = (instance.metadata?.effects ?? []) as Effect[];
              return (
                <div
                  key={instance.instanceId}
                  className="flex items-center justify-between text-xs rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="font-medium dark:text-text-dark light:text-text-light truncate">
                      {def?.name ?? instance.definitionId}
                    </div>
                    <div className="dark:text-text-dark-muted light:text-text-light-muted truncate">
                      {remainingText(instance)}
                      {metaEffects.map(e => e.description).filter(Boolean).join('；') && ` · ${metaEffects.map(e => e.description).filter(Boolean).join('；')}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDetach(instance)}
                    className="ml-2 shrink-0 p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                    title="解除"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 通用伤害修饰 */}
      <div className="rounded border border-dashed border-gray-300 dark:border-gray-600 p-2.5 space-y-2">
        <h4 className="text-xs font-semibold dark:text-text-dark light:text-text-light flex items-center gap-1">
          <Zap size={12} /> 伤害修饰（抗性/免疫/易伤）
        </h4>
        <div className="flex gap-1">
          {AFFINITY_KINDS.map(k => (
            <button
              key={k.kind}
              onClick={() => setAffinityKind(k.kind as 'resistance' | 'immunity' | 'vulnerability')}
              className={`flex-1 text-xs py-1 rounded ${
                affinityKind === k.kind
                  ? 'bg-accent text-white'
                  : 'bg-gray-100 dark:bg-gray-800 dark:text-text-dark-muted light:text-text-light-muted'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {DAMAGE_TYPES.map(d => (
            <button
              key={d.key}
              onClick={() =>
                setSelectedTypes(prev =>
                  prev.includes(d.key) ? prev.filter(t => t !== d.key) : [...prev, d.key],
                )
              }
              className={`text-[11px] px-1.5 py-0.5 rounded border ${
                selectedTypes.includes(d.key)
                  ? 'bg-accent/15 border-accent text-accent'
                  : 'border-gray-200 dark:border-gray-700 dark:text-text-dark-muted light:text-text-light-muted'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center text-xs">
          <select
            value={sourceKind}
            onChange={e => setSourceKind(e.target.value)}
            className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent text-xs px-1 py-1 dark:text-text-dark light:text-text-light"
          >
            {SOURCE_KINDS.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <input
            type="checkbox"
            checked={untilNextTurn}
            onChange={e => setUntilNextTurn(e.target.checked)}
            title="持续到该参战者的第 N 个回合开始（如剑刃防护「直到你的下一回合」）"
          />
          <span className="dark:text-text-dark-muted light:text-text-light-muted shrink-0">到其第</span>
          <input
            type="number"
            min={1}
            value={turnCount}
            onChange={e => setTurnCount(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
            onBlur={() => setTurnCount(Math.max(1, Math.floor(Number(turnCount)) || 1))}
            disabled={!untilNextTurn}
            className="w-12 rounded border border-gray-200 dark:border-gray-700 bg-transparent text-xs px-1 py-1 disabled:opacity-50 dark:text-text-dark light:text-text-light"
            title="1 = 下一回合，2 = 下下回合…"
          />
          <span className="dark:text-text-dark-muted light:text-text-light-muted shrink-0">回合</span>
          <input
            type="number"
            min={0}
            value={durationRounds}
            onChange={e => setDurationRounds(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
            onBlur={() => setDurationRounds(Math.max(0, Math.floor(Number(durationRounds)) || 0))}
            className="w-16 rounded border border-gray-200 dark:border-gray-700 bg-transparent text-xs px-1 py-1 dark:text-text-dark light:text-text-light"
            title="持续回合数，0 = 永久"
          />
          <span className="dark:text-text-dark-muted light:text-text-light-muted shrink-0">回合（0=永久）</span>
        </div>
        <button
          onClick={handleAttachAffinity}
          className="w-full text-xs py-1.5 rounded bg-accent text-white hover:opacity-90 flex items-center justify-center gap-1"
        >
          <Plus size={12} /> 附加伤害修饰
        </button>
      </div>

      {/* 状态库全量 */}
      <div>
        <h4 className="text-xs font-semibold dark:text-text-dark light:text-text-light mb-2">
          状态库（{allDefinitions.length}）
        </h4>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {allDefinitions.map(def => (
            <div
              key={def.id}
              className="flex items-center justify-between text-xs rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5"
            >
              <div className="min-w-0">
                <div className="font-medium dark:text-text-dark light:text-text-light truncate">
                  {def.name}
                  {activeDefIds.has(def.id) && (
                    <span className="ml-1.5 text-[10px] text-accent">已激活</span>
                  )}
                </div>
                <div className="dark:text-text-dark-muted light:text-text-light-muted truncate">
                  {def.shortDescription || def.description}
                </div>
              </div>
              <button
                onClick={() => handleAttach(def)}
                className="ml-2 shrink-0 p-1 rounded text-accent hover:bg-accent/10"
                title={activeDefIds.has(def.id) ? '重复附加将刷新（replace）' : '附加'}
              >
                <Plus size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
