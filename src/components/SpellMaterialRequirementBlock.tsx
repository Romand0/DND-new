// 角色卡内的法术材料区块 —— 展示材料需求并支持补入材料 / 卷轴
import { Check, X, Package, ScrollText } from 'lucide-react';
import type { Character } from '@/types/character';
import { characterStore } from '@/data/characterStore';
import type { Spell } from '@/types/spell';
import {
  evaluateSpellMaterials,
  buildMaterialEquipment,
  buildScrollEquipment,
  type MaterialRequirement,
} from '@/data/spellMaterials';

interface Props {
  spell: Spell;
  character: Character;
  inventory: Character['equipment'];
  onChanged: () => void;
  /** 只读视图（玩家端）：隐藏补货按钮 */
  readOnly?: boolean;
}

export default function SpellMaterialRequirementBlock({ spell, character, inventory, onChanged, readOnly = false }: Props) {
  if (!spell.components?.material) return null;
  const evaluation = evaluateSpellMaterials(spell, inventory);
  const hasAnyRequirement = evaluation.requirements.items.length > 0;

  const addMaterial = (req: MaterialRequirement) => {
    const existing = (inventory || []).find(it => it.materialKey === req.key);
    if (existing) return;
    characterStore.addEquipment(character.id, buildMaterialEquipment(spell, req));
    onChanged();
  };

  const addScroll = () => {
    const existing = (inventory || []).find(it => it.scrollSpellId === spell.id);
    if (existing) return;
    characterStore.addEquipment(character.id, buildScrollEquipment(spell));
    onChanged();
  };

  return (
    <div className="mb-2 rounded-lg border dark:border-border-dark light:border-border-light p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        {evaluation.satisfied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <X className="w-3.5 h-3.5 text-red-400" />
        )}
        <span className="font-medium dark:text-text-dark light:text-text-light">材料（M）</span>
        <span className="dark:text-text-dark-muted light:text-text-light-muted">
          {evaluation.viaScroll
            ? '对应卷轴满足'
            : evaluation.viaPouch
              ? '材料包替代'
              : evaluation.satisfied
                ? '材料齐备'
                : '材料缺失'}
        </span>
      </div>

      {hasAnyRequirement ? (
        <div className="space-y-1">
          {evaluation.statuses.map(({ requirement, status }) => (
            <div key={requirement.key} className="flex items-center gap-1.5 text-[11px]">
              <span
                className={`shrink-0 px-1 py-0.5 rounded text-[10px] ${
                  status === 'have'
                    ? 'bg-green-500/10 text-green-500'
                    : status === 'pouch'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-red-500/10 text-red-400'
                }`}
              >
                {status === 'have' ? '持有' : status === 'pouch' ? '材料包' : '缺失'}
              </span>
              <span className="dark:text-text-dark light:text-text-light">{requirement.description || requirement.name}</span>
              {requirement.costGp ? <span className="text-amber-400">≥ {requirement.costGp} gp</span> : null}
              {requirement.consumed ? <span className="text-red-400">耗材</span> : null}
              {status === 'missing' && !readOnly && (
                <button
                  onClick={() => addMaterial(requirement)}
                  className="ml-auto inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  <Package className="w-3 h-3" />
                  补入
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted">
          {spell.materialInfo || '材料成分（材料袋 / 法器可满足）'}
        </div>
      )}

      {!evaluation.satisfied && !readOnly && (
        <button
          onClick={addScroll}
          className="w-full inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] border border-dashed dark:border-border-dark light:border-border-light hover:border-primary hover:text-primary dark:text-text-dark light:text-text-light"
        >
          <ScrollText className="w-3 h-3" />
          补入《{spell.name}》卷轴
        </button>
      )}
    </div>
  );
}
