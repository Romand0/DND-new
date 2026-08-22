/**
 * 拖拽视觉效果模块
 * 
 * 包含拖拽状态管理、碰撞检测、视觉效果、瞬移过渡等功能
 */

import { useRef, useState, useCallback } from 'react';
import { DragEndEvent } from '@dnd-kit/core';
import { SpatialGrid } from '../../utils/spatialGrid';
import { NODE_W, NODE_H } from './constants';
import type { FlowNodeDef } from '../../types/flow';

// ===== 拖拽视觉效果状态接口 =====
export interface DragEffectsState {
  draggingNodeId: string | null;
  isColliding: boolean;
  collisionDir: 'up' | 'down' | 'left' | 'right' | null;
  animateMove: boolean;
}

// ===== 跨层拖拽状态接口 =====
export interface CrossLayerDragState {
  phase: 'idle' | 'palette' | 'crossing' | 'canvas';
  meta: {
    type: string;
    label: string;
    icon?: string;
    color?: string;
    category?: string;
    description?: string;
    fields?: Record<string, any>;
  } | null;
  fingerPos: { x: number; y: number } | null;
}

// ===== 拖拽视觉效果配置 =====
export interface DragEffectsConfig {
  spatialGridRef: React.MutableRefObject<SpatialGrid>;
  canvasScale: number;
  onDragEnd: (nodeId: string, delta: { x: number; y: number }) => void;
  onDragStart?: (nodeId: string) => void;
  onDragCancel?: () => void;
}

