import React from 'react';

// 插入插槽：块之间的落点感应条。拖拽悬停时高亮，点击时设为插入锚点（面板追加目标）。
// key 由 slotKey 生成，拖拽提交与点击锚点共用同一寻址格式。

interface FlowDropSlotProps {
  slotKey: string;
  /** 拖拽悬停高亮 */
  active: boolean;
  /** 是否处于拖拽会话（拉高感应条） */
  dragging: boolean;
  /** 点击插槽（非拖拽态）设置插入锚点 */
  onPick: (slotKey: string) => void;
}

export const FlowDropSlot: React.FC<FlowDropSlotProps> = ({ slotKey, active, dragging, onPick }) => {
  return (
    <div
      data-slot-key={slotKey}
      onClick={e => { e.stopPropagation(); onPick(slotKey); }}
      className={`relative w-full transition-all duration-100 ${
        dragging ? 'h-5 my-0.5' : 'h-2.5'
      } ${active ? 'bg-primary/30 border-y-2 border-dashed border-primary rounded' : 'hover:bg-primary/10 rounded'}`}
    >
      {active && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-primary font-medium pointer-events-none">
          放到这里
        </div>
      )}
    </div>
  );
};

export default FlowDropSlot;
