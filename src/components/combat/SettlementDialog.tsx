import { useState, useEffect } from 'react';
import { X, Package, Sparkles, Heart, Zap, CheckCircle2 } from 'lucide-react';
import combatStore from '@/data/combatStore';
import statusLibrary from '@/data/statusLibrary';
import type { CombatRecord, SettlementPreview, SettlementSelections, SettlementEntry, SettlementStatusLine } from '@/types/combat';

interface Props {
  record: CombatRecord;
  onClose: () => void;
  onSettled?: () => void;
}

/** 状态行显示名与持续提示 */
function describeStatus(line: SettlementStatusLine): { name: string; duration: string } {
  const def = statusLibrary.get(line.instance.definitionId);
  const name = def?.name ?? line.instance.definitionId;
  let duration = '';
  if (line.instance.expiresAt) {
    const remainMs = line.instance.expiresAt - Date.now();
    const remainMin = Math.max(0, Math.ceil(remainMs / 60000));
    duration = `剩余约 ${remainMin} 分钟`;
  } else if (line.instance.expirePolicy === 'rounds' || line.instance.expirePolicy === 'combatantTurn') {
    duration = `战斗内 ${line.instance.durationRounds ?? '?'} 回合`;
  } else {
    duration = '持续生效';
  }
  return { name, duration };
}

function StatusLineRow({ line, checked, onToggle }: { line: SettlementStatusLine; checked: boolean; onToggle: () => void }) {
  const { name, duration } = describeStatus(line);
  if (!line.inheritable) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs opacity-60">
        <span className="w-4" />
        <span className="dark:text-text-dark-muted light:text-text-light-muted line-through">{name}</span>
        <span className="text-danger/80">{line.excludeReason}</span>
      </div>
    );
  }
  return (
    <label className="flex items-center gap-2 py-1 text-xs cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-4 h-4 accent-primary"
      />
      <span className="dark:text-text-dark light:text-text-light">{name}</span>
      <span className="dark:text-text-dark-muted light:text-text-light-muted">{duration}</span>
    </label>
  );
}

