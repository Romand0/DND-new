// 字段级采纳合并：变更审批面板把玩家快照与正式卡现状做「按勾选行合并」，
// 未勾选（不采纳）的 diff 行回退到正式卡现状值——替代旧版整卡覆盖，避免冲掉 DM 无关改动。
// 另导出 stableStringify 供 SyncButton 做本地/云端内容比对（键序无关，剥离易变字段后可比）。

import type { Character } from '@/types/character';
import type { CharacterDiffRow } from '@/types/changeRequest';
import { equipKey } from '@/lib/characterDiff';

/** 键序无关的确定性 JSON 序列化（跨端比对用；undefined 字段自然省略） */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',');
  return `{${body}}`;
}

function splitOnce(s: string, sep: string): [string, string] {
  const i = s.indexOf(sep);
  return i === -1 ? [s, ''] : [s.slice(0, i), s.slice(i + sep.length)];
}

function getByPath(obj: any, path: string): unknown {
  let cur = obj;
  for (const seg of path.split('.')) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function setByPath(obj: any, path: string, value: unknown): void {
  const segs = path.split('.');
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    if (cur[segs[i]] === undefined || cur[segs[i]] === null || typeof cur[segs[i]] !== 'object') {
      cur[segs[i]] = {};
    }
    cur = cur[segs[i]];
  }
  cur[segs[segs.length - 1]] = value;
}

/**
 * 按勾选结果合并：起点为玩家快照 payload，未采纳行的对应字段回退为 base（正式卡现状）。
 * 行无 key（旧数据/未覆盖领域）时视为强制采纳，保留 payload 值。
 */
export function mergeAdoptedFields(
  base: Character,
  payload: Character,
  rows: CharacterDiffRow[],
  adoptedKeys: Set<string>,
): Character {
  const merged = JSON.parse(JSON.stringify(payload)) as any;
  const baseAny = base as any;
  for (const row of rows) {
    if (!row.key || adoptedKeys.has(row.key)) continue;
    revertAspect(merged, baseAny, row);
  }
  return merged as Character;
}

/** 把 row 对应的「方面」恢复为 base 现状；无法回退（base 缺参照）时保留 payload 值并静默跳过 */
function revertAspect(merged: any, base: any, row: CharacterDiffRow): void {
  const key = row.key as string;
  if (key.startsWith('equipment:')) {
    const id = key.slice('equipment:'.length);
    const bItem = ((base.equipment ?? []) as any[]).find((e) => equipKey(e) === id);
    const mList = (merged.equipment ?? []) as any[];
    const mIdx = mList.findIndex((e) => equipKey(e) === id);
    if (row.kind === 'add') {
      // 玩家新增的条目不采纳 → 从合并结果中移除
      if (mIdx >= 0) mList.splice(mIdx, 1);
      return;
    }
    if (!bItem) return;
    if (mIdx >= 0) mList[mIdx] = JSON.parse(JSON.stringify(bItem));
    else mList.push(JSON.parse(JSON.stringify(bItem)));
    return;
  }
  if (key.startsWith('features:')) {
    const [name, aspect] = splitOnce(key.slice('features:'.length), ':');
    const mList = (merged.features ?? []) as any[];
    const mFeat = mList.find((f) => String(f?.name ?? '') === name);
    const bFeat = ((base.features ?? []) as any[]).find((f) => String(f?.name ?? '') === name);
    if (!aspect) {
      if (row.kind === 'add') {
        if (mFeat) merged.features = mList.filter((f) => f !== mFeat);
        return;
      }
      if (!bFeat) return;
      const cloned = JSON.parse(JSON.stringify(bFeat));
      if (mFeat) mList[mList.indexOf(mFeat)] = cloned;
      else mList.push(cloned);
      return;
    }
    if (!mFeat || !bFeat) return;
    if (aspect === 'role') mFeat.role = bFeat.role;
    else if (aspect === 'desc') mFeat.description = bFeat.description;
    return;
  }
  if (key.startsWith('proficiencies:')) {
    const [cat, item] = splitOnce(key.slice('proficiencies:'.length), ':');
    if (!item) return;
    const cur = (merged.proficiencies ?? {}) as Record<string, string[]>;
    const mSet = new Set(cur[cat] ?? []);
    const bSet = ((base.proficiencies ?? {}) as Record<string, string[]>)[cat] ?? [];
    if (row.kind === 'add') mSet.delete(item);
    else if (bSet.includes(item)) mSet.add(item);
    merged.proficiencies = { ...cur, [cat]: [...mSet] };
    return;
  }
  if (key.startsWith('spells.cantrips:') || key.startsWith('spells.custom:')) {
    const [field, name] = splitOnce(key.slice('spells.'.length), ':');
    if (!name) return;
    const mArr = [...(((merged.spells ?? {}) as any)[field] ?? []) as string[]];
    const bArr = (((base.spells ?? {}) as any)[field] ?? []) as string[];
    if (row.kind === 'add') {
      merged.spells = { ...(merged.spells ?? {}), [field]: mArr.filter((n) => n !== name) };
    } else if (bArr.includes(name) && !mArr.includes(name)) {
      merged.spells = { ...(merged.spells ?? {}), [field]: [...mArr, name] };
    }
    return;
  }
  if (key.startsWith('spells.spellSlots.')) {
    const slotKey = key.slice('spells.spellSlots.'.length);
    const mSlots = { ...(((merged.spells ?? {}).spellSlots ?? {}) as Record<string, unknown>) };
    const bSlot = (((base.spells ?? {}).spellSlots ?? {}) as Record<string, unknown>)[slotKey];
    if (bSlot === undefined) delete mSlots[slotKey];
    else mSlots[slotKey] = JSON.parse(JSON.stringify(bSlot));
    merged.spells = { ...(merged.spells ?? {}), spellSlots: mSlots };
    return;
  }
  if (key.startsWith('skills.')) {
    const skillKey = key.slice('skills.'.length);
    const mSkills = { ...((merged.skills ?? {}) as Record<string, unknown>) };
    const bSkill = ((base.skills ?? {}) as Record<string, unknown>)[skillKey];
    if (bSkill === undefined) delete mSkills[skillKey];
    else mSkills[skillKey] = JSON.parse(JSON.stringify(bSkill));
    merged.skills = mSkills;
    return;
  }
  if (key.includes('.')) {
    // 点路径嵌套标量（currency.x / abilities.x.score / profession.class）
    const bv = getByPath(base, key);
    if (bv === undefined) {
      // base 缺该字段（如正式卡从未设置过）：回退 = 清除合并结果中的字段
      const segs = key.split('.');
      const parent = getByPath(merged, segs.slice(0, -1).join('.'));
      if (parent && typeof parent === 'object') delete (parent as any)[segs[segs.length - 1]];
      return;
    }
    setByPath(merged, key, JSON.parse(JSON.stringify(bv)));
    return;
  }
  // 顶层标量
  if (base[key] === undefined) delete merged[key];
  else merged[key] = JSON.parse(JSON.stringify(base[key]));
}
