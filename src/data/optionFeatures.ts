// 从角色已选选项链（种族→亚种、背景、职业）收集应存在于角色卡上的完整特性/特质条目。
// 与 abilityBonus / proficiencyBonus 同一「读时派生」模式：选项库静态，角色字段只是引用。
// 补全语义为「每一条至少存在一份」：按 category+name 判定是否已存在（与隐藏功能的 key 同
// 口径，避免同名义条目重复渲染或隐藏状态错乱）；已存在条目一律保留用户编辑（描述、隐藏状
// 态），只追加缺失条目，因此补全操作幂等且无破坏性。
import type { CharacterOption } from '@/types/characterOption';
import type { Character, Feature, FeatureReaction, FeatureRole, FeatureActivation, FeatureResourceKind, FeaturePoolFormula } from '@/types/character';
import { optionStore } from '@/data/optionStore';
import { getClassProficiencyInfo } from '@/data/classProficiencies';
import { getSubclassDisplayName } from '@/data/subclasses';

export interface OptionFeatureEntry {
  name: string;
  description: string;
  category: '种族特质' | '亚种特质' | '职业特性' | '背景特性';
  source: string;
  level?: number;
  /** 作用方式分类（CharacterDetail 四类页）；缺省走 deriveFeatureRole 关键词兜底 */
  role?: FeatureRole;
  system?: string;
  systemKind?: 'container' | 'member';
  /** 反应触发声明（透传到角色卡 Feature.reaction） */
  reaction?: FeatureReaction;
  /** 施法形态 / 资源模型（主动技能；种子由 scripts/annotate-feature-resources.mjs 标注） */
  activation?: FeatureActivation;
  resource?: FeatureResourceKind;
  poolFormula?: FeaturePoolFormula;
  pool?: string;
  cost?: number;
}

/**
 * 职业熟练项块条目（护甲/武器/工具/技能任选）。
 * 种子数据从未包含该块（提取脚本丢失，见 classProficiencies.ts 头注），此处从手录表派生，
 * 命名与背景派生条目同风格（技能熟练项/工具熟练项…，挂在职业特性分类下）。
 * 熟练项语义上属于属性调整层（融入数值），统一显式标 stat。
 */
export function collectClassProficiencyEntries(className: string): OptionFeatureEntry[] {
  const info = getClassProficiencyInfo(className);
  if (!info) return [];
  const out: OptionFeatureEntry[] = [];
  if (info.armor) out.push({ name: '护甲熟练项', description: info.armor, category: '职业特性', source: className, role: 'stat' });
  if (info.weapons) out.push({ name: '武器熟练项', description: info.weapons, category: '职业特性', source: className, role: 'stat' });
  if (info.tools) out.push({ name: '工具熟练项', description: info.tools, category: '职业特性', source: className, role: 'stat' });
  if (info.skills) out.push({ name: '技能熟练项', description: info.skills, category: '职业特性', source: className, role: 'stat' });
  return out;
}

