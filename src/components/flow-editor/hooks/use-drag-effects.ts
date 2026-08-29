import { useState, useCallback, useEffect, useRef } from 'react';
import { DragEndEvent } from '@dnd-kit/core';
import type { FlowDefinition, NodeTypeMeta } from '@/types/flow';
import { nodesOverlap } from '@/utils/flow-editor/collision';
import { SpatialGrid } from '@/utils/spatialGrid';
import { NODE_W, NODE_H } from '@/utils/flow-editor/constants';

interface CrossLayerDragState {
  phase: 'idle' | 'palette' | 'crossing' | 'canvas';
  meta: NodeTypeMeta | null;
  fingerPos: { x: number; y: number } | null;
}

export function useDragEffects({
  flow,
  canvasScale,
  canvasTranslate,
  addNode,
  updateNodePositionByDelta,
}: {
  flow: FlowDefinition;
  canvasScale: number;
  canvasTranslate: { x: number; y: number };
  addNode: (typeMeta: NodeTypeMeta, position: { x: number; y: number }) => void;
  updateNodePositionByDelta: (nodeId: string, delta: { x: number; y: number }) => void;
}) {
  // 状态管理
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isColliding, setIsColliding] = useState(false);
  const [collisionDir, setCollisionDir] = useState<'up' | 'down' | 'left' | 'right' | null>(null);
  const [animateMove, setAnimateMove] = useState(false);
  const [crossLayerDrag, setCrossLayerDrag] = useState<CrossLayerDragState>({
    phase: 'idle',
    meta: null,
    fingerPos: null,
  });

  // 性能优化
  const spatialGridRef = useRef(new SpatialGrid());
  const rafIdRef = useRef<number | null>(null);
  const lastEventRef = useRef<DragEndEvent | null>(null);

  // 碰撞检测函数
  const checkCollision = useCallback((nodeId: string, projectedX: number, projectedY: number): boolean => {
    const target = flow.nodes.find(n => n.id === nodeId);
    if (!target) return false;
    const projected = { ...target, position: { x: projectedX, y: projectedY } };
    return flow.nodes.some(other => other.id !== nodeId && nodesOverlap(projected, other, NODE_W));
  }, [flow.nodes]);

  const getProjectedPosition = useCallback((nodeId: string, delta: { x: number; y: number }) => {
    const target = flow.nodes.find(n => n.id === nodeId);
    if (!target) return { x: 0, y: 0 };
    return {
      x: Math.max(0, target.position.x + delta.x),
      y: Math.max(0, target.position.y + delta.y),
    };
  }, [flow.nodes]);

  const getCollisionDir = useCallback((
    nodeId: string,
    projectedX: number,
    projectedY: number,
  ): 'up' | 'down' | 'left' | 'right' | null => {
    const target = flow.nodes.find(n => n.id === nodeId);
    if (!target) return null;
    const projected = { ...target, position: { x: projectedX, y: projectedY } };
    const other = flow.nodes.find(o => o.id !== nodeId && nodesOverlap(projected, o, NODE_W));
    if (!other) return null;
    const dx = projected.position.x - other.position.x;
    const dy = projected.position.y - other.position.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }, [flow.nodes]);

  // 拖拽事件处理
  const handleDragStart = useCallback((event: DragEndEvent) => {
    const nodeId = event.active?.id as string;
    if (nodeId) setDraggingNodeId(nodeId);
    setIsColliding(false);
    
    if (event.active.data.current?.fromPalette) {
      setCrossLayerDrag(prev => ({
        ...prev,
        phase: 'palette',
        meta: event.active.data.current?.typeMeta as NodeTypeMeta || null,
      }));
    }
  }, []);

  const handleDragMove = useCallback((event: DragEndEvent) => {
    // 跨层拖拽处理逻辑
    if (event.active.data.current?.fromPalette) {
      setCrossLayerDrag(prev => ({
        ...prev,
        phase: 'crossing',
        fingerPos: { x: event.over?.data.current?.rect?.left, y: event.over?.data.current?.rect?.top },
      }));
    }
    
    // 拖拽降频：仅标记脏事件，实际碰撞检测在 rAF 回调中执行
    lastEventRef.current = event;
    if (rafIdRef.current !== null) return;
    
    rafIdRef.current = requestAnimationFrame(() => {
      if (!lastEventRef.current) return;
      
      const { active, delta } = lastEventRef.current;
      const nodeId = active.id as string;
      
      // 执行碰撞检测
      const projectedPos = getProjectedPosition(nodeId, delta);
      const colliding = checkCollision(nodeId, projectedPos.x, projectedPos.y);
      setIsColliding(colliding);
      
      if (colliding) {
        const dir = getCollisionDir(nodeId, projectedPos.x, projectedPos.y);
        setCollisionDir(dir);
      } else {
        setCollisionDir(null);
      }
      
      rafIdRef.current = null;
    });
  }, [flow.nodes, canvasScale, checkCollision, getProjectedPosition, getCollisionDir]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, delta } = event;
    
    // 从左侧栏拖入画布（增强：跨层落位）
    if (active.data.current?.fromPalette) {
      const typeMeta = active.data.current?.typeMeta as NodeTypeMeta;
      if (typeMeta) {
        const scaledDelta = { x: delta.x / canvasScale, y: delta.y / canvasScale };
        const projectedPos = getProjectedPosition(active.id as string, scaledDelta);
        addNode(typeMeta, projectedPos);
      }
    }
    
    // 画布内节点拖拽结束
    const nodeId = active.id as string;
    if (!active.data.current?.fromPalette) {
      // 调用位置更新函数
      const scaledDelta = { x: delta.x / canvasScale, y: delta.y / canvasScale };
      updateNodePositionByDelta(nodeId, scaledDelta);
    }
    
    setDraggingNodeId(null);
    setIsColliding(false);
    setCollisionDir(null);
    setCrossLayerDrag({ phase: 'idle', meta: null, fingerPos: null });
    
    // 瞬移过渡动画
    setAnimateMove(true);
    window.setTimeout(() => setAnimateMove(false), 300);
  }, [addNode, canvasScale, getProjectedPosition, updateNodePositionByDelta]);

  // 空间索引重建
  useEffect(() => {
    spatialGridRef.current.rebuild(flow.nodes);
    // setActiveSpatialGrid(spatialGridRef.current); // 需要导入 setActiveSpatialGrid
  }, [flow.nodes]);

  // 清理
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return {
    // 状态
    draggingNodeId,
    isColliding,
    collisionDir,
    animateMove,
    crossLayerDrag,
    
    // 事件处理
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    
    // 碰撞检测
    checkCollision,
    getProjectedPosition,
    getCollisionDir,
    
    // 暴露 spatialGridRef 供外部使用
    spatialGridRef,
  };
}