import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Edit2, Trash2, GripVertical, Shield, Heart, Footprints, Swords, BookOpen } from 'lucide-react';
import type { NpcTemplate, NpcAttack } from '@/types/combat';
import MonsterEditor from '@/components/MonsterEditor';
import npcTemplateStore from '@/data/npcTemplateStore';

export default function MonsterDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { isDM } = useAuth();
  const [template, setTemplate] = useState<NpcTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const t = npcTemplateStore.getById(id);
      if (t) {
        setTemplate(t);
      } else {
        setError('怪物模板不存在');
      }
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const handleSave = (updated: NpcTemplate) => {
    if (!isDM) return;
    npcTemplateStore.update(id!, updated);
    setTemplate(updated);
    setEditorOpen(false);
  };

  const handleDelete = () => {
    if (!isDM || !id) return;
    npcTemplateStore.delete(id);
    setDeleteConfirm(false);
    navigate('/monsters');
  };

  const crLabels: Record<number, string> = {
    0: '0', 0.25: '1⁄4', 0.5: '1⁄2', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: '11', 12: '12', 13: '13', 14: '14', 15: '15', 16: '16', 17: '17', 18: '18', 19: '19', 20: '20',
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;
  if (error) return <div className="p-8 text-center text-danger">{error}</div>;
  if (!template) return <div className="p-8 text-center text-gray-500">怪物模板不存在</div>;

  return (
    <div className="space-y-6">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/monsters')}
            className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">{template.name}</h1>
            <p className="text-sm text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">
              模板 ID: {template.templateId}
            </p>
          </div>
        </div>
        {isDM && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditorOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
            >
              <Edit2 className="w-4 h-4" /> 编辑
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger/80 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> 删除
            </button>
          </div>
        )}
      </div>

      {/* 核心信息卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border p-4 dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium dark:text-text-dark light:text-text-light">护甲 (AC)</span>
          </div>
          <div className="text-3xl font-bold dark:text-text-dark light:text-text-light">{template.ac}</div>
        </div>
        <div className="rounded-xl border p-4 dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium dark:text-text-dark light:text-text-light">生命值 (HP)</span>
          </div>
          <div className="text-3xl font-bold dark:text-text-dark light:text-text-light">{template.maxHp}</div>
        </div>
        <div className="rounded-xl border p-4 dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card">
          <div className="flex items-center gap-2 mb-2">
            <Footprints className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium dark:text-text-dark light:text-text-light">速度</span>
          </div>
          <div className="text-3xl font-bold dark:text-text-dark light:text-text-light">{template.speed}尺</div>
        </div>
        <div className="rounded-xl border p-4 dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card">
          <div className="flex items-center gap-2 mb-2">
            <Swords className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium dark:text-text-dark light:text-text-light">攻击方式</span>
          </div>
          <div className="text-3xl font-bold dark:text-text-dark light:text-text-light">{template.attacks.length}</div>
        </div>
      </div>

      {/* 属性值 */}
      <div className="rounded-xl border p-4 dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card">
        <h2 className="text-lg font-bold mb-4 dark:text-text-dark light:text-text-light">属性值</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'strength', label: '力量', value: template.strength },
            { key: 'dexterity', label: '敏捷', value: template.dexterity },
            { key: 'constitution', label: '体质', value: template.constitution },
            { key: 'intelligence', label: '智力', value: template.intelligence },
            { key: 'wisdom', label: '感知', value: template.wisdom },
            { key: 'charisma', label: '魅力', value: template.charisma },
          ].map(({ key, label, value }) => (
            <div key={key} className="p-3 rounded-lg bg-white/5">
              <div className="text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">{label}</div>
              <div className="text-2xl font-bold dark:text-text-dark light:text-text-light">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 怪物信息 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4 dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card">
          <h2 className="text-lg font-bold mb-4 dark:text-text-dark light:text-text-light">怪物信息</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">挑战等级 (CR)</span>
              <span className={`font-bold ${template.cr === undefined ? 'text-gray-400' : 'text-primary'}`}>
                {template.cr === undefined ? '—' : crLabels[template.cr] || template.cr}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">尺寸</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{template.size || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">种类</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{template.type || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">阵营</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{template.alignment || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">来源</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{template.source || '—'}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-4 dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card">
          <h2 className="text-lg font-bold mb-4 dark:text-text-dark light:text-text-light">其他信息</h2>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">特性</div>
              <div className="text-sm dark:text-text-dark light:text-text-light whitespace-pre-wrap">{template.features || '无'}</div>
            </div>
            <div>
              <div className="text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">感官</div>
              <div className="text-sm dark:text-text-dark light:text-text-light whitespace-pre-wrap">{template.senses || '无'}</div>
            </div>
            <div>
              <div className="text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">语言</div>
              <div className="text-sm dark:text-text-dark light:text-text-light">{template.languages || '无'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 攻击方式 */}
      <div className="rounded-xl border p-4 dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card">
        <h2 className="text-lg font-bold mb-4 dark:text-text-dark light:text-text-light flex items-center gap-2">
          <Swords className="w-5 h-5 text-primary" />
          攻击方式
        </h2>
        {template.attacks.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">
            暂无攻击方式
          </div>
        ) : (
          <div className="space-y-3">
            {template.attacks.map((attack, index) => (
              <div key={index} className="p-4 rounded-lg border dark:border-border-dark light:border-border-light bg-white/5">
                <div className="flex items-start gap-3">
                  <GripVertical className="w-4 h-4 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <div className="font-medium dark:text-text-dark light:text-text-light mb-2">{attack.name}</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">攻击加值:</span>
                        <span className="ml-1 dark:text-text-dark light:text-text-light">{attack.attackBonus}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">伤害:</span>
                        <span className="ml-1 dark:text-text-dark light:text-text-light">{attack.damage}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">伤害类型:</span>
                        <span className="ml-1 dark:text-text-dark light:text-text-light">{attack.damageType}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">射程:</span>
                        <span className="ml-1 dark:text-text-dark light:text-text-light">{attack.range}</span>
                      </div>
                    </div>
                    {attack.properties.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {attack.properties.map((prop, i) => (
                          <span key={i} className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">
                            {prop}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 编辑器 */}
      <MonsterEditor
        initialTemplate={template}
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(false)} />
          <div className="relative w-full max-w-sm rounded-xl border p-6 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">确认删除</h3>
            <p className="text-sm mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要删除怪物「{template.name}」吗?此操作不可撤销。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-danger hover:bg-danger/80 text-white rounded-lg"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
