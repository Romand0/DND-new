// 从角色已选选项链（种族→亚种、背景、职业）收集应存在于角色卡上的完整特性/特质条目。
// 与 abilityBonus / proficiencyBonus 同一「读时派生」模式：选项库静态，角色字段只是引用。
// 补全语义为「每一条至少存在一份」：按 category+name 判定是否已存在（与隐藏功能的 key 同
// 口径，避免同名义条目重复渲染或隐藏状态错乱）；已存在条目一律保留用户编辑（描述、隐藏状
// 态），只追加缺失条目，因此补全操作幂等且无破坏性。
import type { CharacterOption } from '@/types/characterOption';
import type { Character } from '@/types/character';
import { optionStore } from '@/data/optionStore';

export interface OptionFeatureEntry {
  name: string;
  description: string;
  category: '种族特质' | '亚种特质' | '职业特性' | '背景特性';
  source: string;
  level?: number;
}

/** 收集角色已选选项链上的全部特性/特质条目（顺序：种族 → 亚种 → 背景 → 职业） */
export function collectOptionFeatureEntries(character: {
  race?: string;
  background?: string;
  profession?: { class?: string };
}): OptionFeatureEntry[] {
  const out: OptionFeatureEntry[] = [];
  const seen = new Set<string>();
  const push = (e: OptionFeatureEntry) => {
    const key = `${e.category}:${e.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };

  // 种族链：character.race 可能指向种族或亚种（亚种沿 parentName 补齐母种族特质）；
  // 与 handleRaceSelect / handleSubraceSelect 的写入口径一致（亚种 source 记母种族名）
  const raceName = character.race;
  if (raceName) {
    const opt = optionStore.getByName(raceName);
    if (opt) {
      const chain: CharacterOption[] = [opt];
      if (opt.category === 'subrace' && opt.parentName) {
        const parent = optionStore.getByName(opt.parentName, 'race');
        if (parent) chain.unshift(parent);
      }
      for (const o of chain) {
        const category = o.category === 'subrace' ? '亚种特质' : '种族特质';
        const source = o.category === 'subrace' ? o.parentName || o.name : o.name;
        for (const t of o.traits || []) {
          if (t.name && t.text) push({ name: t.name, description: t.text, category, source, level: t.level });
        }
      }
    }
  }

  // 背景：feature + mechanics 派生条目（与 handleBackgroundSelect 同一套派生）
  if (character.background) {
    const bg = optionStore.getByName(character.background, 'background');
    if (bg) {
      if (bg.feature?.name && bg.feature?.text) {
        push({ name: bg.feature.name, description: bg.feature.text, category: '背景特性', source: bg.name });
      }
      const m = bg.mechanics || {};
      if (m.skills) push({ name: '技能熟练项', description: m.skills, category: '背景特性', source: bg.name });
      if (m.tools) push({ name: '工具熟练项', description: m.tools, category: '背景特性', source: bg.name });
      if (m.languages) push({ name: '语言', description: m.languages, category: '背景特性', source: bg.name });
      if (m.equipment) push({ name: '装备', description: m.equipment, category: '背景特性', source: bg.name });
    }
  }

  // 职业：traits 全量写入并携带 level，显示层按角色等级过滤
  const className = character.profession?.class;
  if (className) {
    const cls = optionStore.getByName(className, 'class');
    if (cls) {
      for (const t of cls.traits || []) {
        if (t.name && t.text) push({ name: t.name, description: t.text, category: '职业特性', source: cls.name, level: t.level });
      }
    }
  }

  return out;
}

/** 缺失条目 = 期望条目中角色卡上没有同 category+name 的那些 */
export function computeMissingOptionFeatures(character: Character): OptionFeatureEntry[] {
  const existing = new Set(
    (character.features || []).map((f) => `${f.category || ''}:${f.name}`)
  );
  return collectOptionFeatureEntries(character).filter(
    (e) => !existing.has(`${e.category}:${e.name}`)
  );
}