/** 收集角色已选选项链上的全部特性/特质条目（顺序：种族 → 亚种 → 背景 → 职业 → 子职业） */
export function collectOptionFeatureEntries(character: {
  race?: string;
  background?: string;
  profession?: { class?: string; subclass?: string };
}): OptionFeatureEntry[] {
  const out: OptionFeatureEntry[] = [];
  const seen = new Set<string>();
  // 种子/云端行的特质文本可能携带上一句遗留的句末标点（早期快照导入的种族特质「。你的魅力加2」），
  // 种子落盘前已剥（build-seed cleanTraitTexts），这里对云端覆盖行/旧缓存兜底再剥一次
  const cleanText = (s: string) => s.replace(/^[。、：；\s]+/, '') || s;
  const push = (e: OptionFeatureEntry) => {
    const key = `${e.category}:${e.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...e, description: cleanText(e.description) });
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
          if (t.name && t.text) push({ name: t.name, description: t.text, category, source, level: t.level, role: t.role, system: t.system, systemKind: t.systemKind, reaction: t.reaction, activation: t.activation, resource: t.resource, poolFormula: t.poolFormula, pool: t.pool, cost: t.cost });
        }
      }
    }
  }

  // 背景：feature + mechanics 派生条目（与 handleBackgroundSelect 同一套派生）
  if (character.background) {
    const bg = optionStore.getByName(character.background, 'background');
    if (bg) {
      if (bg.feature?.name && bg.feature?.text) {
        push({ name: bg.feature.name, description: bg.feature.text, category: '背景特性', source: bg.name, role: bg.feature.role, reaction: bg.feature.reaction });
      }
      const m = bg.mechanics || {};
      // mechanics 派生条目是纯数值/装备块，语义上属于属性调整层，统一显式标 stat
      if (m.skills) push({ name: '技能熟练项', description: m.skills, category: '背景特性', source: bg.name, role: 'stat' });
      if (m.tools) push({ name: '工具熟练项', description: m.tools, category: '背景特性', source: bg.name, role: 'stat' });
      // 语言非典型熟练项且不参与战斗场景，按 DM 裁定一律归人物设定
      if (m.languages) push({ name: '语言', description: m.languages, category: '背景特性', source: bg.name, role: 'profile' });
      if (m.equipment) push({ name: '装备', description: m.equipment, category: '背景特性', source: bg.name, role: 'stat' });
    }
  }

  // 职业：traits 全量写入并携带 level，显示层按角色等级过滤；
  // 熟练项块（护甲/武器/工具/技能任选）种子缺失，从手录表补齐
  const className = character.profession?.class;
  if (className) {
    for (const e of collectClassProficiencyEntries(className)) push(e);
    const cls = optionStore.getByName(className, 'class');
    if (cls) {
      for (const t of cls.traits || []) {
        if (t.name && t.text) push({ name: t.name, description: t.text, category: '职业特性', source: cls.name, level: t.level, role: t.role, system: t.system, systemKind: t.systemKind, reaction: t.reaction, activation: t.activation, resource: t.resource, poolFormula: t.poolFormula, pool: t.pool, cost: t.cost });
      }
    }
  }

  // 子职业：沿 profession.subclass 补齐（种子 subclasses.features 原本漏在收集链外）。
  // profession.subclass 存手录表 id（如 arcane_trickster），种子子职业按中文名索引——
  // 先经手录表翻成 displayName 再查选项库；查不到时按原值兜底（兼容直接存名称的数据）
  const subclassName = character.profession?.subclass;
  if (subclassName) {
    const displayName = getSubclassDisplayName(character as Character);
    const sub = optionStore.getByName(displayName || subclassName, 'subclass') ?? optionStore.getByName(subclassName, 'subclass');
    if (sub) {
      for (const t of sub.traits || []) {
        if (t.name && t.text) push({ name: t.name, description: t.text, category: '职业特性', source: sub.name, level: t.level, role: t.role, system: t.system, systemKind: t.systemKind, reaction: t.reaction, activation: t.activation, resource: t.resource, poolFormula: t.poolFormula, pool: t.pool, cost: t.cost });
        // 体系容器成员展开（P6 战技）：学习集型容器（卓越战技）的 options 成员派生为独立
        // 卡上条目，成员自带 system/systemKind/role 标注；预选单选型容器（引导神力）沿用
        // chosenForm 机制，成员不入卡——展开范围按名单限定，避免超魔/魔印类全量灌卡
        if (MEMBER_EXPAND_CONTAINERS.has(t.name) && t.systemKind === 'container' && Array.isArray(t.options)) {
          for (const o of t.options) {
            if (o.name && o.text) push({ name: o.name, description: o.text, category: '职业特性', source: sub.name, level: o.level, role: o.role, system: o.system, systemKind: o.systemKind, reaction: o.reaction, activation: o.activation, resource: o.resource, poolFormula: o.poolFormula, pool: o.pool, cost: o.cost });
          }
        }
      }
    }
  }

  return out;
}

/** 体系容器成员展开名单：学习集型容器的 options 成员派生为卡上独立条目（P6 战技；
 * 单选预选型容器（引导神力/暗影技艺）沿用 chosenForm 机制，成员不入卡 */
const MEMBER_EXPAND_CONTAINERS = new Set(['卓越战技']);

/** 缺失条目 = 期望条目中角色卡上没有同 category+name 的那些 */
export function computeMissingOptionFeatures(character: Character): OptionFeatureEntry[] {
  const existing = new Set(
    (character.features || []).map((f) => `${f.category || ''}:${f.name}`)
  );
  return collectOptionFeatureEntries(character).filter(
    (e) => !existing.has(`${e.category}:${e.name}`)
  );
}

/**
 * 机械字段合并刷新：角色卡上已存在的库条目，机械字段（等级/作用方式/资源模型/反应声明等）
 * 以选项库当前标注为准刷新；description 等用户编辑保留。幂等无损——老卡缺 activation/
 * resource/poolFormula 标注时打开角色卡即自动升级（动作/池经济恢复记账），无需手动「刷新」。
 * 返回 changed=false 时调用方跳过写入（防 effect 循环）。
 */
export function mergeFeatureMechanics(character: Character): {
  features: Character['features'];
  changed: boolean;
} {
  const expMap = new Map(
    collectOptionFeatureEntries(character).map((e) => [`${e.category}:${e.name}`, e])
  );
  let changed = false;
  const features = (character.features || []).map((f) => {
    const e = expMap.get(`${f.category || ''}:${f.name}`);
    if (!e) return f;
    const patch: Partial<Feature> = {};
    const seedFields: Partial<Record<keyof Feature, unknown>> = {
      level: e.level,
      role: e.role,
      system: e.system,
      systemKind: e.systemKind,
      reaction: e.reaction,
      activation: e.activation,
      resource: e.resource,
      poolFormula: e.poolFormula,
      pool: e.pool,
      cost: e.cost,
    };
    for (const [k, v] of Object.entries(seedFields)) {
      // 库无标注（undefined）时保留卡上现有值——合并只做「库有而卡缺/过期」的升级，零破坏
      if (v == null) continue;
      const key = k as keyof Feature;
      if (JSON.stringify(f[key]) !== JSON.stringify(v)) {
        (patch as Record<string, unknown>)[k] = v;
      }
    }
    if (Object.keys(patch).length === 0) return f;
    changed = true;
    return { ...f, ...patch };
  });
  // 体系容器成员追加（P6 战技）：学习集型容器（卓越战技）的池主与成员条目旧卡上不存在
  // （extract 采集线此前不落 options，卡上从未有过），进战时按库全量补齐——面板按池聚合
  // 展示战技列表，未学的由 DM 自律/隐藏机制管理；其余全量期望条目（熟练项等选择型内容）
  // 仍走角色卡手动「刷新」，避免合并改变卡的构建语义。成员/池主已在卡上时 added 为空，
  // changed 不翻转，幂等防循环。
  const added: Character['features'] = [];
  const existingKeys = new Set(
    (character.features || []).map((f) => `${f.category || ''}:${f.name}`)
  );
  for (const [key, e] of expMap) {
    if (existingKeys.has(key)) continue;
    const isPoolContainer = e.systemKind === 'container' && MEMBER_EXPAND_CONTAINERS.has(e.name);
    const isSystemMember = e.systemKind === 'member' && MEMBER_EXPAND_CONTAINERS.has(e.system ?? '');
    if (isPoolContainer || isSystemMember) {
      added.push({
        id: crypto.randomUUID(),
        name: e.name,
        description: e.description,
        category: e.category,
        source: e.source,
        level: e.level,
        role: e.role,
        system: e.system,
        systemKind: e.systemKind,
        reaction: e.reaction,
        activation: e.activation,
        resource: e.resource,
        poolFormula: e.poolFormula,
        pool: e.pool,
        cost: e.cost,
      });
    }
  }
  if (added.length > 0) {
    changed = true;
    features.push(...added);
  }
  return { features, changed };
}
