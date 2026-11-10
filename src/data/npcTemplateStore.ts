// NPC 模板（怪物图鉴）Store - 种子基线 + 后端 API（仅存覆盖/墓碑/自建行）
// getAll = filterByCampaignScope(种子 ∪ 云端)；种子驻留仓库，云端只存覆盖行。
import { scopedKey, getCampaignId } from '@/data/campaignScope';
import { filterByCampaignScope, subscribeLibraryScope } from '@/data/libraryScope';
import type { NpcTemplate, CreatureSize, CreatureType } from '@/types/combat';
import { CREATURE_SIZE_LABELS, CREATURE_TYPE_LABELS } from '@/types/combat';
import * as api from '@/lib/api';
import { getCachedSeed, loadSeed, subscribeSeed } from '@/data/seedLoader';
import { mergeBaseline } from '@/data/libraryMerge';

// 反查表：旧文本 → 枚举
const REVERSE_SIZE_MAP: Record<string, CreatureSize> = Object.fromEntries(
  Object.entries(CREATURE_SIZE_LABELS).map(([k, v]) => [v, Number(k) as CreatureSize])
);
// 图鉴原文种类主词 → 枚举（原文常带括号注记/旧译变体，精确匹配会大量 miss）
const TYPE_ALIAS_MAP: Record<string, CreatureType> = {
  ...Object.fromEntries(Object.entries(CREATURE_TYPE_LABELS) as [string, CreatureType][]),
  类人: 'humanoid',
  构装: 'construct',
  亡灵: 'undead',
  不死: 'undead',
  妖精: 'fey',
  天族: 'celestial',
};
const TYPE_PREFIX_RE = /^(超巨型|超大型|微型|小型|中型|中形|大型|巨型)/;

/** 图鉴种类原文 → 枚举（剥体型前缀 / 集群后缀 / 括号注记后按别名归一） */
function resolveCreatureType(raw: unknown): CreatureType | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const candidates = [raw];
  const stripped = raw.replace(TYPE_PREFIX_RE, '').trim();
  if (stripped) candidates.push(stripped);
  const deSwarm = stripped.replace(/的.*?集群$/, '').trim();
  if (deSwarm) candidates.push(deSwarm);
  for (const c of candidates) {
    const head = c.split(/[（(/]/)[0].trim();
    for (const key of [c, head]) {
      const hit = TYPE_ALIAS_MAP[key];
      if (hit) return hit;
    }
  }
  return undefined;
}

/** 图鉴体型原文 → 枚举（「中形」「超大型」等旧译一并归一） */
function resolveCreatureSize(raw: unknown): CreatureSize | undefined {
  if (typeof raw === 'number') return raw as CreatureSize;
  if (typeof raw !== 'string') return undefined;
  if (raw in REVERSE_SIZE_MAP) return REVERSE_SIZE_MAP[raw];
  const legacy: Record<string, CreatureSize> = { 中形: 2, 超大型: 5 };
  return legacy[raw];
}

const STORAGE_KEY = 'dnd-npc-templates';
const storageKey = () => scopedKey(STORAGE_KEY);
type Listener = () => void;

let listeners: Listener[] = [];

// 规则书集变化触发刷新；种子就绪触发刷新
subscribeLibraryScope(() => notify());
subscribeSeed(() => notify());

// 进程内缓存：避免每次读都全量 parse localStorage。所有写操作必须经过 save()。
let cloudCache: NpcTemplate[] | null = null;

// 跨标签页一致性：其它标签页写入 localStorage 后，让本页缓存失效
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey()) cloudCache = null;
  });
}

function notify(): void {
  listeners.forEach(listener => listener());
}

