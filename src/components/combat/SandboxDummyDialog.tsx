// 试验场己方人偶设置弹窗：选择职业/子职业/等级 → 自动解锁特性并写入影子卡，
// 支持六属性/HP/速度自定义；法术位按职业表自动填充（资源消耗模式下可用）。
// 影子卡（isSandbox）不上云、角色列表隐藏；人偶参战者复用完整 PC 派生链路
//（AC 重算 / 豁免加值 / 被动引擎 features / 战斗背包装备）。
import { useEffect, useState, useMemo } from 'react';
import { X, Plus } from 'lucide-react';
import optionStore from '@/data/optionStore';
import { subscribeLibraryScope } from '@/data/libraryScope';
import type { CharacterOption, OptionTrait } from '@/types/characterOption';
import type { Character, Feature, Abilities } from '@/types/character';
import { useNumberInput, useTextInput } from '@/hooks/useInput';

export interface SandboxDummyConfig {
  name: string;
  classId: string | null;
  /** 职业名（影子卡 profession.class，供无甲防御等按职业匹配的被动规则使用） */
  className: string | null;
  subclassId: string | null;
  subclassName: string | null;
  level: number;
  abilities: Record<keyof Abilities, number>;
  maxHp: number;
  speed: number;
  features: Feature[];
  spellSlots: Character['spells']['spellSlots'];
}

interface Props {
  open: boolean;
  defaultName: string;
  onConfirm: (config: SandboxDummyConfig) => void;
  onClose: () => void;
}

const ABILITY_LABELS: { key: keyof Abilities; label: string }[] = [
  { key: 'strength', label: '力量' },
  { key: 'dexterity', label: '敏捷' },
  { key: 'constitution', label: '体质' },
  { key: 'intelligence', label: '智力' },
  { key: 'wisdom', label: '感知' },
  { key: 'charisma', label: '魅力' },
];

const modifierOf = (score: number): number => Math.floor((score - 10) / 2);
const fmtMod = (m: number): string => (m >= 0 ? `+${m}` : `${m}`);

/** 职业特性按等级解锁（OptionTrait.level 缺省视为 1 级），映射为角色卡 Feature */
function traitsToFeatures(traits: OptionTrait[], level: number): Feature[] {
  return traits
    .filter(t => (t.level ?? 1) <= level)
    .map((t, i) => ({
      id: `sandbox-feat-${t.name}-${i}`,
      name: t.name,
      description: t.text,
      category: '职业特性',
      level: t.level ?? 1,
      ...(t.role ? { role: t.role } : {}),
      ...(t.system ? { system: t.system } : {}),
      ...(t.systemKind ? { systemKind: t.systemKind } : {}),
    }));
}

/** 职业表 slots（「1环」: "2"）→ SpellSlots（levelN: {max, used:0}）；「－」跳过 */
function tableSlotsToSpellSlots(table: CharacterOption['table'], level: number): Character['spells']['spellSlots'] {
  const slots = table?.find(r => r.level === level)?.slots;
  const out: Character['spells']['spellSlots'] = {
    level1: { max: 0, used: 0 }, level2: { max: 0, used: 0 }, level3: { max: 0, used: 0 },
    level4: { max: 0, used: 0 }, level5: { max: 0, used: 0 }, level6: { max: 0, used: 0 },
    level7: { max: 0, used: 0 }, level8: { max: 0, used: 0 }, level9: { max: 0, used: 0 },
  };
  if (!slots) return out;
  for (let lv = 1; lv <= 9; lv++) {
    const raw = slots[`${lv}环`];
    const n = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
    if (!isNaN(n) && n > 0) out[`level${lv}` as keyof Character['spells']['spellSlots']] = { max: n, used: 0 };
  }
  return out;
}

