// LocalStorage 文件目录：把浏览器里散落的键按业务域归档，并为每类文件提供
// 「特定打开格式」（表格列 / 详情结构 / 原始文本）。键的判定以源码中各 store
// 的 storageKey 为准；新增 store 时在此补一条映射即可，页面无需改动。

export type StorageFolderId =
  | 'session'
  | 'characters'
  | 'library'
  | 'combat'
  | 'battleground'
  | 'treasure'
  | 'flows'
  | 'world'
  | 'prefs'
  | 'system'
  | 'other';

export type StorageFileKind =
  | 'character'
  | 'character-backup'
  | 'equipment'
  | 'spell'
  | 'option'
  | 'monster'
  | 'combat'
  | 'hooked-combat'
  | 'battleground'
  | 'treasure'
  | 'treasure-distribution'
  | 'flow'
  | 'binding'
  | 'viewport'
  | 'game-time'
  | 'calendar'
  | 'status'
  | 'string-list'
  | 'text'
  | 'object'
  | 'flag'
  | 'unknown';

export interface StorageFolderDef {
  id: StorageFolderId;
  label: string;
  description: string;
}

export const STORAGE_FOLDERS: StorageFolderDef[] = [
  { id: 'session', label: '会话与账号', description: '登录令牌、当前账号、主题、当前团组' },
  { id: 'characters', label: '角色卡', description: '角色卡集与自动备份' },
  { id: 'library', label: '资料库', description: '装备、法术、角色选项、怪物图鉴' },
  { id: 'combat', label: '战斗', description: '战斗记录与联动战斗' },
  { id: 'battleground', label: '沙盘', description: '战斗沙盘摆位与地形' },
  { id: 'treasure', label: '宝藏', description: '宝藏与分配记录' },
  { id: 'flows', label: '流程', description: '流程库镜像、法术绑定、视图快照与旧键残留' },
  { id: 'world', label: '世界时钟', description: '游戏内时间与日历' },
  { id: 'prefs', label: '界面与偏好', description: '自定义状态、特性隐藏、特性筛选' },
  { id: 'system', label: '系统标记', description: '数据迁移与种子导入的一次性标记' },
  { id: 'other', label: '其他', description: '未识别的 LocalStorage 键' },
];

export const KIND_LABELS: Record<StorageFileKind, string> = {
  character: '角色卡集',
  'character-backup': '角色卡备份',
  equipment: '装备库',
  spell: '法术库',
  option: '角色选项',
  monster: '怪物图鉴',
  combat: '战斗记录',
  'hooked-combat': '联动战斗',
  battleground: '沙盘',
  treasure: '宝藏',
  'treasure-distribution': '分配记录',
  flow: '流程库',
  binding: '法术绑定',
  viewport: '编辑器视图快照',
  'game-time': '游戏时间',
  calendar: '游戏日历',
  status: '自定义状态',
  'string-list': '字符串列表',
  text: '文本',
  object: '对象',
  flag: '系统标记',
  unknown: '未知格式',
};

/** 数组类文件按「记录条数」统计，其余按「字段数」 */
const ARRAY_KINDS = new Set<StorageFileKind>([
  'character',
  'character-backup',
  'equipment',
  'spell',
  'option',
  'monster',
  'combat',
  'battleground',
  'treasure',
  'treasure-distribution',
  'flow',
  'binding',
  'string-list',
]);

/** 计数单位：数据集用「条」，配置类用「字段」，标记/纯文本类不显示单位 */
export function countUnit(kind: StorageFileKind): string {
  if (ARRAY_KINDS.has(kind)) return '条';
  if (kind === 'flag' || kind === 'text') return '';
  return '字段';
}

export interface StorageFile {
  key: string;
  /** 分桶团组 id（仅带 `dnd-{团组}:` 前缀的键有值） */
  campaignId: string | null;
  folderId: StorageFolderId;
  kind: StorageFileKind;
  label: string;
  raw: string;
  size: number;
  value: any;
  parseError: boolean;
  /** 记录条数 / 字段数 */
  itemCount: number;
}

interface KeyRule {
  folderId: StorageFolderId;
  kind: StorageFileKind;
  label: string;
}

