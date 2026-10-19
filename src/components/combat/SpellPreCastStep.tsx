// 前置检查步骤（cast_start）—— 成分 V/S/M + 施法时间 + 射程明细，硬门禁 + 强制施放（R3）
import { Check, X, AlertTriangle } from 'lucide-react';
import type { Combatant } from '@/types/combat';
import { isOneActionCast, isBonusActionCast } from '@/types/combat';
import type { Spell } from '@/types/spell';
import { deriveCanGesticulate } from '@/data/somaticCheck';
import { parseSpellRange } from '@/utils/spellRange';

export interface PrecastCheckItem {
  key: string;
  label: string;
  pass: boolean;
  detail: string;
}

interface Props {
  spell: Spell;
  caster: Combatant;
  canUseAction: boolean;
  canUseBonusAction: boolean;
  onConfirm: (message: string, data: Record<string, unknown>) => void;
  onForce: (message: string, data: Record<string, unknown>) => void;
}

export default function SpellPreCastStep({ spell, caster, canUseAction, canUseBonusAction, onConfirm, onForce }: Props) {
  const items: PrecastCheckItem[] = [];
  const blockingConditions: string[] = [];

  // 言语成分（V）：Combatant.canSpeak 战斗期补丁优先，未定义视为可用
  if (spell.components?.verbal) {
    const pass = caster.canSpeak !== false;
    items.push({
      key: 'V', label: '言语成分（V）', pass,
      detail: pass ? '施法者可言语' : '施法者无法说话或发声',
    });
  }

  // 姿势成分（S）：失能/昏迷/阻断状态/手动覆盖（deriveCanGesticulate）
  if (spell.components?.somatic) {
    const canGesticulate = deriveCanGesticulate(caster, []);
    if (!canGesticulate) {
      if (caster.isIncapacitated) blockingConditions.push('incapacitated');
      if (caster.isUnconscious) blockingConditions.push('unconscious');
      if (caster.canGesticulate === false) blockingConditions.push('手动覆盖');
    }
    items.push({
      key: 'S', label: '姿势成分（S）', pass: canGesticulate,
      detail: canGesticulate
        ? '施法者可做手势'
        : `手势被阻断${blockingConditions.length > 0 ? `：${blockingConditions.join('、')}` : ''}`,
    });
  }

  // 材料成分（M）：暂无运行时判定（法术材料包/法器默认已备），展示性条目
  if (spell.components?.material) {
    items.push({ key: 'M', label: '材料成分（M）', pass: true, detail: '默认已备（材料包/法器）' });
  }

  // 施法时间：1 动作 → canUseAction；1 附赠动作 → canUseBonusAction；其他（1 分钟/仪式）不做运行时校验
  const castingTimeLabel = spell.castingTime || '未标注';
  if (isOneActionCast(spell.castingTime)) {
    items.push({
      key: 'action', label: '施法时间：1 动作', pass: canUseAction,
      detail: canUseAction ? '本回合动作可用' : '本回合动作已耗尽',
    });
  } else if (isBonusActionCast(spell.castingTime)) {
    items.push({
      key: 'bonus', label: '施法时间：1 附赠动作', pass: canUseBonusAction,
      detail: canUseBonusAction ? '本回合附赠动作可用' : '本回合附赠动作已耗尽',
    });
  } else {
    items.push({ key: 'time', label: `施法时间：${castingTimeLabel}`, pass: true, detail: '非动作类，不做运行时校验' });
  }

  // 射程：仅展示要求（实际距离门禁在目标确认步骤）
  const range = parseSpellRange(spell.range);
  items.push({
    key: 'range', label: `施法距离：${range.label}`, pass: true,
    detail: range.feet !== null ? `要求 ${range.feet} 尺（下一 步按沙盘距离校验）` : '特殊射程，按原文裁决',
  });

  const failures = items.filter(i => !i.pass);
  const allPass = failures.length === 0;

  const data: Record<string, unknown> = {
    checks: items.map(i => ({ key: i.key, label: i.label, pass: i.pass, detail: i.detail })),
    blockingConditions,
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-3 space-y-2">
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">施法前置检查</div>
        {items.map(item => (
          <div key={item.key} className="flex items-start gap-2 text-sm">
            {item.pass ? (
              <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            ) : (
              <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className={`font-medium ${item.pass ? 'dark:text-text-dark light:text-text-light' : 'text-red-400'}`}>
                {item.label}
              </span>
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted ml-1.5">{item.detail}</span>
            </div>
          </div>
        ))}
      </div>

      {allPass ? (
        <button
          onClick={() => onConfirm('前置检查通过', data)}
          className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          检查通过，确认目标
        </button>
      ) : (
        <>
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-400 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {failures.length} 项检查未通过：{failures.map(f => f.label).join('、')}。按规则无法施放该法术。
            </span>
          </div>
          <button
            onClick={() => onForce(`强制施放（${failures.map(f => f.label).join('、')}未通过）`, data)}
            className="w-full py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors"
          >
            强制施放（记为部分通过并继续）
          </button>
        </>
      )}
    </div>
  );
}