export default function SandboxDummyDialog(props: Props) {
  const { open, defaultName, onConfirm, onClose } = props;

  // optionStore 种子按规则书范围异步加载：订阅变更信号驱动重取（弹窗未打开时也保持新鲜）
  const [optionTick, setOptionTick] = useState(0);
  useEffect(() => {
    const un1 = optionStore.subscribe(() => setOptionTick(t => t + 1));
    const un2 = subscribeLibraryScope(() => setOptionTick(t => t + 1));
    return () => { un1(); un2(); };
  }, []);
  const classes = useMemo(() => {
    void optionTick;
    return optionStore.getAll().filter(o => o.category === 'class' && !o.deleted);
  }, [optionTick]);
  const [classId, setClassId] = useState<string>('');
  const [subclassId, setSubclassId] = useState<string>('');
  const nameInput = useTextInput(defaultName, { fallback: defaultName, trimOnBlur: true });
  // 弹窗每次打开重置名称为最新序号（组件常驻，state 跨次保留会拿到过期编号）
  useEffect(() => {
    if (open) nameInput.setExternal(defaultName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultName]);
  const levelInput = useNumberInput(1, { fallback: 1 });
  const hpInput = useNumberInput(20, { fallback: 20 });
  const speedInput = useNumberInput(30, { fallback: 30 });
  const [scores, setScores] = useState<Record<keyof Abilities, number>>({
    strength: 10, dexterity: 10, constitution: 10,
    intelligence: 10, wisdom: 10, charisma: 10,
  });

  const selectedClass = classes.find(c => c.id === classId) ?? null;
  const subclasses = selectedClass
    ? optionStore.getSubclasses(selectedClass.name).filter(s => !s.deleted)
    : [];
  const selectedSubclass = subclasses.find(s => s.id === subclassId) ?? null;
  const level = levelInput.value;

  const features = useMemo(() => {
    if (!selectedClass) return [];
    const list = traitsToFeatures(selectedClass.traits, level);
    if (selectedSubclass) list.push(...traitsToFeatures(selectedSubclass.traits, level));
    return list;
  }, [selectedClass, selectedSubclass, level]);

  const spellSlots = useMemo(
    () => (selectedClass ? tableSlotsToSpellSlots(selectedClass.table, level) : null),
    [selectedClass, level]
  );

  if (!open) return null;

  const hasSpellSlots = !!spellSlots && (Object.keys(spellSlots) as (keyof Character['spells']['spellSlots'])[]).some(k => spellSlots[k].max > 0);

  const handleConfirm = () => {
    onConfirm({
      name: nameInput.text.trim() || defaultName,
      classId: selectedClass?.id ?? null,
      className: selectedClass?.name ?? null,
      subclassId: selectedSubclass?.id ?? null,
      subclassName: selectedSubclass?.name ?? null,
      level,
      abilities: { ...scores },
      maxHp: hpInput.value,
      speed: speedInput.value,
      features,
      spellSlots: spellSlots ?? {
        level1: { max: 0, used: 0 }, level2: { max: 0, used: 0 }, level3: { max: 0, used: 0 },
        level4: { max: 0, used: 0 }, level5: { max: 0, used: 0 }, level6: { max: 0, used: 0 },
        level7: { max: 0, used: 0 }, level8: { max: 0, used: 0 }, level9: { max: 0, used: 0 },
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-500" />
            己方人偶设置
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 名称 / 等级 / HP / 速度 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">名称</label>
              <input
                type="text"
                value={nameInput.text}
                onChange={e => nameInput.onChange(e.target.value)}
                onBlur={nameInput.onBlur}
                className="w-full px-2 py-1.5 rounded border dark:bg-slate-900 dark:border-border-dark dark:text-text-dark light:bg-white light:border-border-light light:text-text-light text-sm"
              />
            </div>
            <div>
              <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">等级</label>
              <input
                type="number" min={1} max={20}
                value={levelInput.text}
                onChange={e => levelInput.onChange(e.target.value)}
                onBlur={levelInput.onBlur}
                className="w-full px-2 py-1.5 rounded border dark:bg-slate-900 dark:border-border-dark dark:text-text-dark light:bg-white light:border-border-light light:text-text-light text-sm"
              />
            </div>
            <div>
              <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">生命上限</label>
              <input
                type="number" min={1}
                value={hpInput.text}
                onChange={e => hpInput.onChange(e.target.value)}
                onBlur={hpInput.onBlur}
                className="w-full px-2 py-1.5 rounded border dark:bg-slate-900 dark:border-border-dark dark:text-text-dark light:bg-white light:border-border-light light:text-text-light text-sm"
              />
            </div>
            <div>
              <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">速度（尺）</label>
              <input
                type="number" min={0}
                value={speedInput.text}
                onChange={e => speedInput.onChange(e.target.value)}
                onBlur={speedInput.onBlur}
                className="w-full px-2 py-1.5 rounded border dark:bg-slate-900 dark:border-border-dark dark:text-text-dark light:bg-white light:border-border-light light:text-text-light text-sm"
              />
            </div>
          </div>

          {/* 职业 / 子职业 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">职业（可选）</label>
              <select
                value={classId}
                onChange={e => { setClassId(e.target.value); setSubclassId(''); }}
                className="w-full px-2 py-1.5 rounded border dark:bg-slate-900 dark:border-border-dark dark:text-text-dark light:bg-white light:border-border-light light:text-text-light text-sm"
              >
                <option value="">无（纯沙包）</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                子职业{level < 3 && '（3 级起）'}
              </label>
              <select
                value={subclassId}
                onChange={e => setSubclassId(e.target.value)}
                disabled={!selectedClass || level < 3 || subclasses.length === 0}
                className="w-full px-2 py-1.5 rounded border dark:bg-slate-900 dark:border-border-dark dark:text-text-dark light:bg-white light:border-border-light light:text-text-light text-sm disabled:opacity-40"
              >
                <option value="">无</option>
                {subclasses.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 六属性 */}
          <div>
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">属性值（10 = 调整值 +0）</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {ABILITY_LABELS.map(({ key, label }) => (
                <div key={key}>
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                    {label}
                    <span className="ml-1 text-primary font-bold">{fmtMod(modifierOf(scores[key]))}</span>
                  </div>
                  <input
                    type="number" min={1} max={30}
                    value={scores[key]}
                    onChange={e => {
                      const n = parseInt(e.target.value, 10);
                      setScores(prev => ({ ...prev, [key]: isNaN(n) ? 10 : n }));
                    }}
                    className="w-full px-2 py-1.5 rounded border dark:bg-slate-900 dark:border-border-dark dark:text-text-dark light:bg-white light:border-border-light light:text-text-light text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 特性预览 */}
          {selectedClass && (
            <div>
              <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                已解锁特性（{features.length} 条，自动写入人偶，供被动引擎与仪表盘使用）
              </label>
              <div className="max-h-40 overflow-y-auto rounded border dark:border-border-dark light:border-border-light p-2 space-y-1">
                {features.length === 0 && (
                  <div className="text-xs opacity-50 dark:text-text-dark-muted light:text-text-light-muted">当前等级无特性</div>
                )}
                {features.map(f => (
                  <div key={f.id} className="text-xs dark:text-text-dark light:text-text-light flex gap-2">
                    <span className="opacity-50 shrink-0">{f.level ? `L${f.level}` : ''}</span>
                    <span className="font-medium shrink-0">{f.name}</span>
                    <span className="opacity-50 truncate">{f.description.slice(0, 40)}</span>
                  </div>
                ))}
              </div>
              {hasSpellSlots && (
                <div className="text-xs mt-2 text-primary">
                  法术位已按 {selectedClass.name} {level} 级职业表自动填充：
                  {(Object.entries(spellSlots!) as [string, { max: number }][])
                    .filter(([, s]) => s.max > 0)
                    .map(([k, s]) => `${k.replace('level', '')}环×${s.max}`)
                    .join('、')}
                </div>
              )}
            </div>
          )}

          {/* 操作 */}
          <div className="flex justify-end gap-2 pt-2 border-t dark:border-border-dark light:border-border-light">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm hover:bg-green-500"
            >
              生成人偶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
