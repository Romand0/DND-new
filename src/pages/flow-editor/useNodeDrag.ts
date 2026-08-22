/**
 * Node Drag Hook
 * 
 * 管理节点拖拽的状态和操作，包括：
 * - 节点拖拽状态管理（draggingNodeId, isColliding, collisionDir, animateMove）
 * - 跨层拖拽状态管理（crossLayerDrag）
 * - 实时碰撞检测和方向计算
 * - 拖拽事件处理（开始、移动、结束）
 * - 磁吸对齐和智能退避算法
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { FlowDefinition, FlowNodeDef, NodeTypeMeta } from '@/types/flow';
import { nodesOverlap, findNonOverlappingPositionV2 } from './collision';
import { NODE_W, NODE_H, CARD_NODE_W, CARD_NODE_H } from './constants';

// ===== 拖拽状态接口 =====
export interface DragState {
  draggingNodeId: string | null;
  isColliding: boolean;
  collisionDir: 'up' | 'down' | 'left' | 'right' | null;
  animateMove: boolean;
}

// ===== 跨层拖拽状态接口 =====
export interface CrossLayerDragState {
  phase: 'idle' | 'palette' | 'crossing' | 'canvas';
  meta: NodeTypeMeta | null;
  fingerPos: { x: number; y: number } | null;
}

// ===== Hook 配置接口 =====
export interface UseNodeDragConfig {
  flow: FlowDefinition;
  canvasScale: number;
  canvasTranslate: { x: number; y: number };
  addNode: (typeMeta: NodeTypeMeta, position: { x: number; y: number }) => void;
  setShowLeftPanel: (show: boolean) => void;
  setFlow: (flow: FlowDefinition) => void;
  spatialGridRef: React.MutableRefObject<any>;
  canvasRef?: React.RefObject<HTMLDivElement>;
}

// ===== Hook 返回值接口 =====
export interface UseNodeDragReturn {
  // 拖拽状态
  dragState: DragState;
  crossLayerDrag: CrossLayerDragState;
  
  // 事件处理函数
  handleDragStart: (event: DragEndEvent) => void;
  handleDragMove: (event: DragEndEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  
  // 碰撞检测函数
  checkCollision: (nodeId: string, projectedX: number, projectedY: number) => boolean;
  getProjectedPosition: (nodeId: string, delta: { x: number; y: number }) => { x: number; y: number };
  getCollisionDir: (nodeId: string, projectedX: number, projectedY: number) => 'up' | 'down' | 'left' | 'right' | null;
}

// ===== 创建空流程的函数 =====
export function createEmptyFlow(): FlowDefinition {
  return {
    id: `flow-${Date.now()}`,
    name: '未命名流程',
    description: '',
    nodes: [],
    edges: [],
    tags: [],
    version: 1,
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ===== Node Drag Hook =====
export function useNodeDrag(config: UseNodeDragConfig): UseNodeDragReturn {
  const { 
    flow, 
    canvasScale, 
    canvasTranslate, 
    addNode, 
    setShowLeftPanel, 
    setFlow,
    spatialGridRef,
    canvasRef
  } = config;

  // ===== 拖拽状态 =====
  const [dragState, setDragState] = useState<DragState>({
    draggingNodeId: null,
    isColliding: false,
    collisionDir: null,
    animateMove: false,
  });

  const [crossLayerDrag, setCrossLayerDrag] = useState<CrossLayerDragState>({
    phase: 'idle',
    meta: null,
    fingerPos: null,
  });

  // ===== rAF 降频相关 =====
  const rafIdRef = useRef<number | null>(null);
  const lastEventRef = useRef<DragEndEvent | null>(null);

  // ===== 碰撞检测：计算拖拽节点的投影位置与其他节点是否重叠 =====
  const checkCollision = useCallback((nodeId: string, projectedX: number, projectedY: number): boolean => {
    const target = flow.nodes.find((n: FlowNodeDef) => n.id === nodeId);
    if (!target) return false;
    const projected = { ...target, position: { x: projectedX, y: projectedY } };
    return flow.nodes.some((other: FlowNodeDef) => other.id !== nodeId && nodesOverlap(projected, other, NODE_W));
  }, [flow.nodes]);

  // ===== 拖拽中实时位置投影 =====
  const getProjectedPosition = useCallback((nodeId: string, delta: { x: number; y: number }) => {
    const target = flow.nodes.find(n => n.id === nodeId);
    if (!target) return { x: 0, y: 0 };
    return {
      x: Math.max(0, target.position.x + delta.x),
      y: Math.max(0, target.position.y + delta.y),
    };
  }, [flow.nodes]);

  // ===== 碰撞方向：计算被拖拽节点的推离方向（供方向提示箭头） =====
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

  // ===== 事件：拖拽开始 =====
  const handleDragStart = useCallback((event: DragEndEvent) => {
    const nodeId = event.active?.id as string;
    if (nodeId) {
      setDragState(prev => ({ ...prev, draggingNodeId: nodeId }));
    }
    setDragState(prev => ({ ...prev, isColliding: false, collisionDir: null }));
    
    // ── 跨层拖拽：开始拖拽时设置 phase ──
    if (event.active.data.current?.fromPalette) {
      setCrossLayerDrag(prev => ({
        ...prev,
        phase: 'palette',
        meta: event.active.data.current?.typeMeta as NodeTypeMeta || null,
      }));
    }
  }, []);

  // ===== 事件：拖拽移动（rAF 节流 + 实时碰撞检测，不再写入位置状态） =====
  const handleDragMove = useCallback((event: DragEndEvent) => {
    const { active } = event;
    if (!active) return;
    
    // ── 跨层拖拽：手指位置检测 ──
    if (active.data.current?.fromPalette) {
      const translatedRect = active.rect.current.translated;
      if (translatedRect) {
        const panelWidth = 320; // 左面板宽度 w-72 = 288px，加 padding
        const fingerX = translatedRect.left + translatedRect.width / 2;
        if (fingerX > panelWidth && crossLayerDrag.phase === 'palette') {
          // 手指越过面板边界 → 进入 CROSSING 阶段
          setCrossLayerDrag(prev => ({
            ...prev,
            phase: 'crossing',
            fingerPos: { x: fingerX, y: translatedRect.top },
          }));
          // 收起左面板（带动画）
          setShowLeftPanel(false);
        }
        if (crossLayerDrag.phase === 'crossing' || crossLayerDrag.phase === 'canvas') {
          // 面板已收起，卡片全屏跟随
          setCrossLayerDrag(prev => ({
            ...prev,
            phase: 'canvas',
            fingerPos: { x: fingerX, y: translatedRect.top + translatedRect.height / 2 },
          }));
        }
      }
    }
    
    // 拖拽降频：仅标记脏事件，实际碰撞检测在 rAF 回调中执行
    lastEventRef.current = event;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const ev = lastEventRef.current;
      lastEventRef.current = null;
      if (!ev?.active) return;
      const nodeId = ev.active.id as string;
      const scaledDelta = { x: ev.delta.x / canvasScale, y: ev.delta.y / canvasScale };
      
      // ★ 一次查找，复用 target 引用
      const target = flow.nodes.find(n => n.id === nodeId);
      if (!target) return;
      
      const projected = {
        x: Math.max(0, target.position.x + scaledDelta.x),
        y: Math.max(0, target.position.y + scaledDelta.y),
      };
      
      // ★ 直接用 SpatialGrid 候选做碰撞，不再遍历全量 nodes
      const candidates = spatialGridRef.current
        .queryCandidates(projected.x, projected.y, NODE_W, NODE_H)
        .filter(o => o.id !== nodeId);
      
      const colliding = candidates.some(o =>
        projected.x < o.position.x + NODE_W &&
        projected.x + NODE_W > o.position.x &&
        projected.y < o.position.y + NODE_H &&
        projected.y + NODE_H > o.position.y
      );
      
      setDragState(prev => ({ ...prev, isColliding: colliding }));
      
      if (colliding) {
        const other = candidates.find(o =>
          projected.x < o.position.x + NODE_W &&
          projected.x + NODE_W > o.position.x &&
          projected.y < o.position.y + NODE_H &&
          projected.y + NODE_H > o.position.y
        );
        if (other) {
          const dx = projected.x - other.position.x;
          const dy = projected.y - other.position.y;
          setDragState(prev => ({ 
            ...prev, 
            collisionDir: Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up')
          }));
        }
      } else {
        setDragState(prev => ({ ...prev, collisionDir: null }));
      }
    });
  }, [flow.nodes, canvasScale, crossLayerDrag.phase, setShowLeftPanel, spatialGridRef]);

  // ===== 事件：拖拽结束 =====
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, delta } = event;
    
    // ── 从左侧栏拖入画布（增强：跨层落位） ──
    if (active.data.current?.fromPalette) {
      const typeMeta = active.data.current.typeMeta as NodeTypeMeta;
      const translatedRect = active.rect.current.translated;
      if (translatedRect && canvasRef?.current) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const dropX = translatedRect.left + translatedRect.width / 2;
        const dropY = translatedRect.top + translatedRect.height / 2;

        if (
          dropX >= canvasRect.left &&
          dropX <= canvasRect.right &&
          dropY >= canvasRect.top &&
          dropY <= canvasRect.bottom
        ) {
          // ★ 精确落位：屏幕坐标 → 画布逻辑坐标（含缩放 + 平移 + 滚动）
          const x = (dropX - canvasRect.left + canvasRef.current.scrollLeft - canvasTranslate.x)
                    / canvasScale
                    - CARD_NODE_W / 2;
          const y = (dropY - canvasRect.top + canvasRef.current.scrollTop - canvasTranslate.y)
                    / canvasScale
                    - CARD_NODE_H / 2;
          addNode(typeMeta, { x: Math.max(0, x), y: Math.max(0, y) });
        } else {
          // 松手在画布外 → 取消放置，恢复左面板
          setShowLeftPanel(true);
        }
      } else {
        // 兜底：放在画布中心
        const canvas = canvasRef?.current;
        const cx = canvas ? (canvas.scrollLeft + canvas.clientWidth / 2) / canvasScale - NODE_W / 2 : 600;
        const cy = canvas ? (canvas.scrollTop + canvas.clientHeight / 2) / canvasScale - 24 : 400;
        addNode(typeMeta, { x: cx, y: cy });
      }

      // 重置跨层状态
      setCrossLayerDrag({ phase: 'idle', meta: null, fingerPos: null });
      return;
    }

    // ── 画布内节点拖拽结束：用全量 delta 一次性写入最终位置 + 智能退避 + 磁吸对齐 ──
    const nodeId = active.id as string;
    setDragState(prev => ({ ...prev, draggingNodeId: null, isColliding: false, collisionDir: null }));
    
    const scaledDelta = { x: delta.x / canvasScale, y: delta.y / canvasScale };
    // 创建新的flow对象
    const target = flow.nodes.find(n => n.id === nodeId);
    if (!target) return;
    
    const proposed = {
      x: Math.max(0, target.position.x + scaledDelta.x),
      y: Math.max(0, target.position.y + scaledDelta.y),
    };
    
    // ① 先磁吸（用户心理预期是"放到网格上"）
    const snap = 20;
    const snapped = {
      x: Math.round(proposed.x / snap) * snap,
      y: Math.round(proposed.y / snap) * snap,
    };
    
    // ② 再退避（从磁吸位置出发，退避步长也对齐网格）
    const testNode = { ...target, position: snapped };
    const others = flow.nodes.filter(n => n.id !== nodeId);
    const resolvedPos = findNonOverlappingPositionV2(testNode, others, NODE_W, NODE_H, spatialGridRef.current, canvasScale);
    
    // ③ 退避结果再次磁吸，确保最终落位在网格上
    const finalPos = {
      x: Math.round(resolvedPos.x / snap) * snap,
      y: Math.round(resolvedPos.y / snap) * snap,
    };
    
    // 创建新的flow对象
    const newFlow = {
      ...flow,
      nodes: flow.nodes.map(n => n.id === nodeId ? { ...n, position: finalPos } : n),
      updatedAt: Date.now(),
    };
    
    setFlow(newFlow);
    
    // 瞬移过渡：拖拽结束后短暂开启 transform 过渡，300ms 后移除
    setDragState(prev => ({ ...prev, animateMove: true }));
    window.setTimeout(() => {
      setDragState(prev => ({ ...prev, animateMove: false }));
    }, 300);
  }, [addNode, canvasScale, canvasTranslate, setFlow, spatialGridRef]);

  return {
    // 拖拽状态
    dragState,
    crossLayerDrag,
    
    // 事件处理函数
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    
    // 碰撞检测函数
    checkCollision,
    getProjectedPosition,
    getCollisionDir,
  };
}

// ===== 便捷函数 =====
/**
 * 创建 useNodeDrag hook 的便捷函数，用于不需要复杂配置的场景
 */
export function useNodeDragSimple(
  flow: FlowDefinition,
  canvasScale: number,
  canvasTranslate: { x: number; y: number },
  addNode: (typeMeta: NodeTypeMeta, position: { x: number; y: number }) => void,
  setShowLeftPanel: (show: boolean) => void,
  setFlow: (flow: FlowDefinition) => void,
  spatialGridRef: React.MutableRefObject<any>,
  canvasRef?: React.RefObject<HTMLDivElement>
): UseNodeDragReturn {
  return useNodeDrag({
    flow,
    canvasScale,
    canvasTranslate,
    addNode,
    setShowLeftPanel,
    setFlow,
    spatialGridRef,
    canvasRef,
  });
}