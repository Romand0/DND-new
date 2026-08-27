import React from 'react';
import { X } from 'lucide-react';
import PaletteDragItem from '../../pages/flow-editor/components/PaletteDragItem';
import { NodeTypeMeta } from '@/types/flow';

interface FlowNodePaletteProps {
  showLeftPanel: boolean;
  onToggleLeftPanel: () => void;
  nodeGroups: Record<string, NodeTypeMeta[]>;
  isDark: boolean;
}

export const FlowNodePalette: React.FC<FlowNodePaletteProps> = ({
  showLeftPanel,
  onToggleLeftPanel,
  nodeGroups,
  isDark,
}) => {
  return (
    <div className={`${
      showLeftPanel ? 'translate-x-0' : '-translate-x-full'
    } lg:translate-x-0 absolute lg:relative z-30 w-72 lg:w-80 h-full flex-shrink-0 border-r dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-gray-50 overflow-y-auto overflow-x-hidden transition-transform duration-200 ease-out node-card-container`}>
      <div className="p-4">
        {/* 移动端头部 */}
        <div className="flex items-center justify-between mb-4 lg:hidden">
          <h2 className="text-sm font-semibold dark:text-text-dark light:text-text-light">环节库</h2>
          <button
            onClick={onToggleLeftPanel}
            className="p-1.5 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* 桌面端标题 */}
        <h2 className="text-sm font-semibold dark:text-text-dark light:text-text-light mb-4 hidden lg:block text-left lg:text-center">环节库</h2>
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-6 text-left lg:text-center">
          拖拽节点卡片添加到画布
        </p>
        
        {/* 移动端滚动提示 */}
        <div className="lg:hidden mb-4 text-center">
          <p className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
            ← 左右滑动查看更多节点类型
          </p>
        </div>
        
        {/* 节点分类列表 */}
        <div className="space-y-6">
          {Object.entries(nodeGroups).map(([category, metas]) => (
            <div key={category}>
              <h3 className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted uppercase tracking-wide mb-4 text-left lg:text-center">
                {category}
              </h3>
              <div className="flex flex-wrap gap-2 lg:gap-3">
                {metas.map(meta => (
                  <PaletteDragItem key={meta.type} meta={meta} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};