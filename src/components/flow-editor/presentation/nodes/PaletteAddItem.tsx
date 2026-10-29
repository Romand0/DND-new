// 左侧栏节点类型条目：点击即添加（拓扑编辑不使用拖拽）
import type { NodeTypeMeta } from '@/types/flow';

interface PaletteAddItemProps {
  meta: NodeTypeMeta;
  onAdd: (meta: NodeTypeMeta) => void;
}

function PaletteAddItem({ meta, onAdd }: PaletteAddItemProps) {
  return (
    <button
      onClick={() => onAdd(meta)}
      className="node-card flex-shrink-0 inline-flex flex-row items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-left transition-all duration-200 hover:bg-primary/10 hover:border-primary hover:shadow-md hover:scale-105 border border-transparent bg-white/8 dark:bg-white/8 light:bg-gray-100/60 active:scale-[0.95] active:shadow-inner min-w-[100px] h-[44px] w-auto"
      title={meta.description}
    >
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: meta.color }}
      />
      <span className="truncate font-medium text-xs flex-1 min-w-0">{meta.label}</span>
    </button>
  );
}

export default PaletteAddItem;