// ===== 拖拽视觉效果 Hook =====
export function useDragEffects(config: DragEffectsConfig) {
  const {
    spatialGridRef,
    canvasScale,
    onDragEnd,
    onDragStart,
    onDragCancel,
  } = config;

  // 拖拽状态：实时碰撞检测
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isColliding, setIsColliding] = useState(false);
  const [collisionDir, setCollisionDir] = useState<'up' | 'down' | 'left' | 'right' | null>(null);
  const [animateMove, setAnimateMove] = useState(false);
  
  // 降频优化引用
  const rafIdRef = useRef<number | null>(null);
  const lastEventRef = useRef<DragEndEvent | null>(null);

  // 跨层拖拽状态
  const [crossLayerDrag, setCrossLayerDrag] = useState<CrossLayerDragState>({
    phase: 'idle',
    meta: null,
    fingerPos: null,
  });

  // ===== 拖拽开始处理 =====
  const handleDragStart = useCallback((nodeId: string) => {
    setDraggingNodeId(nodeId);
    setIsColliding(false);
    setCollisionDir(null);
    setAnimateMove(false);
    onDragStart?.(nodeId);
  }, [onDragStart]);

  // ===== 拖拽移动处理（实时碰撞检测） =====
  const handleDragMove = useCallback((event: DragEndEvent) => {
    // 降频优化：避免每帧都处理
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    
    rafIdRef.current = requestAnimationFrame(() => {
      lastEventRef.current = event;
      
      // 这里可以添加实时碰撞检测逻辑
      // 由于需要访问其他节点数据，具体的碰撞检测逻辑在主组件中实现
      // 这里只负责更新视觉效果状态
    });
  }, []);

  // ===== 拖拽结束处理 =====
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const { active, delta } = event;
    
    // 如果是画布内节点拖拽
    if (active.data.current?.node) {
      const nodeId = active.id as string;
      
      // 重置跨层状态
      setCrossLayerDrag({ phase: 'idle', meta: null, fingerPos: null });
      
      // 画布内节点拖拽结束：用全量 delta 一次性写入最终位置 + 智能退避 + 磁吸对齐
      setDraggingNodeId(null);
      setIsColliding(false);
      setCollisionDir(null);
      const scaledDelta = { x: delta.x / canvasScale, y: delta.y / canvasScale };
      
      // 调用外部处理函数
      onDragEnd(nodeId, scaledDelta);
      
      // 瞬移过渡：拖拽结束后短暂开启 transform 过渡，300ms 后移除
      setAnimateMove(true);
      window.setTimeout(() => setAnimateMove(false), 300);
    } else {
      // 跨层拖拽或其他情况
      setDraggingNodeId(null);
      setIsColliding(false);
      setCollisionDir(null);
      setAnimateMove(false);
      onDragCancel?.();
    }
  }, [canvasScale, onDragEnd, onDragCancel]);

  // ===== 跨层拖拽开始处理 =====
  const startCrossLayerDrag = useCallback((meta: CrossLayerDragState['meta'], fingerPos: { x: number; y: number }) => {
    setCrossLayerDrag({
      phase: 'palette',
      meta,
      fingerPos,
    });
  }, []);

  // ===== 跨层拖拽移动处理 =====
  const updateCrossLayerDrag = useCallback((fingerPos: { x: number; y: number }) => {
    if (crossLayerDrag.phase === 'palette') {
      setCrossLayerDrag(prev => ({
        ...prev,
        fingerPos,
        phase: 'crossing',
      }));
    } else if (crossLayerDrag.phase === 'crossing') {
      setCrossLayerDrag(prev => ({
        ...prev,
        fingerPos,
      }));
    }
  }, [crossLayerDrag.phase]);

  // ===== 跨层拖拽结束处理 =====
  const endCrossLayerDrag = useCallback((canvasPos: { x: number; y: number }) => {
    if (crossLayerDrag.meta && crossLayerDrag.phase === 'crossing') {
      // 在画布上添加新节点
      setCrossLayerDrag({
        phase: 'canvas',
        meta: crossLayerDrag.meta,
        fingerPos: canvasPos,
      });
      
      // 返回新节点信息，供外部处理
      return {
        type: crossLayerDrag.meta.type,
        position: canvasPos,
        meta: crossLayerDrag.meta,
      };
    }
    
    // 重置跨层状态
    setCrossLayerDrag({ phase: 'idle', meta: null, fingerPos: null });
    return null;
  }, [crossLayerDrag]);

  // ===== 重置所有拖拽状态 =====
  const resetDragEffects = useCallback(() => {
    setDraggingNodeId(null);
    setIsColliding(false);
    setCollisionDir(null);
    setAnimateMove(false);
    setCrossLayerDrag({ phase: 'idle', meta: null, fingerPos: null });
    
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  // ===== 获取拖拽视觉效果状态 =====
  const getDragEffectsState = useCallback((): DragEffectsState => {
    return {
      draggingNodeId,
      isColliding,
      collisionDir,
      animateMove,
    };
  }, [draggingNodeId, isColliding, collisionDir, animateMove]);

  // ===== 设置碰撞状态 =====
  const setCollisionState = useCallback((isColliding: boolean, collisionDir: 'up' | 'down' | 'left' | 'right' | null) => {
    setIsColliding(isColliding);
    setCollisionDir(collisionDir);
  }, []);

  return {
    // 状态
    draggingNodeId,
    isColliding,
    collisionDir,
    animateMove,
    crossLayerDrag,
    
    // 方法
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    startCrossLayerDrag,
    updateCrossLayerDrag,
    endCrossLayerDrag,
    resetDragEffects,
    getDragEffectsState,
    setCollisionState,
    
    // 引用
    rafIdRef,
    lastEventRef,
  };
}

// ===== 拖拽视觉效果样式生成器 =====
export function createDragEffectsStyle(
  isDragging: boolean,
  isColliding: boolean,
  collisionDir: 'up' | 'down' | 'left' | 'right' | null,
  animateMove: boolean,
  dndDragging: boolean,
  isSelected: boolean,
  isConnectSource: boolean
): React.CSSProperties {
  return {
    opacity: isColliding ? 0.6 : (dndDragging ? 0.9 : 1),
    filter: isColliding ? 'drop-shadow(0 0 4px red)' : undefined,
    transition: dndDragging ? 'none' : (animateMove ? 'transform 200ms ease-out' : undefined),
    cursor: dndDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 20 : (isSelected ? 10 : 1),
  };
}

// ===== 拖拽视觉效果类名生成器 =====
export function createDragEffectsClassName(
  isColliding: boolean,
  collisionDir: 'up' | 'down' | 'left' | 'right' | null,
  animateMove: boolean,
  isSelected: boolean,
  isConnectSource: boolean,
  shakeClass?: string
): string {
  const borderColor = isColliding
    ? 'border-red-500 shadow-red-500/30'
    : isSelected
      ? 'border-primary shadow-primary/20'
      : isConnectSource
        ? 'border-primary/60'
        : 'dark:border-border-dark light:border-border-light shadow-sm hover:border-primary/40';

  const shakeClassFinal = isColliding ? 'animate-shake' : (shakeClass || '');
  const animateMoveClass = animateMove ? 'animate-move' : '';

  return [
    'rounded-lg border-2 p-2.5 sm:p-3 transition-all cursor-pointer',
    borderColor,
    shakeClassFinal,
    animateMoveClass,
  ].filter(Boolean).join(' ');
}

// ===== 碰撞方向指示器配置 =====
export interface CollisionDirectionIndicatorConfig {
  collisionDir: 'up' | 'down' | 'left' | 'right' | null;
  className?: string;
}

// ===== 碰撞方向指示器渲染配置 =====
export function getCollisionDirectionIndicatorConfig(config: CollisionDirectionIndicatorConfig) {
  if (!config.collisionDir) return null;

  return {
    className: config.className || 'absolute inset-0 pointer-events-none z-30 text-red-500 text-lg leading-none',
    indicators: [
      {
        direction: 'up',
        position: 'absolute -top-3 left-1/2 -translate-x-1/2',
        show: config.collisionDir === 'up',
        symbol: '↑',
      },
      {
        direction: 'down',
        position: 'absolute -bottom-3 left/1/2 -translate-x-1/2',
        show: config.collisionDir === 'down',
        symbol: '↓',
      },
      {
        direction: 'left',
        position: 'absolute -left-3 top-1/2 -translate-y-1/2',
        show: config.collisionDir === 'left',
        symbol: '←',
      },
      {
        direction: 'right',
        position: 'absolute -right-3 top-1/2 -translate-y-1/2',
        show: config.collisionDir === 'right',
        symbol: '→',
      },
    ],
  };
}

// ===== 瞬移过渡动画控制 =====
export function useAnimateTransition() {
  const [animateMove, setAnimateMove] = useState(false);
  
  const triggerAnimateMove = useCallback(() => {
    setAnimateMove(true);
    window.setTimeout(() => setAnimateMove(false), 300);
  }, []);

  const resetAnimateMove = useCallback(() => {
    setAnimateMove(false);
  }, []);

  return {
    animateMove,
    triggerAnimateMove,
    resetAnimateMove,
  };
}