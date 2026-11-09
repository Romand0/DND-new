// DM Toolkit - Character State Management (Backend API + localStorage cache)
// ============================================================
import type {
  Character,
  Attack,
  Equipment,
  Feature,
  SpellSlotLevel,
  SpellSlots,
  ProficiencyCategory,
  SkillKey,
  AbilityKey,
  Currency,
} from '@/types/character';
import { scopedKey } from '@/data/campaignScope';
import { globalStatusManager } from './statusManager';
import { getAvailableSubclasses, canChooseSubclass, getSubclassDisplayName } from './subclasses';
import * as api from '@/lib/api';
import { wearEquipment, unwearEquipment } from './equipmentWear';
import { equipmentStore } from './equipmentStore';
import { computeAbilityBreakdown } from './abilityBonus';

// 从 localStorage 读取 auth_token，构造带 JWT 的 headers
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const storageKey = () => scopedKey('DND');
const BACKUP_KEY = 'dm-characters-backup';
const BACKUP_INTERVAL = 30000;

// 进程内缓存：避免每次读都全量 parse localStorage。
// 所有写操作都必须经过 saveStore()/saveCharacter()，否则缓存不会失效。
let charactersCache: Character[] | null = null;



// 跨标签页一致性：其它标签页写入 localStorage 后，让本页缓存失效
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey()) charactersCache = null;
  });
}

// ============================================================
// 存储层
// ============================================================

function migrateCharacter(char: any): Character {
  // 迁移：将 class / subclass 统一为 profession 结构，并保证 profession 一定存在。
  // 旧数据可能既没有 profession 也没有 class（部分后端返回），此时必须兜底为空对象，
  // 否则渲染层读取 character.profession.class 会抛 "Cannot read properties of undefined"。
  if (!char.profession || typeof char.profession !== 'object') {
    char.profession = {
      class: char.class || '',
      subclass: char.subclass || undefined,
    };
  } else {
    if (char.profession.class === undefined) {
      char.profession.class = char.class || '';
    }
    if (char.profession.subclass === undefined && char.subclass) {
      char.profession.subclass = char.subclass;
    }
  }
  delete char.class;
  delete char.subclass;
  
  if (char.attacks && Array.isArray(char.attacks)) {
    char.attacks = char.attacks.map((attack: any) => ({
      id: attack.id,
      name: attack.name || '',
      attackBonus: attack.attackBonus !== undefined ? attack.attackBonus : (attack.bonus || ''),
      damage: attack.damage || '',
      damageType: attack.damageType !== undefined ? attack.damageType : (attack.type || ''),
      range: attack.range || '',
      properties: attack.properties || [],
      subtype: attack.subtype,
      normalRange: attack.normalRange,
      maxRange: attack.maxRange,
      twoHandedDamage: attack.twoHandedDamage,
    }));
  }
  // 迁移：为缺少 childId 的装备生成唯一实例 ID
  if (char.equipment && Array.isArray(char.equipment)) {
    char.equipment = char.equipment.map((eq: any) => {
      if (!eq.childId) {
        eq.childId = (char.id || 'char') + '-' + generateId();
      }
      if (!eq.id && eq.childId) {
        eq.id = eq.childId;
      }
      return eq;
    });
  }
  // 迁移：手持槽 → 备战槽（手持只在战斗中有意义，角色卡只保留「进战斗自动拿起」的备战数据）
  // 旧数据三条路径：heldLeftId/heldRightId 字符串（更早格式）→ heldLeft/heldRight HandSlot → readiedLeft/readiedRight
  if (char.readiedLeft === undefined || char.readiedRight === undefined) {
    const legacyLeft = (char.heldLeftId as string | null)
      ?? (char.heldLeft && typeof char.heldLeft === 'object' ? (char.heldLeft as any).equipmentId : null);
    const legacyRight = (char.heldRightId as string | null)
      ?? (char.heldRight && typeof char.heldRight === 'object' ? (char.heldRight as any).equipmentId : null);
    char.readiedLeft = legacyLeft ?? null;
    char.readiedRight = legacyRight ?? null;
  }
  delete char.heldLeft;
  delete char.heldRight;
  delete char.heldLeftId;
  delete char.heldRightId;
  // 迁移：statuses（持久状态源）非数组时兜底 undefined，防止旧/异常数据污染
  if (char.statuses !== undefined && !Array.isArray(char.statuses)) {
    char.statuses = undefined;
  }
  return char as Character;
}

/**
 * 对外暴露的数据规范化入口：把后端 / 旧格式对象补全成符合 Character 结构的对象。
 * 用于绕过 store 的路径（如玩家端直接把 API 原始数据传给组件）。
 */
export function normalizeCharacter(char: any): Character {
  return migrateCharacter(char);
}

function migrateStore(chars: any[]): Character[] {
  let migrated = false;
  const result = chars.map((char) => {
    const hasOldAttackFields = char.attacks?.some((a: any) => 
      'bonus' in a || 'type' in a
    );
    const missingNewAttackFields = char.attacks?.some((a: any) =>
      !('attackBonus' in a) || !('damageType' in a) || !('range' in a) || !('properties' in a)
    );
    const missingChildId = char.equipment?.some((eq: any) => !eq.childId);
    const missingReadiedSlots = char.readiedLeft === undefined || char.readiedRight === undefined;
    // profession 缺失或结构不对也必须迁移（旧数据可能只有 class 字段）
    const invalidProfession = !char.profession || typeof char.profession !== 'object' || typeof char.profession.class !== 'string';
    if (hasOldAttackFields || missingNewAttackFields || missingReadiedSlots || missingChildId || invalidProfession) {
      migrated = true;
      return migrateCharacter(char);
    }
    return char as Character;
  });
  if (migrated) {
    saveStore(result);
  }
  return result;
}

function getStore(): Character[] {
  if (charactersCache) return charactersCache;
  try {
    const data = localStorage.getItem(storageKey());
    const chars = data ? JSON.parse(data) : [];
    return migrateStore(chars);
  } catch {
    return [];
  }
}

function saveStore(store: Character[]): void {
  charactersCache = store;
  localStorage.setItem(storageKey(), JSON.stringify(store));
  scheduleBackup();
}

function getAllCharacters(): Character[] {
  return getStore();
}

/** 可见角色列表：过滤试验场影子卡（影子卡仅通过 characterId 被战斗链路引用） */
function getAllVisibleCharacters(): Character[] {
  return getStore().filter(c => !c.isSandbox);
}

/**
 * 创建试验场影子角色卡：仅写本地（不同步云端），带 isSandbox 标记。
 * 影子卡使试验场人偶复用完整 PC 装备/法术派生链路。
 */
function createSandboxCharacter(data: Partial<Character>): Character {
  const chars = getStore();
  const now = Date.now();
  const char: Character = {
    id: crypto.randomUUID(),
    name: data.name ?? '试验体',
    gender: data.gender ?? '',
    profession: data.profession ?? { class: '' },
    level: data.level ?? 1,
    proficiencyBonus: data.proficiencyBonus ?? 2,
    race: data.race ?? '',
    background: data.background ?? '',
    alignment: data.alignment ?? '',
    experience: data.experience ?? 0,
    size: data.size ?? '中',
    passivePerception: data.passivePerception ?? 10,
    hitDice: data.hitDice ?? { type: 'd8', total: 1, used: 0 },
    currency: data.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    skills: data.skills ?? {
      acrobatics: { proficient: false, extra: 0 },
      animalHandling: { proficient: false, extra: 0 },
      arcana: { proficient: false, extra: 0 },
      athletics: { proficient: false, extra: 0 },
      deception: { proficient: false, extra: 0 },
      history: { proficient: false, extra: 0 },
      insight: { proficient: false, extra: 0 },
      intimidation: { proficient: false, extra: 0 },
      investigation: { proficient: false, extra: 0 },
      medicine: { proficient: false, extra: 0 },
      nature: { proficient: false, extra: 0 },
      perception: { proficient: false, extra: 0 },
      performance: { proficient: false, extra: 0 },
      persuasion: { proficient: false, extra: 0 },
      religion: { proficient: false, extra: 0 },
      sleightOfHand: { proficient: false, extra: 0 },
      stealth: { proficient: false, extra: 0 },
      survival: { proficient: false, extra: 0 },
    },
    proficiencies: data.proficiencies ?? {
      armor: [],
      weapons: [],
      tools: [],
      languages: [],
      savingThrows: [],
    },
    abilities: data.abilities ?? {
      strength: { score: 10, modifier: 0 },
      dexterity: { score: 10, modifier: 0 },
      constitution: { score: 10, modifier: 0 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 10, modifier: 0 },
      charisma: { score: 10, modifier: 0 },
    },
    // 初始属性值基线：仅 DM 在弹窗中显式设置后才有值；老数据留空，避免把当前值误冻结为"初始"
    baseAbilities: data.baseAbilities,
    // 特性属性加值的任选结果：直通（undefined 合法，规则未完成时不计入最终值）
    abilityBonusChoices: data.abilityBonusChoices,
    // 特性熟练项的任选结果：同上，直通
    proficiencyChoices: data.proficiencyChoices,
    // 手动来源标记（旧数据补充）：直通
    proficiencySourceMarks: data.proficiencySourceMarks,
    maxHp: data.maxHp ?? 20,
    currentHp: data.currentHp ?? 20,
    tempHp: data.tempHp ?? 0,
    armorClass: data.armorClass ?? 10,
    speed: data.speed ?? 30,
    equipment: data.equipment ?? [],
    attacks: data.attacks ?? [],
    spells: data.spells ?? {
      cantrips: [],
      custom: [],
      spellSlots: {
        level1: { max: 0, used: 0 },
        level2: { max: 0, used: 0 },
        level3: { max: 0, used: 0 },
        level4: { max: 0, used: 0 },
        level5: { max: 0, used: 0 },
        level6: { max: 0, used: 0 },
        level7: { max: 0, used: 0 },
        level8: { max: 0, used: 0 },
        level9: { max: 0, used: 0 },
      },
    },
    features: data.features ?? [],
    appearance: data.appearance ?? '',
    personality: data.personality ?? '',
    ideals: data.ideals ?? '',
    bonds: data.bonds ?? '',
    flaws: data.flaws ?? '',
    wornArmorId: data.wornArmorId ?? null,
    wornOutfitId: data.wornOutfitId ?? null,
    readiedLeft: data.readiedLeft ?? null,
    readiedRight: data.readiedRight ?? null,
    ...(data as Partial<Character>),
    // isSandbox 强制为 true（不可被 data 覆盖）
    isSandbox: true,
  };
  recalculateArmorClass(char);
  chars.push(char);
  saveStore(chars);
  return char;
}

