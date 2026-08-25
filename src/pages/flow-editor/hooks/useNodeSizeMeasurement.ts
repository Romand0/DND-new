import { useRef, useState, useLayoutEffect, useCallback } from 'react';
import type { FlowNodeDef } from '@/types/flow';

interface NodeSize {
  w: number;
  h: number;
}

export function useNodeSizeMeasurement({
  nodes,
  canvasScale,
  onRefSet,
}: {
  nodes: FlowNodeDef[];
  canvasScale: number;
  onRefSet?: (nodeId: string, ref: HTMLDivElement | null) => void;
}) {
  // 完全复制原有逻辑，不做任何改动
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [nodeSizes, setNodeSizes] = useState<Map<string, NodeSize>>(new Map());

  useLayoutEffect(() => {
    const newSizes = new Map<string, NodeSize>();
    const resizeObserver = new ResizeObserver(() => {
      nodeRefs.current.forEach((ref, nodeId) => {
        if (ref) {
          const rect = ref.getBoundingClientRect();
          // 考虑画布缩放，转换为画布坐标
          const scaleX = 1 / canvasScale;
          newSizes.set(nodeId, {
            w: rect.width * scaleX,
            h: rect.height * scaleX
          });
        }
      });
      setNodeSizes(new Map(newSizes)); // 触发重新渲染
    });
    
    // 初始测量
    nodeRefs.current.forEach((ref, nodeId) => {
      if (ref) {
        const rect = ref.getBoundingClientRect();
        // 考虑画布缩放，转换为画布坐标
        const scaleX = 1 / canvasScale;
        newSizes.set(nodeId, {
          w: rect.width * scaleX,
          h: rect.height * scaleX
        });
        // 开始监听尺寸变化
        resizeObserver.observe(ref);
      }
    });
    
    setNodeSizes(newSizes);
    
    // 清理函数
    return () => {
      resizeObserver.disconnect();
    };
  }, [nodes, canvasScale]);

  // 提供与原来完全相同的接口
  const setNodeRef = useCallback((nodeId: string, ref: HTMLDivElement | null) => {
    if (ref) {
      nodeRefs.current.set(nodeId, ref);
    } else {
      nodeRefs.current.delete(nodeId);
    }
    onRefSet?.(nodeId, ref);
  }, [onRefSet]);

  return {
    nodeSizes,
    setNodeRef,
  };
}