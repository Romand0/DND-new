// 左侧栏可拖拽节点类型条目
import { useDraggable } from '@dnd-kit/core';
import type { NodeTypeMeta } from '@/types/flow';

interface PaletteDragItemProps {
  meta: NodeTypeMeta;
}

function PaletteDragItem({ meta }: PaletteDragItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${meta.type}`,
    data: { fromPalette: true, typeMeta: meta },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`node-card flex-shrink-0 inline-flex flex-row items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-left transition-all duration-200
        hover:bg-primary/10 hover:border-primary hover:shadow-md hover:scale-105
        border border-transparent dark:border-transparent light:border-transparent
        bg-white/8 dark:bg-white/8 light:bg-gray-100/60
        active:scale-[0.95] active:shadow-inner
        ${isDragging ? 'opacity-50 scale-95 shadow-lg border-primary/30' : ''}
        min-w-[100px] h-[44px] w-auto`}
      title={meta.description}
      style={{ touchAction: 'none' }}
    >
      <span
        className="w-4 h-4 rounded-full flex-shrink-0 mb-1"
        style={{ backgroundColor: meta.color }}
      />
      <span className="truncate font-medium text-xs flex-1 min-w-0">{meta.label}</span>
    </button>
  );
}

export default PaletteDragItem;