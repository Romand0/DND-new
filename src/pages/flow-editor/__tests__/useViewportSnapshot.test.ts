/**
 * useViewportSnapshot Hook 单元测试
 * 
 * 测试重点：
 * - 视口状态管理
 * - 快照保存和恢复
 * - 防抖机制
 * - 事件监听
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useViewportSnapshot } from '../useViewportSnapshot';
import flowStore from '../../data/flowStore';

// Mock dependencies
jest.mock('../../data/flowStore');

const mockFlowStore = flowStore as jest.Mocked<typeof flowStore>;

describe('useViewportSnapshot Hook', () => {
  const mockFlowId = 'test-flow-id';
  const mockCanvasRef = { current: document.createElement('div') };
  
  const mockConfig = {
    flowId: mockFlowId,
    canvasRef: mockCanvasRef,
    canvasScale: 1,
    setCanvasScale: jest.fn(),
    canvasTranslate: { x: 0, y: 0 },
    setCanvasTranslate: jest.fn(),
    showLeftPanel: false,
    setShowLeftPanel: jest.fn(),
    showRightPanel: false,
    setShowRightPanel: jest.fn(),
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mocks
    mockFlowStore.getViewportSnapshot.mockReturnValue(null);
    mockFlowStore.saveViewportSnapshot.mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up timers
    jest.useFakeTimers().clearAllTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default viewport state', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      expect(result.current.viewportRef.current).toEqual({
        scrollX: 0,
        scrollY: 0,
        scale: 1,
        translateX: 0,
        translateY: 0,
        showLeftPanel: false,
        showRightPanel: false,
      });
      
      expect(result.current.scrollRestoreStatus).toBe('idle');
    });

    it('should initialize with provided canvas scale and translate', () => {
      const config = {
        ...mockConfig,
        canvasScale: 1.5,
        canvasTranslate: { x: 100, y: 200 },
      };
      
      const { result } = renderHook(() => useViewportSnapshot(config));
      
      expect(result.current.viewportRef.current.scale).toBe(1.5);
      expect(result.current.viewportRef.current.translateX).toBe(100);
      expect(result.current.viewportRef.current.translateY).toBe(200);
    });
  });

  describe('Viewport State Management', () => {
    it('should update viewport ref when scale changes', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      act(() => {
        mockConfig.setCanvasScale(1.5);
      });
      
      expect(result.current.viewportRef.current.scale).toBe(1.5);
    });

    it('should update viewport ref when translate changes', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      act(() => {
        mockConfig.setCanvasTranslate({ x: 100, y: 200 });
      });
      
      expect(result.current.viewportRef.current.translateX).toBe(100);
      expect(result.current.viewportRef.current.translateY).toBe(200);
    });

    it('should update viewport ref when panel states change', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      act(() => {
        mockConfig.setShowLeftPanel(true);
        mockConfig.setShowRightPanel(true);
      });
      
      expect(result.current.viewportRef.current.showLeftPanel).toBe(true);
      expect(result.current.viewportRef.current.showRightPanel).toBe(true);
    });
  });

  describe('Snapshot Management', () => {
    it('should save viewport snapshot to flowStore', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      act(() => {
        result.current.saveViewport();
      });
      
      expect(mockFlowStore.saveViewportSnapshot).toHaveBeenCalledWith(mockFlowId, {
        scrollX: 0,
        scrollY: 0,
        scale: 1,
        translateX: 0,
        translateY: 0,
        showLeftPanel: false,
        showRightPanel: false,
      });
    });

    it('should schedule viewport save with debounce', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      act(() => {
        result.current.scheduleViewportSave();
      });
      
      // Timer should be set
      expect(result.current.saveTimerRef.current).not.toBeNull();
      
      // Fast forward timers
      jest.useFakeTimers().advanceTimersByTime(500);
      
      // Timer should be cleared and save should be called
      expect(result.current.saveTimerRef.current).toBeNull());
      expect(mockFlowStore.saveViewportSnapshot).toHaveBeenCalled();
    });

    it('should clear existing timer when scheduling new save', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      // First schedule
      act(() => {
        result.current.scheduleViewportSave();
      });
      
      // Second schedule before first completes
      act(() => {
        result.current.scheduleViewportSave();
      });
      
      // Only one timer should exist
      expect(result.current.saveTimerRef.current).not.toBeNull();
      
      // Fast forward timers
      jest.useFakeTimers().advanceTimersByTime(500);
      
      // Save should be called only once
      expect(mockFlowStore.saveViewportSnapshot).toHaveBeenCalledTimes(1);
    });

    it('should restore viewport from snapshot', () => {
      const mockSnapshot = {
        scrollX: 100,
        scrollY: 200,
        scale: 1.5,
        translateX: 50,
        translateY: 75,
        showLeftPanel: true,
        showRightPanel: false,
      };
      
      mockFlowStore.getViewportSnapshot.mockReturnValue(mockSnapshot);
      
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      act(() => {
        result.current.restoreViewport();
      });
      
      expect(result.current.scrollRestoreStatus).toBe('restoring');
      
      // Verify state updates
      expect(mockConfig.setCanvasScale).toHaveBeenCalledWith(1.5);
      expect(mockConfig.setCanvasTranslate).toHaveBeenCalledWith({ x: 50, y: 75 });
      expect(mockConfig.setShowLeftPanel).toHaveBeenCalledWith(true);
      expect(mockConfig.setShowRightPanel).toHaveBeenCalledWith(false);
      
      // Verify canvas scroll
      if (mockCanvasRef.current) {
        expect(mockCanvasRef.current.scrollLeft).toBe(100);
        expect(mockCanvasRef.current.scrollTop).toBe(200);
      }
    });

    it('should not restore when no snapshot exists', () => {
      mockFlowStore.getViewportSnapshot.mockReturnValue(null);
      
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      act(() => {
        result.current.restoreViewport();
      });
      
      expect(result.current.scrollRestoreStatus).toBe('restored');
      expect(mockConfig.setCanvasScale).not.toHaveBeenCalled();
    });

    it('should clear snapshot', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      act(() => {
        result.current.clearSnapshot();
      });
      
      expect(mockFlowStore.saveViewportSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('Snapshot Status Checks', () => {
    it('should check if snapshot exists', () => {
      mockFlowStore.getViewportSnapshot.mockReturnValue({} as any);
      
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      expect(result.current.hasSnapshot()).toBe(true);
    });

    it('should check if snapshot does not exist', () => {
      mockFlowStore.getViewportSnapshot.mockReturnValue(null);
      
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      expect(result.current.hasSnapshot()).toBe(false);
    });

    it('should get current snapshot', () => {
      const mockSnapshot = { scale: 1.5 } as any;
      mockFlowStore.getViewportSnapshot.mockReturnValue(mockSnapshot);
      
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      expect(result.current.getSnapshot()).toBe(mockSnapshot);
    });
  });

  describe('Event Handling', () => {
    it('should handle scroll events', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      // Simulate scroll event
      if (mockCanvasRef.current) {
        mockCanvasRef.current.scrollLeft = 100;
        mockCanvasRef.current.scrollTop = 200;
        
        const scrollEvent = new Event('scroll');
        mockCanvasRef.current.dispatchEvent(scrollEvent);
      }
      
      // Should update viewport ref and schedule save
      expect(result.current.viewportRef.current.scrollX).toBe(100);
      expect(result.current.viewportRef.current.scrollY).toBe(200);
    });

    it('should handle beforeunload event', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      // Simulate beforeunload event
      const beforeUnloadEvent = new Event('beforeunload');
      window.dispatchEvent(beforeUnloadEvent);
      
      expect(mockFlowStore.saveViewportSnapshot).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle save errors gracefully', () => {
      mockFlowStore.saveViewportSnapshot.mockImplementation(() => {
        throw new Error('Save failed');
      });
      
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      expect(() => {
        act(() => {
          result.current.saveViewport();
        });
      }).not.toThrow();
    });

    it('should handle restore errors gracefully', () => {
      mockFlowStore.getViewportSnapshot.mockImplementation(() => {
        throw new Error('Restore failed');
      });
      
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      expect(() => {
        act(() => {
          result.current.restoreViewport();
        });
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should debounce rapid save calls', () => {
      const { result } = renderHook(() => useViewportSnapshot(mockConfig));
      
      // Call save multiple times rapidly
      act(() => {
        result.current.scheduleViewportSave();
        result.current.scheduleViewportSave();
        result.current.scheduleViewportSave();
      });
      
      // Should only have one timer
      expect(result.current.saveTimerRef.current).not.toBeNull();
      
      // Fast forward timers
      jest.useFakeTimers().advanceTimersByTime(500);
      
      // Should save only once
      expect(mockFlowStore.saveViewportSnapshot).toHaveBeenCalledTimes(1);
    });
  });
});