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
} from '@/types/character';
import * as api from '@/lib/api';
import { wearEquipment, unwearEquipment } from './equipmentWear';

// 从 localStorage 读取 auth_token，构造带 JWT 的 headers
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const STORAGE_KEY = 'DND';
const BACKUP_KEY = 'dm-characters-backup';
const BACKUP_INTERVAL = 30000;

// ============================================================
// 存储层
// ============================================================

function migrateCharacter(char: any): Character {
  if (char.attacks && Array.isArray(char.attacks)) {
    char.attacks = char.attacks.map((attack: any) => ({
      id: attack.id,
      name: attack.name || '',
      attackBonus: attack.attackBonus !== undefined ? attack.attackBonus : (attack.bonus || ''),
      damage: attack.damage || '',
      damageType: attack.damageType !== undefined ? attack.damageType : (attack.type || ''),
      range: attack.range || '',
      properties: attack.properties || [],
    }));
  }
  return char as Character;
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
    if (hasOldAttackFields || missingNewAttackFields) {
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
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const chars = data ? JSON.parse(data) : [];
    return migrateStore(chars);
  } catch {
    return [];
  }
}

function saveStore(store: Character[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  scheduleBackup();
}

function getAllCharacters(): Character[] {
  return getStore();
}

function getCharacter(charId: string): Character | null {
  const chars = getStore();
  return chars.find((c) => c.id === charId) || null;
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
  syncCharacterToBackend(charWithTimestamps).catch(() => {});
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
  } catch {
    // PUT 失败（可能是新角色 404 或网络问题），尝试 POST 创建
    await api.apiFetch('/characters', {
      method: 'POST',
      body: JSON.stringify(char),
      headers,
    });
  }
}