function getCharacter(charId: string): Character | null {
  const chars = getStore();
  const found = chars.find((c) => c.id === charId) || null;
  if (!found) return null;
  // 浅拷贝：防止调用方 mutate 污染内存缓存（原实现每次 parse 天然隔离）
  return { ...found, equipment: [...(found.equipment ?? [])], attacks: [...(found.attacks ?? [])] };
}

function saveCharacter(charData: Character): Character {
  const chars = getStore();
  const index = chars.findIndex((c) => c.id === charData.id);
  const now = Date.now();
  const charWithTimestamps = { ...charData, updatedAt: now };

    if (index === -1) {
    charWithTimestamps.createdAt = now;
    // 新增：先算 AC，再 push（同一个引用，顺序无所谓但统一风格）
    recalculateArmorClass(charWithTimestamps);
    chars.push(charWithTimestamps);
  } else {
    // 先算 AC，再 spread 进数组
    recalculateArmorClass(charWithTimestamps);
    chars[index] = { ...chars[index], ...charWithTimestamps };
  }
  
  saveStore(chars);
  // 试验场影子卡仅存本地：任何写路径（装备/HP 变更等）都禁止把影子卡推上云端，
  // 否则云端拉回的影子卡会混进角色列表（历史脏数据可能缺 isSandbox 标记）
  if (charWithTimestamps.isSandbox) {
    return charWithTimestamps;
  }
  syncCharacterToBackend(charWithTimestamps).catch((err) => {
    console.error('[characterStore] 同步到后端失败:', err);
  });
  return charWithTimestamps;
}

// ============================================================
// 后端 API 同步（单个角色 CRUD）
// ============================================================

// 同步单个角色到后端
async function syncCharacterToBackend(char: Character): Promise<void> {
  const headers = getAuthHeaders();
  if (!headers['Authorization']) {
    // 未登录，跳过后台同步，数据保留在 localStorage
    return;
  }
  try {
    await api.apiFetch(`/characters/${char.id}`, {
      method: 'PUT',
      body: JSON.stringify(char),
      headers,
    });
  } catch (err: any) {
    // 仅当角色不存在（404）时才 POST 创建，避免网络错误导致重复创建
    if (err?.message?.includes('404') || err?.message?.includes('不存在')) {
      await api.apiFetch('/characters', {
        method: 'POST',
        body: JSON.stringify(char),
        headers,
      });
    } else {
      throw err;
    }
  }
}

// 从后端加载所有角色
async function loadAllFromBackend(): Promise<Character[]> {
  if (!api.hasToken()) {
    return [];
  }
  return await api.fetchAllCharacters<Character[]>();
}

// 从后端加载所有角色并替换本地缓存（不触发反向同步）
async function replaceAllFromBackend(): Promise<Character[]> {
  const chars = await loadAllFromBackend();
  // 云端不该存在影子卡：过滤显式标记，并按「试验体·」名字前缀兜底
  // （历史版本可能把缺标记的影子卡推上云，拉回后会在角色列表露出）
  const migrated = chars
    .map((c: any) => migrateCharacter(c))
    .filter((c: any) => !c.isSandbox && !String(c.name || '').startsWith('试验体·'));
  // 保留本地试验场影子卡（云端不存在，全量替换会把它们洗掉导致人偶装备派生失效）
  const localSandbox = getStore().filter(c => c.isSandbox);
  const merged = [...migrated, ...localSandbox.filter(s => !migrated.some(m => m.id === s.id))];
  // 直接写入 localStorage 并更新缓存，不触发 syncCharacterToBackend
  charactersCache = merged;
  localStorage.setItem(storageKey(), JSON.stringify(merged));
  scheduleBackup();
  return migrated;
}

// ============================================================
// 自动备份
// ============================================================

let backupTimer: number | null = null;

function scheduleBackup(): void {
  if (backupTimer) {
    clearTimeout(backupTimer);
  }
  backupTimer = window.setTimeout(() => {
    createBackup();
  }, BACKUP_INTERVAL);
}

function createBackup(): void {
  try {
    const data = localStorage.getItem(storageKey());
    if (data) {
      const backup = {
        timestamp: Date.now(),
        data: JSON.parse(data),
      };
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    }
  } catch {
    // ignore
  }
}

