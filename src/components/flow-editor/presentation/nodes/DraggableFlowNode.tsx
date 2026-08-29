/**
 * 可拖拽节点组件
 * 封装 dnd-kit useDraggable，实现节点拖拽功能
 */

import React, { useRef, useEffect } from 'react';
import { CSS } from '@dnd-kit/utilities';
import { useDraggable } from '@dnd-kit/core';
import { resolveNodeIcon } from '@/utils/flow-editor/node-icon';
import { NODE_TYPE_REGISTRY } from '@/types/flow';
import { NODE_W } from '@/utils/flow-editor/constants';
import type { FlowNodeDef, FlowDefinition, NodeTypeMeta } from '@/types/flow';

interface DraggableFlowNodeProps {
  node: FlowNodeDef;
  isSelected: boolean;
  isConnectSource: boolean;
  isDragging: boolean;
  isColliding: boolean;
  collisionDir: 'up' | 'down' | 'left' | 'right' | null;
  animateMove: boolean;
  canvasScale: number;
  onClick: () => void;
  onStartConnecting: () => void;
  onDelete: () => void;
  flow: FlowDefinition;
  onRefSet: (ref: HTMLDivElement | null) => void;
}

export default function DraggableFlowNode({
  node,
  isSelected,
  isConnectSource,
  isDragging,
  isColliding,
  collisionDir,
  animateMove,
  canvasScale,
  onClick,
  onStartConnecting,
  onDelete,
  flow,
  onRefSet,
}: DraggableFlowNodeProps) {
  const meta = NODE_TYPE_REGISTRY.find(m => m.type === node.type);
  const { attributes, listeners, setNodeRef, transform, isDragging: dndDragging } = useDraggable({
    id: node.id,
    data: { node },
  });
  
  // 额外的 ref 用于尺寸测量
  const sizeRef = useRef<HTMLDivElement>(null);
  
  // 当 ref 设置时调用回调
  useEffect(() => {
    onRefSet(sizeRef.current);
  }, [sizeRef.current, onRefSet]);

  // ★ 将 dnd-kit 屏幕像素 transform 转换为画布坐标，补偿父容器 scale
  const adjustedTransform: React.CSSProperties['transform'] =
    transform
      ? CSS.Transform.toString({
          x: transform.x / canvasScale,
          y: transform.y / canvasScale,
          scaleX: 1,
          scaleY: 1,
        })
      : undefined;

  // 拖拽时应用 CSS transform（跟随手指/鼠标）
  const style: React.CSSProperties = {
    position: 'absolute',
    left: node.position.x,
    top: node.position.y,
    width: NODE_W,
    zIndex: isDragging ? 20 : (isSelected ? 10 : 1),
    transform: adjustedTransform,   // ★ 用调整后的 transform
    opacity: isColliding ? 0.6 : (dndDragging ? 0.9 : 1),
    // 软排斥预览：碰撞时红色投影提示
    filter: isColliding ? 'drop-shadow(0 0 4px red)' : undefined,
    // 拖拽中禁用 transform 动画更跟手；结束后短暂开启 200ms 过渡做瞬移落位动画
    transition: dndDragging ? 'none' : (animateMove ? 'transform 200ms ease-out' : undefined),
    // 阻止浏览器默认 touch 行为（如滚动），确保 dnd-kit 接管拖拽
    touchAction: 'none',
    cursor: dndDragging ? 'grabbing' : 'grab',
  };

  // 碰撞时抖动动画
  const shakeClass = isColliding ? 'animate-shake' : '';
  const borderColor = isColliding
    ? 'border-red-500 shadow-red-500/30'
    : isSelected
      ? 'border-primary shadow-primary/20'
      : isConnectSource
        ? 'border-primary/60'
        : 'dark:border-border-dark light:border-border-light shadow-sm hover:border-primary/40';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      data-node-id={node.id}
      className={`select-none ${shakeClass} flow-node-card`}
    >
      {/* 内层容器用于尺寸测量 */}
      <div ref={sizeRef} className="absolute inset-0 pointer-events-none" />
      {/* 碰撞方向提示：按推离方向显示对应边缘箭头 */}
      {collisionDir && (
        <div className="absolute inset-0 pointer-events-none z-30 text-red-500 text-lg leading-none">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2" style={{ display: collisionDir === 'up' ? 'block' : 'none' }}>↑</div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2" style={{ display: collisionDir === 'down' ? 'block' : 'none' }}>↓</div>
          <div className="absolute -left-3 top-1/2 -translate-y-1/2" style={{ display: collisionDir === 'left' ? 'block' : 'none' }}>←</div>
          <div className="absolute -right-3 top-1/2 -translate-y-1/2" style={{ display: collisionDir === 'right' ? 'block' : 'none' }}>→</div>
        </div>
      )}
      <div
        className={`rounded-lg border-2 p-2.5 sm:p-3 transition-all cursor-pointer ${borderColor} dark:bg-bg-dark-2 light:bg-white ${animateMove ? 'animate-move' : ''}`}
        onClick={(e) => {
          // 仅在未拖拽时触发 click（dnd-kit 的 listeners 已处理拖拽）
          if (!dndDragging) onClick();
        }}
      >
        {/* 节点头部 */}
        <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
          <span
            className="w-5 h-5 sm:w-6 sm:h-6 rounded flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: meta?.color || '#6b7280' }}
          >
            {resolveNodeIcon(meta?.icon)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] sm:text-xs font-semibold dark:text-text-dark light:text-text-light truncate">
              {node.label}
            </div>
            <div className="text-[9px] sm:text-[10px] dark:text-text-dark-muted light:text-text-light-muted truncate">
              {node.type}
            </div>
          </div>
          {/* 操作按钮：阻止事件冒泡到拖拽层 */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onStartConnecting();
              }}
              className="p-1 sm:p-1.5 rounded hover:bg-white/10 text-primary"
              title="连接"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 sm:p-1.5 rounded hover:bg-white/10 text-red-400"
              title="删除"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* 节点配置预览 */}
        {node.config && Object.keys(node.config).length > 0 && (
          <div className="text-[9px] sm:text-[10px] dark:text-text-dark-muted light:text-text-light-muted space-y-0.5 max-h-20 overflow-y-auto">
            {Object.entries(node.config).map(([k, v]) => (
              <div key={k} className="truncate pr-1" title={`${k}: ${String(v)}`}>
                <span className="font-medium">{k}:</span> 
                <span className="truncate ml-1">{String(v)}</span>
              </div>
            ))}
            
            {/* 如果是 cast_start 节点且绑定了法术，显示 DSL */}
            {node.type === 'cast_start' && flow.spellId && (
              <div className="mt-1 pt-1 border-t dark:border-border-dark light:border-border-light text-[8px] font-mono bg-gray-100/30 dark:bg-gray-800/30 rounded px-1 max-h-16 overflow-y-auto">
                <div className="truncate" title={`autoChecks: ${JSON.stringify(node.config?.autoChecks || {})}`}>
                  autoChecks={JSON.stringify(node.config?.autoChecks || {}).substring(0, 50)}
                  {JSON.stringify(node.config?.autoChecks || {}).length > 50 && '...'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}