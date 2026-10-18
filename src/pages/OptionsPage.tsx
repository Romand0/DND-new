import { useState, useEffect, useMemo } from 'react';
import { Users, Sparkles, Crown, Shield, Search, ChevronDown, ChevronRight } from 'lucide-react';
import optionStore from '@/data/optionStore';
import type { CharacterOption, OptionCategory, OptionTrait, ClassTableRow } from '@/types/characterOption';

const CATEGORY_TABS: { key: OptionCategory; label: string; icon: typeof Users }[] = [
  { key: 'race', label: '种族', icon: Users },
  { key: 'background', label: '背景', icon: Sparkles },
  { key: 'class', label: '职业', icon: Crown },
  { key: 'subclass', label: '子职业', icon: Shield },
];

const CATEGORY_LABEL: Record<OptionCategory, string> = {
  race: '种族',
  subrace: '亚种',
  background: '背景',
  class: '职业',
  subclass: '子职业',
};

const ABILITY_ORDER = ['力量', '敏捷', '体质', '智力', '感知', '魅力'];

function AbilityBonusBadges({ bonus }: { bonus: Record<string, number> }) {
  const entries = ABILITY_ORDER.filter((a) => bonus[a]).map((a) => [a, bonus[a]] as const);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([a, v]) => (
        <span key={a} className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
          {a} +{v}
        </span>
      ))}
    </div>
  );
}

function MechanicsBadges({ option }: { option: CharacterOption }) {
  const m = option.mechanics || {};
  const badges: string[] = [];
  if (m.size) badges.push(`体型：${m.size}`);
  if (m.speed) badges.push(`速度：${m.speed}尺`);
  if (m.darkvision) badges.push(`黑暗视觉：${m.darkvision}尺`);
  if (m.hitDie) badges.push(`生命骰：d${m.hitDie}`);
  if (m.savingThrows?.length) badges.push(`豁免：${m.savingThrows.join('、')}`);
  if (m.skills) badges.push(`技能：${m.skills}`);
  if (m.languages) badges.push(`语言：${m.languages}`);
  if (m.tools) badges.push(`工具：${m.tools}`);
  if (m.equipment) badges.push(`装备：${m.equipment}`);
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {badges.map((b) => (
        <span key={b} className="px-2 py-0.5 rounded-full bg-white/5 border border-border-dark text-gray-300 text-xs">
          {b}
        </span>
      ))}
    </div>
  );
}

