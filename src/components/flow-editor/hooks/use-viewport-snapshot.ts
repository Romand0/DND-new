/**
 * Flow Editor 视口快照管理 Hook
 * 
 * 功能：
 * - 保存/恢复编辑器视图状态（画布位置、缩放、面板开关）
 * - 跨页面刷新保持编辑器体验
 * - 支持多流程独立快照
 * 
 * 核心逻辑：
 * 1. 每次视图变化时自动保存快照
 * 2. 组件挂载时尝试恢复快照
 * 3. 提供手动清除快照功能
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import flowStore from '@/data/flowStore';

// ===== Hook 配置接口 =====
export interface UseViewportSnapshotConfig {
  flowId: string;
  canvasRef: React.RefObject<HTMLDivElement>;
  canvasScale: number;
  setCanvasScale: (scale: number) => void;
  canvasTranslate: { x: number; y: number };
  setCanvasTranslate: (translate: { x: number; y: number }) => void;
  showLeftPanel: boolean;
  setShowLeftPanel: (show: boolean) => void;
  showRightPanel: boolean;
  setShowRightPanel: (show: boolean) => void;
}

// ===== 快照类型定义 =====
export interface ViewportSnapshot {
  scrollX: number;
  scrollY: number;
  scale: number;
  translateX: number;
  translateY: number;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  timestamp: number;
}

// ===== 快照恢复状态 =====
export type ScrollRestoreStatus = 'idle' | 'restoring' | 'restored';

// ===== Hook 返回值接口 =====
export interface UseViewportSnapshotReturn {
  // 状态
  scrollRestoreStatus: ScrollRestoreStatus;
  
  // 引用
  viewportRef: React.MutableRefObject<{
    scrollX: number;
    scrollY: number;
    scale: number;
    translateX: number;
    translateY: number;
    showLeftPanel: boolean;
    showRightPanel: boolean;
  }>;
  
  // 操作
  saveViewport: () => void;
  restoreViewport: () => void;
  clearSnapshot: () => void;
  
  // 状态检查
  hasSnapshot: () => boolean;
  getSnapshot: () => ViewportSnapshot | null;
}

// ===== 主要 Hook =====
export function useViewportSnapshot(config: UseViewportSnapshotConfig): UseViewportSnapshotReturn {
  const {
    flowId,
    canvasRef,
    canvasScale,
    setCanvasScale,
    canvasTranslate,
    setCanvasTranslate,
    showLeftPanel,
    setShowLeftPanel,
    showRightPanel,
    setShowRightPanel,
  } = config;

  // ===== 状态管理 =====
  const [scrollRestoreStatus, setScrollRestoreStatus] = useState<ScrollRestoreStatus>('idle');
  
  // ===== 视口引用 =====
  const viewportRef = useRef({
    scrollX: 0,
    scrollY: 0,
    scale: canvasScale,
    translateX: canvasTranslate.x,
    translateY: canvasTranslate.y,
    showLeftPanel,
    showRightPanel,
  });

  // ===== 快照操作 =====

  // 保存当前视口状态到快照
  const saveViewport = useCallback(() => {
    if (!flowId) return;
    const canvas = canvasRef.current;
    const v = viewportRef.current;
    
    flowStore.saveViewportSnapshot(flowId, {
      scrollX: canvas ? canvas.scrollLeft : v.scrollX,
      scrollY: canvas ? canvas.scrollTop : v.scrollY,
      scale: v.scale,
      translateX: v.translateX,
      translateY: v.translateY,
      showLeftPanel: v.showLeftPanel,
      showRightPanel: v.showRightPanel,
      timestamp: Date.now(),
    } as ViewportSnapshot);
    
    console.log(`[ViewportSnapshot] 已保存快照: ${flowId}`);
  }, [flowId, canvasRef]);

  // 恢复视口状态
  const restoreViewport = useCallback(() => {
    if (!flowId) return;
    
    setScrollRestoreStatus('restoring');
    const snapshot = flowStore.getViewportSnapshot(flowId);
    
    if (!snapshot) {
      setScrollRestoreStatus('idle');
      return;
    }
    
    // 恢复画布状态
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.scrollLeft = snapshot.scrollX;
      canvas.scrollTop = snapshot.scrollY;
    }
    
    // 恢复缩放和平移
    setCanvasScale(snapshot.scale);
    setCanvasTranslate({
      x: snapshot.translateX,
      y: snapshot.translateY,
    });
    
    // 恢复面板状态
    setShowLeftPanel(snapshot.showLeftPanel);
    setShowRightPanel(snapshot.showRightPanel);
    
    // 更新引用
    viewportRef.current = {
      scrollX: snapshot.scrollX,
      scrollY: snapshot.scrollY,
      scale: snapshot.scale,
      translateX: snapshot.translateX,
      translateY: snapshot.translateY,
      showLeftPanel: snapshot.showLeftPanel,
      showRightPanel: snapshot.showRightPanel,
    };
    
    setScrollRestoreStatus('restored');
    console.log(`[ViewportSnapshot] 已恢复快照: ${flowId}`);
  }, [flowId, canvasRef, setCanvasScale, setCanvasTranslate, setShowLeftPanel, setShowRightPanel]);

  // 清除快照
  const clearSnapshot = useCallback(() => {
    if (!flowId) return false;
    
    try {
      // 移除本地存储的快照
      const raw = localStorage.getItem('dnd-flow-viewport-snapshots');
      if (raw) {
        const map: Record<string, ViewportSnapshot> = JSON.parse(raw);
        delete map[flowId];
        localStorage.setItem('dnd-flow-viewport-snapshots', JSON.stringify(map));
      }
      
      // 重置状态
      setScrollRestoreStatus('idle');
      console.log(`[ViewportSnapshot] 已清除快照: ${flowId}`);
      return true;
    } catch (error) {
      console.error(`[ViewportSnapshot] 清除快照失败: ${flowId}`, error);
      return false;
    }
  }, [flowId]);

  // 状态检查
  const hasSnapshot = useCallback((): boolean => {
    if (!flowId) return false;
    try {
      const raw = localStorage.getItem('dnd-flow-viewport-snapshots');
      if (!raw) return false;
      
      const map: Record<string, ViewportSnapshot> = JSON.parse(raw);
      return !!map[flowId];
    } catch {
      return false;
    }
  }, [flowId]);

  // 获取当前快照
  const getSnapshot = useCallback((): ViewportSnapshot | null => {
    if (!flowId) return null;
    try {
      return flowStore.getViewportSnapshot(flowId);
    } catch (error) {
      console.error(`[ViewportSnapshot] 获取快照失败: ${flowId}`, error);
      return null;
    }
  }, [flowId]);

  // ===== 自动保存监听 =====
  useEffect(() => {
    // 监听视图变化，自动保存快照
    const handleScroll = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        viewportRef.current.scrollX = canvas.scrollLeft;
        viewportRef.current.scrollY = canvas.scrollTop;
        saveViewport();
      }
    };

    const handleScaleChange = () => {
      viewportRef.current.scale = canvasScale;
      saveViewport();
    };

    const handleTranslateChange = () => {
      viewportRef.current.translateX = canvasTranslate.x;
      viewportRef.current.translateY = canvasTranslate.y;
      saveViewport();
    };

    const handlePanelChange = () => {
      viewportRef.current.showLeftPanel = showLeftPanel;
      viewportRef.current.showRightPanel = showRightPanel;
      saveViewport();
    };

    // 添加事件监听
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('scroll', handleScroll);
    }

    // 监听状态变化
    const scaleObserver = new MutationObserver(() => handleScaleChange());
    const translateObserver = new MutationObserver(() => handleTranslateChange());
    const panelObserver = new MutationObserver(() => handlePanelChange());

    // 观察相关元素
    const scaleElement = document.querySelector('[data-canvas-scale]');
    const translateElement = document.querySelector('[data-canvas-translate]');
    const panelElement = document.querySelector('[data-panel-state]');

    if (scaleElement) scaleObserver.observe(scaleElement, { attributes: true });
    if (translateElement) translateObserver.observe(translateElement, { attributes: true });
    if (panelElement) panelObserver.observe(panelElement, { attributes: true });

    // 清理函数
    return () => {
      if (canvas) {
        canvas.removeEventListener('scroll', handleScroll);
      }
      scaleObserver.disconnect();
      translateObserver.disconnect();
      panelObserver.disconnect();
    };
  }, [flowId, canvasRef, canvasScale, canvasTranslate, showLeftPanel, showRightPanel, saveViewport]);

  // ===== 组件挂载时恢复快照 =====
  useLayoutEffect(() => {
    if (flowId && hasSnapshot()) {
      restoreViewport();
    }
  }, [flowId, hasSnapshot, restoreViewport]);

  return {
    scrollRestoreStatus,
    viewportRef,
    saveViewport,
    restoreViewport,
    clearSnapshot,
    hasSnapshot,
    getSnapshot,
  };
}