// 范围施法目标步骤（select_target mode='area'）—— 弹窗内网格拾取施法点/朝向/计算方法，
// computeAoeCells 与编译器同源同参预览（几何单一事实源），切比雪夫射程门禁 + 强制施放回退。
import { useMemo, useState } from 'react';
import { Check, X, AlertTriangle, Crosshair } from 'lucide-react';
import type { Combatant } from '@/types/combat';
import type { Spell } from '@/types/spell';
import { parseSpellRange } from '@/utils/spellRange';
import { computeAoeCells, filterAoeTargets, spellAoeSpec, describeAoeSpec } from '@/data/aoeShapes';
import type { Bearing } from '@/data/battleGeometry';

const DIRECTIONS: { b: Bearing; label: string }[] = [
  { b: 'NW', label: '西北' }, { b: 'N', label: '北' }, { b: 'NE', label: '东北' },
  { b: 'W', label: '西' }, { b: 'E', label: '东' },
  { b: 'SW', label: '西南' }, { b: 'S', label: '南' }, { b: 'SE', label: '东南' },
];

interface Props {
  spell: Spell;
  caster: Combatant;
  combatants: Combatant[];
  combatantPositions?: Record<string, { col: number; row: number } | null | undefined> | null;
  /** 沙盘尺寸（GRID_PRESETS[size].cols/rows），AoE 越界裁剪与网格渲染 */
  bounds: { cols: number; rows: number };
  /** 初始即以自身为源点（自身射程的 AoE 法术：origin 恒为施法者格） */
  defaultSelfOriginated?: boolean;
  /** 确认按钮文案（默认「范围确认，开始施法流程」） */
  confirmLabel?: string;
  onConfirm: (message: string, data: Record<string, unknown>) => void;
  onForce: (message: string, data: Record<string, unknown>) => void;
}

