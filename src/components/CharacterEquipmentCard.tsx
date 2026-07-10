import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
  Minus,
  Plus,
  CheckCircle,
  Swords,
  Shield,
  Scale,
  Coins,
} from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import type { Equipment } from '@/types/character';

/** 判断装备是否可穿戴（护甲 或 杂项-服装） */
function isWearable(item: { category?: string; subtype?: string }): boolean {
  return item.category === '护甲' || (item.category === '杂项' && item.subtype === '服装');
}

interface Props {
  item: Equipment & { id: string };
  characterId?: string;
  onEdit: (item: Equipment & { id: string }) => void;
  onDelete: (itemId: string) => void;
  onUpdateQuantity?: (itemId: string, delta: number) => void;
  onRefresh?: () => void;
  showQuantity?: boolean;
}

export default function CharacterEquipmentCard({
  item,
  characterId,
  onEdit,
  onDelete,
  onUpdateQuantity,
  onRefresh,
  showQuantity = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const itemId = item.childId || item.id;


  const wearable = isWearable(item);
  const isWorn = item.tags?.some(t => t.key === '着装状态' && t.value === '已穿戴');

  return (
    <div className="rounded-lg border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light overflow-hidden">
      <div className="p-3">
        {/* 主体行 */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {/* 名称 + 着装状态绿勾 */}
            <div className="text-sm font-medium dark:text-text-dark light:text-text-light flex items-center gap-2">
              <span className="truncate">{item.name || '未命名装备'}</span>
              {isWorn && (
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              )}
            </div>

            {/* 分类标签行（含武器/护甲重叠胶囊） */}
            <div className="flex items-center mt-1 text-xs">
              {item.category === '武器' && (item.damageDice || item.damageType) ? (
                <div className="relative flex items-center min-h-[22px]">
                  <span className="relative z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-700 text-white text-xs font-medium shadow-sm">
                    <Swords className="w-3 h-3" />
                    武器
                  </span>
                  <span className="inline-flex items-center pl-5 -ml-3 py-0.5 pr-2 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs">
                    {item.damageDice}{item.damageType ? ` ${item.damageType}` : ''}
                  </span>
                </div>
              ) : item.category === '护甲' && item.acBase ? (
                <div className="relative flex items-center min-h-[22px]">
                  <span className="relative z-10 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-700 text-white text-xs font-medium shadow-sm">
                    <Shield className="w-3 h-3" />
                    护甲
                  </span>
                  <span className="inline-flex items-center pl-5 -ml-3 py-0.5 pr-2 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 text-xs">
                    AC = {item.acBase}
                  </span>
                </div>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-white/50 dark:bg-white/10 dark:text-text-dark light:text-text-light">
                  {item.category || '—'}
                </span>
              )}
            </div>

            {/* 重量 + 价格行 */}
            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">
                <Scale className="w-3 h-3 inline mr-0.5" />
                {item.weight != null ? `${item.weight} 磅` : '— 磅'}
              </span>
              <span className="dark:text-text-dark-muted light:text-text-light-muted">
                <Coins className="w-3 h-3 inline mr-0.5" />
                {item.price ? `${item.price.amount} ${item.price.unit}` : '—'}
              </span>
            </div>
          </div>

          {/* 右侧操作区 */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {/* 穿戴/卸下按钮（仅护甲/服装 + 有 characterId 时显示） */}
            {wearable && characterId && (
              <button
                onClick={() => {
                  const result = isWorn
                    ? characterStore.unwearEquipment(characterId, itemId)
                    : characterStore.wearEquipment(characterId, itemId);
                  if (!result.success) alert(result.message);
                  else onRefresh?.();
                }}
                className={`w-full text-xs px-2 py-1 rounded transition-colors ${
                  isWorn
                    ? 'bg-danger/10 text-danger hover:bg-danger/20'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
              >
                {isWorn ? '卸下' : '穿戴'}
              </button>
            )}

            <div className="flex items-center gap-1">
              <button
                onClick={() => onEdit(item)}
                className="p-1.5 rounded hover:bg-primary/20 text-primary"
                title="编辑"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(itemId)}
                className="p-1.5 rounded hover:bg-danger/20 text-danger"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {showQuantity && onUpdateQuantity && (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateQuantity(itemId, -1); }}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 dark:hover:bg-white/10 dark:text-text-dark light:text-text-light"
                  title="减少数量"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-auto text-center text-xs dark:text-text-dark light:text-text-light">
                  ×{item.quantity || 1}{item.unit || '个'}
                </span>

                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateQuantity(itemId, 1); }}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 dark:hover:bg-white/10 dark:text-text-dark light:text-text-light"
                  title="增加数量"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 展开按钮行 */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t dark:border-border-dark/50 light:border-border-light/50">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark transition-colors"
          >
            {expanded ? (
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

      {/* 展开详情区 */}
      {expanded && (
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
                  <span key={idx} className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
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
      {item.tags.filter(tag => tag.key !== '着装状态').map((tag, idx) => (
        <span key={idx} className="px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent">
          {tag.key}: {tag.value}
        </span>
      ))}
      {item.tags.filter(tag => tag.key === '着装状态').length === 0 && (
        <span className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">无</span>
      )}
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
}