// 键的 base 部分 → 规则；带团组前缀的键先剥掉前缀再查表
const BASE_RULES: Record<string, KeyRule> = {
  DND: { folderId: 'characters', kind: 'character', label: '角色卡' },
  'dm-characters-backup': { folderId: 'characters', kind: 'character-backup', label: '角色卡自动备份' },
  'DND-equipments': { folderId: 'library', kind: 'equipment', label: '装备库' },
  'DND-spells': { folderId: 'library', kind: 'spell', label: '法术库' },
  'DND-character-options': { folderId: 'library', kind: 'option', label: '角色选项' },
  'dnd-npc-templates': { folderId: 'library', kind: 'monster', label: '怪物图鉴' },
  'dnd-combat-records': { folderId: 'combat', kind: 'combat', label: '战斗记录' },
  'dnd-hooked-combat': { folderId: 'combat', kind: 'hooked-combat', label: '联动战斗' },
  'dnd-battlegrounds': { folderId: 'battleground', kind: 'battleground', label: '沙盘' },
  'dnd-treasures': { folderId: 'treasure', kind: 'treasure', label: '宝藏' },
  'dnd-treasure-distributions': { folderId: 'treasure', kind: 'treasure-distribution', label: '宝藏分配记录' },
  'dnd-flows': { folderId: 'flows', kind: 'flow', label: '流程库镜像' },
  'dnd-flow-library': { folderId: 'flows', kind: 'flow', label: '流程库（旧键）' },
  'dnd-flow-viewport-snapshots': { folderId: 'flows', kind: 'viewport', label: '编辑器视图快照' },
  'dnd-spell-flow-bindings': { folderId: 'flows', kind: 'binding', label: '法术-流程绑定' },
  'dnd-game-time': { folderId: 'world', kind: 'game-time', label: '游戏时间' },
  'dnd-game-calendar': { folderId: 'world', kind: 'calendar', label: '游戏日历' },
  'dnd-custom-statuses': { folderId: 'prefs', kind: 'status', label: '自定义状态' },
  'DND-feature-hidden': { folderId: 'prefs', kind: 'string-list', label: '已隐藏特性' },
  'dnd-feature-role-filter': { folderId: 'prefs', kind: 'text', label: '特性角色筛选' },
  'dm-theme': { folderId: 'session', kind: 'text', label: '界面主题' },
  'auth_token': { folderId: 'session', kind: 'text', label: '登录令牌' },
  'auth_user': { folderId: 'session', kind: 'object', label: '当前账号' },
  'dnd-current-campaign': { folderId: 'session', kind: 'text', label: '当前团组' },
  'dnd-legacy-migrated-default': { folderId: 'system', kind: 'flag', label: '旧键迁移标记' },
  'dnd-npc-templates-seeded-v2': { folderId: 'system', kind: 'flag', label: '怪物图鉴种子标记' },
  'dnd-npc-templates-cloud-seeded': { folderId: 'system', kind: 'flag', label: '怪物图鉴云端种子标记' },
};

// 旧版草稿/已发布双键已并入 dnd-flows 镜像，本页不再展示这两项
const LEGACY_EXCLUDED_KEYS = new Set(['dnd-flow-drafts', 'dnd-flow-published']);

/** 拆出团组前缀：`dnd-{团组id}:{base}` */
function splitScopedKey(key: string): { campaignId: string | null; base: string } {
  const m = /^dnd-([^:]+):(.+)$/.exec(key);
  if (m) return { campaignId: m[1], base: m[2] };
  return { campaignId: null, base: key };
}

function fallbackRule(base: string): KeyRule {
  if (base.includes('flow')) {
    return { folderId: 'flows', kind: 'unknown', label: base };
  }
  return { folderId: 'other', kind: 'unknown', label: base };
}

export function buildStorageFile(key: string, raw: string): StorageFile {
  const { campaignId, base } = splitScopedKey(key);
  const rule = BASE_RULES[base] ?? fallbackRule(base);
  let value: any = raw;
  let parseError = false;
  try {
    value = JSON.parse(raw);
  } catch {
    // 纯文本键（主题、令牌）存的是裸字符串，按文本展示而非报错
    parseError = rule.kind !== 'text';
  }
  let itemCount = 0;
  if (!parseError) {
    if (ARRAY_KINDS.has(rule.kind)) {
      itemCount = Array.isArray(value) ? value.length : value && typeof value === 'object' ? 1 : 0;
    } else if (Array.isArray(value)) {
      itemCount = value.length;
    } else if (value && typeof value === 'object') {
      itemCount = Object.keys(value).length;
    }
  }
  return {
    key,
    campaignId,
    folderId: rule.folderId,
    kind: rule.kind,
    label: rule.label,
    raw,
    size: new Blob([raw]).size,
    value,
    parseError,
    itemCount,
  };
}

export function readStorageFiles(): StorageFile[] {
  const files: StorageFile[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || LEGACY_EXCLUDED_KEYS.has(key)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      files.push(buildStorageFile(key, raw));
    }
  } catch {
    // localStorage 不可用（隐私模式）时返回空列表
  }
  return files.sort((a, b) => {
    const fa = STORAGE_FOLDERS.findIndex((f) => f.id === a.folderId);
    const fb = STORAGE_FOLDERS.findIndex((f) => f.id === b.folderId);
    if (fa !== fb) return fa - fb;
    return a.label.localeCompare(b.label, 'zh-Hans-CN');
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatTimestamp(ts: unknown): string {
  const n = typeof ts === 'number' ? ts : Number(ts);
  if (!n || Number.isNaN(n)) return '—';
  try {
    return new Date(n).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return String(ts);
  }
}

export function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  let cur = obj;
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (seg === 'length') {
      cur = typeof cur?.length === 'number' ? cur.length : undefined;
      continue;
    }
    cur = cur[seg];
  }
  return cur;
}

