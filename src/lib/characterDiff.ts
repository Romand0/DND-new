// 角色卡字段级 diff：玩家提交摘要与 DM 审批弹窗共用。
// 设计取舍：标量字段逐个比对精确到项；数组类按业务主键对齐（装备 childId、特性 name、
// 法术位 key）后比对关键字段——避免整卡 JSON 逐节点深比较产生大量噪音行。

import type { Character, AbilityKey } from '@/types/character';
import type { CharacterDiffRow } from '@/types/changeRequest';
import { SKILL_LABELS } from '@/data/characterStore';

const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: '力量',
  dexterity: '敏捷',
  constitution: '体质',
  intelligence: '智力',
  wisdom: '感知',
  charisma: '魅力',
};

const ABILITY_KEYS: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

const CURRENCY_LABELS: Record<string, string> = { cp: '铜币', sp: '银币', ep: '银币(电子)', gp: '金币', pp: '铂币' };

const SLOT_LABELS: Record<string, string> = {
  level1: '1环', level2: '2环', level3: '3环', level4: '4环',
  level5: '5环', level6: '6环', level7: '7环', level8: '8环', level9: '9环',
};

function fmt(v: unknown): string {
  if (v === undefined || v === null || v === '') return '（空）';
  if (typeof v === 'boolean') return v ? '是' : '否';
  return String(v);
}

/** 装备行标识：childId 优先（背包实例唯一），缺省退化 id+名称 */
function equipKey(e: any): string {
  return String(e?.childId || e?.id || '') || String(e?.name ?? '');
}

function equipLabel(e: any): string {
  const base = String(e?.name ?? '未命名装备');
  const qty = typeof e?.quantity === 'number' ? `×${e.quantity}` : '';
  return `${base}${qty}`;
}

/** 技能熟练展示：proficient/expertise 压缩为文本 */
function skillState(s: any): string {
  if (!s) return '（空）';
  if (s.expertise) return '专精';
  if (s.proficient) return '熟练';
  return '（空）';
}

