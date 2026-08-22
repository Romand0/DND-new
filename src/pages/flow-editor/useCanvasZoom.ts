/**
 * Canvas Zoom Hook
 * 
 * 管理画布缩放功能，包括：
 * - 触屏双指捏合缩放
 * - 鼠标 Ctrl/Meta + 滚轮缩放
 * - 缩放按钮控制
 * - 缩放重置功能
 * - 缩放状态管理
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSensors, useSensor, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { SCALE_MIN, SCALE_MAX, SCALE_STEP } from './constants';

// ===== Hook 配置接口 =====
export interface UseCanvasZoomConfig {
  canvasRef: React.RefObject<HTMLDivElement>;
  canvasScale: number;
  setCanvasScale: (updater: (prev: number) => number) => void;
  canvasTranslate: { x: number; y: number };
  setCanvasTranslate: (translate: { x: number; y: number }) => void;
  onTouchEnd: () => void;
  onWheel?: (e: React.WheelEvent) => void;
}

// ===== 缩放状态类型 =====
export type PinchState = {
  phase: 'idle' | 'pinching';
  meta: {
    pointers: Map<number, { x: number; y: number }>;
    startScale: number;
    startTranslate: { x: number; y: number };
    startDist: number;
    startMid: { x: number; y: number };
  };
  fingerPos: { x: number; y: number } | null;
};

// ===== 主要 Hook =====
export function useCanvasZoom(config: UseCanvasZoomConfig) {
  const {
    canvasRef,
    canvasScale,
    setCanvasScale,
    canvasTranslate,
    setCanvasTranslate,
    onTouchEnd,
    onWheel,
  } = config;

  // ===== 双指捏合状态引用 =====
  const pinchRef = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startScale: number;
    startTranslate: { x: number; y: number };
    startDist: number;
    startMid: { x: number; y: number };
  }>({
    pointers: new Map(),
    startScale: 1,
    startTranslate: { x: 0, y: 0 },
    startDist: 0,
    startMid: { x: 0, y: 0 },
  });

  // ===== 触屏双指捏合开始 =====
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) return;
    
    const pts = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
    const map = new Map(pts.map(p => [p.id, { x: p.x, y: p.y }]));
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    
    pinchRef.current = {
      pointers: map,
      startScale: canvasScale,
      startTranslate: canvasTranslate,
      startDist: dist,
      startMid: mid,
    };
  }, [canvasScale, canvasTranslate]);

  // ===== 触屏双指捏合移动 =====
  const handleTouchMove = useCallback((e: TouchEvent) => {
    const state = pinchRef.current;
    if (e.touches.length < 2 || state.startDist === 0) return;
    
    e.preventDefault();
    const pts = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    
    const ratio = dist / state.startDist;
    const newScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, state.startScale * ratio));
    const scaleDelta = newScale / state.startScale;
    const newTranslate = {
      x: state.startTranslate.x * scaleDelta + (mid.x - state.startMid.x * scaleDelta),
      y: state.startTranslate.y * scaleDelta + (mid.y - state.startMid.y * scaleDelta),
    };
    
    setCanvasScale(() => newScale);
    setCanvasTranslate(newTranslate);
  }, [setCanvasScale, setCanvasTranslate]);

  // ===== 触屏双指捏合结束 =====
  const handleTouchEnd = useCallback(() => {
    pinchRef.current.startDist = 0;
    onTouchEnd();
  }, [onTouchEnd]);

  // ===== 阻止浏览器默认双指缩放 =====
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => handleTouchMove(e);
    
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, [handleTouchMove, canvasRef]);

  // ===== 鼠标 Ctrl/Meta + 滚轮缩放 =====
  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    setCanvasScale((prev: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((prev + delta) * 100) / 100)));
    
    // 调用外部传入的 onWheel 回调
    onWheel?.(e);
  }, [setCanvasScale, onWheel]);

  // ===== 缩放按钮回调 =====
  const zoomIn = useCallback(() => {
    setCanvasScale((prev: number) => Math.min(SCALE_MAX, Math.round((prev + SCALE_STEP) * 100) / 100));
  }, [setCanvasScale]);

  const zoomOut = useCallback(() => {
    setCanvasScale((prev: number) => Math.max(SCALE_MIN, Math.round((prev - SCALE_STEP) * 100) / 100));
  }, [setCanvasScale]);

  const resetZoom = useCallback(() => {
    setCanvasScale(() => 1);
    setCanvasTranslate({ x: 0, y: 0 });
  }, [setCanvasScale, setCanvasTranslate]);

  // ===== 获取当前缩放状态 =====
  const getZoomInfo = useCallback(() => ({
    scale: canvasScale,
    translate: canvasTranslate,
    zoomPercentage: Math.round(canvasScale * 100),
    isMinZoom: canvasScale <= SCALE_MIN,
    isMaxZoom: canvasScale >= SCALE_MAX,
  }), [canvasScale, canvasTranslate]);

  // ===== 传感器配置 =====
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // 5→3，更早激活
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,    // 250→150，触屏响应提速 100ms
        tolerance: 8,  // 5→8，允许更大手指抖动不取消
      },
    }),
  );

  return {
    // 触屏捏合
    handleTouchStart,
    handleTouchEnd,
    
    // 鼠标滚轮
    handleCanvasWheel,
    
    // 按钮控制
    zoomIn,
    zoomOut,
    resetZoom,
    
    // 状态
    getZoomInfo,
    sensors,
    
    // 引用
    pinchRef,
  };
}

// ===== 便捷函数 =====
/**
 * 创建 useCanvasZoom hook 的便捷函数，用于不需要复杂配置的场景
 */
export function useCanvasZoomSimple(
  canvasRef: React.RefObject<HTMLDivElement>,
  onWheel?: (e: React.WheelEvent) => void
) {
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasTranslate, setCanvasTranslate] = useState({ x: 0, y: 0 });

  return useCanvasZoom({
    canvasRef,
    canvasScale,
    setCanvasScale,
    canvasTranslate,
    setCanvasTranslate,
    onTouchEnd: () => {},
    onWheel,
  });
}

// ===== 类型导出 =====
