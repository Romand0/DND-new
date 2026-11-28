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

// ---------- 道具投送（纯函数：可读性、归一化、行投影） ----------

/** 空目标 = 全团；已撤回对玩家不可见；DM 始终可见 */
export function canViewHandout(handout: any, userId: string, isDm: boolean): boolean {
  if (isDm) return true;
  if (!handout || handout.recalledAt) return false;
  const targets = arr(handout.targetUserIds).filter((v): v is string => typeof v === 'string');
  return targets.length === 0 || targets.includes(userId);
}

/** 零已读才允许撤回 */
export function canRecallHandout(readCount: number): boolean {
  return !(Number.isFinite(readCount) && readCount > 0);
}

export function normalizeHandout(raw: any, campaignId: string, createdBy: string, timestamp = Date.now()) {
  const targetUserIds = Array.from(
    new Set(arr(raw?.targetUserIds).filter((v): v is string => typeof v === 'string' && v.trim().length > 0))
  );
  return {
    id: str(raw?.id) || newId(),
    campaignId,
    ...(optionalStr(raw?.sceneId) ? { sceneId: raw.sceneId } : {}),
    kind: isHandoutKind(raw?.kind) ? raw.kind : (typeof raw?.kind === 'string' && raw.kind ? raw.kind : 'letter'),
    title: str(raw?.title).trim().slice(0, 200),
    body: str(raw?.body).slice(0, 20000),
    ...(optionalStr(raw?.imageUrl) ? { imageUrl: raw.imageUrl } : {}),
    targetUserIds,
    createdBy,
    createdAt: num(raw?.createdAt, timestamp),
  };
}

export interface HandoutValidation { ok: boolean; error?: string }

export function validateHandout(handout: any): HandoutValidation {
  if (!handout || typeof handout !== 'object') return { ok: false, error: '道具为空' };
  if (!isHandoutKind(handout.kind)) return { ok: false, error: '未知道具类别' };
  if (!str(handout.title).trim()) return { ok: false, error: '道具标题必填' };
  if (!str(handout.body).trim() && !str(handout.imageUrl).trim()) {
    return { ok: false, error: '道具正文与图片至少填写一项' };
  }
  return { ok: true };
}

