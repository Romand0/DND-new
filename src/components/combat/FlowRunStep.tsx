// 按流程施放 —— 战斗施法弹窗的流程执行步骤
// 组装参战者身份映射的 FlowExecutionContext 调用 flowCompiler 执行绑定流程，
// 逐节点渲染执行日志（豁免判定/分档取值/骰值/HP 变化），确认后把逐目标 HP 结果交宿主回写。
// 编译器纯计算不落库：HP 变更只在确认时经 CombatSession 的参战者路径应用。
import { useMemo, useState } from 'react';
import { ChevronLeft, Play, Check, AlertTriangle, Workflow } from 'lucide-react';
import { flowCompiler } from '@/lib/flowCompiler';
import type { FlowDefinition, FlowExecutionContext, FlowLogEntry } from '@/types/flow';
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
      await flowCompiler.executeFlow(flow, context);
      setLog([...context.log]);
      setRan(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

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

    // 摘要：豁免行 + 效果行（先攻表格单元格宽度有限，保持一行紧凑）
    const parts: string[] = [];
    if (mainSave) {
      parts.push(`${mainSave.targetName} ${mainSave.ability === 'wisdom' ? '感知' : mainSave.ability === 'dexterity' ? '敏捷' : mainSave.ability === 'strength' ? '力量' : mainSave.ability === 'constitution' ? '体质' : mainSave.ability === 'intelligence' ? '智力' : '魅力'}豁免${mainSave.success ? '成功' : '失败'}（${mainSave.d20Roll}+${mainSave.saveBonus} vs DC ${mainSave.dc}）`);
    }
    if (mainEffect && !mainEffect.error) {
      parts.push(`${mainEffect.targetName}${effectType === 'damage' ? `受到${mainEffect.effectValue}点伤害` : `恢复${mainEffect.effectValue}点生命值`}（HP ${mainEffect.oldHp}→${mainEffect.newHp}）`);
    } else if (saveOutput && mainSave?.success) {
      parts.push('豁免通过，法术无效');
    }
    const summary = `${caster.name} 以流程施放 ${spell.name}：${parts.join('，')}`;

    onApplied({
      spellName: spell.name,
      castingTime: spell.castingTime,
      success,
      effectType,
      amount: success ? (mainEffect?.effectValue ?? 0) : 0,
      targetResults,
      summary,
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
                {(data.dice?.values?.length ?? 0) > 0 && ` · 骰值 [${data.dice.values.join(', ')}]${data.dice.bonus ? `+${data.dice.bonus}` : ''}`}
              </div>
            )}
            {/* 骰值明细（apply_effect 无缩放时） */}
            {!data?.scaleSource && (data?.dice?.values?.length ?? 0) > 0 && (
              <div className="opacity-90">骰值 [{data.dice.values.join(', ')}]{data.dice.bonus ? `+${data.dice.bonus}` : ''}</div>
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