export interface TableColumn {
  label: string;
  path: string;
  align?: 'left' | 'right';
}

/** 各类文件的表格列：与类型定义对齐，打开即为该文件的「特定格式」 */
export const TABLE_COLUMNS: Partial<Record<StorageFileKind, TableColumn[]>> = {
  character: [
    { label: '名称', path: 'name' },
    { label: '职业', path: 'profession.class' },
    { label: '等级', path: 'level', align: 'right' },
    { label: '种族', path: 'race' },
    { label: 'HP', path: 'maxHp', align: 'right' },
    { label: 'AC', path: 'armorClass', align: 'right' },
    { label: '更新', path: 'updatedAt' },
  ],
  'character-backup': [
    { label: '备份时间', path: 'timestamp' },
    { label: '角色数', path: 'data.length', align: 'right' },
  ],
  equipment: [
    { label: '名称', path: 'name' },
    { label: '分类', path: 'category' },
    { label: '子分类', path: 'subtype' },
    { label: '伤害', path: 'damageDice' },
    { label: '重量', path: 'weight', align: 'right' },
    { label: '价格', path: 'price.amount', align: 'right' },
    { label: '单位', path: 'price.unit' },
  ],
  spell: [
    { label: '名称', path: 'name' },
    { label: '环阶', path: 'level', align: 'right' },
    { label: '学派', path: 'school' },
    { label: '施法时间', path: 'castingTime' },
    { label: '射程', path: 'range' },
    { label: '持续时间', path: 'duration' },
  ],
  option: [
    { label: '名称', path: 'name' },
    { label: '分类', path: 'category' },
    { label: '父项', path: 'parentName' },
    { label: '来源', path: 'source' },
    { label: '更新', path: 'updatedAt' },
  ],
  monster: [
    { label: '名称', path: 'name' },
    { label: 'CR', path: 'cr' },
    { label: '种类', path: 'creatureType' },
    { label: 'AC', path: 'ac', align: 'right' },
    { label: 'HP', path: 'maxHp', align: 'right' },
    { label: '更新', path: 'updatedAt' },
  ],
  combat: [
    { label: '标题', path: 'title' },
    { label: '模式', path: 'mode' },
    { label: '参战者', path: 'combatants.length', align: 'right' },
    { label: '回合', path: 'rounds.length', align: 'right' },
    { label: '已结算', path: 'settledAt' },
    { label: '更新', path: 'updatedAt' },
  ],
  battleground: [
    { label: '战斗 ID', path: 'sessionId' },
    { label: '尺寸', path: 'size' },
    { label: '棋子', path: 'tokens.length', align: 'right' },
    { label: '物品', path: 'itemTokens.length', align: 'right' },
    { label: '地形', path: 'zones.length', align: 'right' },
    { label: '更新', path: 'updatedAt' },
  ],
  treasure: [
    { label: '标题', path: 'title' },
    { label: '物品', path: 'items.length', align: 'right' },
    { label: '经验', path: 'experience', align: 'right' },
    { label: '金币', path: 'currency.gp', align: 'right' },
    { label: '更新', path: 'updatedAt' },
  ],
  'treasure-distribution': [
    { label: '宝藏', path: 'treasureId' },
    { label: '角色', path: 'characterName' },
    { label: '物品', path: 'items.length', align: 'right' },
    { label: '经验', path: 'experience', align: 'right' },
    { label: '分配时间', path: 'distributedAt' },
  ],
  flow: [
    { label: '名称', path: 'name' },
    { label: '分类', path: 'category' },
    { label: '节点', path: 'nodes.length', align: 'right' },
    { label: '连线', path: 'edges.length', align: 'right' },
    { label: '发布版本', path: 'publishedVersion', align: 'right' },
    { label: '更新', path: 'updatedAt' },
  ],
  binding: [
    { label: '法术 ID', path: 'spell_id' },
    { label: '流程 ID', path: 'flow_id' },
    { label: '创建', path: 'created_at' },
    { label: '更新', path: 'updated_at' },
  ],
  viewport: [
    { label: '流程 ID', path: 'id' },
    { label: '缩放', path: 'scale', align: 'right' },
    { label: '左面板', path: 'showLeftPanel' },
    { label: '右面板', path: 'showRightPanel' },
    { label: '快照时间', path: 'timestamp' },
  ],
  status: [
    { label: '名称', path: 'name' },
    { label: 'ID', path: 'id' },
    { label: '类型', path: 'type' },
  ],
};

/** 视图快照以「流程 ID 为键的对象」存储，转成数组后才可表格化 */
export function normalizeForTable(kind: StorageFileKind, value: any): any[] {
  if (kind === 'viewport') {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).map(([id, snap]: [string, any]) => ({ id, ...(snap ?? {}) }));
  }
  if (kind === 'hooked-combat') {
    return value && typeof value === 'object' ? [value] : [];
  }
  return Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
}