export default function SettlementDialog({ record, onClose, onSettled }: Props) {
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [selEq, setSelEq] = useState<Record<string, Set<string>>>({});
  const [selSlots, setSelSlots] = useState<Set<string>>(new Set());
  const [selHp, setSelHp] = useState<Set<string>>(new Set());
  const [selStatus, setSelStatus] = useState<Record<string, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = combatStore.buildSettlementPreview(record.id);
    if (!p) {
      setError('无法生成结算预览（记录不存在或为试验场）');
      return;
    }
    setPreview(p);
    // 默认全选
    const eq: Record<string, Set<string>> = {};
    const st: Record<string, Set<string>> = {};
    const slots = new Set<string>();
    const hp = new Set<string>();
    for (const e of p.entries) {
      eq[e.combatantId] = new Set(e.equipment.map(l => l.childId));
      const inheritable = e.statuses.filter(s => s.inheritable).map(s => s.instance.instanceId);
      if (inheritable.length > 0) st[e.combatantId] = new Set(inheritable);
      if (e.spellSlots.length > 0) slots.add(e.combatantId);
      if (e.hp) hp.add(e.combatantId);
    }
    setSelEq(eq);
    setSelStatus(st);
    setSelSlots(slots);
    setSelHp(hp);
  }, [record.id]);

  const hasAnyChange = preview?.entries.some(e =>
    e.equipment.length > 0 || e.spellSlots.length > 0 || e.hp || e.statuses.length > 0
  ) ?? false;

  const handleConfirm = () => {
    if (!preview) return;
    const selections: SettlementSelections = {
      equipmentChildIds: Object.fromEntries(
        Object.entries(selEq).map(([k, v]) => [k, [...v]]),
      ),
      spellSlotCombatantIds: [...selSlots],
      hpCombatantIds: [...selHp],
      statusInstanceIds: Object.fromEntries(
        Object.entries(selStatus).map(([k, v]) => [k, [...v]]),
      ),
    };
    const ok = combatStore.settleCombat(record.id, selections);
    if (!ok) {
      setError('结算失败（记录可能已封存或不存在）');
      return;
    }
    onSettled?.();
    onClose();
  };

  const renderEntry = (e: SettlementEntry) => (
    <div key={e.combatantId} className="rounded-lg border dark:border-border-dark light:border-border-light p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold dark:text-text-dark light:text-text-light">{e.characterName}</span>
        {e.characterMissing && (
          <span className="text-xs text-danger">角色卡缺失，跳过并入</span>
        )}
      </div>
      {e.characterMissing && <div />}

      {/* 装备变更 */}
      {e.equipment.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
            <Package className="w-3.5 h-3.5" /> 装备变更
          </div>
          <div className="space-y-0.5">
            {e.equipment.map(l => {
              const checked = selEq[e.combatantId]?.has(l.childId) ?? false;
              const deltaText = l.added
                ? `+${l.resultQty}（拾取）`
                : l.removed || l.resultQty === 0
                  ? '耗尽移除'
                  : `${l.resultQty - l.srcQty > 0 ? '+' : ''}${l.resultQty - l.srcQty}（${l.srcQty} → ${l.resultQty}）`;
              return (
                <label key={l.childId} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelEq(prev => {
                      const next = { ...prev };
                      const set = new Set(next[e.combatantId] ?? []);
                      if (set.has(l.childId)) set.delete(l.childId); else set.add(l.childId);
                      next[e.combatantId] = set;
                      return next;
                    })}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="dark:text-text-dark light:text-text-light flex-1 truncate">{l.name}</span>
                  <span className={`tabular-nums ${l.resultQty > l.srcQty ? 'text-accent' : 'text-danger'}`}>{deltaText}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* 法术位消耗 */}
      {e.spellSlots.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
            <Sparkles className="w-3.5 h-3.5" /> 法术位消耗
          </div>
          <label className="flex items-center gap-2 py-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={selSlots.has(e.combatantId)}
              onChange={() => setSelSlots(prev => {
                const next = new Set(prev);
                if (next.has(e.combatantId)) next.delete(e.combatantId); else next.add(e.combatantId);
                return next;
              })}
              className="w-4 h-4 accent-primary"
            />
            <span className="dark:text-text-dark light:text-text-light flex-1">
              {e.spellSlots.map(s => `${s.label} ×${s.delta}`).join('、')}
            </span>
          </label>
        </div>
      )}

      {/* HP */}
      {e.hp && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
            <Heart className="w-3.5 h-3.5" /> HP
          </div>
          <label className="flex items-center gap-2 py-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={selHp.has(e.combatantId)}
              onChange={() => setSelHp(prev => {
                const next = new Set(prev);
                if (next.has(e.combatantId)) next.delete(e.combatantId); else next.add(e.combatantId);
                return next;
              })}
              className="w-4 h-4 accent-primary"
            />
            <span className="dark:text-text-dark light:text-text-light flex-1">
              {e.hp.from} → {e.hp.to}
            </span>
          </label>
        </div>
      )}

      {/* 状态继承 */}
      {e.statuses.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
            <Zap className="w-3.5 h-3.5" /> 持续状态
          </div>
          <div className="space-y-0.5">
            {e.statuses.map(line => (
              <StatusLineRow
                key={line.instance.instanceId}
                line={line}
                checked={selStatus[e.combatantId]?.has(line.instance.instanceId) ?? false}
                onToggle={() => setSelStatus(prev => {
                  const next = { ...prev };
                  const set = new Set(next[e.combatantId] ?? []);
                  if (set.has(line.instance.instanceId)) set.delete(line.instance.instanceId);
                  else set.add(line.instance.instanceId);
                  next[e.combatantId] = set;
                  return next;
                })}
              />
            ))}
          </div>
        </div>
      )}

      {e.equipment.length === 0 && e.spellSlots.length === 0 && !e.hp && e.statuses.length === 0 && (
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted py-1">无变更</div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div
        className="relative w-full max-w-md max-h-[85vh] rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light shrink-0">
          <h3 className="font-bold text-sm dark:text-text-dark light:text-text-light">
            战斗结算 — {record.title}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-danger/10 text-danger transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 overflow-y-auto space-y-3">
          {error && (
            <div className="text-xs text-danger bg-danger/10 rounded-lg p-2">{error}</div>
          )}
          {!preview && !error && (
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">生成预览中…</div>
          )}
          {preview && !hasAnyChange && (
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted py-4 text-center">
              所有参战者均无可并入变更，确认后直接封存记录。
            </div>
          )}
          {preview && hasAnyChange && preview.entries.map(renderEntry)}
          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
            确认后勾选项将并入对应角色卡，战斗记录封存为只读。
          </div>
        </div>

        <div className="flex gap-2 p-3 border-t dark:border-border-dark light:border-border-light shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!preview || !!error}
            className="flex-1 py-2 text-sm rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" /> 确认结算
          </button>
        </div>
      </div>
    </div>
  );
}
