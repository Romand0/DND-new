// 战斗状态持久化桥：statusManager 单例（内存）↔ CombatRecord.statusInstances（localStorage + 云备份）。
// 状态机的 combatId 即记录 ID；任何状态变更防抖写回记录，进入战斗页时按记录水合。
import combatStore from './combatStore';
import { globalStatusManager } from './statusManager';
import type { StatusInstance } from '@/types/status';

const hydrated = new Set<string>();

function cloneInstances(list: StatusInstance[]): StatusInstance[] {
  return list.map(i => ({ ...i, metadata: i.metadata ? { ...i.metadata } : undefined }));
}

/** 从记录水合状态（每场战斗只水合一次；记录无持久化数据时保持内存现状，老数据零迁移） */
export function hydrateCombatStatuses(recordId: string): void {
  if (hydrated.has(recordId)) return;
  hydrated.add(recordId);
  const saved = combatStore.get(recordId)?.statusInstances;
  if (!Array.isArray(saved) || saved.length === 0) return;
  globalStatusManager.loadCombatInstances(recordId, cloneInstances(saved));
}

/** 把内存中该战斗的活跃状态写回记录（内容无变化时跳过，避免 updatedAt 空转） */
export function persistCombatStatuses(recordId: string): void {
  const rec = combatStore.get(recordId);
  if (!rec) return;
  const next = cloneInstances(globalStatusManager.getActiveCombatInstances(recordId));
  if (JSON.stringify(next) === JSON.stringify(rec.statusInstances ?? [])) return;
  combatStore.update(recordId, { statusInstances: next, updatedAt: Date.now() });
}

/**
 * 订阅状态变更并防抖持久化；返回清理函数。
 * 清理时立即补写一次，避免 100ms 防抖窗口内离开页面丢改动。
 */
export function startStatusPersistence(recordId: string): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = globalStatusManager.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      persistCombatStatuses(recordId);
    }, 100);
  });
  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    unsub();
    persistCombatStatuses(recordId);
  };
}
