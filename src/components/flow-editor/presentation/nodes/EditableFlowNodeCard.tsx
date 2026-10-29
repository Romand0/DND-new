import { Link2, ListPlus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { FlowNodeDef } from '@/types/flow';
import { NODE_TYPE_REGISTRY, NODE_CONFIG_SCHEMA, isConfigFieldVisible } from '@/types/flow';
import { NODE_W } from '@/utils/flow-editor/constants';
import { resolveNodeIcon } from '@/utils/flow-editor/node-icon';

interface EditableFlowNodeCardProps {
  node: FlowNodeDef;
  x: number;
  y: number;
  isSelected: boolean;
  isConnectSource: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  nodeRef: (el: HTMLDivElement | null) => void;
  onSelect: () => void;
  onInsertAfter: () => void;
  onStartConnecting: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

/**
 * 拓扑编辑态节点卡片：坐标由布局派生，卡片只提供结构操作（后插 / 连接 / 层内移动 / 删除）。
 */
export default function EditableFlowNodeCard({
  node,
  x,
  y,
  isSelected,
  isConnectSource,
  canMoveLeft,
  canMoveRight,
  nodeRef,
  onSelect,
  onInsertAfter,
  onStartConnecting,
  onMove,
  onDelete,
}: EditableFlowNodeCardProps) {
  const meta = NODE_TYPE_REGISTRY.find(m => m.type === node.type);
  const schema = NODE_CONFIG_SCHEMA[node.type] ?? [];
  const configEntries = Object.entries(node.config ?? {}).filter(([key]) => {
    const field = schema.find(f => f.key === key);
    return !field || isConfigFieldVisible(field, node.config);
  });

  const borderColor = isConnectSource
    ? 'border-primary shadow-primary/20'
    : isSelected
      ? 'border-primary ring-2 ring-primary/30 shadow-primary/20'
      : 'dark:border-border-dark light:border-border-light hover:border-primary/40';

  const actionClass =
    'p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div
      ref={nodeRef}
      data-node-id={node.id}
      className="absolute select-none group"
      style={{ left: x, top: y, width: NODE_W }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div
        className={`rounded-lg border-2 p-2.5 transition-colors cursor-pointer dark:bg-bg-dark-2 light:bg-white shadow-sm ${borderColor}`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: meta?.color || '#6b7280' }}
          >
            {resolveNodeIcon(meta?.icon)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold dark:text-text-dark light:text-text-light truncate">
              {node.label}
            </div>
            <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted truncate">
              {meta?.label || node.type}
            </div>
          </div>
          {isSelected && (
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-primary" aria-label="当前选中" />
          )}
        </div>

        {configEntries.length > 0 && (
          <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted space-y-0.5 max-h-16 overflow-hidden">
            {configEntries.slice(0, 4).map(([k, v]) => (
              <div key={k} className="truncate pr-1" title={`${k}: ${String(v)}`}>
                <span className="font-medium">{k}:</span>
                <span className="ml-1">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        )}

        <div
          className={`flex items-center justify-end gap-0.5 mt-1.5 pt-1.5 border-t dark:border-border-dark/60 light:border-border-light transition-opacity ${
            isSelected
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto'
          }`}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onInsertAfter(); }}
            className={`${actionClass} text-primary`}
            title="在此节点之后插入环节"
          >
            <ListPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onStartConnecting(); }}
            className={`${actionClass} text-primary`}
            title="连接到此节点之后"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMove(-1); }}
            className={`${actionClass} dark:text-text-dark light:text-text-light`}
            disabled={!canMoveLeft}
            title="在同层内左移"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMove(1); }}
            className={`${actionClass} dark:text-text-dark light:text-text-light`}
            disabled={!canMoveRight}
            title="在同层内右移"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className={`${actionClass} text-red-400`}
            title="删除节点"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
