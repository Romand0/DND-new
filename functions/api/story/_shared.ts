// 剧情模块纯函数层：默认值、结构校验、玩家投影。无 IO，探针可直接 import。

export const STORY_KIND = 'story';
export const LEDGER_SOURCE_KINDS = ['check', 'item', 'treasure', 'spell', 'growth'];
export const HANDOUT_KINDS = ['letter', 'map', 'notice', 'other'];
const SCENE_STATUSES = ['planned', 'active', 'done', 'skipped'];
const ARC_STATUSES = ['planned', 'active', 'closed'];
const OBJECTIVE_KINDS = ['main', 'side', 'personal'];
const OBJECTIVE_OUTCOMES = ['pending', 'met', 'missed', 'dropped'];
const ENTITY_KINDS = ['equipment', 'spell', 'monster', 'rule'];

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function optionalNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function optionalStr(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function newId(): string {
  return crypto.randomUUID();
}

function normalizeSnippet(raw: any) {
  return {
    id: str(raw?.id) || newId(),
    text: str(raw?.text),
    refs: arr(raw?.refs)
      .map((r: any) => ({
        kind: ENTITY_KINDS.includes(r?.kind) ? r.kind : 'rule',
        id: str(r?.id),
        label: str(r?.label),
      }))
      .filter(r => r.id),
  };
}

function normalizeObjective(raw: any) {
  return {
    id: str(raw?.id) || newId(),
    kind: OBJECTIVE_KINDS.includes(raw?.kind) ? raw.kind : 'main',
    title: str(raw?.title),
    assigneeIds: arr(raw?.assigneeIds).filter((v): v is string => typeof v === 'string'),
    outcome: OBJECTIVE_OUTCOMES.includes(raw?.outcome) ? raw.outcome : 'pending',
  };
}

function normalizeReward(raw: any) {
  const currency = raw?.currency;
  const reward: any = {
    items: arr(raw?.items)
      .map((it: any) => ({
        name: str(it?.name),
        quantity: Math.max(1, Math.round(num(it?.quantity, 1))),
        ...(optionalStr(it?.equipmentId) ? { equipmentId: it.equipmentId } : {}),
      }))
      .filter(it => it.name),
  };
  if (currency && typeof currency === 'object') {
    reward.currency = {
      pp: Math.max(0, num(currency.pp)),
      gp: Math.max(0, num(currency.gp)),
      ep: Math.max(0, num(currency.ep)),
      sp: Math.max(0, num(currency.sp)),
      cp: Math.max(0, num(currency.cp)),
    };
  }
  const exp = optionalNum(raw?.experience);
  if (exp !== undefined) reward.experience = Math.max(0, Math.round(exp));
  if (optionalStr(raw?.notes)) reward.notes = raw.notes;
  return reward;
}

function normalizeScene(raw: any, chapterId: string, timestamp: number) {
  const time = raw?.time ?? {};
  const location = raw?.location ?? {};
  const roster = raw?.roster ?? {};
  return {
    id: str(raw?.id) || newId(),
    chapterId,
    title: str(raw?.title, '未命名场景'),
    status: SCENE_STATUSES.includes(raw?.status) ? raw.status : 'planned',
    time: {
      order: Math.max(0, Math.round(num(time.order))),
      ...(optionalStr(time.gameDate) ? { gameDate: time.gameDate } : {}),
      ...(optionalNum(time.gameMinute) !== undefined ? { gameMinute: Math.max(0, Math.min(1439, Math.round(time.gameMinute))) } : {}),
      ...(optionalNum(time.sessionNo) !== undefined ? { sessionNo: Math.max(0, Math.round(time.sessionNo)) } : {}),
    },
    location: {
      name: str(location.name),
      ...(optionalStr(location.region) ? { region: location.region } : {}),
      ...(optionalStr(location.battlegroundId) ? { battlegroundId: location.battlegroundId } : {}),
    },
    roster: {
      characterIds: arr(roster.characterIds).filter((v): v is string => typeof v === 'string'),
      npcIds: arr(roster.npcIds).filter((v): v is string => typeof v === 'string'),
      absentCharacterIds: arr(roster.absentCharacterIds).filter((v): v is string => typeof v === 'string'),
    },
    snippets: arr(raw?.snippets).map(normalizeSnippet),
    ...(optionalStr(raw?.dmNotes) ? { dmNotes: raw.dmNotes } : {}),
    plannedObjectives: arr(raw?.plannedObjectives).map(normalizeObjective),
    plannedReward: normalizeReward(raw?.plannedReward),
    dependsOn: arr(raw?.dependsOn).filter((v): v is string => typeof v === 'string'),
    ...(optionalStr(raw?.resultNotes) ? { resultNotes: raw.resultNotes } : {}),
    ...(optionalStr(raw?.settlementSummary) ? { settlementSummary: raw.settlementSummary } : {}),
    ...(optionalStr(raw?.combatRecordId) ? { combatRecordId: raw.combatRecordId } : {}),
    ...(optionalStr(raw?.skipReason) ? { skipReason: raw.skipReason } : {}),
    createdAt: num(raw?.createdAt, timestamp),
    updatedAt: num(raw?.updatedAt, timestamp),
  };
}

function normalizeChapter(raw: any, timestamp: number) {
  const id = str(raw?.id) || newId();
  return {
    id,
    title: str(raw?.title, '未命名章节'),
    summary: str(raw?.summary),
    order: Math.max(0, Math.round(num(raw?.order))),
    scenes: arr(raw?.scenes).map((s: any) => normalizeScene(s, id, timestamp)),
    createdAt: num(raw?.createdAt, timestamp),
    updatedAt: num(raw?.updatedAt, timestamp),
  };
}

/** 归一化：补齐 id/默认值/嵌套结构，容忍旧数据缺字段 */
export function normalizeArc(raw: any, campaignId: string, userId: string, timestamp = Date.now()) {
  const id = str(raw?.id) || newId();
  return {
    id,
    campaignId,
    title: str(raw?.title, '未命名剧情线'),
    summary: str(raw?.summary),
    status: ARC_STATUSES.includes(raw?.status) ? raw.status : 'planned',
    chapters: arr(raw?.chapters).map((c: any) => normalizeChapter(c, timestamp)),
    createdBy: str(raw?.createdBy) || userId,
    createdAt: num(raw?.createdAt, timestamp),
    updatedAt: timestamp,
  };
}

export interface ArcValidation { ok: boolean; error?: string }

/** 结构校验（成员资格等跨表检查由调用方补充） */
export function validateArc(arc: any): ArcValidation {
  if (!arc || typeof arc !== 'object') return { ok: false, error: '剧情线为空' };
  if (!str(arc.title).trim()) return { ok: false, error: '剧情线标题必填' };
  if (!Array.isArray(arc.chapters)) return { ok: false, error: 'chapters 必须是数组' };

  const chapterOrders = new Set<number>();
  const sceneIds = new Set<string>();
  for (const ch of arc.chapters) {
    if (!str(ch?.title).trim()) return { ok: false, error: '章节标题必填' };
    if (chapterOrders.has(ch.order)) return { ok: false, error: `章节顺序 ${ch.order} 重复` };
    chapterOrders.add(ch.order);
    if (!Array.isArray(ch.scenes)) return { ok: false, error: 'scenes 必须是数组' };
    const sceneOrders = new Set<number>();
    for (const sc of ch.scenes) {
      if (!str(sc?.title).trim()) return { ok: false, error: '场景标题必填' };
      if (sceneIds.has(sc.id)) return { ok: false, error: '场景 id 重复' };
      sceneIds.add(sc.id);
      if (sceneOrders.has(sc.time?.order)) return { ok: false, error: `章节「${ch.title}」内场景顺序 ${sc.time?.order} 重复` };
      sceneOrders.add(sc.time?.order);
      if (!SCENE_STATUSES.includes(sc.status)) return { ok: false, error: `未知场景状态: ${sc.status}` };
    }
  }
  for (const ch of arc.chapters) {
    for (const sc of ch.scenes) {
      for (const dep of sc.dependsOn ?? []) {
        if (dep === sc.id) return { ok: false, error: '场景不能依赖自身' };
        if (!sceneIds.has(dep)) return { ok: false, error: `前置场景不存在: ${dep}` };
      }
      if (sc.status === 'active') {
        const unmet = (sc.dependsOn ?? []).filter((dep: string) => {
          const target = arc.chapters.flatMap((c: any) => c.scenes).find((s: any) => s.id === dep);
          return !target || target.status !== 'done';
        });
        if (unmet.length) return { ok: false, error: `前置场景未完成: ${unmet.join(', ')}` };
      }
      if (sc.status === 'skipped' && !str(sc.skipReason).trim()) {
        return { ok: false, error: '跳过场景必须填写原因' };
      }
    }
  }
  return { ok: true };
}

export function collectSceneIds(arc: any): string[] {
  return arr(arc?.chapters)
    .flatMap((c: any) => arr(c?.scenes))
    .map((s: any) => str(s?.id))
    .filter(Boolean);
}

export function collectCharacterIds(arc: any): string[] {
  const ids = new Set<string>();
  for (const ch of arr(arc?.chapters)) {
    for (const sc of arr(ch?.scenes)) {
      for (const id of arr(sc?.roster?.characterIds)) if (typeof id === 'string') ids.add(id);
      for (const id of arr(sc?.roster?.absentCharacterIds)) if (typeof id === 'string') ids.add(id);
      for (const obj of arr(sc?.plannedObjectives)) {
        for (const id of arr(obj?.assigneeIds)) if (typeof id === 'string') ids.add(id);
      }
    }
  }
  return Array.from(ids);
}

/** 玩家侧投影：不返回任何剧情内容，连剧情线存在性都不暴露 */
export function projectArcsForViewer(arcs: any[], isDm: boolean): any[] {
  return isDm ? arcs : [];
}

export function isLedgerSourceKind(v: unknown): boolean {
  return typeof v === 'string' && LEDGER_SOURCE_KINDS.includes(v);
}

export function isHandoutKind(v: unknown): boolean {
  return typeof v === 'string' && HANDOUT_KINDS.includes(v);
}
