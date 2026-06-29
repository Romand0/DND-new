// DM Toolkit - Character Detail Page Component
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  Shield,
  Zap,
  Footprints,
  Star,
  Eye,
  Swords,
  ScrollText,
  Package,
  Coins,
  Scale,
  Sparkles,
  Plus,
  Minus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Edit2,
  X,
  Download,
  Library,
} from 'lucide-react';
import type { Character, AbilityKey, ProficiencyCategory, Equipment } from '@/types/character';
import type { Spell } from '@/types/spell';
import type { EquipmentItem } from '@/types/equipment';
import { characterStore } from '@/data/characterStore';
import { spellStore } from '@/data/spellStore';
import SpellPicker from '@/components/SpellPicker';
import EquipmentPicker from '@/components/EquipmentPicker';
import EquipmentEditor from '@/components/EquipmentEditor';

const abilityLabels: Record<AbilityKey, string> = {
  strength: '力量',
  dexterity: '敏捷',
  constitution: '体质',
  intelligence: '智力',
  wisdom: '感知',
  charisma: '魅力',
};

const proficiencyLabels: Record<ProficiencyCategory, string> = {
  armor: '护甲',
  weapons: '武器',
  tools: '工具',
  languages: '语言',
  savingThrows: '豁免熟练',
};

const displayedProficiencyCategories: ProficiencyCategory[] = ['armor', 'weapons', 'tools', 'languages'];

