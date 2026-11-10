// 魔法泛条目「生成器」——城主指南里 +1/+2/+3 武器/护甲/盾牌/弹药与法术卷轴的
// 通用模板条目（如「武器，+1、+2、+3」）。它们在装备库/选择器中是生成具体魔法
// 物品（或按法术生成卷轴）的入口，需要与普通条目区分：始终置顶并加特殊样式块。
import type { EquipmentItem } from '@/types/equipment';

type GeneratorLike = Pick<EquipmentItem, 'id' | 'name' | 'magicCategory' | 'price' | 'scrollSpellId'>;

/** 泛条目生成器的种子 id（版本化种子内 id 稳定） */
const GENERATOR_IDS = new Set([
  'magic-武器',
  'magic-护甲',
  'magic-盾牌',
  'magic-弹药',
  'magic-法术卷轴',
]);

/** 泛条目名称（兜底识别：id 变更/云端覆盖行仍能命中） */
const GENERIC_NAMES = new Set(['武器', '护甲', '盾牌', '弹药', '法术卷轴']);

/**
 * 是否为魔法泛条目生成器。
 * 仅魔法物品参与；已绑定法术的具体卷轴（scrollSpellId）不算生成器。
 * 优先按 id 命中；名称+无定价兜底，避免 id 漂移后漏判。
 */
export function isMagicGenerator(item: GeneratorLike): boolean {
  if (item.magicCategory !== '魔法物品') return false;
  if (item.scrollSpellId) return false;
  if (GENERATOR_IDS.has(item.id)) return true;
  return GENERIC_NAMES.has(item.name) && (item.price?.amount ?? 0) === 0;
}

/** 生成器条目在列表中的特殊样式块（背景/描边强化，保持与主色相关的克制强调） */
export const GENERATOR_CARD_CLASS =
  'border-primary/50 ring-1 ring-primary/30 bg-primary/5 dark:bg-primary/10 hover:border-primary';