function normalizeTemplate(t: any): NpcTemplate {
  return {
    id: t.id ?? crypto.randomUUID(),
    templateId: t.templateId ?? t.id ?? crypto.randomUUID(),
    name: t.name ?? '未命名NPC',
    strength: t.strength ?? 10,
    dexterity: t.dexterity ?? 10,
    constitution: t.constitution ?? 10,
    intelligence: t.intelligence ?? 10,
    wisdom: t.wisdom ?? 10,
    charisma: t.charisma ?? 10,
    maxHp: t.maxHp ?? 10,
    speed: t.speed ?? 30,
    ac: t.ac ?? 10,
    attacks: (t.attacks ?? []).map((a: any) => ({
      name: a.name ?? '',
      attackBonus: a.attackBonus ?? '',
      damage: a.damage ?? '',
      damageType: a.damageType ?? '挥砍',
      range: a.range ?? '5 尺',
      properties: a.properties ?? [],
      subtype: a.subtype,
      normalRange: a.normalRange,
      maxRange: a.maxRange,
      twoHandedDamage: a.twoHandedDamage,
    })),
    creatureSize: (t.creatureSize as CreatureSize | undefined) ?? resolveCreatureSize(t.size),
    creatureType: (t.creatureType as CreatureType | undefined) ?? resolveCreatureType(t.type),
    createdAt: t.createdAt ?? Date.now(),
    updatedAt: t.updatedAt ?? Date.now(),
    cr: t.cr,
    size: t.size,
    type: t.type,
    alignment: t.alignment,
    features: t.features,
    senses: t.senses,
    languages: t.languages,
    savingThrows: t.savingThrows,
    skills: t.skills,
    source: t.source,
    proficiencyBonus: t.proficiencyBonus,
    pbDerived: t.pbDerived,
    hpDice: t.hpDice,
    acNote: t.acNote,
    nameEn: t.nameEn,
    xp: t.xp,
    damageResistances: t.damageResistances,
    damageImmunities: t.damageImmunities,
    damageVulnerabilities: t.damageVulnerabilities,
    conditionImmunities: t.conditionImmunities,
    speedNotes: t.speedNotes,
    traits: t.traits,
    sourceDir: t.sourceDir,
    campaignId: t.campaignId,
    seedId: t.seedId,
    deleted: t.deleted,
  };
}

// 云端行缓存（覆盖/墓碑/自建），不含种子
function loadCloud(): NpcTemplate[] {
  if (cloudCache) return cloudCache;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) {
      cloudCache = [];
      return cloudCache;
    }
    const parsed: unknown[] = JSON.parse(raw);
    cloudCache = parsed.map(normalizeTemplate);
    return cloudCache;
  } catch {
    cloudCache = [];
    return cloudCache;
  }
}

function saveCloud(templates: NpcTemplate[]): void {
  cloudCache = templates;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(templates));
  } catch (e) {
    console.error('NPC模板保存失败:', e);
  }
  notify();
}

// 怪物种子：索引键用 templateId（种子 id 是随机 uuid，templateId 是稳定 slug）。
// 但 libraryMerge 按 id 合并——先把种子 id 对齐为 templateId，保证合并键稳定。
function normalizedSeeds(): NpcTemplate[] {
  const seeds = getCachedSeed<NpcTemplate>('monsters') ?? [];
  return seeds.map((s) => ({ ...s, id: s.templateId || s.id }));
}

function merged(): NpcTemplate[] {
  return mergeBaseline(normalizedSeeds(), loadCloud()).items;
}

function overlayId(seedId: string): string {
  return `ovl-${getCampaignId()}-${seedId}`;
}

