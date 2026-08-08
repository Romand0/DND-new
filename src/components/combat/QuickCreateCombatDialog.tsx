import { useState, useEffect, useMemo } from 'react';
import { X, Zap } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import type { Character } from '@/types/character';

export interface QuickCreateResult {
  title: string;
  /** 选中的参战者列表，已填入先攻值 */
  combatants: Array<{
    characterId: string;
    name: string;
    initiative: number;
    ac: number;
    maxHp: number;
    currentHp: number;
    speed: number;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: QuickCreateResult) => void;
}

export default function QuickCreateCombatDialog(props: Props) {
  const { open, onClose, onConfirm } = props;
  const [title, setTitle] = useState('');
  const [allChars, setAllChars] = useState<Character[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initiativeInputs, setInitiativeInputs] = useState<Record<string, string>>({});

  // 打开时：初始化名称 + 读取所有本地 PC + 默认全选
  useEffect(() => {
    if (!open) return;
    const defaultTitle = `战斗记录 ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setTitle(defaultTitle);
    const chars = characterStore.getAll();
    setAllChars(chars);
    const ids = new Set(chars.map(c => c.id));
    setSelectedIds(ids);
    // 先攻默认空，由用户填
    const initInit: Record<string, string> = {};
    chars.forEach(c => { initInit[c.id] = ''; });
    setInitiativeInputs(initInit);
  }, [open]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === allChars.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allChars.map(c => c.id)));
    }
  };

  const updateInitiative = (id: string, value: string) => {
    setInitiativeInputs(prev => ({ ...prev, [id]: value }));
  };

  const handleConfirm = () => {
    if (!title.trim()) {
      alert('战斗名称不能为空');
      return;
    }
    if (selectedIds.size === 0) {
      alert('请至少选择一位参战者');
      return;
    }
    const combatants: QuickCreateResult['combatants'] = [];
    for (const char of allChars) {
      if (!selectedIds.has(char.id)) continue;
      const raw = initiativeInputs[char.id]?.trim() ?? '';
      const init = parseInt(raw, 10);
      if (isNaN(init)) {
        alert(`${char.name} 的先攻值未填写或不是有效数字`);
        return;
      }
      combatants.push({
        characterId: char.id,
        name: char.name,
        initiative: init,
        ac: char.armorClass ?? 0,
        maxHp: char.maxHp ?? 0,
        currentHp: char.currentHp ?? char.maxHp ?? 0,
        speed: char.speed ?? 30,
      });
    }
    onConfirm({ title: title.trim(), combatants });
  };

  const handleCancel = () => {
    onClose();
  };

  // 快速随机先攻：d20 + 敏捷调整值
  const rollAllInitiative = () => {
    setInitiativeInputs(prev => {
      const next = { ...prev };
      allChars.forEach(c => {
        if (!selectedIds.has(c.id)) return;
        const dexMod = c.abilities?.dexterity?.modifier ?? 0;
        const d20 = Math.floor(Math.random() * 20) + 1;
        next[c.id] = String(d20 + dexMod);
      });
      return next;
    });
  };

  const selectedChars = useMemo(
    () => allChars.filter(c => selectedIds.has(c.id)),
    [allChars, selectedIds]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            快速创建战斗
          </h3>
          <button
            onClick={handleCancel}
            className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 战斗名称 */}
          <div>
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5 block">
              战斗名称
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') handleCancel();
              }}
              className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary transition-colors"
              placeholder="请输入战斗名称"
            />
          </div>

          {/* 角色列表头部 */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allChars.length > 0 && selectedIds.size === allChars.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm dark:text-text-dark light:text-text-light">
                  全选（{selectedIds.size}/{allChars.length}）
                </span>
              </label>
            </div>
            <button
              onClick={rollAllInitiative}
              disabled={selectedChars.length === 0}
              className="px-3 py-1.5 text-xs rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🎲 随机先攻（d20+敏捷）
            </button>
          </div>

          {/* 角色列表 */}
          {allChars.length === 0 ? (
            <div className="py-8 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted border-2 border-dashed rounded-lg dark:border-border-dark light:border-border-light">
              暂无本地角色，请先在角色资料库中创建 PC。
            </div>
          ) : (
            <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {allChars.map(char => {
                const selected = selectedIds.has(char.id);
                const dexMod = char.abilities?.dexterity?.modifier ?? 0;
                return (
                  <div
                    key={char.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      selected
                        ? 'dark:border-primary/40 dark:bg-bg-dark light:border-primary/40 light:bg-bg-light-2'
                        : 'dark:border-border-dark light:border-border-light opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelect(char.id)}
                      className="w-4 h-4 accent-primary shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">
                        {char.name}
                      </div>
                      <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                        敏捷 {dexMod >= 0 ? `+${dexMod}` : dexMod} · AC {char.armorClass} · HP {char.currentHp}/{char.maxHp}
                      </div>
                    </div>
                    <div className="shrink-0 w-28">
                      <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                        先攻
                      </label>
                      <input
                        type="number"
                        disabled={!selected}
                        value={initiativeInputs[char.id] ?? ''}
                        onChange={(e) => updateInitiative(char.id, e.target.value)}
                        className={`w-full px-2 py-1.5 text-sm rounded border outline-none focus:border-primary transition-colors ${
                          selected
                            ? 'dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light'
                            : 'dark:border-border-dark/50 light:border-border-light/50 dark:bg-bg-dark/30 light:bg-bg-light/30 opacity-50 cursor-not-allowed'
                        }`}
                        placeholder="如 15"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 底部按钮 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCancel}
              className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedChars.length === 0 || !title.trim()}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              确认建表
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
