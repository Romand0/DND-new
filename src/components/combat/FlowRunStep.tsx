// 按流程施放 —— 战斗施法弹窗的流程执行步骤
// 组装参战者身份映射的 FlowExecutionContext 调用 flowCompiler 执行绑定流程，
// 逐节点渲染执行日志（豁免判定/分档取值/骰值/HP 变化），确认后把逐目标 HP 结果交宿主回写。
// 编译器纯计算不落库：HP 变更只在确认时经 CombatSession 的参战者路径应用。
// 骰源钩子：默认手动模式（现场投骰后输入，编译器在每个检定/效果骰前暂停收数），
// 输入框旁挂自动掷按钮；关闭手动开关则全自动（旧行为）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Play, Check, AlertTriangle, Workflow, Dices } from 'lucide-react';
import { flowCompiler } from '@/lib/flowCompiler';
import type { FlowDefinition, FlowExecutionContext, FlowLogEntry, FlowDiceRequest } from '@/types/flow';
import type { Combatant } from '@/types/combat';
import type { Spell } from '@/types/spell';

/** 单目标结算结果（回传宿主回写参战者 HP） */
export interface FlowCastTargetResult {
  combatantId: string;
  name: string;
  effectType: 'damage' | 'healing';
  effectValue: number;
  newHp: number;
}

/** 流程施放完成回传（契约：CombatSession.onFlowResolved 消费） */
export interface FlowCastPayload {
  spellName: string;
  castingTime?: string;
  /** 主目标受影响（豁免失败/被命中）；豁免成功或无效果节点时 false */
  success: boolean;
  effectType: 'damage' | 'heal';
  /** 主目标数值（无效果时 0） */
  amount: number;
  targetResults: FlowCastTargetResult[];
  /** 先攻表格摘要文本 */
  summary: string;
  /** 专注类法术标记（成功施展时宿主声明专注状态） */
  concentration?: boolean;
}

interface Props {
  flow: FlowDefinition;
  spell: Spell;
  caster: Combatant;
  target: Combatant;
  allCombatants: Combatant[];
  combatantPositions?: Record<string, { col: number; row: number } | null | undefined> | null;
  onBack: () => void;
  onApplied: (payload: FlowCastPayload) => void;
}

/** 日志状态 → 展示色 */
const STATUS_STYLES: Record<FlowLogEntry['status'], string> = {
  success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  failure: 'text-red-400 bg-red-500/10 border-red-500/30',
  partial: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  skipped: 'text-text-dark-muted light:text-text-light-muted bg-black/5 dark:bg-white/5 border-transparent',
};