function parseHandoutTargets(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** DB 行 → 客户端视图：data JSON 展开，附查看者已读状态与已读人数 */
export function projectHandoutRow(row: any, viewerRead?: any, readCount = 0): any {
  const data = parseJson(row?.data);
  const view: any = {
    id: str(row?.id),
    campaignId: str(row?.campaign_id),
    ...(optionalStr(row?.scene_id) ? { sceneId: row.scene_id } : {}),
    kind: isHandoutKind(row?.kind) ? row.kind : 'other',
    title: str(data.title),
    body: str(data.body),
    ...(optionalStr(data.imageUrl) ? { imageUrl: data.imageUrl } : {}),
    targetUserIds: parseHandoutTargets(row?.target_user_ids),
    createdBy: str(row?.created_by),
    createdAt: num(row?.created_at),
    ...(optionalNum(row?.recalled_at) ? { recalledAt: Number(row.recalled_at) } : {}),
    readCount: Math.max(0, Math.round(num(readCount))),
  };
  if (viewerRead && num(viewerRead.read_at) > 0) view.readAt = num(viewerRead.read_at);
  if (viewerRead && optionalNum(viewerRead.favorited_at)) view.favoritedAt = Number(viewerRead.favorited_at);
  return view;
}

// ---------- 账本聚合（纯函数：端点负责取源记录，这里只做组装与汇总） ----------

function parseJson(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

const CURRENCY_KEYS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;

function formatTreasureDetail(detail: any): string {
  const parts: string[] = [];
  for (const key of CURRENCY_KEYS) {
    const v = Number(detail?.currency?.[key] ?? 0);
    if (v > 0) parts.push(`${v}${key}`);
  }
  const items = arr(detail?.items);
  if (items.length) {
    parts.push(items.map((it: any) => `${str(it?.name)}×${Math.max(1, Math.round(num(it?.quantity, 1)))}`).join('、'));
  }
  const exp = num(detail?.experience);
  if (exp > 0) parts.push(`经验 +${exp}`);
  return parts.join(' · ');
}

export interface LedgerRails {
  /** check 请求：key = 消息 id */
  checkRequests: Map<string, any>;
  /** check 结果：key = 请求消息 id（来自 reply_message_id） */
  checkResults: Map<string, any>;
  /** character_logs：key = 日志 id */
  logs: Map<string, any>;
}

/** 把索引 + 源记录组装为账本条目；源记录缺失时标记 invalid */
export function buildLedgerEntries(links: any[], rails: LedgerRails): any[] {
  const entries = links.map((link: any) => {
    const base = {
      linkId: str(link.id),
      sceneId: str(link.scene_id),
      sourceKind: str(link.source_kind),
      sourceId: str(link.source_id),
      characterId: optionalStr(link.character_id),
      note: optionalStr(link.note),
    };
    if (link.source_kind === 'check') {
      const request = rails.checkRequests.get(str(link.source_id));
      if (!request) {
        return { ...base, title: '检定记录不存在', occurredAt: num(link.occurred_at, 0), invalid: true };
      }
      const payload = parseJson(request.payload);
      const result = rails.checkResults.get(str(link.source_id));
      const resultPayload = result ? parseJson(result.payload) : null;
      const parts = [`检定：${str(payload.checkLabel, '检定')}（${str(payload.characterName, '角色')}）`];
      if (payload.dcMode === 'open') parts.push(`DC ${num(payload.dc)}`);
      parts.push(resultPayload ? `结果 ${num(resultPayload.appliedValue)}` : '待回应');
      return {
        ...base,
        title: parts[0],
        amountText: parts.slice(1).join(' · '),
        occurredAt: resultPayload ? num(resultPayload.submittedAt, num(request.created_at)) : num(request.created_at),
      };
    }

    const log = rails.logs.get(str(link.source_id));
    if (!log) {
      return { ...base, title: '源记录不存在', occurredAt: num(link.occurred_at, 0), invalid: true };
    }
    const detail = parseJson(log.detail);
    return {
      ...base,
      title: str(log.title, '未命名记录'),
      amountText: link.source_kind === 'treasure' ? formatTreasureDetail(detail) : undefined,
      occurredAt: num(link.occurred_at, num(log.created_at)),
    };
  });

  entries.sort((a: any, b: any) => a.occurredAt - b.occurredAt || String(a.linkId).localeCompare(String(b.linkId)));
  return entries;
}

export interface LedgerTotals {
  itemCount: number;
  currency: Record<string, number>;
  experience: number;
  spellSlots: Record<number, number>;
}

/** 汇总口径：宝藏明细累加钱币/物品/经验；法术 slot_change 累加消耗环级；物资日志计件 */
export function summarizeLedger(links: any[], rails: Pick<LedgerRails, 'logs'>): LedgerTotals {
  const totals: LedgerTotals = { itemCount: 0, currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, experience: 0, spellSlots: {} };
  for (const link of links) {
    const log = rails.logs.get(str(link.source_id));
    if (!log) continue;
    const detail = parseJson(log.detail);
    if (link.source_kind === 'treasure') {
      for (const key of CURRENCY_KEYS) totals.currency[key] += Math.max(0, num(detail?.currency?.[key]));
      for (const it of arr(detail?.items)) totals.itemCount += Math.max(1, Math.round(num(it?.quantity, 1)));
      totals.experience += Math.max(0, num(detail?.experience));
      continue;
    }
    if (link.source_kind === 'item') {
      totals.itemCount += 1;
      continue;
    }
    if (link.source_kind === 'spell' && log.kind === 'slot_change') {
      const level = parseInt(String(detail?.levelKey ?? '').replace(/\D/g, ''), 10);
      const fromUsed = num(detail?.from?.used);
      const toUsed = num(detail?.to?.used);
      if (Number.isFinite(level) && toUsed > fromUsed) {
        totals.spellSlots[level] = (totals.spellSlots[level] ?? 0) + (toUsed - fromUsed);
      }
      continue;
    }
    if (link.source_kind === 'growth' && log.kind === 'exp_change') {
      totals.experience += Math.max(0, num(detail?.to) - num(detail?.from));
    }
  }
  return totals;
}
