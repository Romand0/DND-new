// 团组作用域辅助：模块级当前团组 id + localStorage 键分桶。
// main.tsx 在渲染前同步初始化，保证各 store 首次 load 就落到正确桶；
// CampaignContext 切换团组时更新后整页 reload，避免 9 个模块级单例 store 的热刷新问题。

const CURRENT_KEY = 'dnd-current-campaign';

let currentCampaignId = 'default';

/** 应用启动时（main.tsx，渲染前）同步调用 */
export function initCampaignScopeFromStorage(): void {
  try {
    const saved = localStorage.getItem(CURRENT_KEY);
    if (saved) currentCampaignId = saved;
  } catch {
    currentCampaignId = 'default';
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