function getBackup(): { timestamp: number; data: Character[] } | null {
  try {
    const data = localStorage.getItem(BACKUP_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function restoreFromBackup(): Character[] {
  const backup = getBackup();
  if (backup) {
    saveStore(backup.data);
    return backup.data;
  }
  return [];
}

// ============================================================
// 工具函数
// ============================================================

// ============ 货币换算工具 ============
// 物品价格转铜币（D&D 5e 标准：1pp=1000cp, 1gp=5ep=10sp=100cp）
function priceToCopper(price: { amount: number; unit: 'pp' | 'gp' | 'ep' | 'sp' | 'cp' }): number {
  if (!price) return 0;
  const { amount = 0, unit = 'gp' } = price;
  const floored = Math.floor(amount);
  if (unit === 'pp') return floored * 1000;
  if (unit === 'gp') return floored * 100;
  if (unit === 'ep') return floored * 20;
  if (unit === 'sp') return floored * 10;
  return floored;
}

// 计算单件装备价值（向下取整）
function getEquipmentValue(item: Equipment): number {
  if (!item.price) return 0;
  return Math.floor(priceToCopper(item.price) * (item.quantity || 1));
}

// 换算基准：1gp = 5ep = 10sp = 100cp
// 铂金币（pp）不参与换算：与 gp/ep/sp/cp 并行存在，交易时只动 gp/ep/sp/cp

// 货币转铜币总数（仅 gp/ep/sp/cp 参与，pp 不计入）
function currencyToCopper(c: Currency): number {
  return Math.floor(c.cp || 0) + Math.floor(c.sp || 0) * 10 + Math.floor(c.ep || 0) * 20 + Math.floor(c.gp || 0) * 100;
}

// 铜币总数按「gp 优先、ep 次之、sp 再次、cp 兜底」规范化拆分，不主动产生 pp
// 满足：ep ≤ 4, sp ≤ 9, cp ≤ 9
// 注意：返回的 pp 字段为 0，调用方若需保留原 pp 请自行合并
function copperToCurrency(totalCp: number): Currency {
  totalCp = Math.floor(totalCp);
  if (totalCp < 0) totalCp = 0;
  const gp = Math.floor(totalCp / 100);
  totalCp -= gp * 100;
  const ep = Math.floor(totalCp / 20);
  totalCp -= ep * 20;
  const sp = Math.floor(totalCp / 10);
  totalCp -= sp * 10;
  const cp = totalCp;
  return { pp: 0, gp, ep, sp, cp };
}

// 判断货币是否足以支付指定铜币数（仅看 gp/ep/sp/cp，pp 不参与担负判断）
function canAfford(c: Currency, totalCp: number): boolean {
  return currencyToCopper(c) >= Math.floor(totalCp);
}

// 扣款：从 gp/ep/sp/cp 中扣除，pp 保持不变；不足时原样返回
function deductCurrency(c: Currency, totalCp: number): Currency {
  const remain = currencyToCopper(c) - Math.floor(totalCp);
  if (remain < 0) return { ...c };
  // 只规范化 gp/ep/sp/cp，pp 保留原值
  return { ...copperToCurrency(remain), pp: c.pp || 0 };
}

// ============ 背包重量/价值工具 ============

// 计算单件装备重量：packSize 存在时按个体折算，否则 weight 视为单件重
function getEquipmentWeight(item: Equipment): number {
  const w = item.weight || 0;
  const q = item.quantity || 1;
  if (item.packSize && item.packSize > 0) {
    return (w / item.packSize) * q;
  }
  return w * q;
}

// 计算背包总重量
function getTotalWeight(char: Character): number {
  return (char.equipment || []).reduce((sum, item) => sum + getEquipmentWeight(item), 0);
}

// 计算单件装备价值（铜币），按数量计
function getEquipmentValueCopper(item: Equipment): number {
  if (!item.price) return 0;
  return priceToCopper(item.price) * (item.quantity || 1);
}

// 计算背包总价值（铜币）
function getTotalValueCopper(char: Character): number {
  return (char.equipment || []).reduce((sum, item) => sum + getEquipmentValueCopper(item), 0);
}

function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);
}

function generateFileName(char: Character): string {
  const safeName = char.name.replace(/[<>:"/\\|?*]/g, '_');
  return `${safeName}-${char.id.slice(0, 8)}.json`;
}

function createBlankCharacter(name?: string): Character {
  return {
    id: generateId(),
    name: name || '新角色',
    gender: '',
    profession: {
      class: '',
      subclass: undefined,
    },
    level: 1,
    race: '',
    background: '',
    alignment: '',
    experience: 0,
    size: '中型',
    
    abilities: {
      strength: { score: 10, modifier: 0 },
      dexterity: { score: 10, modifier: 0 },
      constitution: { score: 10, modifier: 0 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 10, modifier: 0 },
      charisma: { score: 10, modifier: 0 },
    },

    proficiencyBonus: 2,
    passivePerception: 10,
    armorClass: 10,
    speed: 30,
    maxHp: 10,
    currentHp: 10,
    tempHp: 0,
    hitDice: { type: 'd8', total: 1, used: 0 },
    
    attacks: [],
    spells: {
      cantrips: [],
      spellSlots: {
        level1: { max: 0, used: 0 },
        level2: { max: 0, used: 0 },
        level3: { max: 0, used: 0 },
        level4: { max: 0, used: 0 },
        level5: { max: 0, used: 0 },
        level6: { max: 0, used: 0 },
        level7: { max: 0, used: 0 },
        level8: { max: 0, used: 0 },
        level9: { max: 0, used: 0 },
      },
      custom: [],
    },
    
    equipment: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    
    skills: {
      acrobatics: { proficient: false, extra: 0 },
      animalHandling: { proficient: false, extra: 0 },
      arcana: { proficient: false, extra: 0 },
      athletics: { proficient: false, extra: 0 },
      deception: { proficient: false, extra: 0 },
      history: { proficient: false, extra: 0 },
      insight: { proficient: false, extra: 0 },
      intimidation: { proficient: false, extra: 0 },
      investigation: { proficient: false, extra: 0 },
      medicine: { proficient: false, extra: 0 },
      nature: { proficient: false, extra: 0 },
      perception: { proficient: false, extra: 0 },
      performance: { proficient: false, extra: 0 },
      persuasion: { proficient: false, extra: 0 },
      religion: { proficient: false, extra: 0 },
      sleightOfHand: { proficient: false, extra: 0 },
      stealth: { proficient: false, extra: 0 },
      survival: { proficient: false, extra: 0 },
    },
    
    proficiencies: {
      armor: [],
      weapons: [],
      tools: [],
      languages: [],
      savingThrows: [],
    },
    
    features: [],
    
    appearance: '',
    personality: '',
    ideals: '',
    bonds: '',
    flaws: '',
    
    wornArmorId: null,
    wornOutfitId: null,
    readiedLeft: null,
    readiedRight: null,

    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================
// 角色卡库 - CRUD
// ============================================================

function addCharacter(characterData: Partial<Character>): Character {
  const newChar: Character = {
    ...createBlankCharacter(),
    ...characterData,
    id: generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return saveCharacter(newChar);
}

function deleteCharacter(charId: string): void {
  const chars = getStore().filter((c) => c.id !== charId);
  saveStore(chars);
  const token = localStorage.getItem('auth_token');
  if (token) {
    api.apiFetch(`/characters/${charId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }).catch(() => {});
  }
}


function updateCharacter(charId: string, updatedData: Partial<Character>): Character | null {
  const char = getCharacter(charId);
  if (!char) return null;
  const updated = { ...char, ...updatedData, updatedAt: Date.now() };
  return saveCharacter(updated);
}

/**
 * 持久状态源操作：结束/移除一条状态实例。
 * - 'end'：标记 isActive=false 并保留条目（历史记录）
 * - 'remove'：整条移除
 * 同步把内存 globalStatusManager 中同 instanceId 的实例 declareEnd（若存在），
 * 保证「角色卡持久源」与「内存运行时」一致。
 */
function updateCharacterStatus(charId: string, instanceId: string, action: 'end' | 'remove'): Character | null {
  const char = getCharacter(charId);
  if (!char || !Array.isArray(char.statuses)) return null;
  const next = char.statuses
    .map(s => (s.instanceId === instanceId && action === 'end' ? { ...s, isActive: false, declaredEndAt: Date.now() } : s))
    .filter(s => !(s.instanceId === instanceId && action === 'remove'));
  const updated = { ...char, statuses: next, updatedAt: Date.now() };
  // declareEnd 对不存在/已结束的 ID 是安全 no-op，直接调用保证内存运行时同步
  globalStatusManager.declareEnd(instanceId);
  return saveCharacter(updated);
}

// ============================================================
// 角色卡导入/导出 (Import / Export)
// ============================================================

// ---------- 单张导出 ----------
function exportSingleCharacter(charId: string): void {
  const char = getCharacter(charId);
  if (!char) {
    console.warn('角色不存在:', charId);
    return;
  }
  const json = JSON.stringify(char, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = generateFileName(char);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ---------- 批量导出（全部） ----------
function exportAllCharacters(): void {
  const chars = getAllCharacters();
  if (chars.length === 0) {
    alert('没有角色卡可导出');
    return;
  }
  chars.forEach((char) => {
    exportSingleCharacter(char.id);
  });
}

// ---------- 批量导出（选中） ----------
function exportSelectedCharacters(charIds: string[]): void {
  if (!charIds || charIds.length === 0) {
    alert('请选择要导出的角色卡');
    return;
  }
  charIds.forEach((id) => {
    const char = getCharacter(id);
    if (char) {
      exportSingleCharacter(id);
    } else {
      console.warn('角色不存在，跳过:', id);
    }
  });
}

// ---------- 单张导入 ----------
function importSingleCharacter(file: File): Promise<Character> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.id || !data.name) {
          reject(new Error('无效的角色卡文件：缺少 id 或 name'));
          return;
        }
        const fullChar = { ...createBlankCharacter(), ...data } as Character;
        saveCharacter(fullChar);
        resolve(fullChar);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = function () {
      reject(new Error('读取文件失败'));
    };
    reader.readAsText(file);
  });
}

// ---------- 批量导入（多文件） ----------
function importMultipleCharacters(files: FileList | File[]): Promise<Character[]> {
  const fileArray = Array.from(files).filter((f) => f.name.endsWith('.json'));
  if (fileArray.length === 0) {
    alert('没有找到 JSON 文件');
    return Promise.resolve([]);
  }
  const promises = fileArray.map((file) => importSingleCharacter(file));
  return Promise.all(promises)
    .then((results) => {
      console.log(`成功导入 ${results.length} 张角色卡`);
      return results;
    })
    .catch((err) => {
      console.error('导入失败:', err);
      alert('部分文件导入失败，请检查文件格式');
      return [];
    });
}

// ---------- 导出交互辅助（供 UI 调用） ----------
function createImportDialog(accept = '.json', multiple = true): Promise<Character[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    document.body.appendChild(input);
    input.onchange = function (e) {
      const files = (e.target as HTMLInputElement).files;
      document.body.removeChild(input);
      if (!files || files.length === 0) {
        resolve([]);
        return;
      }
      importMultipleCharacters(files).then((results) => {
        resolve(results);
      });
      input.value = '';
    };
    input.click();
  });
}

// ---------- 导出全部确认（防误触） ----------
function exportAllWithConfirm(): void {
  const chars = getAllCharacters();
  if (chars.length === 0) {
    alert('没有角色卡可导出');
    return;
  }
  if (confirm(`确定要导出全部 ${chars.length} 张角色卡吗？\n（每张卡将作为一个独立的 .json 文件下载）`)) {
    exportAllCharacters();
  }
}

// ============================================================
// 子项 CRUD (攻击、装备、特性等)
// ============================================================

// ---------- 攻击 (Attacks) ----------
function addAttack(charId: string, attackData: Partial<Attack>): Attack | null {
  const char = getCharacter(charId);
  if (!char) return null;
  const newAttack: Attack = { id: generateId(), name: '', attackBonus: '', damage: '', damageType: '', range: '', properties: [], ...attackData };
  char.attacks.push(newAttack);
  saveCharacter(char as Character);
  return newAttack;
}

function updateAttack(charId: string, attackId: string, updatedData: Partial<Attack>): Attack | null {
  const char = getCharacter(charId);
  if (!char) return null;
  const index = char.attacks.findIndex((a) => a.id === attackId);
  if (index === -1) return null;
  char.attacks[index] = { ...char.attacks[index], ...updatedData };
  saveCharacter(char as Character);
  return char.attacks[index];
}

function deleteAttack(charId: string, attackId: string): void {
  const char = getCharacter(charId);
  if (!char) return;
  char.attacks = char.attacks.filter((a) => a.id !== attackId);
  saveCharacter(char as Character);
}

// ---------- 装备 (Equipment) ----------
function addEquipment(charId: string, equipData: Partial<Equipment>): Equipment | null {
  const char = getCharacter(charId);
  if (!char) return null;
  // 防御：防止编辑器透传的 childId(undefined) 覆盖
  const safeData: Partial<Equipment> = { ...equipData };
  delete (safeData as any).childId;

  // 必填字段兜底：防止空 name / 空 category / 无效 quantity
  if (typeof safeData.name !== 'string' || safeData.name.trim() === '') {
    safeData.name = '未命名物品';
  }
  if (typeof safeData.category !== 'string' || safeData.category.trim() === '') {
    safeData.category = '杂项';
  }
  if (typeof safeData.quantity !== 'number' || isNaN(safeData.quantity) || safeData.quantity <= 0) {
    safeData.quantity =
      typeof safeData.packSize === 'number' && safeData.packSize > 0
        ? safeData.packSize
        : 1;
  }

  // 生成子ID：角色ID + 随机后缀
  const childId = charId + '-' + generateId();
  const newEquip: Equipment = {
    id: safeData.id || generateId(), // 保留装备库模板ID
    childId, // 新增子ID
    name: safeData.name,
    quantity: safeData.quantity,
    packSize: safeData.packSize,
    unit: safeData.unit,
    category: safeData.category,
    ...safeData,
  };
  // 最终兜底：确保必填字段始终有值（即使 spread 后被意外覆盖）
  if (!newEquip.name) newEquip.name = '未命名物品';
  if (!newEquip.category) newEquip.category = '杂项';
  if (typeof newEquip.quantity !== 'number' || newEquip.quantity <= 0) newEquip.quantity = 1;

  char.equipment.push(newEquip);
  saveCharacter(char as Character);
  return newEquip;
}



function updateEquipment(charId: string, equipId: string, updatedData: Partial<Equipment>): Equipment | null {
  const char = getCharacter(charId);
  if (!char) return null;
  const index = char.equipment.findIndex(
    (e) => e.childId === equipId || e.id === equipId
  );
  if (index === -1) return null;
  char.equipment[index] = { ...char.equipment[index], ...updatedData };
  saveCharacter(char as Character);
  return char.equipment[index];
}


function deleteEquipment(charId: string, equipId: string): void {
  const char = getCharacter(charId);
  if (!char) return;
  // 优先用 childId 匹配，兼容旧数据用 id
  const index = char.equipment.findIndex(
    (e) => e.childId === equipId || e.id === equipId
  );
  if (index === -1) return;
  const removed = char.equipment[index];
  // 如果被删除的装备正穿着，清槽位（同时检查 id 和 childId）
  if (char.wornArmorId === removed.id || char.wornArmorId === removed.childId) {
    char.wornArmorId = null;
  }
  if (char.wornOutfitId === removed.id || char.wornOutfitId === removed.childId) {
    char.wornOutfitId = null;
  }
  // 如果被删除的装备在备战槽，清槽位
  const removedSlotId = removed.childId || removed.id;
  if (char.readiedLeft === removedSlotId) {
    char.readiedLeft = null;
  }
  if (char.readiedRight === removedSlotId) {
    char.readiedRight = null;
  }
  char.equipment.splice(index, 1);
  saveCharacter(char as Character);
}



// ---------- 特性 (Features) ----------
function addFeature(charId: string, featureData: Partial<Feature>): Feature | null {
  const char = getCharacter(charId);
  if (!char) return null;
  const newFeature: Feature = { id: generateId(), name: '', description: '', category: '其他', ...featureData };
  char.features.push(newFeature);
  saveCharacter(char as Character);
  return newFeature;
}

function updateFeature(charId: string, featureId: string, updatedData: Partial<Feature>): Feature | null {
  const char = getCharacter(charId);
  if (!char) return null;
  const index = char.features.findIndex((f) => f.id === featureId);
  if (index === -1) return null;
  char.features[index] = { ...char.features[index], ...updatedData };
  saveCharacter(char as Character);
  return char.features[index];
}

// 特性条目不提供删除：隐藏（localStorage DND-feature-hidden）已覆盖「不展示」诉求，
// 删除会破坏选项链数据完整性；误删/历史删除用 CharacterDetail 的一键补全恢复

// ---------- 戏法 (Cantrips) ----------
function addCantrip(charId: string, cantripName: string): string[] | null {
  const char = getCharacter(charId);
  if (!char) return null;
  char.spells.cantrips.push(cantripName);
  saveCharacter(char as Character);
  return char.spells.cantrips;
}

function removeCantrip(charId: string, index: number): void {
  const char = getCharacter(charId);
  if (!char) return;
  char.spells.cantrips.splice(index, 1);
  saveCharacter(char as Character);
}

// ---------- 自定义法术 (Custom Spells) ----------
function addCustomSpell(charId: string, spellName: string): string[] | null {
  const char = getCharacter(charId);
  if (!char) return null;
  char.spells.custom.push(spellName);
  saveCharacter(char as Character);
  return char.spells.custom;
}

function removeCustomSpell(charId: string, index: number): void {
  const char = getCharacter(charId);
  if (!char) return;
  char.spells.custom.splice(index, 1);
  saveCharacter(char as Character);
}

// ---------- 法术位 (Spell Slots) ----------
function updateSpellSlots(charId: string, levelKey: SpellSlotLevel, slotData: { max?: number; used?: number }): { max: number; used: number } | null {
  const char = getCharacter(charId);
  if (!char) return null;
  if (!char.spells.spellSlots[levelKey]) return null;
  char.spells.spellSlots[levelKey] = { ...char.spells.spellSlots[levelKey], ...slotData };
  saveCharacter(char as Character);
  return char.spells.spellSlots[levelKey];
}

// ---------- 熟练项 (Proficiencies) ----------
function addProficiency(charId: string, category: ProficiencyCategory, item: string): string[] | null {
  const char = getCharacter(charId);
  if (!char) return null;
  if (!char.proficiencies[category]) return null;
  if (!char.proficiencies[category].includes(item)) {
    char.proficiencies[category].push(item);
    saveCharacter(char as Character);
  }
  return char.proficiencies[category];
}

function removeProficiency(charId: string, category: ProficiencyCategory, index: number): void {
  const char = getCharacter(charId);
  if (!char) return;
  if (!char.proficiencies[category]) return;
  char.proficiencies[category].splice(index, 1);
  saveCharacter(char as Character);
}

function updateProficiency(charId: string, category: ProficiencyCategory, index: number, value: string): void {
  const char = getCharacter(charId);
  if (!char) return;
  if (!char.proficiencies[category]) return;
  if (index < 0 || index >= char.proficiencies[category].length) return;
  char.proficiencies[category][index] = value;
  saveCharacter(char as Character);
}

// ---------- 技能 (Skills) ----------
function updateSkill(charId: string, skillKey: SkillKey, updates: Partial<{ proficient: boolean; extra: number }>): { proficient: boolean; extra: number } | null {
  const char = getCharacter(charId);
  if (!char) return null;
  if (!char.skills[skillKey]) return null;
  char.skills[skillKey] = { ...char.skills[skillKey], ...updates };
  saveCharacter(char as Character);
  return char.skills[skillKey];
}

// ============================================================
// 角色卡库 - 计算辅助 (供 UI 调用)
// ============================================================

// 根据属性值计算调整值
function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function calcPassivePerception(char: Character): number {
  const wisMod = char.abilities?.wisdom?.modifier || 0;
  const prof = char.proficiencyBonus || 2;
  const extra = char.skills?.perception?.extra || 0;
  return 10 + wisMod + prof + extra;
}

/** 根据角色当前穿戴状态和敏捷值重新计算护甲等级 */
function recalculateArmorClass(char: Character, combatInventory?: Equipment[]): void {
  if (!char.equipment) char.equipment = [];
  // 战斗场景下使用战斗背包作为查找源（含拾取物），否则用角色源背包
  const source = combatInventory ?? char.equipment;

  // 悬空引用防护：槽位指着的装备已不在背包里，清掉（兼容 childId）
  if (char.wornArmorId && !source.find(e => e.id === char.wornArmorId || e.childId === char.wornArmorId)) {
    char.wornArmorId = null;
  }
  if (char.wornOutfitId && !source.find(e => e.id === char.wornOutfitId || e.childId === char.wornOutfitId)) {
    char.wornOutfitId = null;
  }

  const dexScore = char.abilities?.dexterity?.score ?? 10;
  const dexMod = calcModifier(dexScore);

  if (char.wornArmorId) {
    const armor = source.find(e => e.id === char.wornArmorId || e.childId === char.wornArmorId);
    // 旧背包实例 acBase 为空串（种子补值前从模板加入），按实例 id（=模板 id）回查装备库模板兜底
    const armorAcBase = armor?.acBase || (armor ? equipmentStore.getById(armor.id)?.acBase : '') || '';
    // 魔法护甲加值：存量实例缺字段时同模式回查模板兜底
    const armorMagicBonus = armor?.magicBonus ?? (armor ? equipmentStore.getById(armor.id)?.magicBonus : undefined) ?? 0;
    if (armorAcBase) {
      const baseAc = Number(armorAcBase) + armorMagicBonus;
      const subtype = armor.subtype || '轻甲';
      switch (subtype) {
        case '轻甲':
          char.armorClass = baseAc + dexMod;
          break;
        case '中甲':
          char.armorClass = baseAc + Math.min(dexMod, 2);
          break;
        case '重甲':
          char.armorClass = baseAc;
          break;
        default:
          char.armorClass = baseAc + dexMod;
          break;
      }
    }
  } else {
    // 无护甲或找不到护甲 → 裸体 AC
    char.armorClass = 10 + dexMod;
  }

  // 备战数据代表「进战斗会拿起」，日常状态按未持盾处理（战斗中持盾 +2 在 computeCombatantAc 按参战者手持判定）
}

// ============================================================
// 备战槽管理（角色卡持久备战数据：进战斗时自动拿起）
// 战斗层手持（state 三态、切换）在 combatStore 的参战者上
// ============================================================

/** 判断装备是否为双手武器 */
function isTwoHandedWeapon(item: Equipment): boolean {
  if (!item.properties) return false;
  return item.properties.includes('双手');
}

/** 判断装备可以设入备战槽（已穿戴的盔甲/服装不能备战） */
function canBeReadied(char: Character, item: Equipment): boolean {
  const slotId = item.childId || item.id;
  if (char.wornArmorId === slotId) return false;
  if (char.wornOutfitId === slotId) return false;
  return true;
}

/**
 * 把背包物品设入备战槽（互斥规则：双手武器占两槽、盾牌/单手武器占一手）
 * hand='auto' 时自动选槽：已在某槽 → 补另一手成双手；否则优先右手
 */
function readyItem(
  charId: string,
  equipId: string,
  hand: 'left' | 'right' | 'auto' = 'auto',
): { success: boolean; message: string } {
  const char = getCharacter(charId);
  if (!char) return { success: false, message: '角色不存在' };

  const equip = (char.equipment ?? []).find(e => e.childId === equipId || e.id === equipId);
  if (!equip) return { success: false, message: '装备不存在' };
  if (!canBeReadied(char, equip)) {
    return { success: false, message: '已穿戴的盔甲/服装不能备战' };
  }

  const slotId = equip.childId || equip.id;
  if (!slotId) return { success: false, message: '装备缺少唯一标识' };

  const alreadyInLeft = char.readiedLeft === slotId;
  const alreadyInRight = char.readiedRight === slotId;
  if (alreadyInLeft && alreadyInRight) {
    return { success: true, message: `${equip.name} 已双手备战` };
  }

  if ((alreadyInLeft || alreadyInRight) && hand !== 'auto') {
    const target = hand === 'left' ? char.readiedLeft : char.readiedRight;
    if (target === slotId) {
      return { success: true, message: `${equip.name} 已在${hand === 'left' ? '左手' : '右手'}备战` };
    }
    if (target === null) {
      if (hand === 'left') char.readiedLeft = slotId; else char.readiedRight = slotId;
      saveCharacter(char as Character);
      return { success: true, message: `${equip.name} 已双手备战` };
    }
    return { success: false, message: hand === 'left' ? '左手备战槽已被占用' : '右手备战槽已被占用' };
  }

  if (hand === 'auto') {
    if (alreadyInLeft && char.readiedRight === null) {
      char.readiedRight = slotId;
      saveCharacter(char as Character);
      return { success: true, message: `${equip.name} 已双手备战` };
    }
    if (alreadyInRight && char.readiedLeft === null) {
      char.readiedLeft = slotId;
      saveCharacter(char as Character);
      return { success: true, message: `${equip.name} 已双手备战` };
    }
    if (char.readiedRight === null) {
      char.readiedRight = slotId;
      saveCharacter(char as Character);
      return { success: true, message: `${equip.name} 已备于右手` };
    } else if (char.readiedLeft === null) {
      char.readiedLeft = slotId;
      saveCharacter(char as Character);
      return { success: true, message: `${equip.name} 已备于左手` };
    }
    return { success: false, message: '备战槽已满，请先卸下一件' };
  }

  const target = hand === 'left' ? char.readiedLeft : char.readiedRight;
  if (target !== null) {
    return { success: false, message: hand === 'left' ? '左手备战槽已被占用' : '右手备战槽已被占用' };
  }
  if (hand === 'left') char.readiedLeft = slotId; else char.readiedRight = slotId;
  saveCharacter(char as Character);
  return { success: true, message: `${equip.name} 已备于${hand === 'left' ? '左手' : '右手'}` };
}

/** 卸下备战槽（双手物品两槽同清走 'both'） */
function unreadyItem(
  charId: string,
  hand: 'left' | 'right' | 'both'
): { success: boolean; message: string } {
  const char = getCharacter(charId);
  if (!char) return { success: false, message: '角色不存在' };

  let count = 0;
  if ((hand === 'left' || hand === 'both') && char.readiedLeft) {
    char.readiedLeft = null;
    count++;
  }
  if ((hand === 'right' || hand === 'both') && char.readiedRight) {
    char.readiedRight = null;
    count++;
  }
  if (count === 0) return { success: false, message: '备战槽为空' };
  saveCharacter(char as Character);
  return { success: true, message: `已卸下 ${count} 件备战物品` };
}




// ============================================================
// 技能与豁免 (Skills & Saving Throws)
// ============================================================

const SKILL_GROUP_CONFIG: Record<AbilityKey, { label: string; savingThrow: AbilityKey; skills: SkillKey[] }> = {
  strength: { label: '力量', savingThrow: 'strength', skills: ['athletics'] },
  dexterity: { label: '敏捷', savingThrow: 'dexterity', skills: ['acrobatics', 'sleightOfHand', 'stealth'] },
  constitution: { label: '体质', savingThrow: 'constitution', skills: [] },
  intelligence: { label: '智力', savingThrow: 'intelligence', skills: ['arcana', 'history', 'investigation', 'nature', 'religion'] },
  wisdom: { label: '感知', savingThrow: 'wisdom', skills: ['animalHandling', 'insight', 'medicine', 'perception', 'survival'] },
  charisma: { label: '魅力', savingThrow: 'charisma', skills: ['deception', 'intimidation', 'performance', 'persuasion'] },
};

// 命名导出：proficiencyBonus 模块做中文→技能键反查用（技能表为静态种子，无循环依赖）
export const SKILL_LABELS: Record<SkillKey, string> = {
  athletics: '运动',
  acrobatics: '特技',
  sleightOfHand: '巧手',
  stealth: '隐匿',
  arcana: '奥秘',
  history: '历史',
  investigation: '调查',
  nature: '自然',
  religion: '宗教',
  animalHandling: '驯兽',
  insight: '洞悉',
  medicine: '医疗',
  perception: '察觉',
  survival: '生存',
  deception: '欺瞒',
  intimidation: '威吓',
  performance: '表演',
  persuasion: '说服',
};

const SAVE_LABELS: Record<AbilityKey, string> = {
  strength: '力量豁免',
  dexterity: '敏捷豁免',
  constitution: '体质豁免',
  intelligence: '智力豁免',
  wisdom: '感知豁免',
  charisma: '魅力豁免',
};

const SKILL_TO_ATTRIBUTE: Record<SkillKey, AbilityKey> = {} as Record<SkillKey, AbilityKey>;
for (const [attrKey, config] of Object.entries(SKILL_GROUP_CONFIG)) {
  for (const skillKey of config.skills) {
    SKILL_TO_ATTRIBUTE[skillKey as SkillKey] = attrKey as AbilityKey;
  }
}

function getGroupedSkills(char: Character): {
  attribute: AbilityKey;
  attributeLabel: string;
  save: { key: AbilityKey; label: string; proficient: boolean; expertise: boolean; bonus: number; modifier: number; overridden: boolean };
  skills: { key: SkillKey; label: string; proficient: boolean; expertise: boolean; bonus: number; extra: number }[];
}[] {
  if (!char) return [];
  const result = [];
  const abilityMods: Record<AbilityKey, number> = {
    strength: char.abilities?.strength?.modifier || 0,
    dexterity: char.abilities?.dexterity?.modifier || 0,
    constitution: char.abilities?.constitution?.modifier || 0,
    intelligence: char.abilities?.intelligence?.modifier || 0,
    wisdom: char.abilities?.wisdom?.modifier || 0,
    charisma: char.abilities?.charisma?.modifier || 0,
  };
  const saveProfs = char.proficiencies?.savingThrows || [];
  const saveExpertiseList = char.saveExpertise || [];
  const saveOverrideMap = char.saveBonusOverride || {};
  const skills = char.skills || {};
  const profBonus = char.proficiencyBonus || 2;

  for (const [attrKey, config] of Object.entries(SKILL_GROUP_CONFIG)) {
    const key = attrKey as AbilityKey;
    const saveMod = abilityMods[key] || 0;
    const isSaveProficient = saveProfs.includes(key);
    const isSaveExpertise = saveExpertiseList.includes(key);
    // 专精时熟练加值翻倍
    const saveProfBonus = isSaveProficient ? (isSaveExpertise ? profBonus * 2 : profBonus) : 0;
    const defaultSaveBonus = saveMod + saveProfBonus;
    // 覆盖值优先：未设置（undefined）则用默认计算值
    const overrideVal = saveOverrideMap[key];
    const isOverridden = typeof overrideVal === 'number' && !isNaN(overrideVal);
    const saveBonus = isOverridden ? overrideVal : defaultSaveBonus;

    const skillList = config.skills.map((skillKey) => {
      const skillData = skills[skillKey] || { proficient: false, extra: 0, expertise: false };
      const abilityMod = abilityMods[key] || 0;
      const isExpertise = skillData.expertise || false;
      // 专精时熟练加值翻倍
      const profBonusSkill = skillData.proficient ? (isExpertise ? profBonus * 2 : profBonus) : 0;
      const extra = skillData.extra || 0;
      return {
        key: skillKey,
        label: SKILL_LABELS[skillKey] || skillKey,
        proficient: skillData.proficient || false,
        expertise: isExpertise,
        bonus: abilityMod + profBonusSkill + extra,
        extra: extra,
      };
    });

    result.push({
      attribute: key,
      attributeLabel: config.label,
      save: {
        key: key,
        label: SAVE_LABELS[key] || (key + '豁免'),
        proficient: isSaveProficient,
        expertise: isSaveExpertise,
        bonus: saveBonus,
        modifier: saveMod,
        overridden: isOverridden,
      },
      skills: skillList,
    });
  }
  return result;
}

function getSkillBonus(char: Character, skillKey: SkillKey): number {
  if (!char || !char.skills) return 0;
  const skill = char.skills[skillKey];
  if (!skill) return 0;
  const attrKey = SKILL_TO_ATTRIBUTE[skillKey];
  if (!attrKey) return 0;
  const abilityMod = char.abilities?.[attrKey]?.modifier || 0;
  const profBonus = skill.proficient ? (char.proficiencyBonus || 2) : 0;
  const extra = skill.extra || 0;
  return abilityMod + profBonus + extra;
}

function getSaveBonus(char: Character, saveKey: AbilityKey): number {
  if (!char || !char.abilities) return 0;
  // 覆盖值优先：NPC 个别属性的豁免加值可单独设定
  const override = char.saveBonusOverride?.[saveKey];
  if (typeof override === 'number' && !isNaN(override)) return override;
  // 默认：属性调整值 + 熟练加值
  const abilityMod = char.abilities?.[saveKey]?.modifier || 0;
  const isProficient = char.proficiencies?.savingThrows?.includes(saveKey) || false;
  const isExpertise = char.saveExpertise?.includes(saveKey) || false;
  const profBonus = isProficient ? (isExpertise ? (char.proficiencyBonus || 2) * 2 : (char.proficiencyBonus || 2)) : 0;
  return abilityMod + profBonus;
}

function getAllSkillBonuses(char: Character): { key: SkillKey; label: string; bonus: number; proficient: boolean }[] {
  if (!char) return [];
  return (Object.keys(SKILL_LABELS) as SkillKey[]).map((skillKey) => ({
    key: skillKey,
    label: SKILL_LABELS[skillKey] || skillKey,
    bonus: getSkillBonus(char, skillKey),
    proficient: char.skills?.[skillKey]?.proficient || false,
  }));
}

function getAllSaveBonuses(char: Character): { key: AbilityKey; label: string; bonus: number; proficient: boolean }[] {
  if (!char) return [];
  const saveProfs = char.proficiencies?.savingThrows || [];
  return (Object.keys(SAVE_LABELS) as AbilityKey[]).map((key) => ({
    key: key,
    label: SAVE_LABELS[key],
    bonus: getSaveBonus(char, key),
    proficient: saveProfs.includes(key),
  }));
}

function toggleSkillProficiency(charId: string, skillKey: SkillKey): void {
  const char = getCharacter(charId);
  if (!char || !char.skills) return;
  if (!char.skills[skillKey]) {
    char.skills[skillKey] = { proficient: false, extra: 0, expertise: false };
  }
  char.skills[skillKey].proficient = !char.skills[skillKey].proficient;
  // 取消熟练时也取消专精
  if (!char.skills[skillKey].proficient) {
    char.skills[skillKey].expertise = false;
  }
  saveCharacter(char as Character);
}

function toggleSaveProficiency(charId: string, saveKey: AbilityKey): void {
  const char = getCharacter(charId);
  if (!char) return;
  if (!char.proficiencies) char.proficiencies = { armor: [], weapons: [], tools: [], languages: [], savingThrows: [] };
  if (!char.proficiencies.savingThrows) char.proficiencies.savingThrows = [];
  const index = char.proficiencies.savingThrows.indexOf(saveKey);
  if (index === -1) {
    char.proficiencies.savingThrows.push(saveKey);
  } else {
    char.proficiencies.savingThrows.splice(index, 1);
    // 取消熟练时也取消专精
    if (char.saveExpertise) {
      char.saveExpertise = char.saveExpertise.filter(k => k !== saveKey);
    }
  }
  saveCharacter(char as Character);
}

function toggleSkillExpertise(charId: string, skillKey: SkillKey): void {
  const char = getCharacter(charId);
  if (!char || !char.skills) return;
  if (!char.skills[skillKey]) {
    char.skills[skillKey] = { proficient: false, extra: 0, expertise: false };
  }
  // 只有熟练时才能切换专精
  if (!char.skills[skillKey].proficient) return;
  char.skills[skillKey].expertise = !char.skills[skillKey].expertise;
  saveCharacter(char as Character);
}

function toggleSaveExpertise(charId: string, saveKey: AbilityKey): void {
  const char = getCharacter(charId);
  if (!char) return;
  // 只有熟练时才能切换专精
  const isProficient = char.proficiencies?.savingThrows?.includes(saveKey) || false;
  if (!isProficient) return;
  if (!char.saveExpertise) char.saveExpertise = [];
  const index = char.saveExpertise.indexOf(saveKey);
  if (index === -1) {
    char.saveExpertise.push(saveKey);
  } else {
    char.saveExpertise.splice(index, 1);
  }
  saveCharacter(char as Character);
}

// 设置/清除某属性的豁免加值覆盖值
// 传入 null 或 undefined 清除覆盖，回退到默认计算（属性调整值+熟练加值）
function setSaveBonusOverride(charId: string, saveKey: AbilityKey, value: number | null): void {
  const char = getCharacter(charId);
  if (!char) return;
  if (!char.saveBonusOverride) char.saveBonusOverride = {};
  if (value === null || value === undefined || isNaN(value)) {
    delete char.saveBonusOverride[saveKey];
    // 若覆盖表已空，移除字段保持数据整洁
    if (Object.keys(char.saveBonusOverride).length === 0) {
      delete char.saveBonusOverride;
    }
  } else {
    char.saveBonusOverride[saveKey] = value;
  }
  saveCharacter(char as Character);
}

function setSkillProficiencies(charId: string, skillKeys: SkillKey[]): void {
  const char = getCharacter(charId);
  if (!char || !char.skills) return;
  for (const key of Object.keys(char.skills) as SkillKey[]) {
    char.skills[key].proficient = skillKeys.includes(key);
  }
  saveCharacter(char as Character);
}

// 获取角色所有可用技能列表 (供UI展示)
function getSkillsList(char: Character): { key: SkillKey; name: string; totalBonus: number; proficient: boolean }[] {
  return (Object.keys(char.skills) as SkillKey[]).map((key) => ({
    key,
    name: SKILL_LABELS[key] || key,
    totalBonus: getSkillBonus(char, key),
    proficient: char.skills[key].proficient,
  }));
}

// ============================================================
// 经验值与等级计算 (Experience & Level)
// ============================================================

const XP_TABLE = [
  0,
  300,
  900,
  2700,
  6500,
  14000,
  23000,
  34000,
  48000,
  64000,
  85000,
  100000,
  120000,
  140000,
  165000,
  195000,
  225000,
  265000,
  305000,
  355000,
];

function getLevelFromExp(exp: number): number {
  if (typeof exp !== 'number' || exp < 0) return 1;
  let level = 1;
  for (let i = 0; i < XP_TABLE.length; i++) {
    if (exp >= XP_TABLE[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return Math.min(level, 20);
}

function getNextLevelInfo(currentExp: number): {
  currentLevel: number;
  nextLevel: number;
  expNeeded: number;
  expProgress: number;
  expRemaining: number;
} {
  const currentLevel = getLevelFromExp(currentExp);
  const nextLevel = Math.min(currentLevel + 1, 20);
  const needed = XP_TABLE[nextLevel - 1] || XP_TABLE[XP_TABLE.length - 1];
  const previous = XP_TABLE[currentLevel - 1] || 0;
  const progress = needed > previous ? (currentExp - previous) / (needed - previous) : 1;
  return {
    currentLevel,
    nextLevel,
    expNeeded: needed,
    expProgress: Math.min(Math.max(progress, 0), 1),
    expRemaining: Math.max(needed - currentExp, 0),
  };
}

function calculateLevelsForCharacters(characters: Character[]): (Character & { level: number })[] {
  return characters.map((char) => ({
    ...char,
    level: getLevelFromExp(char.experience || 0),
  }));
}

function canLevelUp(exp: number): boolean {
  const currentLevel = getLevelFromExp(exp);
  if (currentLevel >= 20) return false;
  const nextThreshold = XP_TABLE[currentLevel];
  return exp >= nextThreshold;
}

// ============================================================
// 法术位系统 (Spell Slots System)
// ============================================================

const CASTER_TYPE = {
  FULL: 'full',
  HALF: 'half',
  WARLOCK: 'warlock',
  NONE: 'none',
};

const CLASS_CASTER_TYPE: Record<string, string> = {
  '吟游诗人': CASTER_TYPE.FULL,
  '牧师': CASTER_TYPE.FULL,
  '德鲁伊': CASTER_TYPE.FULL,
  '术士': CASTER_TYPE.FULL,
  '法师': CASTER_TYPE.FULL,
  '邪术师': CASTER_TYPE.WARLOCK,
  '圣武士': CASTER_TYPE.HALF,
  '游侠': CASTER_TYPE.HALF,
  '奇械师': CASTER_TYPE.HALF,
  '野蛮人': CASTER_TYPE.NONE,
  '武僧': CASTER_TYPE.NONE,
  // 战士/游荡者本体不施法，仅施法子职（奥法骑士/诡术师）为 1/3 施法者，
  // 由 hasSpellcasting 的子职分支判定
  '游荡者': CASTER_TYPE.NONE,
  '战士': CASTER_TYPE.NONE,
};

// 非施法职业的施法子职：其法术从法师列表选取，最高 4 环（PHB 1/3 施法者）
const SUBCLASS_SPELL_LIST: Record<string, { source: string; maxLevel: number }> = {
  '游荡者:arcane_trickster': { source: '法师', maxLevel: 4 },
  '战士:eldritch_knight':    { source: '法师', maxLevel: 4 },
};

/** 职业→施法关键属性映射（PHB 标准施法者） */
const CLASS_SPELLCASTING_ABILITY: Record<string, AbilityKey> = {
  '吟游诗人': 'charisma',
  '牧师': 'wisdom',
  '德鲁伊': 'wisdom',
  '圣武士': 'charisma',
  '游侠': 'wisdom',
  '术士': 'charisma',
  '邪术师': 'charisma',
  '法师': 'intelligence',
  '野蛮人': 'strength',
  '武僧': 'wisdom',
  '游荡者': 'intelligence', // 诡术师使用智力施法
  '战士': 'intelligence', // 奥法骑士使用智力施法
  // 英文备选
  'Bard': 'charisma',
  'Cleric': 'wisdom',
  'Druid': 'wisdom',
  'Paladin': 'charisma',
  'Ranger': 'wisdom',
  'Sorcerer': 'charisma',
  'Warlock': 'charisma',
  'Wizard': 'intelligence',
};

/** 获取角色的施法关键属性：显式设置优先，否则按职业推断（无施法能力的子职返回 null） */
export function getSpellcastingAbility(char: Character): AbilityKey | null {
  if (char.spellcastingAbility) return char.spellcastingAbility;
  if (!hasSpellcasting(char)) return null;
  const className = getCharacterClass(char);
  return CLASS_SPELLCASTING_ABILITY[className] ?? null;
}

/** 计算法术豁免 DC */
export function calcSpellSaveDC(char: Character): number | null {
  const ability = getSpellcastingAbility(char);
  if (!ability) return null;
  const mod = char.abilities[ability]?.modifier ?? 0;
  return 8 + char.proficiencyBonus + mod;
}

const CLASS_CASTER_LABEL: Record<string, string> = {
  '吟游诗人': '全职施法者（魅力）',
  '牧师': '全职施法者（感知）',
  '德鲁伊': '全职施法者（感知）',
  '术士': '全职施法者（魅力）',
  '法师': '全职施法者（智力）',
  '邪术师': '契约施法者（魅力·短休恢复）',
  '圣武士': '半职施法者（魅力）',
  '游侠': '半职施法者（感知）',
  '奇械师': '半职施法者（智力）',
  '野蛮人': '非施法者',
  '武僧': '非施法者',
  '游荡者': '半职施法者（智力·诡术师）',
  '战士': '半职施法者（智力·奥法骑士）',
};

const FULL_CASTER_SLOTS = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const HALF_CASTER_SLOTS = [
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0],
  [3, 0, 0, 0, 0],
  [4, 2, 0, 0, 0],
  [4, 2, 0, 0, 0],
  [4, 3, 0, 0, 0],
  [4, 3, 0, 0, 0],
  [4, 3, 2, 0, 0],
  [4, 3, 2, 0, 0],
  [4, 3, 3, 0, 0],
  [4, 3, 3, 0, 0],
  [4, 3, 3, 1, 0],
  [4, 3, 3, 1, 0],
  [4, 3, 3, 2, 0],
  [4, 3, 3, 2, 0],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

// 诡术师法术位（半职施法者，智力施法，最高4环）
// 前2级无施法能力，3级开始获得法术位，最高只能施展4级法术
// 1/3 施法者法术位推进表（PHB：游荡者·诡术师与战士·奥法骑士同表共用）
const THIRD_CASTER_SLOTS = [
  [0, 0, 0, 0, 0],    // 1级：无施法能力
  [0, 0, 0, 0, 0],    // 2级：无施法能力
  [2, 0, 0, 0, 0],    // 3级：2个1环法术位
  [3, 0, 0, 0, 0],    // 4级：3个1环法术位
  [4, 2, 0, 0, 0],    // 5级：4个1环 + 2个2环法术位
  [4, 2, 0, 0, 0],    // 6级：4个1环 + 2个2环法术位
  [4, 3, 0, 0, 0],    // 7级：4个1环 + 3个2环法术位
  [4, 3, 0, 0, 0],    // 8级：4个1环 + 3个2环法术位
  [4, 3, 2, 0, 0],    // 9级：4个1环 + 3个2环 + 2个3环法术位
  [4, 3, 2, 0, 0],    // 10级：4个1环 + 3个2环 + 2个3环法术位
  [4, 3, 3, 0, 0],    // 11级：4个1环 + 3个2环 + 3个3环法术位
  [4, 3, 3, 0, 0],    // 12级：4个1环 + 3个2环 + 3个3环法术位
  [4, 3, 3, 1, 0],    // 13级：4个1环 + 3个2环 + 3个3环 + 1个4环法术位
  [4, 3, 3, 1, 0],    // 14级：4个1环 + 3个2环 + 3个3环 + 1个4环法术位
  [4, 3, 3, 2, 0],    // 15级：4个1环 + 3个2环 + 3个3环 + 2个4环法术位
  [4, 3, 3, 2, 0],    // 16级：4个1环 + 3个2环 + 3个3环 + 2个4环法术位
  [4, 3, 3, 3, 1],    // 17级：4个1环 + 3个2环 + 3个3环 + 3个4环法术位
  [4, 3, 3, 3, 1],    // 18级：4个1环 + 3个2环 + 3个3环 + 3个4环法术位
  [4, 3, 3, 3, 2],    // 19级：4个1环 + 3个2环 + 3个3环 + 3个4环 + 2个4环法术位
  [4, 3, 3, 3, 2],    // 20级：4个1环 + 3个2环 + 3个3环 + 3个4环 + 2个4环法术位
];

const WARLOCK_SLOTS = [
  [1, 1, 2, 2],
  [2, 1, 3, 2],
  [2, 2, 4, 2],
  [2, 2, 5, 2],
  [2, 3, 6, 2],
  [2, 3, 7, 2],
  [2, 4, 8, 2],
  [2, 4, 9, 2],
  [2, 5, 10, 2],
  [2, 5, 10, 3],
  [3, 5, 11, 3],
  [3, 5, 11, 3],
  [3, 5, 12, 3],
  [3, 5, 12, 3],
  [3, 5, 13, 3],
  [3, 5, 13, 3],
  [4, 5, 14, 3],
  [4, 5, 14, 3],
  [4, 5, 15, 3],
  [4, 5, 15, 3],
];

const SPELL_LEVEL_LABELS: Record<number, string> = {
  1: '1环', 2: '2环', 3: '3环', 4: '4环', 5: '5环',
  6: '6环', 7: '7环', 8: '8环', 9: '9环',
};

function hasSpellcasting(char: Character): boolean {
  if (!char) return false;
  const className = getCharacterClass(char);
  const type = CLASS_CASTER_TYPE[className];
  if (type === CASTER_TYPE.FULL || type === CASTER_TYPE.HALF || type === CASTER_TYPE.WARLOCK) {
    return true;
  }
  // 非施法职业的施法子职（战士:奥法骑士 / 游荡者:诡术师，1/3 施法者）
  return !!getSpellListForCharacter(char);
}



// 法术攻击加值 = 施法属性调整值 + 熟练加值
function getSpellAttackBonus(char: Character): number | null {
  const ability = getSpellcastingAbility(char);
  if (!ability || !char.abilities) return null;
  const mod = char.abilities[ability]?.modifier || 0;
  const prof = char.proficiencyBonus || 2;
  return mod + prof;
}

// 施法豁免 DC = 8 + 施法属性调整值 + 熟练加值
function getSpellSaveDC(char: Character): number | null {
  return calcSpellSaveDC(char);
}

/**
 * 兼容性函数：获取职业名称（支持旧数据格式）
 */
function getCharacterClass(char: Character): string {
  // 新数据格式：profession.class
  if (char.profession && char.profession.class) {
    return char.profession.class;
  }
  // 旧数据格式：直接使用class字段
  return (char as any).class || '';
}

function getCasterType(char: Character): string {
  if (!char) return CASTER_TYPE.NONE;
  const className = getCharacterClass(char);
  return CLASS_CASTER_TYPE[className] || CASTER_TYPE.NONE;
}

function getCasterTypeLabel(char: Character): string | null {
  if (!hasSpellcasting(char)) return null;
  const className = getCharacterClass(char);
  return CLASS_CASTER_LABEL[className] || '施法者';
}

function getSpellSlotsByLevel(char: Character): {
  slots: number[];
  maxLevel: number;
  casterType: string;
  ability: AbilityKey;
  slotLevel?: number;
  knownSpells?: number;
  mysticArcanum?: number;
} | null {
  if (!hasSpellcasting(char)) return null;

  const level = Number(char.level) || 1;
  const levelIndex = Math.min(Math.max(0, Math.floor(level) - 1), 19);
  const casterType = getCasterType(char);

  if (casterType === CASTER_TYPE.FULL) {
    const slots = FULL_CASTER_SLOTS[levelIndex] || FULL_CASTER_SLOTS[0];
    let maxLevel = 0;
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i] > 0) { maxLevel = i + 1; break; }
    }
    return {
      slots: slots.slice(0, 9),
      maxLevel,
      casterType: 'full',
      ability: CLASS_SPELLCASTING_ABILITY[getCharacterClass(char)] || 'intelligence',
    };
  }

  if (casterType === CASTER_TYPE.HALF) {
    // 其他半职施法者使用标准的半职施法者数组
    const slots = HALF_CASTER_SLOTS[levelIndex] || HALF_CASTER_SLOTS[0];
    let maxLevel = 0;
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i] > 0) { maxLevel = i + 1; break; }
    }
    return {
      slots: slots.slice(0, 5),
      maxLevel,
      casterType: 'half',
      ability: CLASS_SPELLCASTING_ABILITY[getCharacterClass(char)] || 'intelligence',
    };
  }

  if (casterType === CASTER_TYPE.WARLOCK) {
    const data = WARLOCK_SLOTS[levelIndex] || WARLOCK_SLOTS[0];
    const [slotCount, slotLevel, knownSpells, mysticArcanum] = data;
    return {
      slots: [slotCount],
      slotLevel,
      maxLevel: slotLevel,
      casterType: 'warlock',
      ability: CLASS_SPELLCASTING_ABILITY[getCharacterClass(char)] || 'charisma',
      knownSpells,
      mysticArcanum,
    };
  }

  // 非施法职业的施法子职（1/3 施法者：游荡者:诡术师 / 战士:奥法骑士）：
  // hasSpellcasting 已通过子职校验，走专属环位推进表（最高 4 环）
  if (casterType === CASTER_TYPE.NONE) {
    if (!getSpellListForCharacter(char)) return null;
    const slots = THIRD_CASTER_SLOTS[levelIndex] || THIRD_CASTER_SLOTS[0];
    let maxLevel = 0;
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i] > 0) { maxLevel = i + 1; break; }
    }
    return {
      slots: slots.slice(0, 5),
      maxLevel,
      casterType: 'half',
      ability: CLASS_SPELLCASTING_ABILITY[getCharacterClass(char)] || 'intelligence',
    };
  }

  return null;
}

function getSpellSlotDisplayData(char: Character): {
  ability: AbilityKey;
  abilityLabel: string;
  casterTypeLabel: string;
  spellSlots: {
    level: number;
    label: string;
    max: number;
    used: number;
    available: number;
    isWarlock?: boolean;
  }[];
  maxLevel: number;
  casterType: string;
  knownSpells?: number;
  mysticArcanum?: number;
} | null {
  if (!hasSpellcasting(char)) return null;

  const config = getSpellSlotsByLevel(char);
  if (!config) return null;

  const charSlots = char.spells?.spellSlots || {};

  const ABILITY_LABELS: Record<AbilityKey, string> = {
    strength: '力量',
    dexterity: '敏捷',
    constitution: '体质',
    intelligence: '智力',
    wisdom: '感知',
    charisma: '魅力',
  };

  // 按 getSpellSlotsByLevel 已归一的 casterType 分流（子职施法者职业表为 NONE，但 config 归一为 half）
  if (config.casterType === 'full' || config.casterType === 'half') {
    const slotList = [];
    const slotArray = config.slots || [];
    // 显示层 max 双源合并：存储值（角色属性）优先，标准表兜底，取大者。
    // 标准表按等级推导，等级特殊/低环位子职（如 1 级诡术师手动配置 2 个 1 环位）
    // 的存储 max 会被全 0 标准行清零显示——以存储为准才能忠实呈现角色实际法术位
    for (let i = 0; i < 9; i++) {
      const levelNum = i + 1;
      const levelKey = ('level' + levelNum) as SpellSlotLevel;
      const standardMax = slotArray[i] || 0;
      const storedMax = charSlots[levelKey]?.max || 0;
      const max = Math.max(storedMax, standardMax);
      if (max === 0) continue;
      const used = charSlots[levelKey]?.used || 0;
      slotList.push({
        level: levelNum,
        label: SPELL_LEVEL_LABELS[levelNum] || (levelNum + '环'),
        max,
        used: Math.min(used, max),
        available: max - Math.min(used, max),
      });
    }
    return {
      ability: config.ability,
      abilityLabel: ABILITY_LABELS[config.ability] || config.ability,
      casterTypeLabel: CLASS_CASTER_LABEL[getCharacterClass(char)] || '施法者',
      spellSlots: slotList,
      maxLevel: config.maxLevel,
      casterType: config.casterType,
    };
  }

  if (config.casterType === 'warlock') {
    const slotLevel = config.slotLevel || 1;
    const levelKey = ('level' + slotLevel) as SpellSlotLevel;
    // 同 FULL/HALF：存储 max 优先（契约施法者的魔爆/秘法奇物等可能调整环位数）
    const slotCount = Math.max(config.slots[0] || 0, charSlots[levelKey]?.max || 0);
    const used = charSlots[levelKey]?.used || 0;
    return {
      ability: config.ability,
      abilityLabel: ABILITY_LABELS[config.ability] || config.ability,
      casterTypeLabel: CLASS_CASTER_LABEL[getCharacterClass(char)] || '契约施法者',
      spellSlots: [{
        level: slotLevel,
        label: SPELL_LEVEL_LABELS[slotLevel] || (slotLevel + '环'),
        max: slotCount,
        used: Math.min(used, slotCount),
        available: slotCount - Math.min(used, slotCount),
        isWarlock: true,
      }],
      maxLevel: slotLevel,
      casterType: 'warlock',
      knownSpells: config.knownSpells || 0,
      mysticArcanum: config.mysticArcanum || 0,
    };
  }

  return null;
}

function resetSpellSlots(charId: string): void {
  const char = getCharacter(charId);
  if (!char || !hasSpellcasting(char)) return;

  const config = getSpellSlotsByLevel(char);
  if (!config) return;

  // 确保 spellSlots 对象存在
  if (!char.spells) {
    char.spells = { cantrips: [], spellSlots: {} as SpellSlots, custom: [] };
  }
  if (!char.spells.spellSlots) {
    char.spells.spellSlots = {} as SpellSlots;
  }

  // 长休语义 = 仅恢复（used 归零）。max 是角色属性，长休不得改写：
  // 已有 max（含手动自定义值）一律保留，仅缺失的环位 key 用标准表补齐，
  // 避免标准表与角色实际配置不符时把 max 覆盖成 0（表现为「清空」）
  const ensureSlot = (levelKey: SpellSlotLevel, standardMax: number) => {
    const existing = char.spells.spellSlots[levelKey];
    if (!existing) {
      char.spells.spellSlots[levelKey] = { max: standardMax, used: 0 };
    } else {
      // max 为 0 的历史脏数据（从未初始化/被清坏）用标准表兜底；有值即视为角色属性保留
      if (!existing.max || existing.max <= 0) existing.max = standardMax;
      existing.used = 0;
    }
  };

  if (config.casterType === 'full' || config.casterType === 'half') {
    const slotArray = config.slots || [];
    for (let i = 0; i < slotArray.length; i++) {
      ensureSlot(('level' + (i + 1)) as SpellSlotLevel, slotArray[i] || 0);
    }
  }

  if (config.casterType === 'warlock') {
    ensureSlot(('level' + (config.slotLevel || 1)) as SpellSlotLevel, config.slots[0] || 0);
  }

  saveCharacter(char as Character);
}

function shouldShowSpellSlots(char: Character): boolean {
  return hasSpellcasting(char);
}

// ============================================================
// 子职业管理
// ============================================================

/**
 * 检查角色是否可以选择子职业
 */
export function canCharacterChooseSubclass(character: Character): boolean {
  const className = getCharacterClass(character);
  // 术士和邪术师1级就可以选择子职业
  if (className === '术士' || className === '邪术师') {
    return character.level >= 1;
  }
  // 其他职业3级可以选择子职业
  return character.level >= 3;
}

/**
 * 设置角色的子职业
 */
function setSubclass(charId: string, subclassId: string): void {
  const char = getCharacter(charId);
  if (!char) return;

  const availableSubclasses = getAvailableSubclasses(char as Character);
  const selectedSubclass = availableSubclasses.find(sc => sc.id === subclassId);
  
  if (!selectedSubclass) {
    console.warn(`Subclass ${subclassId} not available for class ${getCharacterClass(char)}`);
    return;
  }

  if (!char.profession) char.profession = { class: '', subclass: undefined };
  char.profession.subclass = selectedSubclass.id;
  saveCharacter(char as Character);
}

/**
 * 更改角色的子职业
 */
function changeSubclass(charId: string, newSubclassId: string): void {
  const char = getCharacter(charId);
  if (!char) return;

  // 空字符串表示清除当前子职业，回到可重新选择的状态
  if (!newSubclassId) {
    if (!char.profession) char.profession = { class: '', subclass: undefined };
    char.profession.subclass = undefined;
    saveCharacter(char as Character);
    return;
  }

  const availableSubclasses = getAvailableSubclasses(char as Character);
  const newSubclass = availableSubclasses.find(sc => sc.id === newSubclassId);
  
  if (!newSubclass) {
    console.warn(`New subclass ${newSubclassId} not available for class ${getCharacterClass(char)}`);
    return;
  }

  if (!char.profession) char.profession = { class: '', subclass: undefined };
  char.profession.subclass = newSubclass.id;
  saveCharacter(char as Character);
}

// ============================================================
// 导出对象
// ============================================================

export const characterStore = {
  // 存储层
  getAll: getAllCharacters,
  getAllVisible: getAllVisibleCharacters,
  createSandbox: createSandboxCharacter,
  get: getCharacter,
  save: saveCharacter,
  add: addCharacter,
  update: updateCharacter,
  delete: deleteCharacter,
  createBlank: createBlankCharacter,
  
  // 工具
  generateId,
  generateFileName,
  
  // 备份
  getBackup,
  restoreFromBackup,
  createBackup,
  
  // 导入导出
  exportSingleCharacter,
  exportAllCharacters,
  exportSelectedCharacters,
  importSingleCharacter,
  importMultipleCharacters,
  createImportDialog,
  exportAllWithConfirm,
  
  // 计算辅助
  calcModifier,
  /**
   * 从分层重算最终属性值并写回 abilities：初始基线 + 种族/亚种特性加值（含已完成的任选）。
   * 基线未设置时跳过（老数据保持现状）；任选规则未选满则该部分暂不计入。
   * 调用点：保存基线 / 任选变更 / 采纳或更换种族选项。
   */
  recomputeAbilities(id: string): void {
    const char = getCharacter(id);
    if (!char || !char.baseAbilities) return;
    const breakdown = computeAbilityBreakdown(char);
    if (!breakdown) return;
    const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
    const abilities = {} as NonNullable<Character['abilities']>;
    for (const key of ABILITY_KEYS) {
      const total = breakdown.entries[key].total;
      abilities[key] = { score: total, modifier: calcModifier(total) };
    }
    updateCharacter(id, { abilities });
  },
  calcPassivePerception,
  recalculateArmorClass,
  getSkillBonus,
  getSkillsList,
  getGroupedSkills,
  getSaveBonus,
  getAllSkillBonuses,
  getAllSaveBonuses,
  toggleSkillProficiency,
  toggleSaveProficiency,
  toggleSkillExpertise,
  toggleSaveExpertise,
  setSaveBonusOverride,
  setSkillProficiencies,
  getLevelFromExp,
  getNextLevelInfo,
  calculateLevelsForCharacters,
  canLevelUp,

  // 货币换算工具
  currencyToCopper,
  copperToCurrency,
  priceToCopper,
  canAfford,
  deductCurrency,

  // 背包重量/价值工具
  getEquipmentWeight,
  getTotalWeight,
  getEquipmentValueCopper,
  getTotalValueCopper,

  // 法术位系统
  hasSpellcasting,
  getSpellcastingAbility,
  getSpellAttackBonus,
  getSpellSaveDC,
  calcSpellSaveDC,
  getCasterType,
  getCasterTypeLabel,
  getSpellSlotsByLevel,
  getSpellSlotDisplayData,
  resetSpellSlots,
  shouldShowSpellSlots,

  // 子项 CRUD
  addAttack,
  updateAttack,
  deleteAttack,
  
  addEquipment,
  updateEquipment,
  deleteEquipment,
  
  addFeature,
  updateFeature,

  addCantrip,
  removeCantrip,
  
  addCustomSpell,
  removeCustomSpell,
  
  updateSpellSlots,
  updateCharacterStatus,
  
  addProficiency,
  removeProficiency,
  updateProficiency,
  
  updateSkill,

  // 后端 API
  syncCharacterToBackend,
  loadAllFromBackend,
  replaceAllFromBackend,

    // 穿戴/卸下
  wearEquipment,
  unwearEquipment,

  // 备战槽（进战斗自动拿起；战斗层手持在 combatStore 参战者上）
  readyItem,
  unreadyItem,
  isTwoHandedWeapon,
   
    // 子职业管理
    getAvailableSubclasses,
    canChooseSubclass,
    canCharacterChooseSubclass,
    getSubclassDisplayName,

    setSubclass,
    changeSubclass,

   // 子职法术列表映射
   getSpellListForCharacter,
} as const;

// 获取角色的法术列表来源和最高环级（用于子职施法者）
export function getSpellListForCharacter(char: Character): { source: string; maxLevel: number } | null {
  const className = getCharacterClass(char);
  const subclass = char.profession?.subclass || (char as any).subclass;
  if (!className || !subclass) return null;
  return SUBCLASS_SPELL_LIST[`${className}:${subclass}`] ?? null;
}