function renderSpellDice(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\d+)d(4|6|8|10|12|20)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={key++} className="inline-flex items-baseline mx-0.5">
        <span className="text-primary font-bold">{match[1]}</span>
        <span className="px-1 py-0 mx-0.5 rounded bg-accent/20 text-accent font-mono font-semibold">
          d{match[2]}
        </span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts;
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border overflow-hidden dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 transition-colors dark:hover:bg-card-dark-hover light:hover:bg-card-light-hover"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold dark:text-text-dark light:text-text-light">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
        )}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function CharacterDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [spellPickerOpen, setSpellPickerOpen] = useState(false);
  const [selectedSpellType, setSelectedSpellType] = useState<'cantrip' | 'spell'>('cantrip');
  const [expandedCantrips, setExpandedCantrips] = useState<Set<number>>(new Set());
  const [expandedSpells, setExpandedSpells] = useState<Set<number>>(new Set());
  const [allSpells, setAllSpells] = useState<Spell[]>(spellStore.getAll());
  const [equipmentPickerOpen, setEquipmentPickerOpen] = useState(false);
  const [expandedEquipment, setExpandedEquipment] = useState<Set<string>>(new Set());
  const [equipmentEditorOpen, setEquipmentEditorOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { id: string }) | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statsEditorOpen, setStatsEditorOpen] = useState(false);
  const [statsForm, setStatsForm] = useState({
    currentHp: 0,
    maxHp: 0,
    tempHp: 0,
    armorClass: 0,
    speed: 0,
    proficiencyBonus: 2,
  });
  const [newProficiency, setNewProficiency] = useState<Record<ProficiencyCategory, string>>({
    armor: '',
    weapons: '',
    tools: '',
    languages: '',
    savingThrows: '',
  });
  const [genderPickerOpen, setGenderPickerOpen] = useState(false);

  const genderOptions = [
    { value: 'male', label: '男', icon: '♂', color: 'text-info' },
    { value: 'female', label: '女', icon: '♀', color: 'text-danger' },
    { value: 'other', label: '其他', icon: '⚧', color: 'text-accent' },
    { value: '', label: '不显示', icon: '—', color: 'dark:text-text-dark-muted light:text-text-light-muted' },
  ] as const;

  const getGenderDisplay = () => {
    if (!character?.gender) return null;
    const option = genderOptions.find((o) => o.value === character.gender);
    return option || null;
  };

  const handleSelectGender = (gender: string) => {
    if (!id) return;
    characterStore.update(id, { gender: gender as any });
    reloadChar();
    setGenderPickerOpen(false);
  };

  const getSpellByName = (name: string): Spell | undefined => {
    return allSpells.find((s) => s.name === name);
  };

  const getSelectedSpellNames = (): string[] => {
    if (!character) return [];
    return [...character.spells.cantrips, ...character.spells.custom];
  };

  const toggleCantripExpand = (index: number) => {
    setExpandedCantrips((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSpellExpand = (index: number) => {
    setExpandedSpells((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSelectSpell = (spell: Spell) => {
    if (!id) return;
    if (selectedSpellType === 'cantrip') {
      characterStore.addCantrip(id, spell.name);
    } else {
      characterStore.addCustomSpell(id, spell.name);
    }
    reloadChar();
  };

  useEffect(() => {
    if (id) {
      const char = characterStore.get(id);
      setCharacter(char);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const unsubscribe = spellStore.subscribe(() => {
      setAllSpells(spellStore.getAll());
    });
    return unsubscribe;
  }, []);

  const reloadChar = () => {
    if (id) {
      const char = characterStore.get(id);
      setCharacter(char);
    }
  };

  const updateAbilityScore = (ability: AbilityKey, score: number | null) => {
    if (!id) return;
    // 当 score 为 null 时，设置为 0
    const finalScore = score ?? 0;
    const modifier = characterStore.calcModifier(finalScore);
    characterStore.update(id, {
      abilities: {
        ...character!.abilities,
        [ability]: { score: finalScore, modifier },
      },
    });
    reloadChar();
  };

  const handleAddAttack = () => {
    if (!id) return;
    characterStore.addAttack(id, { name: '新攻击' });
    reloadChar();
  };

  const handleUpdateAttack = (attackId: string, field: string, value: string) => {
    if (!id) return;
    characterStore.updateAttack(id, attackId, { [field]: value });
    reloadChar();
  };

  const handleDeleteAttack = (attackId: string) => {
    if (!id) return;
    characterStore.deleteAttack(id, attackId);
    reloadChar();
  };

  const handleAddEquipment = () => {
    setEditingEquipment(null);
    setEquipmentEditorOpen(true);
  };

  const handleAddEquipmentFromLibrary = (item: EquipmentItem) => {
    if (!id) return;
    // 创建临时装备对象用于编辑器
    const tempEquipment: Equipment & { id: string } = {
      id: `temp-${Date.now()}`,
      name: item.name,
      category: item.category,
      quantity: 1,
      description: item.description || '',
      weight: item.weight,
      price: item.price,
      properties: item.properties || [],
      tags: item.tags || [],
      source: item.source || '',
      subtype: item.subtype || '',
    };
    setEditingEquipment(tempEquipment);
    setEquipmentEditorOpen(true);
  };

  const handleEditEquipment = (item: Equipment & { id: string }) => {
    setEditingEquipment(item);
    setEquipmentEditorOpen(true);
  };

  const handleSaveEquipment = (formData: Omit<EquipmentItem, 'id' | 'isCustom'>) => {
    if (!id) return;
    if (editingEquipment && editingEquipment.id.startsWith('temp-')) {
      // 从装备库添加的新装备
      characterStore.addEquipment(id, {
        name: formData.name,
        category: formData.category,
        quantity: editingEquipment.quantity || 1,
        description: formData.description,
        weight: formData.weight,
        price: formData.price,
        properties: formData.properties,
        tags: formData.tags,
        source: formData.source,
        subtype: formData.subtype,
      });
    } else if (editingEquipment) {
      // 编辑已有装备
      characterStore.updateEquipment(id, editingEquipment.id, {
        name: formData.name,
        category: formData.category,
        description: formData.description,
        weight: formData.weight,
        price: formData.price,
        properties: formData.properties,
        tags: formData.tags,
        source: formData.source,
        subtype: formData.subtype,
      });
    }
    reloadChar();
    setEquipmentEditorOpen(false);
    setEditingEquipment(null);
  };

  const handleDeleteEquipmentConfirm = () => {
    if (!id || !deleteConfirmId) return;
    characterStore.deleteEquipment(id, deleteConfirmId);
    reloadChar();
    setDeleteConfirmId(null);
  };

  const handleOpenStatsEditor = () => {
    if (!character) return;
    setStatsForm({
      currentHp: character.currentHp,
      maxHp: character.maxHp,
      tempHp: character.tempHp,
      armorClass: character.armorClass,
      speed: character.speed,
      proficiencyBonus: character.proficiencyBonus,
    });
    setStatsEditorOpen(true);
  };

  const handleSaveStats = () => {
    if (!id) return;
    characterStore.update(id, {
      currentHp: statsForm.currentHp || 0,
      maxHp: statsForm.maxHp || 0,
      tempHp: statsForm.tempHp || 0,
      armorClass: statsForm.armorClass || 0,
      speed: statsForm.speed || 0,
      proficiencyBonus: Math.max(2, Math.min(6, statsForm.proficiencyBonus || 2)),
    });
    reloadChar();
    setStatsEditorOpen(false);
  };

  const toggleEquipmentExpand = (equipId: string) => {
    setExpandedEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(equipId)) {
        next.delete(equipId);
      } else {
        next.add(equipId);
      }
      return next;
    });
  };

  const handleAddFeature = () => {
    if (!id) return;
    characterStore.addFeature(id, { name: '新特性' });
    reloadChar();
  };

  const handleUpdateFeature = (featureId: string, field: string, value: string) => {
    if (!id) return;
    characterStore.updateFeature(id, featureId, { [field]: value });
    reloadChar();
  };

  const handleDeleteFeature = (featureId: string) => {
    if (!id) return;
    characterStore.deleteFeature(id, featureId);
    reloadChar();
  };

  const handleRemoveCantrip = (index: number) => {
    if (!id) return;
    characterStore.removeCantrip(id, index);
    reloadChar();
  };

  const handleRemoveCustomSpell = (index: number) => {
    if (!id) return;
    characterStore.removeCustomSpell(id, index);
    reloadChar();
  };

  const handleUpdateSpellSlots = (levelKey: any, field: 'max' | 'used', value: number) => {
    if (!id) return;
    characterStore.updateSpellSlots(id, levelKey, { [field]: value });
    reloadChar();
  };

  const handleAddProficiency = (category: ProficiencyCategory) => {
    if (!id || !newProficiency[category].trim()) return;
    characterStore.addProficiency(id, category, newProficiency[category].trim());
    setNewProficiency({ ...newProficiency, [category]: '' });
    reloadChar();
  };

  const handleRemoveProficiency = (category: ProficiencyCategory, index: number) => {
    if (!id) return;
    characterStore.removeProficiency(id, category, index);
    reloadChar();
  };

  const handleUpdateProficiency = (category: ProficiencyCategory, index: number, value: string) => {
    if (!id) return;
    characterStore.updateProficiency(id, category, index, value);
    reloadChar();
  };

  const hpPercentage = character
    ? character.maxHp > 0
      ? ((character.currentHp + character.tempHp) / character.maxHp) * 100
      : 0
    : 0;

  const hpColor =
    hpPercentage > 60 ? 'bg-success' : hpPercentage > 30 ? 'bg-warning' : 'bg-danger';

  const carryCapacity = character ? character.abilities.strength.score * 15 : 0;
  const totalWeight = character
    ? character.equipment.reduce((sum, item) => {
        const w = item.weight || 0;
        const q = item.quantity || 1;
        return sum + w * q;
      }, 0)
    : 0;
  const isOverloaded = totalWeight > carryCapacity;
  const effectiveSpeed = character
    ? isOverloaded
      ? Math.max(0, character.speed - 10)
      : character.speed
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="dark:text-text-dark-muted light:text-text-light-muted">加载中...</div>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-bold dark:text-text-dark light:text-text-light">角色不存在</h2>
        <Link
          to="/characters"
          className="mt-4 inline-flex items-center gap-2 text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          返回角色列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/characters"
        className="inline-flex items-center gap-2 text-white hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
      </Link>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={character.name}
          onChange={(e) => {
            characterStore.update(id!, { name: e.target.value });
            reloadChar();
          }}
          className="text-xl sm:text-2xl md:text-3xl font-bold bg-transparent border-none outline-none dark:text-text-dark light:text-text-light"
          placeholder="角色名称"
        />
        <button
          onClick={() => setGenderPickerOpen(true)}
          className="flex-shrink-0 p-1 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted transition-colors"
          title={getGenderDisplay()?.label || '设置性别'}
        >
          {getGenderDisplay() ? (
            <span className={`text-xl sm:text-2xl md:text-3xl font-bold ${getGenderDisplay()!.color}`}>
              {getGenderDisplay()!.icon}
            </span>
          ) : (
            <span className="text-lg sm:text-xl md:text-2xl dark:text-text-dark-muted light:text-text-light-muted">
              ⚲
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={character.race}
          onChange={(e) => {
            characterStore.update(id!, { race: e.target.value });
            reloadChar();
          }}
          placeholder="种族"
          className="px-2 py-0.5 text-base bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark dark:focus:text-text-dark light:text-text-light light:focus:text-text-light w-28 font-medium"
        />
        <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
        <input
          type="text"
          value={character.class}
          onChange={(e) => {
            characterStore.update(id!, { class: e.target.value });
            reloadChar();
          }}
          placeholder="职业"
          className="px-2 py-0.5 text-base bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark dark:focus:text-text-dark light:text-text-light light:focus:text-text-light w-28 font-medium"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={character.alignment}
          onChange={(e) => {
            characterStore.update(id!, { alignment: e.target.value });
            reloadChar();
          }}
          placeholder="阵营"
          className="px-2 py-0.5 text-sm bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark-muted dark:focus:text-text-dark light:text-text-light-muted light:focus:text-text-light w-20"
        />
        <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
        <input
          type="text"
          value={character.size}
          onChange={(e) => {
            characterStore.update(id!, { size: e.target.value });
            reloadChar();
          }}
          placeholder="体型"
          className="px-2 py-0.5 text-sm bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark-muted dark:focus:text-text-dark light:text-text-light-muted light:focus:text-text-light w-16"
        />
        <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 text-accent" />
          <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">等级</span>
          <span className="text-sm font-bold dark:text-text-dark light:text-text-light">
            {characterStore.getLevelFromExp(character.experience)}
          </span>
        </div>
      </div>

      <div className="mt-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">
                经验值: {character.experience}
              </span>
              <span className="dark:text-text-dark-muted light:text-text-light-muted">
                {characterStore.getNextLevelInfo(character.experience).currentLevel >= 20
                  ? '已满级'
                  : `距下一级还需 ${characterStore.getNextLevelInfo(character.experience).expRemaining} XP`}
              </span>
            </div>
            <div className="h-1.5 rounded-full dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${characterStore.getNextLevelInfo(character.experience).expProgress * 100}%` }}
              />
            </div>
            <input
              type="number"
              value={character.experience === 0 ? '' : character.experience}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  // 允许清空，暂不更新 store
                } else {
                  const exp = parseInt(val);
                  if (!isNaN(exp)) {
                    const level = characterStore.getLevelFromExp(exp);
                    const proficiencyBonus = Math.ceil(level / 4) + 1;
                    characterStore.update(id!, { experience: exp, level, proficiencyBonus });
                    reloadChar();
                  }
                }
              }}
              onBlur={(e) => {
                // 失去焦点时，如果为空，设置为 0
                if (e.target.value === '') {
                  characterStore.update(id!, { experience: 0, level: 0, proficiencyBonus: 2 });
                  reloadChar();
                }
              }}
              onKeyDown={(e) => {
                // 按回车时，如果为空，设置为 0
                if (e.key === 'Enter' && (e.target as HTMLInputElement).value === '') {
                  characterStore.update(id!, { experience: 0, level: 0, proficiencyBonus: 2 });
                  reloadChar();
                }
              }}
              className="mt-2 w-full px-2 py-1 text-xs bg-white/50 dark:bg-white/10 rounded outline-none dark:text-text-dark light:text-text-light"
              placeholder="输入经验值..."
            />
          </div>

      <div className="relative">
        <button
          onClick={handleOpenStatsEditor}
          className="absolute top-0 right-0 z-10 p-2 rounded-lg border dark:border-border-dark dark:bg-bg-dark dark:text-text-dark-muted hover:border-primary hover:text-primary light:border-border-light light:bg-bg-light-2 light:text-text-light-muted transition-colors"
          title="编辑属性"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-5 h-5 text-danger" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">生命值</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold dark:text-text-dark light:text-text-light">{character.currentHp}</span>
            {character.tempHp > 0 && (
              <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">(+{character.tempHp})</span>
            )}
            <span className="text-lg dark:text-text-dark-muted light:text-text-light-muted">/</span>
            <span className="text-lg dark:text-text-dark-muted light:text-text-light-muted">{character.maxHp}</span>
          </div>
          <div className="mt-2 h-2 rounded-full dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${hpColor}`} style={{ width: `${hpPercentage}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="dark:text-text-dark-muted light:text-text-light-muted">临时HP: {character.tempHp}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-info" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">护甲等级</span>
          </div>
          <div className="text-3xl font-bold dark:text-text-dark light:text-text-light">{character.armorClass}</div>
        </div>

        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Footprints className="w-5 h-5 text-success" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">速度</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-bold ${
              isOverloaded ? 'text-danger' : 'dark:text-text-dark light:text-text-light'
            }`}>
              {isOverloaded ? effectiveSpeed : character.speed}
            </span>
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">尺</span>
          </div>
          {isOverloaded && (
            <div className="mt-1 text-xs text-danger">
              负重 {character.speed} 尺 → {effectiveSpeed} 尺
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-accent" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">熟练加值</span>
          </div>
          <div className="text-3xl font-bold dark:text-text-dark light:text-text-light">
            {character.proficiencyBonus >= 0 ? `+${character.proficiencyBonus}` : character.proficiencyBonus}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Eye className="w-3.5 h-3.5 dark:text-text-dark-muted light:text-text-light-muted" />
            <span className="dark:text-text-dark-muted light:text-text-light-muted">被动察觉: {character ? characterStore.calcPassivePerception(character) : 10}</span>
          </div>
        </div>
      </div>
      </div>

      <Section title="属性值" icon={Zap}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {(Object.keys(character.abilities) as AbilityKey[]).map((ability) => (
            <div
              key={ability}
              className="text-center p-4 rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light"
            >
              <div className="text-xs uppercase tracking-wide mb-1 dark:text-text-dark-muted light:text-text-light-muted">
                {abilityLabels[ability]}
              </div>
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => {
                    const currentScore = character.abilities[ability].score;
                    if (currentScore > 1) {
                      updateAbilityScore(ability, currentScore - 1);
                    }
                  }}
                  className="w-8 h-8 rounded-lg bg-white/50 dark:bg-white/10 hover:bg-primary/20 dark:hover:bg-primary/30 flex items-center justify-center transition-colors"
                >
                  <Minus className="w-4 h-4 dark:text-text-dark light:text-text-light" />
                </button>
                <span className="w-12 py-1 text-2xl font-bold text-center dark:text-text-dark light:text-text-light">
                  {character.abilities[ability].score}
                </span>
                <button
                  onClick={() => {
                    const currentScore = character.abilities[ability].score;
                    if (currentScore < 30) {
                      updateAbilityScore(ability, currentScore + 1);
                    }
                  }}
                  className="w-8 h-8 rounded-lg bg-white/50 dark:bg-white/10 hover:bg-primary/20 dark:hover:bg-primary/30 flex items-center justify-center transition-colors"
                >
                  <Plus className="w-4 h-4 dark:text-text-dark light:text-text-light" />
                </button>
              </div>
              <div className="mt-1 text-lg font-semibold text-primary">
                {character.abilities[ability].modifier >= 0
                  ? `+${character.abilities[ability].modifier}`
                  : character.abilities[ability].modifier}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2 px-4 py-2 text-sm dark:text-text-dark-muted light:text-text-light-muted">
        <Scale className="w-4 h-4" />
        <span>载重：{carryCapacity} 磅</span>
      </div>

      <Section title="技能与豁免" icon={Star}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {character && characterStore.getGroupedSkills(character).map((group) => (
            <div
              key={group.attribute}
              className="p-3 rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light"
            >
              <div className="flex items-center gap-2 mb-2 pb-2 border-b dark:border-border-dark light:border-border-light">
                <span className="text-sm font-bold dark:text-text-dark light:text-text-light">
                  {group.attributeLabel}
                </span>
                <span className="text-xs text-primary font-mono">
                  {group.save.modifier >= 0 ? `+${group.save.modifier}` : group.save.modifier}
                </span>
              </div>
              
              {/* 豁免 */}
              <div
                className={`flex items-center gap-2 p-1.5 rounded-lg mb-2 transition-colors ${
                  group.save.proficient
                    ? 'bg-accent/10'
                    : 'dark:bg-bg-dark/50 light:bg-bg-light-2/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={group.save.proficient}
                  onChange={() => {
                    characterStore.toggleSaveProficiency(id!, group.save.key);
                    reloadChar();
                  }}
                  className="w-4 h-4 accent-accent"
                />
                <span
                  className={`text-xs flex-1 ${
                    group.save.proficient
                      ? 'font-medium dark:text-text-dark light:text-text-light'
                      : 'dark:text-text-dark-muted light:text-text-light-muted'
                  }`}
                >
                  {group.save.label}
                </span>
                <span
                  className={`text-xs font-mono font-bold w-8 text-right ${
                    group.save.proficient
                      ? 'dark:text-text-dark light:text-text-light'
                      : 'dark:text-text-dark-muted light:text-text-light-muted'
                  }`}
                >
                  {group.save.bonus >= 0 ? `+${group.save.bonus}` : group.save.bonus}
                </span>
              </div>
              
              {/* 技能列表 */}
              {group.skills.map((skill) => (
                <div
                  key={skill.key}
                  className={`flex items-center gap-2 p-1.5 rounded-lg transition-colors ${
                    skill.proficient
                      ? 'bg-primary/10'
                      : 'dark:bg-bg-dark/50 light:bg-bg-light-2/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={skill.proficient}
                    onChange={() => {
                      characterStore.toggleSkillProficiency(id!, skill.key);
                      reloadChar();
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                  <span
                    className={`text-xs flex-1 ${
                      skill.proficient
                        ? 'font-medium dark:text-text-dark light:text-text-light'
                        : 'dark:text-text-dark-muted light:text-text-light-muted'
                    }`}
                  >
                    {skill.label}
                  </span>
                  <span
                    className={`text-xs font-mono font-bold w-8 text-right ${
                      skill.proficient
                        ? 'dark:text-text-dark light:text-text-light'
                        : 'dark:text-text-dark-muted light:text-text-light-muted'
                    }`}
                  >
                    {skill.bonus >= 0 ? `+${skill.bonus}` : skill.bonus}
                  </span>
                </div>
              ))}
              
              {group.skills.length === 0 && (
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted text-center py-1">
                  无关联技能
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="熟练项" icon={Star}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedProficiencyCategories.map((category) => (
            <div key={category}>
              <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                {proficiencyLabels[category]}
              </label>
              <div className="space-y-1 mb-2">
                {character.proficiencies[category].map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg dark:bg-bg-dark light:bg-bg-light-2"
                  >
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleUpdateProficiency(category, index, e.target.value)}
                      className="flex-1 px-1 py-0.5 bg-transparent outline-none text-sm dark:text-text-dark light:text-text-light"
                    />
                    <button
                      onClick={() => handleRemoveProficiency(category, index)}
                      className="p-1 rounded hover:bg-danger/20 text-danger flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProficiency[category]}
                  onChange={(e) =>
                    setNewProficiency({ ...newProficiency, [category]: e.target.value })
                  }
                  onKeyDown={(e) => e.key === 'Enter' && handleAddProficiency(category)}
                  placeholder="添加..."
                  className="flex-1 px-2 py-1.5 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
                <button
                  onClick={() => handleAddProficiency(category)}
                  className="px-2 py-1.5 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Section title="攻击" icon={Swords}>
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-2 py-1 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                <span className="pl-2">攻击名</span>
                <span className="w-14 text-center pr-2">攻击加值</span>
                <span className="w-20 text-center pr-2">伤害/类型</span>
                <span className="w-6"></span>
              </div>
              {character.attacks.map((attack) => (
                <div
                  key={attack.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 items-center p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2"
                >
                  <textarea
                    value={attack.name}
                    onChange={(e) => handleUpdateAttack(attack.id!, 'name', e.target.value)}
                    placeholder="攻击名称"
                    rows={1}
                    className="pl-2 pr-1 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-sm dark:text-text-dark light:text-text-light min-w-0 break-words resize-none min-h-[32px] field-sizing-content"
                  />
                  <input
                    type="text"
                    value={attack.bonus}
                    onChange={(e) => handleUpdateAttack(attack.id!, 'bonus', e.target.value)}
                    placeholder="+5"
                    className="w-14 px-1 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-sm text-center dark:text-text-dark light:text-text-light flex-shrink-0"
                  />
                  <input
                    type="text"
                    value={attack.damage}
                    onChange={(e) => handleUpdateAttack(attack.id!, 'damage', e.target.value)}
                    placeholder="1d6+3"
                    className="w-20 px-1 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-sm text-center dark:text-text-dark light:text-text-light flex-shrink-0"
                  />
                  <button
                    onClick={() => handleDeleteAttack(attack.id!)}
                    className="p-1 rounded hover:bg-danger/20 text-danger flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddAttack}
                className="w-full py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                添加攻击
              </button>
            </div>
          </Section>

          <Section title="装备" icon={Package}>
            <div className="space-y-2">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleAddEquipment}
                  className="flex-1 py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  添加装备
                </button>
                <button
                  onClick={() => setEquipmentPickerOpen(true)}
                  className="flex-1 py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                >
                  <Library className="w-4 h-4 inline mr-1" />
                  从装备库添加
                </button>
              </div>
              {character.equipment.map((item) => {
                const isExpanded = expandedEquipment.has(item.id!);
                return (
                  <div
                    key={item.id}
                    className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden"
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                            {item.name || '未命名装备'}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                            <span className="px-1.5 py-0.5 rounded bg-white/50 dark:bg-white/10 dark:text-text-dark light:text-text-light">
                              {item.category || '—'}
                            </span>
                            <span className="dark:text-text-dark-muted light:text-text-light-muted">
                              <Scale className="w-3 h-3 inline mr-0.5" />
                              {item.weight != null ? `${item.weight} 磅` : '— 磅'}
                            </span>
                            <span className="dark:text-text-dark-muted light:text-text-light-muted">
                              <Coins className="w-3 h-3 inline mr-0.5" />
                              {item.price ? `${item.price.amount} ${item.price.unit}` : '—'}
                            </span>
                            <span className="dark:text-text-dark-muted light:text-text-light-muted">
                              ×{item.quantity || 1}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleEditEquipment(item as Equipment & { id: string })}
                            className="p-1.5 rounded hover:bg-primary/20 text-primary"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(item.id!)}
                            className="p-1.5 rounded hover:bg-danger/20 text-danger"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t dark:border-border-dark/50 light:border-border-light/50">
                        <button
                          onClick={() => toggleEquipmentExpand(item.id!)}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              收起详情
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              详情
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-3 border-t dark:border-border-dark/50 light:border-border-light/50">
                        {item.description && (
                          <div>
                            <div className="text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">描述</div>
                            <div className="text-sm dark:text-text-dark light:text-text-light whitespace-pre-wrap">{item.description}</div>
                          </div>
                        )}
                        {item.properties && item.properties.length > 0 && (
                          <div>
                            <div className="text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">属性标签</div>
                            <div className="flex flex-wrap gap-1">
                              {item.properties.map((prop, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary"
                                >
                                  {prop}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {item.tags && item.tags.length > 0 && (
                          <div>
                            <div className="text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">自由标签</div>
                            <div className="flex flex-wrap gap-1">
                              {item.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent"
                                >
                                  {tag.key}: {tag.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {item.subtype && (
                          <div>
                            <div className="text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">子分类</div>
                            <div className="text-sm dark:text-text-dark light:text-text-light">{item.subtype}</div>
                          </div>
                        )}
                        {item.source && (
                          <div>
                            <div className="text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">来源</div>
                            <div className="text-sm dark:text-text-dark light:text-text-light">{item.source}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className={`mt-3 pt-3 border-t flex items-center justify-between text-sm dark:border-border-dark/50 light:border-border-light/50 ${
                isOverloaded ? 'text-danger' : 'dark:text-text-dark-muted light:text-text-light-muted'
              }`}>
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4" />
                  <span>总负重</span>
                </div>
                <span className="font-medium">
                  {totalWeight} / {carryCapacity} 磅
                  {isOverloaded && <span className="ml-2 text-xs">（超重）</span>}
                </span>
              </div>
            </div>
          </Section>

          <Section title="货币" icon={Coins}>
            <div className="grid grid-cols-4 gap-3">
              {(['cp', 'sp', 'gp', 'pp'] as const).map((coin) => (
                <div key={coin} className="text-center p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                  <div className="text-xs uppercase mb-1 dark:text-text-dark-muted light:text-text-light-muted">
                    {coin === 'cp' ? '铜币' : coin === 'sp' ? '银币' : coin === 'gp' ? '金币' : '铂金币'}
                  </div>
                  <input
                    type="number"
                    value={character.currency[coin] === 0 ? '' : character.currency[coin]}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        // 允许清空，暂不更新 store
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num)) {
                          characterStore.update(id!, {
                            currency: {
                              ...character!.currency,
                              [coin]: num,
                            },
                          });
                          reloadChar();
                        }
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value === '') {
                        characterStore.update(id!, {
                          currency: {
                            ...character!.currency,
                            [coin]: 0,
                          },
                        });
                        reloadChar();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.target as HTMLInputElement).value === '') {
                        characterStore.update(id!, {
                          currency: {
                            ...character!.currency,
                            [coin]: 0,
                          },
                        });
                        reloadChar();
                      }
                    }}
                    placeholder="0"
                    className="w-full py-1 text-lg font-bold text-center rounded bg-white/50 dark:bg-white/10 outline-none dark:text-text-dark light:text-text-light"
                  />
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          {characterStore.shouldShowSpellSlots(character) ? (
            <Section title="法术" icon={Sparkles}>
              <div className="space-y-4">
                {/* 施法者信息 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                    {characterStore.getCasterTypeLabel(character)}
                  </span>
                  <button
                    onClick={() => {
                      characterStore.resetSpellSlots(id!);
                      reloadChar();
                    }}
                    className="px-2 py-1 text-xs rounded border dark:border-border-dark dark:text-text-dark-muted hover:border-primary hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                  >
                    长休重置
                  </button>
                </div>

                {/* 法术位 */}
                <div>
                  <div className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                    法术位
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(() => {
                      const spellData = characterStore.getSpellSlotDisplayData(character);
                      if (!spellData) return null;
                      return spellData.spellSlots.map((slot) => (
                        <div
                          key={slot.level}
                          className="p-2 rounded-lg text-center dark:bg-bg-dark light:bg-bg-light-2"
                        >
                          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                            {slot.label}
                            {slot.isWarlock && <span className="ml-1 text-[10px]">(短休)</span>}
                          </div>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <input
                              type="number"
                              value={slot.used === 0 ? '' : slot.used}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  // 允许清空，暂不更新 store
                                } else {
                                  const num = parseInt(val);
                                  if (!isNaN(num)) {
                                    const levelKey = 'level' + slot.level;
                                    handleUpdateSpellSlots(levelKey, 'used', num);
                                  }
                                }
                              }}
                              onBlur={(e) => {
                                if (e.target.value === '') {
                                  const levelKey = 'level' + slot.level;
                                  handleUpdateSpellSlots(levelKey, 'used', 0);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.target as HTMLInputElement).value === '') {
                                  const levelKey = 'level' + slot.level;
                                  handleUpdateSpellSlots(levelKey, 'used', 0);
                                }
                              }}
                              placeholder="0"
                              className="w-8 py-0.5 text-sm rounded bg-white/50 dark:bg-white/10 outline-none text-center dark:text-text-dark light:text-text-light"
                            />
                            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">/</span>
                            <span className="w-8 py-0.5 text-sm text-center dark:text-text-dark-muted light:text-text-light-muted">
                              {slot.max}
                            </span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* 戏法 */}
                <div>
                  <div className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                    戏法 ({character.spells.cantrips.length})
                  </div>
                <div className="space-y-2">
                  {character.spells.cantrips.map((cantrip, index) => {
                    const spellInfo = getSpellByName(cantrip);
                    const isExpanded = expandedCantrips.has(index);
                    return (
                      <div
                        key={index}
                        className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden"
                      >
                        <div className="flex items-center gap-2 p-2">
                          <button
                            onClick={() => spellInfo && toggleCantripExpand(index)}
                            className="flex-1 flex items-center gap-2 text-left min-w-0"
                          >
                            {spellInfo && (
                              <ChevronDown
                                className={`w-4 h-4 flex-shrink-0 transition-transform dark:text-text-dark-muted light:text-text-light-muted ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                                {cantrip}
                              </div>
                              {spellInfo && (
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/20 text-gray-400">
                                    戏法
                                  </span>
                                  <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                                    {spellInfo.school}
                                  </span>
                                </div>
                              )}
                            </div>
                          </button>
                          <button
                            onClick={() => handleRemoveCantrip(index)}
                            className="p-1 rounded hover:bg-danger/20 text-danger flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {isExpanded && spellInfo && (
                          <div className="px-4 pb-3 pt-1 border-t dark:border-border-dark light:border-border-light">
                            <div className="grid grid-cols-2 gap-2 mb-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                              <div>施法时间: {spellInfo.castingTime}</div>
                              <div>射程: {spellInfo.range}</div>
                              <div>持续时间: {spellInfo.duration}</div>
                              <div>
                                成分:{' '}
                                {[
                                  spellInfo.components.verbal && 'V',
                                  spellInfo.components.somatic && 'S',
                                  spellInfo.components.material && 'M',
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </div>
                            </div>
                            {spellInfo.components.material && spellInfo.materialInfo && (
                              <div className="mb-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                材料: {spellInfo.materialInfo}
                              </div>
                            )}
                            <div className="text-xs whitespace-pre-wrap dark:text-text-dark light:text-text-light">
                              {renderSpellDice(spellInfo.description)}
                            </div>
                            {spellInfo.hasHeightened && spellInfo.heightenedEffect && (
                              <div className="mt-2 pt-2 border-t dark:border-border-dark/50 light:border-border-light/50">
                                <div className="text-xs font-medium text-accent mb-1">升环效果</div>
                                <div className="text-xs whitespace-pre-wrap dark:text-text-dark light:text-text-light">
                                  {renderSpellDice(spellInfo.heightenedEffect)}
                                </div>
                              </div>
                            )}
                            {spellInfo.notes && (
                              <div className="mt-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                备注: {spellInfo.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => {
                      setSelectedSpellType('cantrip');
                      setSpellPickerOpen(true);
                    }}
                    className="w-full py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                  >
                    <Plus className="w-4 h-4 inline mr-1" />
                    从法术库添加戏法
                  </button>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                  已知法术 ({character.spells.custom.length})
                </div>
                <div className="space-y-2">
                  {character.spells.custom.map((spell, index) => {
                    const spellInfo = getSpellByName(spell);
                    const isExpanded = expandedSpells.has(index);
                    return (
                      <div
                        key={index}
                        className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden"
                      >
                        <div className="flex items-center gap-2 p-2">
                          <button
                            onClick={() => spellInfo && toggleSpellExpand(index)}
                            className="flex-1 flex items-center gap-2 text-left min-w-0"
                          >
                            {spellInfo && (
                              <ChevronDown
                                className={`w-4 h-4 flex-shrink-0 transition-transform dark:text-text-dark-muted light:text-text-light-muted ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                                {spell}
                              </div>
                              {spellInfo && (
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      spellInfo.level === 0
                                        ? 'bg-gray-500/20 text-gray-400'
                                        : 'bg-primary/20 text-primary'
                                    }`}
                                  >
                                    {spellInfo.level === 0 ? '戏法' : `${spellInfo.level}环`}
                                  </span>
                                  <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                                    {spellInfo.school}
                                  </span>
                                </div>
                              )}
                            </div>
                          </button>
                          <button
                            onClick={() => handleRemoveCustomSpell(index)}
                            className="p-1 rounded hover:bg-danger/20 text-danger flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {isExpanded && spellInfo && (
                          <div className="px-4 pb-3 pt-1 border-t dark:border-border-dark light:border-border-light">
                            <div className="grid grid-cols-2 gap-2 mb-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                              <div>施法时间: {spellInfo.castingTime}</div>
                              <div>射程: {spellInfo.range}</div>
                              <div>持续时间: {spellInfo.duration}</div>
                              <div>
                                成分:{' '}
                                {[
                                  spellInfo.components.verbal && 'V',
                                  spellInfo.components.somatic && 'S',
                                  spellInfo.components.material && 'M',
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </div>
                            </div>
                            {spellInfo.components.material && spellInfo.materialInfo && (
                              <div className="mb-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                材料: {spellInfo.materialInfo}
                              </div>
                            )}
                            <div className="text-xs whitespace-pre-wrap dark:text-text-dark light:text-text-light">
                              {renderSpellDice(spellInfo.description)}
                            </div>
                            {spellInfo.hasHeightened && spellInfo.heightenedEffect && (
                              <div className="mt-2 pt-2 border-t dark:border-border-dark/50 light:border-border-light/50">
                                <div className="text-xs font-medium text-accent mb-1">升环效果</div>
                                <div className="text-xs whitespace-pre-wrap dark:text-text-dark light:text-text-light">
                                  {renderSpellDice(spellInfo.heightenedEffect)}
                                </div>
                              </div>
                            )}
                            {spellInfo.notes && (
                              <div className="mt-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                备注: {spellInfo.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => {
                      setSelectedSpellType('spell');
                      setSpellPickerOpen(true);
                    }}
                    className="w-full py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                  >
                    <Plus className="w-4 h-4 inline mr-1" />
                    从法术库添加法术
                  </button>
                </div>
              </div>
            </div>
          </Section>
          ) : null}

          <Section title="特性与特质" icon={Sparkles}>
            <div className="space-y-2">
              {character.features.map((feature) => (
                <div
                  key={feature.id}
                  className="p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <textarea
                      value={feature.name}
                      onChange={(e) => handleUpdateFeature(feature.id!, 'name', e.target.value)}
                      placeholder="特性名称"
                      rows={1}
                      className="flex-1 px-2 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-sm font-medium dark:text-text-dark light:text-text-light resize-none min-h-[32px] field-sizing-content"
                    />
                    <input
                      type="text"
                      value={feature.category}
                      onChange={(e) => handleUpdateFeature(feature.id!, 'category', e.target.value)}
                      placeholder="分类"
                      className="w-20 px-1 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-xs text-center dark:text-text-dark-muted light:text-text-light-muted"
                    />
                    <button
                      onClick={() => handleDeleteFeature(feature.id!)}
                      className="p-1 rounded hover:bg-danger/20 text-danger"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={feature.description}
                    onChange={(e) => handleUpdateFeature(feature.id!, 'description', e.target.value)}
                    placeholder="描述..."
                    rows={2}
                    className="w-full px-2 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-xs dark:text-text-dark-muted light:text-text-light-muted resize-none min-h-[48px] field-sizing-content"
                  />
                </div>
              ))}
              <button
                onClick={handleAddFeature}
                className="w-full py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                添加特性
              </button>
            </div>
          </Section>
        </div>
      </div>

      <Section title="背景与描述" icon={ScrollText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              背景
            </label>
            <textarea
              value={character.background}
              onChange={(e) => {
                characterStore.update(id!, { background: e.target.value });
                reloadChar();
              }}
              placeholder="例如：士兵、学者、游荡者..."
              rows={1}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[40px] field-sizing-content"
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              外貌描述
            </label>
            <textarea
              value={character.appearance}
              onChange={(e) => {
                characterStore.update(id!, { appearance: e.target.value });
                reloadChar();
              }}
              placeholder="描述角色的外貌特征..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[80px] field-sizing-content"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              性格特点
            </label>
            <textarea
              value={character.personality}
              onChange={(e) => {
                characterStore.update(id!, { personality: e.target.value });
                reloadChar();
              }}
              placeholder="角色的性格特征..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[96px] field-sizing-content"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              理想
            </label>
            <textarea
              value={character.ideals}
              onChange={(e) => {
                characterStore.update(id!, { ideals: e.target.value });
                reloadChar();
              }}
              placeholder="角色的理想与信念..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[96px] field-sizing-content"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              羁绊
            </label>
            <textarea
              value={character.bonds}
              onChange={(e) => {
                characterStore.update(id!, { bonds: e.target.value });
                reloadChar();
              }}
              placeholder="角色的羁绊与重要的人..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[96px] field-sizing-content"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              缺陷
            </label>
            <textarea
              value={character.flaws}
              onChange={(e) => {
                characterStore.update(id!, { flaws: e.target.value });
                reloadChar();
              }}
              placeholder="角色的缺点与弱点..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[96px] field-sizing-content"
            />
          </div>
        </div>
      </Section>

      <div className="flex justify-between items-center pt-4">
        <button
          onClick={() => navigate('/characters')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
        >
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => characterStore.exportSingleCharacter(character.id)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
          >
            <Download className="w-4 h-4" />
            导出此角色
          </button>
          <button
            onClick={() => {
              characterStore.delete(character.id);
              navigate('/characters');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            删除角色
          </button>
        </div>
      </div>

      <SpellPicker
        isOpen={spellPickerOpen}
        onClose={() => setSpellPickerOpen(false)}
        onSelect={handleSelectSpell}
        selectedSpellIds={getSelectedSpellNames()}
        characterClass={character?.class}
        filterLevel={selectedSpellType === 'cantrip' ? 0 : 'all'}
        matchByName={true}
      />

      {equipmentPickerOpen && (
        <EquipmentPicker
          onSelect={handleAddEquipmentFromLibrary}
          onClose={() => setEquipmentPickerOpen(false)}
        />
      )}

      {equipmentEditorOpen && (
        <EquipmentEditor
          item={editingEquipment ? {
            id: editingEquipment.id,
            name: editingEquipment.name,
            category: editingEquipment.category,
            subtype: editingEquipment.subtype,
            weight: editingEquipment.weight || 0,
            price: editingEquipment.price || { amount: 0, unit: 'gp' },
            description: editingEquipment.description || '',
            properties: editingEquipment.properties || [],
            isCustom: true,
            tags: editingEquipment.tags || [],
            source: editingEquipment.source,
          } : undefined}
          onSave={handleSaveEquipment}
          onDelete={editingEquipment && !editingEquipment.id.startsWith('temp-') ? () => {
            if (!id) return;
            characterStore.deleteEquipment(id, editingEquipment.id);
            reloadChar();
            setEquipmentEditorOpen(false);
            setEditingEquipment(null);
          } : undefined}
          onClose={() => {
            setEquipmentEditorOpen(false);
            setEditingEquipment(null);
          }}
        />
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative w-full max-w-xs rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-4 text-center dark:text-text-dark light:text-text-light">
              确认删除
            </h3>
            <p className="text-sm text-center mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要删除这件装备吗？此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2 px-4 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light light:hover:border-primary light:hover:text-primary"
              >
                取消
              </button>
              <button
                onClick={handleDeleteEquipmentConfirm}
                className="flex-1 py-2 px-4 text-sm rounded-lg bg-danger hover:bg-danger-dark text-white transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {statsEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setStatsEditorOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
                编辑属性
              </h3>
              <button
                onClick={() => setStatsEditorOpen(false)}
                className="p-1 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">生命值</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs mb-1 dark:text-text-dark-muted light:text-text-light-muted">当前HP</label>
                    <input
                      type="number"
                      value={statsForm.currentHp || ''}
                      onChange={(e) => setStatsForm({ ...statsForm, currentHp: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 dark:text-text-dark-muted light:text-text-light-muted">最大HP</label>
                    <input
                      type="number"
                      value={statsForm.maxHp || ''}
                      onChange={(e) => setStatsForm({ ...statsForm, maxHp: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 dark:text-text-dark-muted light:text-text-light-muted">临时HP</label>
                    <input
                      type="number"
                      value={statsForm.tempHp || ''}
                      onChange={(e) => setStatsForm({ ...statsForm, tempHp: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">护甲等级 (AC)</label>
                <input
                  type="number"
                  value={statsForm.armorClass || ''}
                  onChange={(e) => setStatsForm({ ...statsForm, armorClass: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                  placeholder="10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">速度</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={statsForm.speed || ''}
                    onChange={(e) => setStatsForm({ ...statsForm, speed: parseInt(e.target.value) || 0 })}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    placeholder="30"
                  />
                  <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">尺</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">熟练加值</label>
                <input
                  type="number"
                  value={statsForm.proficiencyBonus || ''}
                  onChange={(e) => setStatsForm({ ...statsForm, proficiencyBonus: parseInt(e.target.value) || 2 })}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                  placeholder="2"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStatsEditorOpen(false)}
                className="flex-1 py-2 px-4 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light light:hover:border-primary light:hover:text-primary"
              >
                取消
              </button>
              <button
                onClick={handleSaveStats}
                className="flex-1 py-2 px-4 text-sm rounded-lg bg-primary hover:bg-primary-dark text-white transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {genderPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setGenderPickerOpen(false)} />
          <div className="relative w-full max-w-xs rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-4 text-center dark:text-text-dark light:text-text-light">
              选择性别
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {genderOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelectGender(option.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                    character?.gender === option.value
                      ? 'border-primary bg-primary/10'
                      : 'dark:border-border-dark light:border-border-light hover:border-primary hover:bg-primary/5'
                  }`}
                >
                  <span className={`text-3xl font-bold ${option.color}`}>
                    {option.icon}
                  </span>
                  <span className="text-sm dark:text-text-dark light:text-text-light">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setGenderPickerOpen(false)}
              className="w-full mt-4 py-2 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
