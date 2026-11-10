import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEditorState } from '@/data/editorState';
import { ChevronLeft, Edit, Trash2, Coins, Scale, Tag, Swords, Shield, ExternalLink } from 'lucide-react';
import EquipmentEditor from '@/components/EquipmentEditor';
import type { EquipmentItem } from '@/types/equipment';
import { apiFetch } from '@/lib/api';
import { equipmentStore } from '@/data/equipmentStore';
import { getSeedEditUrl } from '@/lib/seedGitHub';
import { useAuth } from '@/contexts/AuthContext';

export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [item, setItem] = useState<EquipmentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEditorState(editorOpen);

  // 从后端加载单条装备；单条接口失败时依次回退：云端全量列表 → 本地缓存（保证中文 id 等边缘场景可见）
  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      // 先预热种子（含种子条目的合并视图），再走 getById（种子 ∪ 云端覆盖）
      await equipmentStore.fetchAll().catch(() => {});
      const local = equipmentStore.getById(id);
      if (local) {
        setItem(local);
        setLoading(false);
        return;
      }
      // 合并视图没有时兜底直接查云端单条
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const data = await apiFetch(`/equipments/${id}`, { method: 'GET', headers });
      setItem(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (updatedItem: EquipmentItem) => {
    if (!isAdmin || !id) return;
    setSaving(true);
    setError('');
    try {
      await equipmentStore.saveItem(updatedItem);
      setEditorOpen(false);
      load();
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !id) return;
    setSaving(true);
    setError('');
    try {
      await equipmentStore.deleteItem(id);
      navigate('/equipment');
    } catch (e: any) {
      setError(e.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  if (!item) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/equipment" className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">装备详情</h1>
        </div>
        <div className="text-center py-12 dark:text-text-dark-muted light:text-text-light-muted">
          {error || '未找到该装备'}
        </div>
      </div>
    );
  }

  const formatPrice = () => {
    const unitMap: Record<string, string> = {
      gp: '金币',
      sp: '银币',
      cp: '铜币',
    };
    return `${item.price.amount} ${unitMap[item.price.unit] || item.price.unit}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/equipment" className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">{item.name}</h1>
          {item.nameEn && (
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mt-0.5">{item.nameEn}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">{item.category}</span>
            {item.subtype && (
              <>
                <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
                <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">{item.subtype}</span>
              </>
            )}
            {item.magicCategory === '魔法物品' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400">魔法物品</span>
            )}
            {item.rarity && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{item.rarity}</span>
            )}
            {item.attunement && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                需同调{item.attunePrereq ? ` · ${item.attunePrereq}` : ''}
              </span>
            )}
            {item.cursed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger">被诅咒</span>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {equipmentStore.isSeedItem(item.id) ? (
              getSeedEditUrl('equipments', item.id) ? (
                <a
                  href={getSeedEditUrl('equipments', item.id)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:border-primary hover:text-primary text-sm transition-colors"
                  title="种子条目只读，点击在 GitHub 编辑源文件"
                >
                  <ExternalLink className="w-4 h-4" /> 在 GitHub 编辑
                </a>
              ) : (
                <span className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary">种子 · 只读</span>
              )
            ) : (
              <>
                <button onClick={() => setEditorOpen(true)}
                  className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
                  <Edit className="w-5 h-5" />
                </button>
                <button onClick={() => setDeleteConfirm(true)}
                  className="p-2 rounded-lg hover:bg-danger/20 text-danger">
                  <Trash2 className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* 价格卡片（原书未标价的条目如魔法物品不显示） */}
        {item.price?.amount > 0 && (
          <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="w-4 h-4 text-accent" />
              <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">价格</span>
            </div>
            <p className="text-lg font-semibold dark:text-text-dark light:text-text-light">{formatPrice()}</p>
          </div>
        )}

        {/* 重量卡片（原书未标重量的条目如魔法物品不显示） */}
        {item.weight > 0 && (
          <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center gap-2 mb-1">
              <Scale className="w-4 h-4 text-accent" />
              <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">重量</span>
            </div>
            <p className="text-lg font-semibold dark:text-text-dark light:text-text-light">{item.weight} 磅</p>
          </div>
        )}

        {/* 伤害卡片（仅武器） */}
        {item.category === '武器' && (item.damageDice || item.damageType) && (
          <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center gap-2 mb-1">
              <Swords className="w-4 h-4 text-accent" />
              <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">伤害</span>
            </div>
            <p className="text-lg font-semibold dark:text-text-dark light:text-text-light">
              {item.damageDice}{item.damageType ? ` ${item.damageType}` : ''}
            </p>
          </div>
        )}
      </div>

        {/* 护甲 AC 卡片（仅护甲） */}
{item.category === '护甲' && item.acBase && (
  <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
    <div className="flex items-center gap-2 mb-1">
      <Shield className="w-4 h-4 text-accent" />
      <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">护甲等级 (AC)</span>
    </div>
    <p className="text-lg font-semibold dark:text-text-dark light:text-text-light">
      AC = {item.acBase}
      {item.strengthReq ? `，力量 ${item.strengthReq}` : ''}
      {item.stealthDisadvantage ? '，隐匿劣势' : ''}
    </p>
  </div>
)}
      
      {item.magicCategory === '魔法物品' && (item.rarity || item.attunement || item.magicBonus || item.cursed || item.activation || (item.charges && item.charges > 0)) && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">魔法物品属性</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm dark:text-text-dark light:text-text-light">
            {item.rarity && (
              <span>稀有度：<span className="font-medium">{item.rarity}</span></span>
            )}
            {item.magicBonus ? (
              <span>魔法加值：<span className="font-medium">+{item.magicBonus}</span></span>
            ) : null}
            {item.attunement && (
              <span>需同调{item.attunePrereq ? `（${item.attunePrereq}）` : ''}</span>
            )}
            {item.activation && <span>激活：{item.activation}</span>}
            {item.charges != null && item.charges > 0 && (
              <span>充能：{item.charges}{item.chargeRegen ? `（${item.chargeRegen}）` : ''}</span>
            )}
            {item.cursed && <span className="text-danger">被诅咒</span>}
          </div>
        </div>
      )}

      {item.properties && item.properties.length > 0 && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">属性</h3>
          <div className="flex flex-wrap gap-2">
            {item.properties.map((prop) => (
              <span key={prop} className="px-2 py-1 rounded bg-primary/20 text-primary text-sm">{prop}</span>
            ))}
          </div>
        </div>
      )}

      {item.description && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">描述</h3>
          <p className="text-sm dark:text-text-dark light:text-text-light whitespace-pre-wrap leading-relaxed">{item.description}</p>
        </div>
      )}

      {item.tags && item.tags.length > 0 && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-medium dark:text-text-dark light:text-text-light">标签</h3>
          </div>
          <div className="space-y-2">
            {item.tags.map((tag, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">{tag.key}</span>
                <span className="dark:text-text-dark light:text-text-light">{tag.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(item.source || item.dataResource) && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">来源</h3>
          <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
            {[item.source, item.dataResource].filter(Boolean).join(' · ')}
          </p>
        </div>
      )}

      {editorOpen && (
        <EquipmentEditor
          item={item}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl border p-6 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">确认删除</h3>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              确定要删除 "{item.name}" 吗？此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 disabled:opacity-50">
                取消
              </button>
              <button onClick={handleDelete} disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger/80 disabled:opacity-50">
                {saving ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