const npcTemplateStore = {
  // 团组过滤视图（怪物图鉴页/参战创建器用）
  getAll(): NpcTemplate[] {
    return filterByCampaignScope([...merged()]).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  // 全库视角（图鉴管理页）
  getAllRaw(): NpcTemplate[] {
    return [...merged()].sort((a, b) => b.updatedAt - a.updatedAt);
  },

  /**
   * 预热种子 + 从云端拉取覆盖/墓碑/自建行（不再推种子上云——种子驻留仓库）。
   */
  async fetchAll(): Promise<NpcTemplate[]> {
    await loadSeed('monsters');
    let remote: NpcTemplate[] = [];
    try {
      remote = await api.fetchAllNpcTemplates<NpcTemplate[]>();
    } catch (err) {
      console.error('[npcTemplateStore] 从后端加载失败:', err);
      return this.getAll();
    }
    saveCloud(remote.map(normalizeTemplate));
    return this.getAll();
  },

  get(id: string): NpcTemplate | null {
    const found = merged().find(t => t.id === id) ?? null;
    if (!found) return null;
    // 浅拷贝：防止调用方 mutate 污染内存缓存
    return { ...found, attacks: [...(found.attacks ?? [])] };
  },

  getById(id: string): NpcTemplate | null {
    const found = merged().find(t => t.id === id);
    return found ? { ...found, attacks: [...(found.attacks ?? [])] } : null;
  },

  // 是否为纯种子条目（id 已对齐 templateId）
  isSeedItem(id: string): boolean {
    return normalizedSeeds().some((s) => s.id === id);
  },

  /**
   * 新建自定义模板：私有条目（普通 uuid），不涉及种子。
   */
  create(template: Omit<NpcTemplate, 'id' | 'createdAt' | 'updatedAt'>): NpcTemplate {
    const now = Date.now();
    const newTemplate: NpcTemplate = {
      ...template,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      campaignId: template.campaignId ?? getCampaignId(),
    };
    const cloud = loadCloud();
    cloud.push(newTemplate);
    saveCloud(cloud);
    api.createNpcTemplate(newTemplate).catch(err => console.error('[npcTemplateStore] 云端创建失败:', err));
    return newTemplate;
  },

  /**
   * 更新模板。种子条目 → 派生覆盖行（overlay id，templateId=overlay id 绕开唯一索引）；
   * 自建/覆盖行按原 id 更新。
   */
  update(id: string, partial: Partial<Omit<NpcTemplate, 'id' | 'createdAt'>>): NpcTemplate | null {
    const cloud = loadCloud();
    const existingCloud = cloud.findIndex(t => t.id === id);

    // 命中种子（id 已对齐 templateId）
    const seed = normalizedSeeds().find(s => s.id === id);
    if (seed) {
      const oid = existingCloud >= 0 ? id : overlayId(seed.id);
      const result: NpcTemplate = {
        ...seed,
        ...partial,
        id: oid,
        templateId: oid,
        seedId: seed.id,
        campaignId: getCampaignId(),
        createdAt: seed.createdAt,
        updatedAt: Date.now(),
      };
      const idx = cloud.findIndex(t => t.id === oid);
      if (idx >= 0) cloud[idx] = result;
      else cloud.push(result);
      saveCloud(cloud);
      api.updateNpcTemplate(oid, result)
        .catch(() => api.createNpcTemplate(result))
        .catch(err => console.error('[npcTemplateStore] 云端更新失败:', err));
      return result;
    }

    if (existingCloud >= 0) {
      cloud[existingCloud] = { ...cloud[existingCloud], ...partial, updatedAt: Date.now() };
      saveCloud(cloud);
      api.updateNpcTemplate(id, cloud[existingCloud]).catch(err => console.error('[npcTemplateStore] 云端更新失败:', err));
      return cloud[existingCloud];
    }
    return null;
  },

  /**
   * 删除模板。种子条目 → 写墓碑行；自建/覆盖行 → 云端移除。
   */
  delete(id: string): void {
    const cloud = loadCloud();
    const seed = normalizedSeeds().find(s => s.id === id);
    if (seed) {
      const tombstone: NpcTemplate = {
        ...seed,
        id: `del-${getCampaignId()}-${seed.id}`,
        templateId: `del-${getCampaignId()}-${seed.id}`,
        seedId: seed.id,
        deleted: true,
        campaignId: getCampaignId(),
      };
      const withoutOverlay = cloud.filter(t => t.seedId !== seed.id);
      withoutOverlay.push(tombstone);
      saveCloud(withoutOverlay);
      api.deleteNpcTemplate(overlayId(seed.id)).catch(() => {});
      api.createNpcTemplate(tombstone).catch(err => console.error('[npcTemplateStore] 墓碑写入失败:', err));
      return;
    }
    saveCloud(cloud.filter(t => t.id !== id));
    api.deleteNpcTemplate(id).catch(err => console.error('[npcTemplateStore] 云端删除失败:', err));
  },

  clear(): void {
    saveCloud([]);
  },

  /** 图鉴种子模板数量（导入卡片展示用） */
  seedCount(): number {
    return (getCachedSeed<NpcTemplate>('monsters') ?? []).length;
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },
};

export default npcTemplateStore;