function TraitList({ traits, title }: { traits: OptionTrait[]; title: string }) {
  if (!traits.length) return null;
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-gray-300 mb-2">{title}</h4>
      <div className="space-y-2">
        {traits.map((t) => (
          <div key={t.name} className="p-3 rounded-lg bg-white/5 border border-border-dark">
            <div className="text-sm font-medium text-gray-200">
              {t.name}
              {t.nameEn && <span className="ml-2 text-xs text-gray-500">{t.nameEn}</span>}
            </div>
            {t.text && <p className="mt-1 text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">{t.text}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassTable({ table }: { table: ClassTableRow[] }) {
  if (!table.length) return null;
  const slotLabels = Object.keys(table.find((r) => r.slots)?.slots || {});
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-gray-300 mb-2">职业表</h4>
      <div className="overflow-x-auto rounded-lg border border-border-dark">
        <table className="w-full text-xs">
          <thead className="bg-white/5">
            <tr>
              <th className="px-2 py-1.5 text-left text-gray-300">等级</th>
              <th className="px-2 py-1.5 text-left text-gray-300">熟练</th>
              <th className="px-2 py-1.5 text-left text-gray-300">职业特性</th>
              {slotLabels.map((l) => (
                <th key={l} className="px-2 py-1.5 text-left text-gray-300">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.level} className="border-t border-border-dark/60">
                <td className="px-2 py-1 text-gray-200">{r.level}</td>
                <td className="px-2 py-1 text-gray-400">+{r.proficiency}</td>
                <td className="px-2 py-1 text-gray-400">{r.features.join('，') || '—'}</td>
                {slotLabels.map((l) => (
                  <td key={l} className="px-2 py-1 text-gray-500">{r.slots?.[l] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptionCard({ option, expanded, onToggle }: { option: CharacterOption; expanded: boolean; onToggle: () => void }) {
  // 建议特征默认只展示前 3 条，点击卡片展开全部
  const [openChars, setOpenChars] = useState<Set<number>>(new Set());
  const toggleChar = (i: number) => {
    setOpenChars((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  return (
    <div className="rounded-xl border border-border-dark bg-white/[0.03] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-200">{option.name}</span>
            {option.nameEn && <span className="text-xs text-gray-500">{option.nameEn}</span>}
            {option.parentName && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs">{option.parentName}</span>
            )}
          </div>
          {option.description && (
            <p className="mt-1 text-xs text-gray-500 line-clamp-1">{option.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(option.traits.length > 0 || option.table) && (
            <span className="text-xs text-gray-500">{option.traits.length} 条特质</span>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border-dark/60 pt-3">
          <MechanicsBadges option={option} />
          {option.mechanics?.abilityBonus && (
            <div className="mb-3">
              <AbilityBonusBadges bonus={option.mechanics.abilityBonus} />
            </div>
          )}
          {option.table && <ClassTable table={option.table} />}
          <TraitList traits={option.traits} title={option.category === 'class' || option.category === 'subclass' ? '职业特性' : '种族特质'} />
          {option.parentTraits && <TraitList traits={option.parentTraits} title={`继承自${option.parentName}的特质`} />}
          {option.feature && (
            <TraitList traits={[option.feature]} title="背景特性" />
          )}
          {option.characteristics && option.characteristics.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-2">建议特征</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {option.characteristics.map((c, i) => {
                  const open = openChars.has(i);
                  return (
                  <div
                    key={i}
                    onClick={() => c.entries.length > 3 && toggleChar(i)}
                    className={`p-2.5 rounded-lg bg-white/5 border border-border-dark ${c.entries.length > 3 ? 'cursor-pointer hover:border-primary/40 transition-colors' : ''}`}
                  >
                    <div className="text-xs text-gray-500 mb-1 flex items-center justify-between">
                      <span>
                        d{c.die.replace('d', '')}-{c.kind}
                      </span>
                      {c.entries.length > 3 && (
                        <span className="text-gray-600">{open ? '收起' : `展开全部 ${c.entries.length} 条`}</span>
                      )}
                    </div>
                    {(open ? c.entries : c.entries.slice(0, 3)).map((e, j) => (
                      <p key={j} className="text-xs text-gray-400 leading-relaxed">{e}</p>
                    ))}
                  </div>
                  );
                })}
              </div>
            </div>
          )}
          {option.subclasses && option.subclasses.length > 0 && (
            <div className="mt-2">
              <h4 className="text-sm font-semibold text-gray-300 mb-2">子职业</h4>
              <div className="flex flex-wrap gap-1.5">
                {option.subclasses.map((s) => (
                  <span key={s} className="px-2 py-0.5 rounded-full bg-white/5 border border-border-dark text-xs text-gray-300">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OptionsPage() {
  const [category, setCategory] = useState<OptionCategory>('race');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [options, setOptions] = useState<CharacterOption[]>(() => optionStore.getAll());

  useEffect(() => {
    const unsub = optionStore.subscribe(() => setOptions(optionStore.getAll()));
    setOptions(optionStore.getAll());
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const list = options.filter((o) => o.category === category);
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (o) => o.name.toLowerCase().includes(q) || o.nameEn.toLowerCase().includes(q) || (o.parentName && o.parentName.toLowerCase().includes(q))
    );
  }, [options, category, search]);

  // 亚种/子职业按母项分组排序
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.parentName !== b.parentName) return a.parentName.localeCompare(b.parentName, 'zh');
      return a.name.localeCompare(b.name, 'zh');
    });
  }, [filtered]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">角色选项</h1>
        <span className="text-sm text-gray-500">{sorted.length} 条 · 玩家手册 2014</span>
      </div>

      {/* 分类切换 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {CATEGORY_TABS.map((t) => {
          const count = options.filter((o) => o.category === t.key).length;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setCategory(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                category === t.key
                  ? 'bg-primary text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              <span className={`text-xs ${category === t.key ? 'text-white/70' : 'text-gray-600'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* 搜索 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索名称…"
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-border-dark text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* 列表 */}
      <div className="space-y-2">
        {sorted.map((o) => (
          <OptionCard
            key={o.id}
            option={o}
            expanded={expandedId === o.id}
            onToggle={() => setExpandedId(expandedId === o.id ? null : o.id)}
          />
        ))}
        {sorted.length === 0 && (
          <div className="text-center py-16 text-gray-500 text-sm">暂无{CATEGORY_LABEL[category]}数据</div>
        )}
      </div>
    </div>
  );
}
