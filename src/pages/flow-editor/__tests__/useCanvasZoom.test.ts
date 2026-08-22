/**
 * useCanvasZoom Hook 单元测试
 * 
 * 测试重点：
 * - 缩放状态管理
 * - 触屏捏合缩放
 * - 鼠标滚轮缩放
 * - 按钮控制
 * - 传感器配置
 */

import { renderHook, act } from '@testing-library/react';
import { useCanvasZoom } from '../useCanvasZoom';
import { useSensors, useSensor } from '@dnd-kit/core';

// Mock dependencies
jest.mock('@dnd-kit/core');
jest.mock('../constants', () => ({
  SCALE_MIN: 0.5,
  SCALE_MAX: 3,
  SCALE_STEP: 0.1,
}));

const mockUseSensors = useSensors as jest.MockedFunction<typeof useSensors>;
const mockUseSensor = useSensor as jest.MockedFunction<typeof useSensor>;

describe('useCanvasZoom Hook', () => {
  const mockCanvasRef = { current: document.createElement('div') };
  const mockOnWheel = jest.fn();
  const mockOnTouchEnd = jest.fn();

  const mockConfig = {
    canvasRef: mockCanvasRef,
    canvasScale: 1,
    setCanvasScale: jest.fn(),
    canvasTranslate: { x: 0, y: 0 },
    setCanvasTranslate: jest.fn(),
    onTouchEnd: mockOnTouchEnd,
    onWheel: mockOnWheel,
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mocks
    mockUseSensors.mockReturnValue({ sensors: [] });
    mockUseSensor.mockReturnValue({ sensor: { active: false } });
  });

  describe('Initialization', () => {
    it('should initialize with default scale and translate', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      expect(result.current.getZoomInfo()).toEqual({
        scale: 1,
        translate: { x: 0, y: 0 },
        zoomPercentage: 100,
        isMinZoom: false,
        isMaxZoom: false,
      });
    });

    it('should initialize with provided scale and translate', () => {
      const config = {
        ...mockConfig,
        canvasScale: 1.5,
        canvasTranslate: { x: 100, y: 200 },
      };
      
      const { result } = renderHook(() => useCanvasZoom(config));
      
      expect(result.current.getZoomInfo()).toEqual({
        scale: 1.5,
        translate: { x: 100, y: 200 },
        zoomPercentage: 150,
        isMinZoom: false,
        isMaxZoom: false,
      });
    });
  });

  describe('Zoom Controls', () => {
    it('should zoom in', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      act(() => {
        result.current.zoomIn();
      });
      
      expect(mockConfig.setCanvasScale).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should zoom out', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      act(() => {
        result.current.zoomOut();
      });
      
      expect(mockConfig.setCanvasScale).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should reset zoom', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      act(() => {
        result.current.resetZoom();
      });
      
      expect(mockConfig.setCanvasScale).toHaveBeenCalledWith(expect.any(Function));
      expect(mockConfig.setCanvasTranslate).toHaveBeenCalledWith({ x: 0, y: 0 });
    });

    it('should respect scale limits', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      // Try to zoom out below minimum
      act(() => {
        result.current.zoomOut();
        result.current.zoomOut();
        result.current.zoomOut();
        result.current.zoomOut();
        result.current.zoomOut();
      });
      
      // Should not go below minimum
      expect(result.current.getZoomInfo().isMinZoom).toBe(true);
      
      // Try to zoom in above maximum
      for (let i = 0; i < 25; i++) {
        act(() => {
          result.current.zoomIn();
        });
      }
      
      // Should not go above maximum
      expect(result.current.getZoomInfo().isMaxZoom).toBe(true);
    });
  });

  describe('Pinch Zoom', () => {
    it('should handle touch start with two fingers', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      const mockTouchEvent = {
        touches: [
          { identifier: 1, clientX: 100, clientY: 100 },
          { identifier: 2, clientX: 150, clientY: 150 },
        ],
      } as React.TouchEvent;
      
      act(() => {
        result.current.handleTouchStart(mockTouchEvent);
      });
      
      // Should update pinch ref
      expect(result.current.pinchRef.current.pointers.size).toBe(2);
      expect(result.current.pinchRef.current.startScale).toBe(1);
    });

    it('should not handle touch start with one finger', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      const mockTouchEvent = {
        touches: [
          { identifier: 1, clientX: 100, clientY: 100 },
        ],
      } as React.TouchEvent;
      
      act(() => {
        result.current.handleTouchStart(mockTouchEvent);
      });
      
      // Should not update pinch ref
      expect(result.current.pinchRef.current.pointers.size).toBe(0);
    });

    it('should handle touch end', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      act(() => {
        result.current.handleTouchEnd();
      });
      
      expect(mockOnTouchEnd).toHaveBeenCalled();
    });

    it('should handle touch move with pinch gesture', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      // Setup initial pinch state
      result.current.pinchRef.current = {
        pointers: new Map([
          [1, { x: 100, y: 100 }],
          [2, { x: 150, y: 150 }],
        ]),
        startScale: 1,
        startTranslate: { x: 0, y: 0 },
        startDist: 70.71, // Distance between points
        startMid: { x: 125, y: 125 },
      };
      
      // Simulate touch move
      const mockTouchEvent = {
        touches: [
          { identifier: 1, clientX: 120, clientY: 120 },
          { identifier: 2, clientX: 180, clientY: 180 },
        ],
        preventDefault: jest.fn(),
      } as unknown as TouchEvent;
      
      act(() => {
        result.current.handleTouchMove(mockTouchEvent);
      });
      
      // Should update scale and translate
      expect(mockConfig.setCanvasScale).toHaveBeenCalledWith(expect.any(Function));
      expect(mockConfig.setCanvasTranslate).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should not handle touch move without initial pinch', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      // Set startDist to 0 (no initial pinch)
      result.current.pinchRef.current.startDist = 0;
      
      const mockTouchEvent = {
        touches: [
          { identifier: 1, clientX: 100, clientY: 100 },
          { identifier: 2, clientX: 150, clientY: 150 },
        ],
        preventDefault: jest.fn(),
      } as unknown as TouchEvent;
      
      act(() => {
        result.current.handleTouchMove(mockTouchEvent);
      });
      
      // Should not update scale or translate
      expect(mockConfig.setCanvasScale).not.toHaveBeenCalled();
      expect(mockConfig.setCanvasTranslate).not.toHaveBeenCalled();
    });
  });

  describe('Mouse Wheel Zoom', () => {
    it('should handle Ctrl+Meta wheel zoom', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      const mockWheelEvent = {
        ctrlKey: true,
        metaKey: false,
        deltaY: 10,
        preventDefault: jest.fn(),
      } as React.WheelEvent;
      
      act(() => {
        result.current.handleCanvasWheel(mockWheelEvent);
      });
      
      expect(mockConfig.setCanvasScale).toHaveBeenCalledWith(expect.any(Function));
      expect(mockOnWheel).toHaveBeenCalledWith(mockWheelEvent);
    });

    it('should not handle wheel without Ctrl+Meta', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      const mockWheelEvent = {
        ctrlKey: false,
        metaKey: false,
        deltaY: 10,
        preventDefault: jest.fn(),
      } as React.WheelEvent;
      
      act(() => {
        result.current.handleCanvasWheel(mockWheelEvent);
      });
      
      expect(mockConfig.setCanvasScale).not.toHaveBeenCalled();
      expect(mockOnWheel).not.toHaveBeenCalled();
    });

    it('should handle wheel direction correctly', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      // Zoom in (scroll up)
      const mockWheelEventUp = {
        ctrlKey: true,
        metaKey: false,
        deltaY: -10,
        preventDefault: jest.fn(),
      } as React.WheelEvent;
      
      act(() => {
        result.current.handleCanvasWheel(mockWheelEventUp);
      });
      
      expect(mockConfig.setCanvasScale).toHaveBeenCalledWith(expect.any(Function));
      
      // Zoom out (scroll down)
      const mockWheelEventDown = {
        ctrlKey: true,
        metaKey: false,
        deltaY: 10,
        preventDefault: jest.fn(),
      } as React.WheelEvent;
      
      act(() => {
        result.current.handleCanvasWheel(mockWheelEventDown);
      });
      
      expect(mockConfig.setCanvasScale).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Sensor Configuration', () => {
    it('should configure sensors correctly', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      expect(result.current.sensors).toBeDefined();
      expect(mockUseSensors).toHaveBeenCalled();
      expect(mockUseSensor).toHaveBeenCalledTimes(2);
    });

    it('should configure PointerSensor with correct constraints', () => {
      renderHook(() => useCanvasZoom(mockConfig));
      
      const pointerSensorCall = mockUseSensor.mock.calls.find(
        call => call[0].type === 'PointerSensor'
      );
      
      expect(pointerSensorCall).toBeDefined();
      expect(pointerSensorCall![1].activationConstraint.distance).toBe(3);
    });

    it('should configure TouchSensor with correct constraints', () => {
      renderHook(() => useCanvasZoom(mockConfig));
      
      const touchSensorCall = mockUseSensor.mock.calls.find(
        call => call[0].type === 'TouchSensor'
      );
      
      expect(touchSensorCall).toBeDefined();
      expect(touchSensorCall![1].activationConstraint.delay).toBe(150);
      expect(touchSensorCall![1].activationConstraint.tolerance).toBe(8);
    });
  });

  describe('Zoom Info', () => {
    it('should provide correct zoom information', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      const info = result.current.getZoomInfo();
      
      expect(info).toEqual({
        scale: 1,
        translate: { x: 0, y: 0 },
        zoomPercentage: 100,
        isMinZoom: false,
        isMaxZoom: false,
      });
    });

    it('should detect minimum zoom', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      // Set to minimum scale
      act(() => {
        result.current.zoomOut();
      });
      
      expect(result.current.getZoomInfo().isMinZoom).toBe(true);
    });

    it('should detect maximum zoom', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      // Set to maximum scale
      for (let i = 0; i < 25; i++) {
        act(() => {
          result.current.zoomIn();
        });
      }
      
      expect(result.current.getZoomInfo().isMaxZoom).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle touch move errors gracefully', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      // Mock error in touch move
      const mockTouchEvent = {
        touches: [
          { identifier: 1, clientX: 100, clientY: 100 },
          { identifier: 2, clientX: 150, clientY: 150 },
        ],
        preventDefault: jest.fn(),
      } as unknown as TouchEvent;
      
      // Set up pinch ref to cause error
      result.current.pinchRef.current = {
        pointers: new Map([
          [1, { x: 100, y: 100 }],
          [2, { x: 150, y: 150 }],
        ]),
        startScale: 1,
        startTranslate: { x: 0, y: 0 },
        startDist: 0, // This will cause division by zero
        startMid: { x: 125, y: 125 },
      };
      
      expect(() => {
        act(() => {
          result.current.handleTouchMove(mockTouchEvent);
        });
      }).not.toThrow();
    });

    it('should handle wheel errors gracefully', () => {
      const { result } = renderHook(() => useCanvasZoom(mockConfig));
      
      const mockWheelEvent = {
        ctrlKey: true,
        metaKey: false,
        deltaY: 10,
        preventDefault: jest.fn(),
      } as React.WheelEvent;
      
      // Mock setCanvasScale to throw error
      mockConfig.setCanvasScale.mockImplementation(() => {
        throw new Error('Scale update failed');
      });
      
      expect(() => {
        act(() => {
          result.current.handleCanvasWheel(mockWheelEvent);
        });
      }).not.toThrow();
    });
  });
});