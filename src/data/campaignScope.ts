// 团组作用域辅助：模块级当前团组 id + localStorage 键分桶。
// main.tsx 在渲染前同步初始化，保证各 store 首次 load 就落到正确桶；
// CampaignContext 切换团组时更新后整页 reload，避免 9 个模块级单例 store 的热刷新问题。

const CURRENT_KEY = 'dnd-current-campaign';

let currentCampaignId = 'default';

/** 升级前（Phase A 分桶前）的旧存储键 → 升级数据都在这些键里（DataManagement 导入/日常使用积累） */
const LEGACY_KEYS = [
  'DND',                  // 角色卡
  'dnd-combat-records',   // 战斗记录
  'dnd-hooked-combat',    // 联动战斗
  'dnd-treasures',        // 宝藏
  'dnd-battlegrounds',    // 沙盘
  'dnd-game-calendar',    // 日历
  'dnd-game-time',        // 游戏时间
  'dnd-npc-templates',    // 怪物图鉴（DataManagement 导入的种子，云端可能为空）
  'DND-equipments',       // 装备库
  'DND-spells',           // 法术库
  'DND-character-options', // 角色选项
];

const LEGACY_MIGRATED_FLAG = 'dnd-legacy-migrated-default';

/** 应用启动时（main.tsx，渲染前）同步调用 */
export function initCampaignScopeFromStorage(): void {
  try {
    const saved = localStorage.getItem(CURRENT_KEY);
    if (saved) currentCampaignId = saved;
  } catch {
    currentCampaignId = 'default';
  }
  migrateLegacyKeys();
}

/**
 * 旧键一次性迁移到默认团组桶：升级分桶后新桶为空，导致 DataManagement 导入过的
 * 本地数据（尤其怪物图鉴，云端无备份）全部「消失」。仅迁移进默认团组（旧数据语义上
 * 属于升级前的默认空间）；每个目标桶仅在自身尚无数据时拷贝，不覆盖已产生的团组数据。
 */
function migrateLegacyKeys(): void {
  try {
    if (currentCampaignId !== 'campaign-default') return;
    if (localStorage.getItem(LEGACY_MIGRATED_FLAG)) return;
    let copied = 0;
    for (const key of LEGACY_KEYS) {
      const targetKey = scopedKey(key);
      if (localStorage.getItem(targetKey)) continue; // 团组桶已有数据，跳过
      const legacy = localStorage.getItem(key);
      if (legacy) {
        localStorage.setItem(targetKey, legacy);
        copied++;
      }
    }
    // 即使一条都没拷也落 flag：旧键本就不存在时不重复扫描
    localStorage.setItem(LEGACY_MIGRATED_FLAG, new Date().toISOString());
    if (copied > 0) console.info(`[campaignScope] 已迁移 ${copied} 项升级前本地数据到默认团组`);
  } catch {
    // 迁移失败不阻塞启动：各 store 仍可从云端恢复
  }
}

export function getCampaignId(): string {
  return currentCampaignId;
}

export function setCurrentCampaignId(id: string): void {
  currentCampaignId = id || 'default';
  try {
    localStorage.setItem(CURRENT_KEY, currentCampaignId);
  } catch {
    // localStorage 不可用时保持内存值，会话内仍可工作
  }
}

/** 团组作用域数据的 localStorage 键：`dnd-{团组id}:{原键}`；无团组上下文落 default 桶 */
export function scopedKey(base: string): string {
  return `dnd-${currentCampaignId}:${base}`;
}