export default function FlowRunStep({
  flow, spell, caster, target, allCombatants, combatantPositions, onBack, onApplied,
}: Props) {
  const [log, setLog] = useState<FlowLogEntry[]>([]);
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 骰源：默认手动（现场投骰后输入）；关闭则全自动。ref 供 executeFlow 闭包读取最新值
  const [manualDice, setManualDice] = useState(true);
  const manualDiceRef = useRef(manualDice);
  useEffect(() => { manualDiceRef.current = manualDice; }, [manualDice]);

  // 悬停中的骰值请求：编译器暂停等输入，Promise resolve 后继续执行
  const [pendingReq, setPendingReq] = useState<FlowDiceRequest | null>(null);
  const pendingResolveRef = useRef<((v: number | number[] | null) => void) | null>(null);
  // 手动输入态（请求切换时重置）
  const [d20Input, setD20Input] = useState('');
  const [diceInputs, setDiceInputs] = useState<string[]>([]);
  useEffect(() => {
    setD20Input('');
    setDiceInputs(pendingReq?.count ? Array.from({ length: pendingReq.count }, () => '') : []);
  }, [pendingReq]);

  // 节点 ID → 标签（日志行标题）
  const nodeLabel = useMemo(() => {
    const m = new Map<string, string>();
    flow.nodes.forEach(n => m.set(n.id, n.label || n.id));
    return m;
  }, [flow]);

  // 主效果节点输出（apply_effect / scaled_effect，取最后执行的）
  const effectOutput = useMemo(() => {
    for (let i = log.length - 1; i >= 0; i--) {
      const t = log[i].nodeType;
      if (t === 'apply_effect' || t === 'scaled_effect') return log[i].data as Record<string, any> | undefined;
    }
    return undefined;
  }, [log]);

  // 主豁免节点（success 语义：主目标豁免失败 = 法术生效）
  const saveOutput = useMemo(() => {
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].nodeType === 'saving_throw') return log[i].data as Record<string, any> | undefined;
    }
    return undefined;
  }, [log]);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setPendingReq(null);
    pendingResolveRef.current = null;
    try {
      const context: FlowExecutionContext = {
        casterId: caster.id,
        spellId: spell.id,
        targets: [target.id],
        results: new Map(),
        stateSnapshot: {},
        log: [],
        positions: combatantPositions,
        // 参战者身份映射：编译器按参战者解析豁免/AC/HP（NPC 免角色卡）
        combatants: Object.fromEntries(allCombatants.map(c => [c.id, c])),
      };
      // 骰源：手动模式下每个检定/效果骰暂停等输入；自动模式直接回落编译器随机
      await flowCompiler.executeFlow(flow, context, async (req) => {
        if (!manualDiceRef.current) return null;
        setLog([...context.log]);
        return new Promise<number | number[] | null>(resolve => {
          pendingResolveRef.current = resolve;
          setPendingReq(req);
        });
      });
      setPendingReq(null);
      pendingResolveRef.current = null;
      setLog([...context.log]);
      setRan(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  // ── 手动骰收数 ──
  const ABILITY_LABELS: Record<string, string> = {
    strength: '力量', dexterity: '敏捷', constitution: '体质', intelligence: '智力', wisdom: '感知', charisma: '魅力',
  };

  const resolvePending = (v: number | number[] | null) => {
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    setPendingReq(null);
    resolve?.(v);
  };

  const d20Valid = Number.isFinite(parseInt(d20Input, 10)) && parseInt(d20Input, 10) >= 1 && parseInt(d20Input, 10) <= 20;
  const diceValid = diceInputs.length > 0 && diceInputs.every(s => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 1 && n <= (pendingReq?.sides ?? 0);
  });

  const confirmD20 = () => { if (d20Valid) resolvePending(parseInt(d20Input, 10)); };
  const confirmDice = () => { if (diceValid) resolvePending(diceInputs.map(s => parseInt(s, 10))); };

  const pendingTitle = (() => {
    if (!pendingReq) return '';
    switch (pendingReq.purpose) {
      case 'save':
        return `${pendingReq.targetName ?? '目标'} ${ABILITY_LABELS[pendingReq.ability ?? ''] ?? pendingReq.ability ?? ''}豁免${pendingReq.dc != null ? ` vs DC ${pendingReq.dc}` : ''}`;
      case 'attack':
        return `法术攻击${pendingReq.targetName ? ` → ${pendingReq.targetName}` : ''}${pendingReq.ac != null ? ` vs AC ${pendingReq.ac}` : ''}`;
      case 'concentration':
        return `专注检定${pendingReq.dc != null ? ` vs DC ${pendingReq.dc}` : ''}`;
      case 'effect':
        return `效果骰 ${pendingReq.expr ?? ''}（${pendingReq.count ?? 0} 颗 d${pendingReq.sides ?? '?'}）`;
      default:
        return '';
    }
  })();

  const inputCls = 'w-20 rounded-lg px-2 py-1.5 text-sm text-center dark:bg-bg-dark light:bg-bg-light-2 dark:border-border-dark light:border-border-light border dark:text-text-dark light:text-text-light';

  const handleApply = () => {
    const effectResults: any[] = Array.isArray(effectOutput?.results) ? effectOutput.results : [];
    const targetResults: FlowCastTargetResult[] = effectResults
      .filter(r => !r.error && r.effectApplied)
      .map(r => ({
        combatantId: r.targetId,
        name: r.targetName,
        effectType: r.effectType as 'damage' | 'healing',
        effectValue: r.effectValue as number,
        newHp: r.newHp as number,
      }));

    const mainEffect = effectResults.find(r => r.targetId === target.id) ?? effectResults[0];
    const mainSave = Array.isArray(saveOutput?.results)
      ? saveOutput.results.find((r: any) => r.targetId === target.id)
      : undefined;
    const success = saveOutput ? (mainSave ? !mainSave.success : true) : !!mainEffect?.effectApplied;
    const effectType = effectOutput?.effectType === 'healing' ? 'heal' as const : 'damage' as const;

    // 摘要（先攻表格单元格宽度有限，保持一行紧凑；《》【】为渲染器标记：法术名/数值高亮）
    const parts: string[] = [];
    if (mainSave) {
      parts.push(mainSave.success ? '豁免通过' : '豁免失败');
    }
    if (mainEffect && !mainEffect.error) {
      parts.push(`【${mainEffect.effectValue}】${effectType === 'damage' ? '伤害' : '生命'}，HP【${mainEffect.oldHp}→${mainEffect.newHp}】`);
    } else if (mainSave?.success) {
      parts.push('无效');
    }
    const summary = `《${spell.name}》→ ${target.name}：${parts.join('，')}`;

    onApplied({
      spellName: spell.name,
      castingTime: spell.castingTime,
      success,
      effectType,
      amount: success ? (mainEffect?.effectValue ?? 0) : 0,
      targetResults,
      summary,
      concentration: spell.concentration === true,
    });
  };

  return (
    <div className="space-y-3">
      {/* 流程卡片头 */}
      <div className="flex items-center gap-2 rounded-lg p-2.5 border dark:bg-bg-dark light:bg-bg-light-2 dark:border-border-dark/50 light:border-border-light/50">
        <Workflow className="w-4 h-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{flow.name}</div>
          <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted">
            {flow.nodes.length} 节点 · {flow.edges.length} 边{flow.publishedVersion ? ` · v${flow.publishedVersion}` : ''}
          </div>
        </div>
      </div>

      {/* 手动掷骰开关（默认开：现场投骰后输入；关 = 全自动随机） */}
      <label className="flex items-center gap-1.5 text-xs dark:text-text-dark-muted light:text-text-light-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={manualDice}
          onChange={e => setManualDice(e.target.checked)}
          disabled={running}
        />
        手动掷骰（现场投骰后输入，每个检定/效果骰暂停确认）
      </label>

      {/* 执行 / 重跑 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleRun}
          disabled={running}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          {running ? '执行中…' : ran ? '重新执行' : '执行流程'}
        </button>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm border dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:bg-black/5 dark:hover:bg-white/5"
        >
          <ChevronLeft className="w-4 h-4" />
          返回
        </button>
      </div>

      {/* 悬停骰值请求：现场投骰后输入，或点自动掷交给编译器随机 */}
      {pendingReq && (
        <div className="rounded-lg p-3 border border-primary/40 bg-primary/5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium dark:text-text-dark light:text-text-light">
            <Dices className="w-4 h-4 text-primary shrink-0" />
            <span>{pendingTitle}</span>
            <span className="dark:text-text-dark-muted light:text-text-light-muted font-normal">—— 现场投骰后输入</span>
          </div>
          {pendingReq.purpose === 'effect' ? (
            <div className="flex items-center gap-2 flex-wrap">
              {diceInputs.map((v, i) => (
                <input
                  key={i}
                  type="number"
                  min={1}
                  max={pendingReq.sides}
                  value={v}
                  onChange={e => setDiceInputs(arr => arr.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`d${pendingReq.sides}`}
                  autoFocus={i === 0}
                  className={inputCls}
                />
              ))}
              <button
                onClick={confirmDice}
                disabled={!diceValid}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
              >
                确认
              </button>
              <button
                onClick={() => resolvePending(null)}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Dices className="w-3.5 h-3.5" />
                自动掷
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={20}
                value={d20Input}
                onChange={e => setD20Input(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmD20(); }}
                placeholder="d20"
                autoFocus
                className={inputCls}
              />
              <button
                onClick={confirmD20}
                disabled={!d20Valid}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
              >
                确认
              </button>
              <button
                onClick={() => resolvePending(null)}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Dices className="w-3.5 h-3.5" />
                自动掷
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs text-red-400 bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* 执行日志（逐节点） */}
      {ran && log.length === 0 && !error && (
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted p-2.5 rounded-lg border border-dashed dark:border-border-dark light:border-border-light">
          流程无可执行节点（检查 cast_start 入口与边连接）
        </div>
      )}
      {log.map((entry, i) => {
        const data = entry.data as Record<string, any> | undefined;
        return (
          <div key={`${entry.nodeId}-${i}`} className={`rounded-lg p-2.5 border text-xs space-y-1.5 ${STATUS_STYLES[entry.status]}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{nodeLabel.get(entry.nodeId) ?? entry.nodeId}</span>
              <span className="text-[10px] opacity-70">{entry.status}</span>
            </div>
            {entry.message && <div className="opacity-80">{entry.message}</div>}
            {/* 豁免逐目标明细 */}
            {Array.isArray(data?.results) && data.results.some((r: any) => r.dc !== undefined) && (
              <div className="space-y-1 opacity-90">
                {data.results.map((r: any, j: number) => (
                  <div key={j} className="flex items-center justify-between gap-2">
                    <span>{r.error ? `${r.targetId}: ${r.error}` : `${r.targetName} d20 ${r.d20Roll}+${r.saveBonus}=${r.total} vs DC ${r.dc}`}</span>
                    <span className="font-medium">{r.success ? '通过' : '失败'}</span>
                  </div>
                ))}
              </div>
            )}
            {/* 分级取值明细 */}
            {data?.scaleSource && (
              <div className="opacity-90">
                缩放：{data.scaleSource} → 档位 {data.matchedTier?.value}
                {(data.dice?.values?.length ?? 0) > 0 && ` · 骰值 [${data.dice.values.join(', ')}]${data.dice.bonus ? `+${data.dice.bonus}` : ''}${data.dice.manual ? '（手动）' : ''}`}
              </div>
            )}
            {/* 骰值明细（apply_effect 无缩放时） */}
            {!data?.scaleSource && (data?.dice?.values?.length ?? 0) > 0 && (
              <div className="opacity-90">骰值 [{data.dice.values.join(', ')}]{data.dice.bonus ? `+${data.dice.bonus}` : ''}{data.dice.manual ? '（手动）' : ''}</div>
            )}
            {/* HP 变更明细 */}
            {Array.isArray(data?.results) && data.results.some((r: any) => r.newHp !== undefined) && (
              <div className="space-y-1 opacity-90">
                {data.results.filter((r: any) => !r.error).map((r: any, j: number) => (
                  <div key={j} className="flex items-center justify-between gap-2">
                    <span>{r.targetName}</span>
                    <span className="font-medium">{r.oldHp} → {r.newHp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 确认应用：HP 回写交宿主 */}
      <button
        onClick={handleApply}
        disabled={!ran || running}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        <Check className="w-4 h-4" />
        确认应用{effectOutput
          ? `（${effectOutput.effectType === 'healing' ? '治疗' : '伤害'} ${effectOutput.matchedTier?.value ?? effectOutput.value ?? ''}）`
          : '（无效果节点，仅记录）'}
      </button>
    </div>
  );
}