export function diffCharacter(base: Character, draft: Character): CharacterDiffRow[] {
  const rows: CharacterDiffRow[] = [];
  const push = (path: string, before: unknown, after: unknown, emptyAs?: 'add' | 'remove') => {
    if (fmt(before) === fmt(after)) return;
    const kind = emptyAs === 'add' && fmt(before) === '（空）' ? 'add'
      : emptyAs === 'remove' && fmt(after) === '（空）' ? 'remove'
      : 'change';
    rows.push({ path, before: fmt(before), after: fmt(after), kind });
  };

  // 顶层标量
  push('姓名', base.name, draft.name);
  push('种族', base.race, draft.race);
  push('职业', base.profession?.class, draft.profession?.class);
  push('等级', base.level, draft.level);
  push('背景', base.background, draft.background);
  push('阵营', base.alignment, draft.alignment);
  push('体型', base.size, draft.size);
  push('生命值上限', base.maxHp, draft.maxHp);
  push('当前生命值', base.currentHp, draft.currentHp);
  push('临时生命值', base.tempHp, draft.tempHp);
  push('护甲等级', base.armorClass, draft.armorClass);
  push('速度', base.speed, draft.speed);
  push('熟练加值', base.proficiencyBonus, draft.proficiencyBonus);
  push('经验值', base.experience, draft.experience);

  // 货币
  const bc = (base.currency ?? {}) as any;
  const dc = (draft.currency ?? {}) as any;
  for (const cur of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
    push(`货币·${CURRENCY_LABELS[cur]}`, bc[cur], dc[cur]);
  }

  // 六维属性（score；undefined 视为缺省不比对）
  const ba = (base.abilities ?? {}) as any;
  const da = (draft.abilities ?? {}) as any;
  for (const k of ABILITY_KEYS) {
    const bScore = typeof ba[k]?.score === 'number' ? ba[k].score : undefined;
    const dScore = typeof da[k]?.score === 'number' ? da[k].score : undefined;
    if (bScore === undefined && dScore === undefined) continue;
    push(`属性·${ABILITY_LABELS[k]}`, bScore ?? '（空）', dScore ?? '（空）');
  }

  // 技能熟练（proficient/expertise）
  const bs = (base.skills ?? {}) as Record<string, any>;
  const ds = (draft.skills ?? {}) as Record<string, any>;
  for (const key of new Set([...Object.keys(bs), ...Object.keys(ds)])) {
    const bTxt = skillState(bs[key]);
    const dTxt = skillState(ds[key]);
    if (bTxt !== dTxt) {
      rows.push({
        path: `技能·${(SKILL_LABELS as any)[key] ?? key}`,
        before: bTxt, after: dTxt,
        kind: bTxt === '（空）' ? 'add' : dTxt === '（空）' ? 'remove' : 'change',
      });
    }
  }

  // 熟练项列表（护甲/武器/工具/语言：数组集合比对）
  const bp = (base.proficiencies ?? {}) as Record<string, string[]>;
  const dp = (draft.proficiencies ?? {}) as Record<string, string[]>;
  const profLabels: Record<string, string> = { armor: '护甲熟练', weapons: '武器熟练', tools: '工具熟练', languages: '语言' };
  for (const cat of ['armor', 'weapons', 'tools', 'languages'] as const) {
    const bSet = new Set(bp[cat] ?? []);
    const dSet = new Set(dp[cat] ?? []);
    for (const item of dSet) {
      if (!bSet.has(item)) rows.push({ path: `${profLabels[cat]}·${item}`, before: '', after: '新增', kind: 'add' });
    }
    for (const item of bSet) {
      if (!dSet.has(item)) rows.push({ path: `${profLabels[cat]}·${item}`, before: '原有', after: '已移除', kind: 'remove' });
    }
  }

  // 装备：按 childId 对齐（数量变化单列，其他字段整体变化合并一行）
  const be = (base.equipment ?? []) as any[];
  const de = (draft.equipment ?? []) as any[];
  const bMap = new Map(be.map(e => [equipKey(e), e]));
  const dMap = new Map(de.map(e => [equipKey(e), e]));
  for (const [key, dItem] of dMap) {
    const bItem = bMap.get(key);
    if (!bItem) {
      rows.push({ path: `装备·${equipLabel(dItem)}`, before: '', after: '新增', kind: 'add' });
    } else if (fmt(bItem.quantity) !== fmt(dItem.quantity)) {
      rows.push({ path: `装备·${String(bItem.name ?? '')}`, before: `×${fmt(bItem.quantity)}`, after: `×${fmt(dItem.quantity)}`, kind: 'change' });
    } else if (JSON.stringify(bItem) !== JSON.stringify(dItem)) {
      rows.push({ path: `装备·${String(bItem.name ?? '')}`, before: '原条目', after: '有修改', kind: 'change' });
    }
  }
  for (const [key, bItem] of bMap) {
    if (!dMap.has(key)) {
      rows.push({ path: `装备·${equipLabel(bItem)}`, before: '原有条目', after: '已移除', kind: 'remove' });
    }
  }

  // 特性/特质：按名称对齐（新增/移除/role 与描述变化）
  const bf = (base.features ?? []) as any[];
  const df = (draft.features ?? []) as any[];
  const bfMap = new Map(bf.map(f => [String(f?.name ?? ''), f]));
  const dfMap = new Map(df.map(f => [String(f?.name ?? ''), f]));
  for (const [key, dFeat] of dfMap) {
    const bFeat = bfMap.get(key);
    if (!bFeat) {
      rows.push({ path: `特性·${key}`, before: '', after: '新增', kind: 'add' });
      continue;
    }
    if (fmt(bFeat.role) !== fmt(dFeat.role)) {
      rows.push({ path: `特性·${key}（作用方式）`, before: fmt(bFeat.role), after: fmt(dFeat.role), kind: 'change' });
    }
    if (String(bFeat.description ?? '') !== String(dFeat.description ?? '')) {
      rows.push({ path: `特性·${key}（描述）`, before: '原文', after: '已修改', kind: 'change' });
    }
  }
  for (const key of bfMap.keys()) {
    if (!dfMap.has(key)) {
      rows.push({ path: `特性·${key}`, before: '原有特性', after: '已移除', kind: 'remove' });
    }
  }

  // 法术位（used/max）
  const bsl = (base.spells?.spellSlots ?? {}) as Record<string, any>;
  const dsl = (draft.spells?.spellSlots ?? {}) as Record<string, any>;
  for (const key of new Set([...Object.keys(bsl), ...Object.keys(dsl)])) {
    const b = bsl[key];
    const d = dsl[key];
    if (!b && !d) continue;
    const bTxt = b ? `${b.used ?? 0}/${b.max ?? 0}` : '（空）';
    const dTxt = d ? `${d.used ?? 0}/${d.max ?? 0}` : '（空）';
    if (bTxt !== dTxt) {
      rows.push({ path: `法术位·${SLOT_LABELS[key] ?? key}`, before: bTxt, after: dTxt, kind: 'change' });
    }
  }

  // 法术列表（cantrips + custom 字符串数组：集合比对）
  const bNames = new Set([...(base.spells?.cantrips ?? []), ...(base.spells?.custom ?? [])]);
  const dNames = new Set([...(draft.spells?.cantrips ?? []), ...(draft.spells?.custom ?? [])]);
  for (const n of dNames) {
    if (!bNames.has(n)) rows.push({ path: `法术·${n}`, before: '', after: '新增', kind: 'add' });
  }
  for (const n of bNames) {
    if (!dNames.has(n)) rows.push({ path: `法术·${n}`, before: '原有', after: '已移除', kind: 'remove' });
  }

  return rows;
}

/** diff 摘要（提交确认框/审批列表用）：按 kind 计数 */
export function summarizeDiff(rows: CharacterDiffRow[]): string {
  const add = rows.filter(r => r.kind === 'add').length;
  const remove = rows.filter(r => r.kind === 'remove').length;
  const change = rows.filter(r => r.kind === 'change').length;
  const parts: string[] = [];
  if (change) parts.push(`${change} 处修改`);
  if (add) parts.push(`${add} 项新增`);
  if (remove) parts.push(`${remove} 项移除`);
  return parts.length ? parts.join('、') : '没有检测到变更';
}