// 从后端加载所有角色（覆盖本地缓存）
async function loadAllFromBackend(): Promise<Character[]> {
  if (!api.hasToken()) {
    // 玩家端也通过公开接口读取
    return await api.fetchAllCharacters<Character[]>();
  }
  return await api.fetchAllCharacters<Character[]>();
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
    const data = localStorage.getItem(STORAGE_KEY);
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
    class: '',
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
    currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    
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
  console.log('addEquipment called', { charId, equipData });

  const char = getCharacter(charId);
  if (!char) return null;
  // 防御：防止编辑器透传的 childId(undefined) 覆盖
  const safeData = { ...equipData };
  delete (safeData as any).childId;
  
  // 生成子ID：角色ID + 随机后缀
  const childId = charId + '-' + generateId();
  const newEquip: Equipment = {
    id: safeData.id || generateId(), // 保留装备库模板ID
    childId, // 新增子ID
    name: '',
    quantity: 1,
    category: '杂项',
    ...safeData,
  };

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

function deleteFeature(charId: string, featureId: string): void {
  const char = getCharacter(charId);
  if (!char) return;
  char.features = char.features.filter((f) => f.id !== featureId);
  saveCharacter(char as Character);
}

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
function recalculateArmorClass(char: Character): void {
  if (!char.equipment) char.equipment = [];

  // 悬空引用防护：槽位指着的装备已不在背包里，清掉（兼容 childId）
  if (char.wornArmorId && !char.equipment.find(e => e.id === char.wornArmorId || e.childId === char.wornArmorId)) {
    char.wornArmorId = null;
  }
  if (char.wornOutfitId && !char.equipment.find(e => e.id === char.wornOutfitId || e.childId === char.wornOutfitId)) {
    char.wornOutfitId = null;
  }

  const dexScore = char.abilities?.dexterity?.score ?? 10;
  const dexMod = calcModifier(dexScore);

  if (char.wornArmorId) {
    const armor = char.equipment.find(e => e.id === char.wornArmorId || e.childId === char.wornArmorId);
    if (armor?.acBase) {
      const baseAc = Number(armor.acBase);
      const subtype = armor.subtype || '轻甲';
      switch (subtype) {
        case '轻甲':
          char.armorClass = baseAc + dexMod;
          return;
        case '中甲':
          char.armorClass = baseAc + Math.min(dexMod, 2);
          return;
        case '重甲':
          char.armorClass = baseAc;
          return;
        default:
          char.armorClass = baseAc + dexMod;
          return;
      }
    }
  }

  // 无护甲或找不到护甲 → 裸体 AC
  char.armorClass = 10 + dexMod;
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

const SKILL_LABELS: Record<SkillKey, string> = {
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
  save: { key: AbilityKey; label: string; proficient: boolean; expertise: boolean; bonus: number; modifier: number };
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
  const skills = char.skills || {};
  const profBonus = char.proficiencyBonus || 2;

  for (const [attrKey, config] of Object.entries(SKILL_GROUP_CONFIG)) {
    const key = attrKey as AbilityKey;
    const saveMod = abilityMods[key] || 0;
    const isSaveProficient = saveProfs.includes(key);
    const isSaveExpertise = saveExpertiseList.includes(key);
    // 专精时熟练加值翻倍
    const saveProfBonus = isSaveProficient ? (isSaveExpertise ? profBonus * 2 : profBonus) : 0;
    const saveBonus = saveMod + saveProfBonus;

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
  const abilityMod = char.abilities?.[saveKey]?.modifier || 0;
  const isProficient = char.proficiencies?.savingThrows?.includes(saveKey) || false;
  const profBonus = isProficient ? (char.proficiencyBonus || 2) : 0;
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
};

const CLASS_SPELL_ABILITY: Record<string, AbilityKey> = {
  '吟游诗人': 'charisma',
  '牧师': 'wisdom',
  '德鲁伊': 'wisdom',
  '术士': 'charisma',
  '法师': 'intelligence',
  '邪术师': 'charisma',
  '圣武士': 'charisma',
  '游侠': 'wisdom',
  '奇械师': 'intelligence',
};

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
  if (!char || !char.class) return false;
  const type = CLASS_CASTER_TYPE[char.class];
  return type === CASTER_TYPE.FULL || type === CASTER_TYPE.HALF || type === CASTER_TYPE.WARLOCK;
}

function getSpellcastingAbility(char: Character): AbilityKey | null {
  if (!hasSpellcasting(char)) return null;
  return CLASS_SPELL_ABILITY[char.class] || null;
}

function getCasterType(char: Character): string {
  if (!char || !char.class) return CASTER_TYPE.NONE;
  return CLASS_CASTER_TYPE[char.class] || CASTER_TYPE.NONE;
}

function getCasterTypeLabel(char: Character): string | null {
  if (!hasSpellcasting(char)) return null;
  return CLASS_CASTER_LABEL[char.class] || '施法者';
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

  const level = char.level || 1;
  const levelIndex = Math.min(level - 1, 19);
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
      ability: CLASS_SPELL_ABILITY[char.class] || 'intelligence',
    };
  }

  if (casterType === CASTER_TYPE.HALF) {
    const slots = HALF_CASTER_SLOTS[levelIndex] || HALF_CASTER_SLOTS[0];
    let maxLevel = 0;
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i] > 0) { maxLevel = i + 1; break; }
    }
    return {
      slots: slots.slice(0, 5),
      maxLevel,
      casterType: 'half',
      ability: CLASS_SPELL_ABILITY[char.class] || 'intelligence',
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
      ability: CLASS_SPELL_ABILITY[char.class] || 'charisma',
      knownSpells,
      mysticArcanum,
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
  const casterType = getCasterType(char);

  const ABILITY_LABELS: Record<AbilityKey, string> = {
    strength: '力量',
    dexterity: '敏捷',
    constitution: '体质',
    intelligence: '智力',
    wisdom: '感知',
    charisma: '魅力',
  };

  if (casterType === CASTER_TYPE.FULL || casterType === CASTER_TYPE.HALF) {
    const slotList = [];
    const slotArray = config.slots || [];
    for (let i = 0; i < slotArray.length; i++) {
      const levelNum = i + 1;
      const max = slotArray[i] || 0;
      if (max === 0) continue;
      const levelKey = 'level' + levelNum as SpellSlotLevel;
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
      casterTypeLabel: CLASS_CASTER_LABEL[char.class] || '施法者',
      spellSlots: slotList,
      maxLevel: config.maxLevel,
      casterType: config.casterType,
    };
  }

  if (casterType === CASTER_TYPE.WARLOCK) {
    const slotCount = config.slots[0] || 0;
    const slotLevel = config.slotLevel || 1;
    const levelKey = ('level' + slotLevel) as SpellSlotLevel;
    const used = charSlots[levelKey]?.used || 0;
    return {
      ability: config.ability,
      abilityLabel: ABILITY_LABELS[config.ability] || config.ability,
      casterTypeLabel: CLASS_CASTER_LABEL[char.class] || '契约施法者',
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

  const casterType = getCasterType(char);

  // 确保 spellSlots 对象存在
  if (!char.spells) {
    char.spells = { cantrips: [], spellSlots: {} as SpellSlots, custom: [] };
  }
  if (!char.spells.spellSlots) {
    char.spells.spellSlots = {} as SpellSlots;
  }

  if (casterType === CASTER_TYPE.FULL || casterType === CASTER_TYPE.HALF) {
    const slotArray = config.slots || [];
    for (let i = 0; i < slotArray.length; i++) {
      const levelNum = i + 1;
      const levelKey = ('level' + levelNum) as SpellSlotLevel;
      if (!char.spells.spellSlots[levelKey]) {
        char.spells.spellSlots[levelKey] = { max: 0, used: 0 };
      }
      char.spells.spellSlots[levelKey].used = 0;
    }
  }

  if (casterType === CASTER_TYPE.WARLOCK) {
    const slotLevel = config.slotLevel || 1;
    const levelKey = ('level' + slotLevel) as SpellSlotLevel;
    if (!char.spells.spellSlots[levelKey]) {
      char.spells.spellSlots[levelKey] = { max: 0, used: 0 };
    }
    char.spells.spellSlots[levelKey].used = 0;
  }

  saveCharacter(char as Character);
}

function shouldShowSpellSlots(char: Character): boolean {
  return hasSpellcasting(char);
}

// ============================================================
// 导出对象
// ============================================================

export const characterStore = {
  // 存储层
  getAll: getAllCharacters,
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
  setSkillProficiencies,
  getLevelFromExp,
  getNextLevelInfo,
  calculateLevelsForCharacters,
  canLevelUp,

  // 法术位系统
  hasSpellcasting,
  getSpellcastingAbility,
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
  deleteFeature,
  
  addCantrip,
  removeCantrip,
  
  addCustomSpell,
  removeCustomSpell,
  
  updateSpellSlots,
  
  addProficiency,
  removeProficiency,
  updateProficiency,
  
  updateSkill,

  // 后端 API
  syncCharacterToBackend,
  loadAllFromBackend,

    // 穿戴/卸下
  wearEquipment,
  unwearEquipment,

};
