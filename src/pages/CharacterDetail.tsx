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
  Sparkles,
  Plus,
  Minus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Download,
} from 'lucide-react';
import type { Character, AbilityKey, ProficiencyCategory } from '@/types/character';
import type { Spell } from '@/types/spell';
import { characterStore } from '@/data/characterStore';
import allSpells from '@/data/spells.json';

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
  const [newCantrip, setNewCantrip] = useState('');
  const [newSpell, setNewSpell] = useState('');
  const [expandedCantrips, setExpandedCantrips] = useState<Set<number>>(new Set());
  const [expandedSpells, setExpandedSpells] = useState<Set<number>>(new Set());
  const [newProficiency, setNewProficiency] = useState<Record<ProficiencyCategory, string>>({
    armor: '',
    weapons: '',
    tools: '',
    languages: '',
    savingThrows: '',
  });

  const getSpellByName = (name: string): Spell | undefined => {
    return (allSpells as Spell[]).find((s) => s.name === name);
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

  useEffect(() => {
    if (id) {
      const char = characterStore.get(id);
      setCharacter(char);
      setLoading(false);
    }
  }, [id]);

  const reloadChar = () => {
    if (id) {
      const char = characterStore.get(id);
      setCharacter(char);
    }
  };

  const updateAbilityScore = (ability: AbilityKey, score: number | null) => {
    if (!id) return;
    const finalScore = score ?? 10;
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
    if (!id) return;
    characterStore.addEquipment(id, { name: '新装备' });
    reloadChar();
  };

  const handleUpdateEquipment = (equipId: string, field: string, value: any) => {
    if (!id) return;
    characterStore.updateEquipment(id, equipId, { [field]: value });
    reloadChar();
  };

  const handleDeleteEquipment = (equipId: string) => {
    if (!id) return;
    characterStore.deleteEquipment(id, equipId);
    reloadChar();
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

  const handleAddCantrip = () => {
    if (!id || !newCantrip.trim()) return;
    characterStore.addCantrip(id, newCantrip.trim());
    setNewCantrip('');
    reloadChar();
  };

  const handleRemoveCantrip = (index: number) => {
    if (!id) return;
    characterStore.removeCantrip(id, index);
    reloadChar();
  };

  const handleAddCustomSpell = () => {
    if (!id || !newSpell.trim()) return;
    characterStore.addCustomSpell(id, newSpell.trim());
    setNewSpell('');
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

  const handleRemoveProficiency = (category: ProficiencyCategory, item: string) => {
    if (!id) return;
    characterStore.removeProficiency(id, category, item);
    reloadChar();
  };

  const hpPercentage = character
    ? character.maxHp > 0
      ? ((character.currentHp + character.tempHp) / character.maxHp) * 100
      : 0
    : 0;

  const hpColor =
    hpPercentage > 60 ? 'bg-success' : hpPercentage > 30 ? 'bg-warning' : 'bg-danger';

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
      <div className="flex items-center gap-4">
        <Link
          to="/characters"
          className="p-2 rounded-lg transition-colors dark:hover:bg-card-dark light:hover:bg-card-light dark:text-text-dark-muted light:text-text-light-muted"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <input
            type="text"
            value={character.name}
            onChange={(e) => {
              characterStore.update(id!, { name: e.target.value });
              reloadChar();
            }}
            className="text-3xl font-bold bg-transparent border-none outline-none w-full dark:text-text-dark light:text-text-light"
            placeholder="角色名称"
          />
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <input
              type="text"
              value={character.race}
              onChange={(e) => {
                characterStore.update(id!, { race: e.target.value });
                reloadChar();
              }}
              placeholder="种族"
              className="px-2 py-0.5 text-sm bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark-muted dark:focus:text-text-dark light:text-text-light-muted light:focus:text-text-light w-24"
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
              className="px-2 py-0.5 text-sm bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark-muted dark:focus:text-text-dark light:text-text-light-muted light:focus:text-text-light w-24"
            />
            <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-accent" />
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
              value={character.experience}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  characterStore.update(id!, { experience: 0, level: 0, proficiencyBonus: 2 });
                } else {
                  const exp = parseInt(val);
                  if (!isNaN(exp)) {
                    const level = characterStore.getLevelFromExp(exp);
                    const proficiencyBonus = Math.ceil(level / 4) + 1;
                    characterStore.update(id!, { experience: exp, level, proficiencyBonus });
                  }
                }
                reloadChar();
              }}
              className="mt-2 w-full px-2 py-1 text-xs bg-white/50 dark:bg-white/10 rounded outline-none dark:text-text-dark light:text-text-light"
              placeholder="输入经验值..."
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-5 h-5 text-danger" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">生命值</span>
          </div>
          <div className="flex items-baseline gap-1">
            <input
              type="number"
              value={character.currentHp}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  characterStore.update(id!, { currentHp: 0 });
                } else {
                  const num = parseInt(val);
                  if (!isNaN(num)) {
                    characterStore.update(id!, { currentHp: num });
                  }
                }
                reloadChar();
              }}
              placeholder="当前"
              className="w-16 px-2 py-1 text-2xl font-bold rounded bg-white/50 dark:bg-white/10 outline-none dark:text-text-dark light:text-text-light"
            />
            {character.tempHp > 0 && (
              <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">(+{character.tempHp})</span>
            )}
            <span className="text-lg dark:text-text-dark-muted light:text-text-light-muted">/</span>
            <input
              type="number"
              value={character.maxHp}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  characterStore.update(id!, { maxHp: 0 });
                } else {
                  const num = parseInt(val);
                  if (!isNaN(num)) {
                    characterStore.update(id!, { maxHp: num });
                  }
                }
                reloadChar();
              }}
              placeholder="最大"
              className="w-16 px-2 py-1 text-lg rounded bg-white/50 dark:bg-white/10 outline-none dark:text-text-dark-muted light:text-text-light-muted"
            />
          </div>
          <div className="mt-2 h-2 rounded-full dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${hpColor}`} style={{ width: `${hpPercentage}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="dark:text-text-dark-muted light:text-text-light-muted">临时HP:</span>
            <input
              type="number"
              value={character.tempHp}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  characterStore.update(id!, { tempHp: 0 });
                } else {
                  const num = parseInt(val);
                  if (!isNaN(num)) {
                    characterStore.update(id!, { tempHp: num });
                  }
                }
                reloadChar();
              }}
              placeholder="0"
              className="w-14 px-2 py-1 rounded bg-white/50 dark:bg-white/10 outline-none dark:text-text-dark light:text-text-light text-center text-sm"
            />
          </div>
        </div>

        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-info" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">护甲等级</span>
          </div>
          <input
            type="number"
            value={character.armorClass}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                characterStore.update(id!, { armorClass: 0 });
              } else {
                const num = parseInt(val);
                if (!isNaN(num)) {
                  characterStore.update(id!, { armorClass: num });
                }
              }
              reloadChar();
            }}
            placeholder="10"
            className="text-3xl font-bold px-3 py-2 rounded bg-white/50 dark:bg-white/10 outline-none dark:text-text-dark light:text-text-light w-full"
          />
        </div>

        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Footprints className="w-5 h-5 text-success" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">速度</span>
          </div>
          <div className="flex items-baseline gap-1">
            <input
              type="number"
              value={character.speed}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  characterStore.update(id!, { speed: 0 });
                } else {
                  const num = parseInt(val);
                  if (!isNaN(num)) {
                    characterStore.update(id!, { speed: num });
                  }
                }
                reloadChar();
              }}
              placeholder="30"
              className="text-3xl font-bold px-3 py-2 rounded bg-white/50 dark:bg-white/10 outline-none dark:text-text-dark light:text-text-light w-20"
            />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">尺</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-accent" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">熟练加值</span>
          </div>
          <input
            type="number"
            value={character.proficiencyBonus}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '') {
                characterStore.update(id!, { proficiencyBonus: 2 });
              } else {
                const num = parseInt(val);
                if (!isNaN(num)) {
                  characterStore.update(id!, { proficiencyBonus: Math.max(2, Math.min(6, num)) });
                }
              }
              reloadChar();
            }}
            placeholder="2"
            className="text-3xl font-bold px-3 py-2 rounded bg-white/50 dark:bg-white/10 outline-none dark:text-text-dark light:text-text-light w-full"
          />
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Eye className="w-3.5 h-3.5 dark:text-text-dark-muted light:text-text-light-muted" />
            <span className="dark:text-text-dark-muted light:text-text-light-muted">被动察觉: {character ? characterStore.calcPassivePerception(character) : 10}</span>
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
              <input
                type="number"
                value={character.abilities[ability].score}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    updateAbilityScore(ability, null);
                  } else {
                    const num = parseInt(val);
                    if (!isNaN(num)) {
                      updateAbilityScore(ability, num);
                    }
                  }
                }}
                placeholder="10"
                className="w-14 py-1 text-2xl font-bold text-center rounded bg-white/50 dark:bg-white/10 outline-none dark:text-text-dark light:text-text-light"
              />
              <div className="mt-1 text-lg font-semibold text-primary">
                {character.abilities[ability].modifier >= 0
                  ? `+${character.abilities[ability].modifier}`
                  : character.abilities[ability].modifier}
              </div>
            </div>
          ))}
        </div>
      </Section>

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
                  <input
                    type="text"
                    value={attack.name}
                    onChange={(e) => handleUpdateAttack(attack.id!, 'name', e.target.value)}
                    placeholder="攻击名称"
                    className="pl-2 pr-1 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-sm dark:text-text-dark light:text-text-light"
                  />
                  <input
                    type="text"
                    value={attack.bonus}
                    onChange={(e) => handleUpdateAttack(attack.id!, 'bonus', e.target.value)}
                    placeholder="+5"
                    className="w-14 px-1 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-sm text-center dark:text-text-dark light:text-text-light"
                  />
                  <input
                    type="text"
                    value={attack.damage}
                    onChange={(e) => handleUpdateAttack(attack.id!, 'damage', e.target.value)}
                    placeholder="1d6+3"
                    className="w-20 px-1 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-sm text-center dark:text-text-dark light:text-text-light"
                  />
                  <button
                    onClick={() => handleDeleteAttack(attack.id!)}
                    className="p-1 rounded hover:bg-danger/20 text-danger"
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
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 px-2 py-1 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                <span className="pl-2">名称</span>
                <span className="w-20 text-center">分类</span>
                <div className="flex items-center justify-end gap-1 pr-6">
                  <span>数量</span>
                </div>
              </div>
              {character.equipment.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2"
                >
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleUpdateEquipment(item.id!, 'name', e.target.value)}
                    placeholder="装备名称"
                    className="pl-2 pr-1 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-sm dark:text-text-dark light:text-text-light"
                  />
                  <input
                    type="text"
                    value={item.category}
                    onChange={(e) => handleUpdateEquipment(item.id!, 'category', e.target.value)}
                    placeholder="分类"
                    className="w-20 px-1 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-xs text-center dark:text-text-dark light:text-text-light"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleUpdateEquipment(item.id!, 'quantity', Math.max(1, (item.quantity || 1) - 1))}
                      className="p-1 rounded hover:bg-white/20 dark:hover:bg-white/10"
                    >
                      <Minus className="w-4 h-4 dark:text-text-dark light:text-text-light" />
                    </button>
                    <span className="w-6 text-center text-sm dark:text-text-dark light:text-text-light">{item.quantity || 1}</span>
                    <button
                      onClick={() => handleUpdateEquipment(item.id!, 'quantity', (item.quantity || 1) + 1)}
                      className="p-1 rounded hover:bg-white/20 dark:hover:bg-white/10"
                    >
                      <Plus className="w-4 h-4 dark:text-text-dark light:text-text-light" />
                    </button>
                    <button
                      onClick={() => handleDeleteEquipment(item.id!)}
                      className="p-1 rounded hover:bg-danger/20 text-danger ml-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={handleAddEquipment}
                className="w-full py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                添加装备
              </button>
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
                    value={character.currency[coin]}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        characterStore.update(id!, {
                          currency: {
                            ...character!.currency,
                            [coin]: 0,
                          },
                        });
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num)) {
                          characterStore.update(id!, {
                            currency: {
                              ...character!.currency,
                              [coin]: num,
                            },
                          });
                        }
                      }
                      reloadChar();
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
                              value={slot.used}
                              onChange={(e) => {
                                const val = e.target.value;
                                const levelKey = 'level' + slot.level;
                                if (val === '') {
                                  handleUpdateSpellSlots(levelKey, 'used', 0);
                                } else {
                                  const num = parseInt(val);
                                  if (!isNaN(num)) {
                                    handleUpdateSpellSlots(levelKey, 'used', num);
                                  }
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
                            className="flex-1 flex items-center gap-2 text-left"
                          >
                            {spellInfo && (
                              <ChevronDown
                                className={`w-4 h-4 flex-shrink-0 transition-transform dark:text-text-dark-muted light:text-text-light-muted ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            )}
                            <span className="text-sm dark:text-text-dark light:text-text-light">
                              {cantrip}
                            </span>
                            {spellInfo && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/20 text-gray-400 flex-shrink-0">
                                {spellInfo.school}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => handleRemoveCantrip(index)}
                            className="p-1 rounded hover:bg-danger/20 text-danger flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {isExpanded && spellInfo && (
                          <div className="px-4 pb-3 pt-1 border-t dark:border-border-dark/50 light:border-border-light/50">
                            <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                              <div>
                                <span className="dark:text-text-dark-muted light:text-text-light-muted">施法时间: </span>
                                <span className="dark:text-text-dark light:text-text-light">{spellInfo.castingTime}</span>
                              </div>
                              <div>
                                <span className="dark:text-text-dark-muted light:text-text-light-muted">射程: </span>
                                <span className="dark:text-text-dark light:text-text-light">{spellInfo.range}</span>
                              </div>
                              <div>
                                <span className="dark:text-text-dark-muted light:text-text-light-muted">持续时间: </span>
                                <span className="dark:text-text-dark light:text-text-light">{spellInfo.duration}</span>
                              </div>
                              <div>
                                <span className="dark:text-text-dark-muted light:text-text-light-muted">成分: </span>
                                <span className="dark:text-text-dark light:text-text-light">
                                  {[
                                    spellInfo.components.verbal && 'V',
                                    spellInfo.components.somatic && 'S',
                                    spellInfo.components.material && 'M',
                                  ]
                                    .filter(Boolean)
                                    .join(', ') || '无'}
                                </span>
                              </div>
                            </div>
                            <div className="text-xs dark:text-text-dark light:text-text-light whitespace-pre-wrap leading-relaxed">
                              {spellInfo.description}
                            </div>
                            {spellInfo.notes && (
                              <div className="mt-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                <span className="font-medium">备注: </span>
                                {spellInfo.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCantrip}
                      onChange={(e) => setNewCantrip(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCantrip()}
                      placeholder="戏法名称"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                    <button
                      onClick={handleAddCantrip}
                      className="px-3 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
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
                            className="flex-1 flex items-center gap-2 text-left"
                          >
                            {spellInfo && (
                              <ChevronDown
                                className={`w-4 h-4 flex-shrink-0 transition-transform dark:text-text-dark-muted light:text-text-light-muted ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            )}
                            <span className="text-sm dark:text-text-dark light:text-text-light">
                              {spell}
                            </span>
                            {spellInfo && (
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                                  spellInfo.level === 0
                                    ? 'bg-gray-500/20 text-gray-400'
                                    : 'bg-primary/20 text-primary'
                                }`}
                              >
                                {spellInfo.level === 0 ? '戏法' : `${spellInfo.level}环`}
                              </span>
                            )}
                            {spellInfo && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/20 text-gray-400 flex-shrink-0">
                                {spellInfo.school}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => handleRemoveCustomSpell(index)}
                            className="p-1 rounded hover:bg-danger/20 text-danger flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {isExpanded && spellInfo && (
                          <div className="px-4 pb-3 pt-1 border-t dark:border-border-dark/50 light:border-border-light/50">
                            <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                              <div>
                                <span className="dark:text-text-dark-muted light:text-text-light-muted">施法时间: </span>
                                <span className="dark:text-text-dark light:text-text-light">{spellInfo.castingTime}</span>
                              </div>
                              <div>
                                <span className="dark:text-text-dark-muted light:text-text-light-muted">射程: </span>
                                <span className="dark:text-text-dark light:text-text-light">{spellInfo.range}</span>
                              </div>
                              <div>
                                <span className="dark:text-text-dark-muted light:text-text-light-muted">持续时间: </span>
                                <span className="dark:text-text-dark light:text-text-light">{spellInfo.duration}</span>
                              </div>
                              <div>
                                <span className="dark:text-text-dark-muted light:text-text-light-muted">成分: </span>
                                <span className="dark:text-text-dark light:text-text-light">
                                  {[
                                    spellInfo.components.verbal && 'V',
                                    spellInfo.components.somatic && 'S',
                                    spellInfo.components.material && 'M',
                                  ]
                                    .filter(Boolean)
                                    .join(', ') || '无'}
                                </span>
                              </div>
                            </div>
                            <div className="text-xs dark:text-text-dark light:text-text-light whitespace-pre-wrap leading-relaxed">
                              {spellInfo.description}
                            </div>
                            {spellInfo.notes && (
                              <div className="mt-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                <span className="font-medium">备注: </span>
                                {spellInfo.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSpell}
                      onChange={(e) => setNewSpell(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSpell()}
                      placeholder="法术名称"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                    <button
                      onClick={handleAddCustomSpell}
                      className="px-3 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
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
                    <input
                      type="text"
                      value={feature.name}
                      onChange={(e) => handleUpdateFeature(feature.id!, 'name', e.target.value)}
                      placeholder="特性名称"
                      className="flex-1 px-2 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-sm font-medium dark:text-text-dark light:text-text-light"
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
                    className="w-full px-2 py-1 rounded bg-white/50 dark:bg-white/10 outline-none text-xs dark:text-text-dark-muted light:text-text-light-muted resize-none"
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
            <input
              type="text"
              value={character.background}
              onChange={(e) => {
                characterStore.update(id!, { background: e.target.value });
                reloadChar();
              }}
              placeholder="例如：士兵、学者、游荡者..."
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              阵营
            </label>
            <input
              type="text"
              value={character.alignment}
              onChange={(e) => {
                characterStore.update(id!, { alignment: e.target.value });
                reloadChar();
              }}
              placeholder="例如：守序善良、中立邪恶..."
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              体型
            </label>
            <input
              type="text"
              value={character.size}
              onChange={(e) => {
                characterStore.update(id!, { size: e.target.value });
                reloadChar();
              }}
              placeholder="例如：中等、小型..."
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
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
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none"
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
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none"
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
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none"
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
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none"
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
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none"
            />
          </div>
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
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg dark:bg-bg-dark light:bg-bg-light-2"
                  >
                    <span className="flex-1 text-sm dark:text-text-dark light:text-text-light">
                      {item}
                    </span>
                    <button
                      onClick={() => handleRemoveProficiency(category, item)}
                      className="p-1 rounded hover:bg-danger/20 text-danger"
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
    </div>
  );
}
