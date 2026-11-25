// aoe_save 通道结算弹窗（吐息武器等）：两段式流程。
// 第一段复用 AoETargetStep（特性模式：形状规格由 parseAoeSpec 从描述解析）拾取方向/源点；
// 第二段逐目标豁免骰（默认自动骰、可改）+ 伤害类型切换（龙裔血统决定）+ 伤害骰预览，
// 确认时经 applyAoeSave 走抗性管线，HP 落地与资源扣减由宿主在 onResolve 处理。
import { useMemo, useState } from 'react';
import { X, Dices, RotateCcw } from 'lucide-react';
import type { Combatant } from '@/types/combat';
import type { Bearing } from '@/data/battleGeometry';
import AoETargetStep from './AoETargetStep';
import { parseAoeSpec } from '@/data/aoeShapes';
import { planAoeSave, applyAoeSave, saveBonusFor, rollAoeDamage, type AoeSaveTargetPlan } from '@/data/aoeSaveEngine';
import { resolveFeatureCapability, type FeatureAoeSaveSpec, type FeatureCapability } from '@/data/featureCapabilities';
import { characterStore } from '@/data/characterStore';
import { rollDice } from '@/data/diceService';
import { ABILITY_LABEL_MAP } from '@/lib/saveBonus';
import { DAMAGE_TYPE_OPTIONS } from '@/types/damage';

interface Stage2Result {
  combatantId: string;
  name: string;
  dc: number;
  saveBonus: number;
  saveFormula: string;
  roll: number;
  total: number;
  success: boolean;
  damage: number;
  damageType: string;
  note?: string;
}

interface Props {
  caster: Combatant;
  featureName: string;
  /** 容器子形态能力覆盖（缺省按 featureName 注册表解析） */
  capability?: FeatureCapability;
  /** 形状描述覆盖（怪物吐息等无角色卡特性文本时，直接传模板 shape 文本） */
  descriptionOverride?: string;
  combatants: Combatant[];
  combatantPositions?: Record<string, { col: number; row: number } | null | undefined> | null;
  bounds: { cols: number; rows: number };
  onResolve: (payload: {
    direction: Bearing;
    origin: { col: number; row: number };
    method: 'template' | 'token';
    damageType: string;
    damageAmount: number;
    results: Stage2Result[];
    message: string;
  }) => void;
  onClose: () => void;
}

