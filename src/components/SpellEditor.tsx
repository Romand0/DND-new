import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Spell } from '@/types/spell';

interface SpellEditorProps {
  spell?: Spell;
  isOpen: boolean;
  onClose: () => void;
  onSave: (spell: Spell, syncToLibrary?: boolean) => Promise<void>;
  showSyncOption?: boolean;
}


const schools = [
  '防护系',
  '咒法系',
  '预言系',
  '附魔系',
  '塑能系',
  '幻术系',
  '死灵系',
  '变化系',
];

const defaultClasses = [
  '吟游诗人',
  '牧师',
  '德鲁伊',
  '圣武士',
  '游侠',
  '术士',
  '法师',
  '邪术士',
];

export default function SpellEditor({ spell, isOpen, onClose, onSave, showSyncOption }: SpellEditorProps) {
const [formData, setFormData] = useState<Spell>({
    id: '',
    name: '',
    level: 0,
    school: '塑能系',
    castingTime: '',
    range: '',
    components: { verbal: false, somatic: false, material: false },

    duration: '',
    description: '',
    classes: [],
    notes: '',
    hasHeightened: false,
    heightenedEffect: '',
    materialInfo: '',
  });

  const [classInput, setClassInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [syncToLibrary, setSyncToLibrary] = useState(false);

  useEffect(() => {
    if (spell) {
      setFormData({ ...spell });
    } else {
      setFormData({
        id: '',
        name: '',
        level: 0,
        school: '塑能系',
        castingTime: '',
        range: '',
        components: { verbal: false, somatic: false, material: false },
        duration: '',
        description: '',
        classes: [],
        notes: '',
        hasHeightened: false,
        heightenedEffect: '',
        materialInfo: '',
      });
    }
    setError('');
  }, [spell, isOpen]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('请输入法术名称');
      return;
    }
    if (!formData.id.trim()) {
      setError('请输入法术ID');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSave(formData, showSyncOption ? syncToLibrary : undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAddClass = () => {
    if (classInput.trim() && !formData.classes.includes(classInput.trim())) {
      setFormData({ ...formData, classes: [...formData.classes, classInput.trim()] });
      setClassInput('');
    }
  };

  const handleRemoveClass = (cls: string) => {
    setFormData({ ...formData, classes: formData.classes.filter((c) => c !== cls) });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light">
          <h2 className="text-xl font-bold dark:text-text-dark light:text-text-light">
            {spell ? '编辑法术' : '新增法术'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">{error}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                法术ID
              </label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="例如：fireball"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                法术名称
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如：火球术"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                环级
              </label>
              <select
                value={formData.level}
                onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
                  <option key={level} value={level} className="dark:bg-bg-dark light:bg-bg-light">
                    {level === 0 ? '戏法 (0环)' : `${level}环`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                学派
              </label>
              <select
                value={formData.school}
                onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              >
                {schools.map((school) => (
                  <option key={school} value={school} className="dark:bg-bg-dark light:bg-bg-light">
                    {school}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                施法时间
              </label>
              <input
                type="text"
                value={formData.castingTime}
                onChange={(e) => setFormData({ ...formData, castingTime: e.target.value })}
                placeholder="1个动作"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                射程
              </label>
              <input
                type="text"
                value={formData.range}
                onChange={(e) => setFormData({ ...formData, range: e.target.value })}
                placeholder="60尺"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                持续时间
              </label>
              <input
                type="text"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="1分钟"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
              成分
            </label>
            <div className="flex gap-6">
              {(['verbal', 'somatic', 'material'] as const).map((comp) => (
                <label
                  key={comp}
                  className="flex items-center gap-2 cursor-pointer dark:text-text-dark light:text-text-light"
                >
                  <input
                    type="checkbox"
                    checked={formData.components[comp]}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        components: { ...formData.components, [comp]: e.target.checked },
                      })
                    }
                    className="w-4 h-4 rounded border-primary text-primary focus:ring-primary"
                  />
                  <span className="text-sm">
                    {comp === 'verbal' ? '语言 (V)' : comp === 'somatic' ? '姿势 (S)' : '材料 (M)'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {formData.components.material && (
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                材料成分
              </label>
              <textarea
                value={formData.materialInfo || ''}
                onChange={(e) => setFormData({ ...formData, materialInfo: e.target.value })}
                placeholder="例如：一颗硫黄球和一团蝙蝠粪"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
              升环机制
            </label>
            <label className="flex items-center gap-2 cursor-pointer dark:text-text-dark light:text-text-light">
              <input
                type="checkbox"
                checked={formData.hasHeightened || false}
                onChange={(e) =>
                  setFormData({ ...formData, hasHeightened: e.target.checked })
                }
                className="w-4 h-4 rounded border-primary text-primary focus:ring-primary"
              />
              <span className="text-sm">是否有升环机制</span>
            </label>
          </div>

          {formData.hasHeightened && (
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                升环效果
              </label>
              <textarea
                value={formData.heightenedEffect || ''}
                onChange={(e) => setFormData({ ...formData, heightenedEffect: e.target.value })}
                placeholder="例如：当你使用2环或更高环位施展此法术时，每高1环伤害增加1d6"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none text-sm"
              />
            </div>
          )}

        
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="法术描述..."
              rows={6}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              备注
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="其他备注信息..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none text-sm"
            />
          </div>

          {showSyncOption && (
  <label className="flex items-center gap-2 cursor-pointer dark:text-text-dark light:text-text-light">
    <input
      type="checkbox"
      checked={syncToLibrary}
      onChange={(e) => setSyncToLibrary(e.target.checked)}
      className="w-4 h-4 rounded border-primary text-primary focus:ring-primary"
    />
    <span className="text-sm">同时更新到法术库（并同步到数据库）</span>
  </label>
         )}

          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
              可用职业
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.classes.map((cls) => (
                <span
                  key={cls}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-primary/20 text-primary"
                >
                  {cls}
                  <button
                    onClick={() => handleRemoveClass(cls)}
                    className="hover:bg-primary/30 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={classInput}
                onChange={(e) => setClassInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddClass())}
                placeholder="添加职业..."
                className="flex-1 px-3 py-2 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
              <button
                onClick={handleAddClass}
                className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
              >
                添加
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {defaultClasses
                .filter((c) => !formData.classes.includes(c))
                .map((cls) => (
                  <button
                    key={cls}
                    onClick={() =>
                      setFormData({ ...formData, classes: [...formData.classes, cls] })
                    }
                    className="px-2 py-1 text-xs rounded-full border transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                  >
                    + {cls}
                  </button>
                ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 px-6 py-4 border-t dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
