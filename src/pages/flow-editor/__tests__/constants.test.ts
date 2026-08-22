/**
 * constants.ts 单元测试
 * 
 * 测试重点：
 * - 常量定义的正确性
 * - 默认值的合理性
 * - 类型安全性
 */

import {
  NODE_W,
  NODE_H,
  CARD_NODE_W,
  CARD_NODE_H,
  SCALE_MIN,
  SCALE_MAX,
  SCALE_STEP,
  SNAP_THRESHOLD,
  COLLISION_THRESHOLD,
  ANIMATION_DURATION,
  AUTO_SAVE_DELAY,
  VIEWPORT_KEY,
  FLOW_KEY,
} from '../constants';

describe('Constants', () => {
  describe('Node Dimensions', () => {
    it('should have valid node dimensions', () => {
      expect(NODE_W).toBeGreaterThan(0);
      expect(NODE_H).toBeGreaterThan(0);
      expect(typeof NODE_W).toBe('number');
      expect(typeof NODE_H).toBe('number');
    });

    it('should have valid card node dimensions', () => {
      expect(CARD_NODE_W).toBeGreaterThan(0);
      expect(CARD_NODE_H).toBeGreaterThan(0);
      expect(typeof CARD_NODE_W).toBe('number');
      expect(typeof CARD_NODE_H).toBe('number');
    });

    it('should have reasonable aspect ratios', () => {
      // Card nodes should be larger than regular nodes
      expect(CARD_NODE_W).toBeGreaterThan(NODE_W);
      expect(CARD_NODE_H).toBeGreaterThan(NODE_H);
    });
  });

  describe('Scale Constants', () => {
    it('should have valid scale limits', () => {
      expect(SCALE_MIN).toBeGreaterThan(0);
      expect(SCALE_MAX).toBeGreaterThan(SCALE_MIN);
      expect(SCALE_MIN).toBeLessThan(1);
      expect(SCALE_MAX).toBeGreaterThan(1);
    });

    it('should have valid scale step', () => {
      expect(SCALE_STEP).toBeGreaterThan(0);
      expect(SCALE_STEP).toBeLessThan(1);
      expect(SCALE_STEP).toBeLessThan(SCALE_MAX - SCALE_MIN);
    });

    it('should have reasonable scale values', () => {
      expect(SCALE_MIN).toBe(0.5);
      expect(SCALE_MAX).toBe(3);
      expect(SCALE_STEP).toBe(0.1);
    });
  });

  describe('Threshold Constants', () => {
    it('should have valid snap threshold', () => {
      expect(SNAP_THRESHOLD).toBeGreaterThan(0);
      expect(SNAP_THRESHOLD).toBeLessThan(50);
      expect(typeof SNAP_THRESHOLD).toBe('number');
    });

    it('should have valid collision threshold', () => {
      expect(COLLISION_THRESHOLD).toBeGreaterThan(0);
      expect(COLLISION_THRESHOLD).toBeLess than (100);
      expect(typeof COLLISION_THRESHOLD).toBe('number');
    });

    it('should have reasonable threshold values', () => {
      expect(SNAP_THRESHOLD).toBe(10);
      expect(COLLISION_THRESHOLD).toBe(5);
    });
  });

  describe('Animation Constants', () => {
    it('should have valid animation duration', () => {
      expect(ANIMATION_DURATION).toBeGreaterThan(0);
      expect(ANIMATION_DURATION).toBeLess than (1000);
      expect(typeof ANIMATION_DURATION).toBe('number');
    });

    it('should have reasonable animation duration', () => {
      expect(ANIMATION_DURATION).toBe(300);
    });
  });

  describe('Delay Constants', () => {
    it('should have valid auto save delay', () => {
      expect(AUTO_SAVE_DELAY).toBeGreaterThan(0);
      expect(AUTO_SAVE_DELAY).toBeLess than (10000);
      expect(typeof AUTO_SAVE_DELAY).toBe('number');
    });

    it('should have reasonable auto save delay', () => {
      expect(AUTO_SAVE_DELAY).toBe(500);
    });
  });

  describe('Storage Keys', () => {
    it('should have valid storage keys', () => {
      expect(VIEWPORT_KEY).toBe('dnd-flow-viewport-snapshots');
      expect(FLOW_KEY).toBe('dnd-flow-library');
      expect(typeof VIEWPORT_KEY).toBe('string');
      expect(typeof FLOW_KEY).toBe('string');
    });

    it('should have non-empty storage keys', () => {
      expect(VIEWPORT_KEY.length).toBeGreaterThan(0);
      expect(FLOW_KEY.length).toBeGreaterThan(0);
    });

    it('should have unique storage keys', () => {
      expect(VIEWPORT_KEY).not.toBe(FLOW_KEY);
    });
  });

  describe('Type Safety', () => {
    it('should have numeric constants', () => {
      const numericConstants = [
        NODE_W,
        NODE_H,
        CARD_NODE_W,
        CARD_NODE_H,
        SCALE_MIN,
        SCALE_MAX,
        SCALE_STEP,
        SNAP_THRESHOLD,
        COLLISION_THRESHOLD,
        ANIMATION_DURATION,
        AUTO_SAVE_DELAY,
      ];

      numericConstants.forEach(constant => {
        expect(typeof constant).toBe('number');
        expect(isNaN(constant)).toBe(false);
        expect(isFinite(constant)).toBe(true);
      });
    });

    it('should have string constants', () => {
      const stringConstants = [
        VIEWPORT_KEY,
        FLOW_KEY,
      ];

      stringConstants.forEach(constant => {
        expect(typeof constant).toBe('string');
        expect(constant.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum scale correctly', () => {
      const testScale = SCALE_MIN;
      expect(testScale).toBeGreaterThan(0);
      expect(testScale).toBeLessThan(1);
    });

    it('should handle maximum scale correctly', () => {
      const testScale = SCALE_MAX;
      expect(testScale).toBeGreaterThan(1);
      expect(testScale).toBeLess than (10);
    });

    it('should handle scale step correctly', () => {
      const testStep = SCALE_STEP;
      expect(testStep).toBeGreaterThan(0);
      expect(testStep).toBeLess than (1);
    });
  });

  describe('Performance', () => {
    it('should have fast constant access', () => {
      const startTime = performance.now();
      
      // Access all constants multiple times
      for (let i = 0; i < 1000; i++) {
        const _ = NODE_W;
        const _ = NODE_H;
        const _ = SCALE_MIN;
        const _ = SCALE_MAX;
        const _ = VIEWPORT_KEY;
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(10); // Should be very fast
    });
  });

  describe('Consistency', () => {
    it('should have consistent scale values', () => {
      expect(SCALE_MIN).toBeLessThan(SCALE_MAX);
      expect(SCALE_STEP).toBeLessThan(SCALE_MAX - SCALE_MIN);
    });

    it('should have consistent threshold values', () => {
      expect(SNAP_THRESHOLD).toBeGreaterThan(COLLISION_THRESHOLD);
    });

    it('should have reasonable animation duration', () => {
      expect(ANIMATION_DURATION).toBeGreaterThan(0);
      expect(ANIMATION_DURATION).toBeLess than (1000);
    });
  });
});