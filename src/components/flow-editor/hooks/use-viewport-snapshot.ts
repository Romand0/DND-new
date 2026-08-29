/**
 * Viewport Snapshot Hook
 * 
 * 管理画布视口快照的保存和恢复，包括：
 * - 画布滚动位置
 * - 缩放级别和平移
 * - 左右面板展开状态
 * - 自动保存和恢复机制
 * - 防抖优化
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { FlowViewportSnapshot } from '../../data/flowStore';
import flowStore from '../../data/flowStore';

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
  saveTimerRef: React.MutableRefObject<number | null>;
  
  // 方法
  saveViewport: () => void;
  scheduleViewportSave: () => void;
  restoreViewport: () => void;
  clearSnapshot: () => void;
  
  // 状态检查
  hasSnapshot: () => boolean;
  getSnapshot: () => FlowViewportSnapshot | null;
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

  // ===== 快照恢复状态 =====
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
  
  // ===== 保存定时器引用 =====
  const saveTimerRef = useRef<number | null>(null);

  // ===== 保存视口快照 =====
  const saveViewport = useCallback(() => {
    if (!flowId) return;
    
    const canvas = canvasRef.current;
    const v = viewportRef.current;
    
    try {
      flowStore.saveViewportSnapshot(flowId, {
        scrollX: canvas ? canvas.scrollLeft : v.scrollX,
        scrollY: canvas ? canvas.scrollTop : v.scrollY,
        scale: v.scale,
        translateX: v.translateX,
        translateY: v.translateY,
        showLeftPanel: v.showLeftPanel,
        showRightPanel: v.showRightPanel,
      });
    } catch (error) {
      console.warn('Failed to save viewport snapshot:', error);
    }
  }, [flowId, canvasRef]);

  // ===== 防抖保存 =====
  const scheduleViewportSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveViewport();
    }, 500); // 500ms 防抖
  }, [saveViewport]);

  // ===== 更新视口引用 =====
  useEffect(() => {
    viewportRef.current.scale = canvasScale;
    viewportRef.current.translateX = canvasTranslate.x;
    viewportRef.current.translateY = canvasTranslate.y;
    viewportRef.current.showLeftPanel = showLeftPanel;
    viewportRef.current.showRightPanel = showRightPanel;
  }, [canvasScale, canvasTranslate, showLeftPanel, showRightPanel]);

  // ===== 滚动事件监听 =====
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onScroll = () => {
      viewportRef.current.scrollX = canvas.scrollLeft;
      viewportRef.current.scrollY = canvas.scrollTop;
      scheduleViewportSave();
    };

    canvas.addEventListener('scroll', onScroll);
    return () => canvas.removeEventListener('scroll', onScroll);
  }, [scheduleViewportSave, canvasRef]);

  // ===== 缩放/面板状态变化监听 =====
  useEffect(() => {
    scheduleViewportSave();
  }, [canvasScale, canvasTranslate, showLeftPanel, showRightPanel, scheduleViewportSave]);

  // ===== 卸载/刷新前保存 =====
  useEffect(() => {
    const onUnload = () => saveViewport();
    window.addEventListener('beforeunload', onUnload);
    
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      saveViewport();
    };
  }, [saveViewport]);

  // ===== 恢复视口快照 =====
  const restoreViewport = useCallback(() => {
    if (scrollRestoreStatus !== 'idle') return;
    
    setScrollRestoreStatus('restoring');
    
    const canvas = canvasRef.current;
    if (!canvas || !flowId) {
      setScrollRestoreStatus('restored');
      return;
    }

    try {
      const snapshot = flowStore.getViewportSnapshot(flowId);
      if (snapshot) {
        // 恢复缩放
        if (typeof snapshot.scale === 'number' && snapshot.scale > 0) {
          setCanvasScale(snapshot.scale);
        }
        
        // 恢复平移
        setCanvasTranslate({
          x: snapshot.translateX,
          y: snapshot.translateY,
        });
        
        // 恢复面板状态
        setShowLeftPanel(snapshot.showLeftPanel);
        setShowRightPanel(snapshot.showRightPanel);
        
        // 恢复滚动位置
        canvas.scrollLeft = snapshot.scrollX;
        canvas.scrollTop = snapshot.scrollY;
        
        // 更新引用
        viewportRef.current = {
          ...viewportRef.current,
          scrollX: snapshot.scrollX,
          scrollY: snapshot.scrollY,
          scale: snapshot.scale,
          translateX: snapshot.translateX,
          translateY: snapshot.translateY,
          showLeftPanel: snapshot.showLeftPanel,
          showRightPanel: snapshot.showRightPanel,
        };
      }
    } catch (error) {
      console.warn('Failed to restore viewport snapshot:', error);
    } finally {
      setScrollRestoreStatus('restored');
    }
  }, [flowId, canvasRef, setCanvasScale, setCanvasTranslate, setShowLeftPanel, setShowRightPanel, scrollRestoreStatus]);

  // ===== 清除快照 =====
  const clearSnapshot = useCallback(() => {
    if (!flowId) return;
    
    try {
      // 移除本地存储的快照
      const raw = localStorage.getItem('dnd-flow-viewport-snapshots');
      if (raw) {
        const map: Record<string, FlowViewportSnapshot> = JSON.parse(raw);
        delete map[flowId];
        localStorage.setItem('dnd-flow-viewport-snapshots', JSON.stringify(map));
      }
    } catch (error) {
      console.warn('Failed to clear viewport snapshot:', error);
    }
  }, [flowId]);

  // ===== 检查是否有快照 =====
  const hasSnapshot = useCallback(() => {
    if (!flowId) return false;
    try {
      return flowStore.getViewportSnapshot(flowId) !== null;
    } catch {
      return false;
    }
  }, [flowId]);

  // ===== 获取当前快照 =====
  const getSnapshot = useCallback((): FlowViewportSnapshot | null => {
    if (!flowId) return null;
    try {
      return flowStore.getViewportSnapshot(flowId);
    } catch {
      return null;
    }
  }, [flowId]);

  return {
    // 状态
    scrollRestoreStatus,
    
    // 引用
    viewportRef,
    saveTimerRef,
    
    // 方法
    saveViewport,
    scheduleViewportSave,
    restoreViewport,
    clearSnapshot,
    
    // 状态检查
    hasSnapshot,
    getSnapshot,
  };
}

// ===== 便捷函数 =====
/**
 * 创建 useViewportSnapshot hook 的便捷函数，用于不需要复杂配置的场景
 */
export function useViewportSnapshotSimple(
  flowId: string,
  canvasRef: React.RefObject<HTMLDivElement>
): UseViewportSnapshotReturn {
  // 默认状态
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasTranslate, setCanvasTranslate] = useState({ x: 0, y: 0 });
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);

  return useViewportSnapshot({
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
  });
}

// ===== 类型导出 =====
export type { FlowViewportSnapshot };