export default function FeatureAoeSaveModal({ caster, featureName, capability: capabilityProp, descriptionOverride, combatants, combatantPositions, bounds, onResolve, onClose }: Props) {
  const capability = capabilityProp ?? resolveFeatureCapability(featureName);
  const spec: FeatureAoeSaveSpec | undefined = capability.aoeSave;
  // 形状规格：从角色卡特性描述解析（「15尺锥状」等），AoETargetStep 特性模式直传
  const description = useMemo(() => {
    if (descriptionOverride) return descriptionOverride;
    const char = caster.characterId ? characterStore.get(caster.characterId) : null;
    return char?.features?.find(f => f.name === featureName)?.description ?? '';
  }, [caster.characterId, featureName, descriptionOverride]);
  const aoeSpec = useMemo(() => parseAoeSpec(description), [description]);

  const [stage, setStage] = useState<'pick' | 'settle'>('pick');
  const [pick, setPick] = useState<{ origin: { col: number; row: number }; direction: Bearing; method: 'template' | 'token'; shapeLabel: string } | null>(null);
  const [damageType, setDamageType] = useState(spec?.damage.damageType ?? '火焰');
  // 线下骰口径：骰值默认空（0 = 未填），由 DM 手填或点掷骰按钮；确认时校验，不预填暗骰值
  const [damageAmount, setDamageAmount] = useState<number>(0);
  const [rolls, setRolls] = useState<Record<string, number>>({});
  const [plans, setPlans] = useState<AoeSaveTargetPlan[]>([]);

  if (!spec || !aoeSpec) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
        <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">{featureName}</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-5 h-5" /></button>
          </div>
          <p className="text-sm text-amber-400">
            {capability.hint}
            <br />无法从特性描述解析范围形状：请在描述中写明形状与尺寸（如「15尺锥状」「30尺线状」）。
          </p>
        </div>
      </div>
    );
  }

  const dc = spec.dc(caster);
  const abilityLabel = ABILITY_LABEL_MAP[spec.saveAbility];

  // 第二段进入：按拾取结果做几何规划（planAoeSave 引擎）；骰值由 DM 在结算段手填/掷骰，不预填
  const enterSettle = (data: Record<string, unknown>) => {
    const origin = data.origin as { col: number; row: number };
    const direction = (data.direction as Bearing) ?? 'E';
    const method = (data.method as 'template' | 'token') ?? 'template';
    const candidates = combatants
      .filter(c => !c.isDead && combatantPositions?.[c.id])
      .map(c => ({ combatant: c, pos: combatantPositions![c.id]! }));
    const plan = planAoeSave(caster, description, dc, spec.saveAbility, candidates, { origin, direction, method, bounds });
    setRolls({});
    setPlans(plan.targets);
    setPick({ origin, direction, method, shapeLabel: plan.shapeLabel || (data.shapeLabel as string) });
    setStage('settle');
  };

  const buildResults = (): Stage2Result[] => {
    const entries = plans.map(t => {
      const combatant = combatants.find(c => c.id === t.combatantId)!;
      const { bonus } = saveBonusFor(combatant, spec.saveAbility);
      return { combatant, roll: rolls[t.combatantId] ?? 0, saveBonus: bonus, dc: t.dc };
    });
    return applyAoeSave(entries, damageAmount, damageType) as Stage2Result[];
  };

  const confirm = () => {
    if (!pick) return;
    // 线下骰口径：伤害骰与逐目标豁免骰必须已填（0/空 = 未填），阻断确认避免暗骰默认路径
    if (damageAmount <= 0) {
      alert(`请先填入或掷 ${spec.damage.dice} 伤害骰值`);
      return;
    }
    const unfilled = plans.filter(t => !rolls[t.combatantId]);
    if (unfilled.length > 0) {
      alert(`以下目标豁免骰未填：${unfilled.map(t => t.name).join('、')}`);
      return;
    }
    const results = buildResults();
    // message 落先攻表/事件流（logRichText 标记语言）：数值【】、豁免通过/失败关键字
    const hitText = results.length === 0
      ? '范围内没有目标'
      : results.map(r => `${r.name}（豁免 ${r.roll}${r.saveBonus >= 0 ? '+' : ''}${r.saveBonus}=${r.total} vs DC${r.dc} ${r.success ? '豁免通过' : '失败'}${r.damage > 0 ? `，【${r.damage}】点${r.damageType}` : '，免疫'}）`).join('、');
    const message = `${featureName}：${pick.shapeLabel} @ (${pick.origin.col},${pick.origin.row})，${damageType}【${damageAmount}】点；${hitText}`;
    onResolve({
      direction: pick.direction,
      origin: pick.origin,
      method: pick.method,
      damageType,
      damageAmount,
      results,
      message,
    });
  };

  const previewResults = stage === 'settle' ? buildResults() : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">{featureName}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        {stage === 'pick' && (
          <AoETargetStep
            aoeSpec={aoeSpec}
            rangeFeet={null}
            lockSelfOriginated
            caster={caster}
            combatants={combatants}
            combatantPositions={combatantPositions}
            bounds={bounds}
            confirmLabel={`确认范围，进入豁免结算（DC${dc} ${abilityLabel}）`}
            onConfirm={(_msg, data) => enterSettle(data)}
            onForce={(_msg, data) => enterSettle(data)}
          />
        )}

        {stage === 'settle' && pick && (
          <div className="space-y-3">
            <div className="rounded-lg border dark:border-border-dark light:border-border-light p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="dark:text-text-dark-muted light:text-text-light-muted">范围</span>
                <span className="font-medium dark:text-text-dark light:text-text-light">{pick.shapeLabel} @ ({pick.origin.col},{pick.origin.row})</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="dark:text-text-dark-muted light:text-text-light-muted">豁免</span>
                <span className="font-medium dark:text-text-dark light:text-text-light">DC{dc} · {abilityLabel}{spec.halfOnSave === false ? '' : ' · 成功减半'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="dark:text-text-dark-muted light:text-text-light-muted shrink-0">伤害类型</span>
                <select
                  value={damageType}
                  onChange={e => setDamageType(e.target.value)}
                  className="px-2 py-1 rounded border text-xs dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
                >
                  {DAMAGE_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <span className="dark:text-text-dark-muted light:text-text-light-muted shrink-0 ml-1">伤害</span>
                <input
                  type="number"
                  min={0}
                  value={damageAmount}
                  onChange={e => setDamageAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-16 px-1.5 py-1 rounded border text-xs font-mono dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
                />
                <button
                  onClick={() => setDamageAmount(rollAoeDamage(spec.damage.dice) ?? damageAmount)}
                  className="p-1 rounded hover:bg-primary/10 text-primary"
                  title={`重掷 ${spec.damage.dice}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <span className="dark:text-text-dark-muted light:text-text-light-muted">（{spec.damage.dice}）</span>
              </div>
            </div>

            <div className="space-y-1.5">
              {plans.length === 0 && (
                <div className="text-xs opacity-60 text-center py-4">范围内没有目标</div>
              )}
              {plans.map(t => {
                const r = previewResults.find(x => x.combatantId === t.combatantId);
                return (
                  <div key={t.combatantId} className="rounded-lg border dark:border-border-dark light:border-border-light px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium dark:text-text-dark light:text-text-light">{t.name}</span>
                      {r && (
                        <span className={r.success ? 'text-emerald-500' : 'text-red-400'}>
                          豁免{r.success ? '成功' : '失败'}{r.damage > 0 ? ` · ${r.damage} 点${r.damageType}` : ' · 免疫'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      <span className="font-mono">d20 {t.saveFormula}</span>
                      <button
                        onClick={() => setRolls(prev => ({ ...prev, [t.combatantId]: rollDice({ sides: 20, count: 1, mode: 'sum' }).total }))}
                        className="p-0.5 rounded hover:bg-primary/10 text-primary"
                        title="自动掷 d20"
                      >
                        <Dices className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={rolls[t.combatantId] ?? ''}
                        onChange={e => setRolls(prev => ({ ...prev, [t.combatantId]: Math.min(20, Math.max(1, Number(e.target.value) || 1)) }))}
                        className="w-12 px-1 py-0.5 rounded border text-xs font-mono dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
                      />
                      {r && <span className="font-mono">= {r.total} vs DC{r.dc}</span>}
                    </div>
                    {r?.note && <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">{r.note}</div>}
                  </div>
                );
              })}
            </div>

            <button
              onClick={confirm}
              className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
            >
              确认结算（HP 与资源由确认时落库）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