export default function AoETargetStep({
  spell, caster, combatants, combatantPositions, bounds, defaultSelfOriginated, confirmLabel, onConfirm, onForce,
}: Props) {
  const spec = spellAoeSpec(spell);
  const range = parseSpellRange(spell.range);
  const needsDirection = spec?.shape === 'cone' || spec?.shape === 'line' || spec?.shape === 'cube';

  const casterPos = combatantPositions?.[caster.id] ?? null;
  const [selfOriginated, setSelfOriginated] = useState(defaultSelfOriginated === true);
  const [origin, setOrigin] = useState<{ col: number; row: number } | null>(null);
  const [direction, setDirection] = useState<Bearing>('same');
  const [method, setMethod] = useState<'template' | 'token'>('template');

  // 以自身为源点时施法点恒为施法者所在格（锥/线/立方排除施法者格由 computeAoeCells 内部处理）
  const effectiveOrigin = selfOriginated ? casterPos : origin;

  const preview = useMemo(() => {
    if (!spec || !effectiveOrigin) return null;
    return computeAoeCells({
      spec,
      origin: effectiveOrigin,
      direction,
      selfOriginated,
      bounds,
    }, method);
  }, [spec, effectiveOrigin, direction, selfOriginated, bounds, method]);

  // 射程门禁：施法者 → 施法点切比雪夫距离 ×5；自身施法距离为 0
  const distance = useMemo(() => {
    if (!effectiveOrigin || !casterPos) return null;
    if (selfOriginated) return 0;
    return Math.max(Math.abs(casterPos.col - effectiveOrigin.col), Math.abs(casterPos.row - effectiveOrigin.row)) * 5;
  }, [effectiveOrigin, casterPos, selfOriginated]);
  const outOfRange = distance !== null && range.feet !== null && distance > range.feet;

  // 群体锁定预览：与编译器 select_target(area) 同参（存活参战者 + 已放置）
  const locked = useMemo(() => {
    if (!preview) return [];
    return filterAoeTargets(preview, combatants
      .filter(c => !c.isDead)
      .map(c => ({ id: c.id, pos: combatantPositions?.[c.id] ?? null })));
  }, [preview, combatants, combatantPositions]);

  if (!spec) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>无法从法术《{spell.name}》描述解析范围形状，请在法术描述中写明形状与尺寸（如「半径20尺」「30尺锥状」）。</span>
      </div>
    );
  }

  const shapeLabel = describeAoeSpec(spec);
  const canConfirm = !!effectiveOrigin && !!preview && preview.cells.length > 0;

  const areaInput = effectiveOrigin
    ? { origin: effectiveOrigin, direction, selfOriginated, method, bounds }
    : null;
  const data: Record<string, unknown> = {
    areaInput,
    origin: effectiveOrigin,
    direction,
    selfOriginated,
    method,
    shape: spec.shape,
    shapeLabel,
    cellCount: preview?.cells.length ?? 0,
    areaCells: preview?.cells.map(c => `${c.col},${c.row}`) ?? [],
    lockedIds: locked.map(l => l.id),
    lockedNames: locked.map(l => combatants.find(c => c.id === l.id)?.name ?? l.id),
    distanceFeet: distance,
    rangeFeet: range.feet,
    rangeRaw: range.label,
  };

  const lockedNames = locked.map(l => combatants.find(c => c.id === l.id)?.name ?? l.id);
  const confirmMessage = `${shapeLabel}${effectiveOrigin ? ` @ (${effectiveOrigin.col},${effectiveOrigin.row})` : ''}覆盖 ${preview?.cells.length ?? 0} 格`
    + (locked.length > 0 ? `，锁定 ${locked.length} 人：${lockedNames.join('、')}` : '，范围内没有参战者');

  const detail = distance === null
    ? { pass: true, text: '施法者未放置在沙盘上，距离未知（跳过校验）' }
    : range.feet === null
    ? { pass: true, text: `施法距离 ${distance} 尺，特殊射程「${range.label}」按原文裁决` }
    : { pass: !outOfRange, text: `施法距离 ${distance} 尺 vs 射程 ${range.feet} 尺${outOfRange ? '，超出射程' : '，在射程内'}` };

  const previewCellKeys = new Set((preview?.cells ?? []).map(c => `${c.col},${c.row}`));

  return (
    <div className="space-y-3">
      {/* 形状与计算方法 */}
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="dark:text-text-dark-muted light:text-text-light-muted">范围形状</span>
          <span className="font-medium dark:text-text-dark light:text-text-light">{shapeLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="dark:text-text-dark-muted light:text-text-light-muted shrink-0">计算方法</span>
          {(['template', 'token'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`px-2 py-0.5 rounded transition-colors ${
                method === m
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'dark:text-text-dark-muted light:text-text-light-muted hover:bg-primary/5'
              }`}
            >
              {m === 'template' ? '模板法' : '标记物法'}
            </button>
          ))}
        </div>
      </div>

      {/* 施法点与朝向 */}
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted flex items-center gap-1">
            <Crosshair className="w-3.5 h-3.5" />
            点击网格拾取施法点（{bounds.cols}×{bounds.rows}）
          </span>
          <button
            onClick={() => setSelfOriginated(v => !v)}
            disabled={!casterPos}
            className={`px-2 py-0.5 rounded text-xs transition-colors disabled:opacity-40 ${
              selfOriginated
                ? 'bg-primary/15 text-primary font-medium'
                : 'dark:text-text-dark-muted light:text-text-light-muted hover:bg-primary/5'
            }`}
          >
            以自身为源点
          </button>
        </div>
        {needsDirection && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0 mr-1">朝向</span>
            {DIRECTIONS.map(d => (
              <button
                key={d.b}
                onClick={() => setDirection(d.b)}
                className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
                  direction === d.b
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'dark:text-text-dark-muted light:text-text-light-muted hover:bg-primary/5'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
        <div className="overflow-auto max-h-72 rounded border dark:border-border-dark/60 light:border-border-light/60 p-1 bg-[--cell-bg] dark:bg-black/20">
          <div
            className="inline-grid gap-px"
            style={{ gridTemplateColumns: `repeat(${bounds.cols}, 18px)` }}
          >
            {Array.from({ length: bounds.rows * bounds.cols }, (_, i) => {
              const col = i % bounds.cols;
              const row = Math.floor(i / bounds.cols);
              const key = `${col},${row}`;
              const inArea = previewCellKeys.has(key);
              const isOrigin = effectiveOrigin?.col === col && effectiveOrigin?.row === row;
              const occupant = combatants.find(
                c => !c.isDead && combatantPositions?.[c.id]?.col === col && combatantPositions?.[c.id]?.row === row
              );
              return (
                <button
                  key={key}
                  onClick={() => { if (!selfOriginated) setOrigin({ col, row }); }}
                  title={`${key}${occupant ? ` · ${occupant.name}` : ''}`}
                  className={`w-[18px] h-[18px] text-[10px] leading-none flex items-center justify-center rounded-[2px] transition-colors ${
                    isOrigin
                      ? 'bg-primary/40 ring-1 ring-primary'
                      : inArea
                        ? 'bg-primary/25'
                        : 'dark:bg-white/5 light:bg-black/5 hover:bg-primary/10'
                  } ${occupant ? 'font-bold' : ''} ${
                    occupant?.id === caster.id
                      ? 'text-amber-400'
                      : occupant
                        ? (inArea ? 'text-primary dark:text-text-dark light:text-text-light' : 'dark:text-text-dark-muted light:text-text-light-muted')
                        : ''
                  }`}
                >
                  {occupant ? occupant.name.slice(0, 1) : ''}
                </button>
              );
            })}
          </div>
        </div>
        {preview && preview.cells.length === 0 && (
          <p className="text-xs text-red-400">施法范围未覆盖任何格子（可能越界），请调整施法点或朝向。</p>
        )}
        {preview && preview.note && (
          <p className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted leading-relaxed">{preview.note}</p>
        )}
      </div>

      {/* 群体锁定预览（group/both 由编译器锁定；zone 模式仅展示格子） */}
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-3 space-y-1.5">
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          范围内参战者（{locked.length}）
        </div>
        {locked.length === 0 ? (
          <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">无（区域效果仍将正常生成）</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {lockedNames.map(n => (
              <span key={n} className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">{n}</span>
            ))}
          </div>
        )}
      </div>

      {/* 射程门禁 */}
      <div className={`rounded-lg border p-3 space-y-1.5 ${
        detail.pass
          ? 'dark:border-border-dark light:border-border-light'
          : 'border-amber-500/40 bg-amber-500/5'
      }`}>
        <div className="flex items-start gap-2 text-sm">
          {detail.pass ? (
            <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
          ) : (
            <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <span className={detail.pass ? 'dark:text-text-dark light:text-text-light' : 'text-red-400'}>
            {detail.text}
          </span>
        </div>
      </div>

      {detail.pass ? (
        <button
          onClick={() => onConfirm(confirmMessage, data)}
          disabled={!canConfirm}
          className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {confirmLabel ?? '范围确认，开始施法流程'}
        </button>
      ) : (
        <>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>施法点超出法术射程，按规则无法施放。可调整施法点、靠近后重试，或强制施放。</span>
          </div>
          <button
            onClick={() => onForce(`强制施放（超出射程：${detail.text}）`, data)}
            disabled={!canConfirm}
            className="w-full py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            强制施放（记为部分通过并继续）
          </button>
        </>
      )}
    </div>
  );
}
