import React from 'react';
import { DndContext } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft, X, CheckCircle, AlertCircle,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import type {
  FlowDefinition,
  FlowNodeDef,
  FlowEdgeDef,
} from '@/types/flow';
import DraggableFlowNode from '../nodes/DraggableFlowNode';
import { sampleSmartEdgeToPolyline, getSmartEdgeDecoratedEndpoints, getSmartArrowPos, getSmartLabelPos, getSmartEdgePath } from '@/utils/flow-editor/edge-connection';

interface FlowCanvasAreaProps {
  flow: FlowDefinition;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  connectFromId: string | null;
  dragEffects: any;
  canvasScale: number;
  nodeSizes: Map<string, {w: number, h: number}>;
  isDark: boolean;
  onNodeClick: (nodeId: string) => void;
  onCanvasClick: () => void;
  onStartConnecting: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onRefSet: (nodeId: string, ref: HTMLDivElement | null) => void;
  validation: {
    showValidation: boolean;
    validationErrors: Array<{
      message: string;
      type?: 'global' | 'node' | 'edge';
      id?: string;
      field?: string;
    }>;
  };
}

export const FlowCanvasArea: React.FC<FlowCanvasAreaProps> = ({
  flow,
  selectedNodeId,
  selectedEdgeId,
  connectFromId,
  dragEffects,
  canvasScale,
  nodeSizes,
  isDark,
  onNodeClick,
  onCanvasClick,
  onStartConnecting,
  onDeleteNode,
  onRefSet,
  validation,
}) => {
  return (
    <div className="relative" style={{ width: 3000, height: 2000 }}>
      {/* 背景网格 + 点击空白处取消选中 */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
        onClick={onCanvasClick}
        onTouchStart={onCanvasClick}
      />

      {/* 节点渲染层（dnd-kit 拖拽） */}
      {flow.nodes.map(node => (
        <DraggableFlowNode
          key={node.id}
          node={node}
          isSelected={selectedNodeId === node.id}
          isConnectSource={connectFromId === node.id}
          isDragging={dragEffects.draggingNodeId === node.id}
          isColliding={dragEffects.draggingNodeId === node.id && dragEffects.isColliding}
          collisionDir={dragEffects.draggingNodeId === node.id ? dragEffects.collisionDir : null}
          animateMove={dragEffects.animateMove}
          canvasScale={canvasScale}
          onClick={() => onNodeClick(node.id)}
          onStartConnecting={() => onStartConnecting(node.id)}
          onDelete={() => onDeleteNode(node.id)}
          flow={flow}
          onRefSet={(ref) => {
            if (ref) {
              onRefSet(node.id, ref);
            } else {
              onRefSet(node.id, null);
            }
          }}
        />
      ))}

      {/* SVG 连线层 —— 暗色模式：浅紫边框+深紫背景+红色波浪纹；亮色模式：灰色边框+白底+灰色脉冲 */}
      <svg className="absolute inset-0 pointer-events-none" style={{ width: 3000, height: 2000, left: 0, right: 0 }}>
        <defs>
          {/* 连线白色阴影滤镜：暗色模式下白色外发光，提升辨识度 */}
          <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ffffff" floodOpacity="0.5" />
          </filter>
          <marker id="chevron-dark" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#818cf8" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
          <marker id="chevron-dark-selected" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#f87171" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
          <marker id="chevron-light" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#9ca3af" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
          <marker id="chevron-light-selected" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#6366f1" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
          <marker id="chevron-fail-dark" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#f87171" strokeWidth="1.5"
              strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
          <marker id="chevron-fail-light" viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#9ca3af" strokeWidth="1.5"
              strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
        </defs>
        {flow.edges.map(edge => {
          const path = getSmartEdgePath(edge, flow.nodes, nodeSizes);
          if (!path) return null;
          const isSelected = selectedEdgeId === edge.id;
          return (
            <g key={edge.id}>
              {/* 底纹轨道（细半透明线） */}
              <path
                d={path}
                fill="none"
                stroke={isDark ? '#4338ca' : '#e5e7eb'}
                strokeWidth={isSelected ? 3 : 2}
                strokeLinecap="round"
                opacity={0.5}
              />
              {/* 波浪箭头层 —— 用 marker-mid 沿采样折线放置 >>>>> 花纹 */}
              {(() => {
                const endpoints = getSmartEdgeDecoratedEndpoints(edge, flow.nodes, nodeSizes);
                if (!endpoints) return null;
                const isFailEdge = edge.trigger === 'on_failure' || edge.trigger === 'on_false';
                const chevronMarkerId = isFailEdge
                  ? (isDark ? 'chevron-fail-dark' : 'chevron-fail-light')
                  : isSelected
                    ? (isDark ? 'chevron-dark-selected' : 'chevron-light-selected')
                    : (isDark ? 'chevron-dark' : 'chevron-light');
                const polyline = sampleSmartEdgeToPolyline(endpoints.from, endpoints.to, 16);
                return (
                  <path
                    d={polyline}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={2}
                    markerMid={`url(#${chevronMarkerId})`}
                  />
                );
              })()}
              {/* 流向箭头 */}
              <polygon points="0,-5 10,0 0,5" fill={isDark ? '#312e81' : '#ffffff'} stroke={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#9ca3af')} strokeWidth="1" transform={`translate(${getSmartArrowPos(edge, flow.nodes, nodeSizes)})`} />
              <polygon points="0,-4 8,0 0,4" fill={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#9ca3af')} transform={`translate(${getSmartArrowPos(edge, flow.nodes, nodeSizes)})`} />
              {/* 连线中部标签：圆角边框样式块（暗色适配：深紫底白字 / 亮白底黑字） */}
              {edge.label && (
                <>
                  <rect
                    x={parseInt(getSmartLabelPos(edge, flow.nodes, nodeSizes).split(',')[0]) - 30}
                    y={parseInt(getSmartLabelPos(edge, flow.nodes, nodeSizes).split(',')[1]) - 11}
                    width="60"
                    height="22"
                    rx="6"
                    fill={isDark ? '#4338ca' : '#ffffff'}
                    stroke={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#d1d5db')}
                    strokeWidth="1"
                    className="select-none pointer-events-auto cursor-pointer transition-colors"
                    onClick={() => {/* setSelectedEdgeId(edge.id) */}}
                  />
                  <text
                    x={parseInt(getSmartLabelPos(edge, flow.nodes, nodeSizes).split(',')[0])}
                    y={parseInt(getSmartLabelPos(edge, flow.nodes, nodeSizes).split(',')[1])}
                    fill={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#ffffff' : '#1a1a2e')}
                    fontSize="10"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontWeight="600"
                    className="select-none pointer-events-auto cursor-pointer"
                    onClick={() => {/* setSelectedEdgeId(edge.id) */}}
                  >{edge.label}</text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* 验证结果浮层 */}
      {validation.showValidation && (
        <div className="absolute bottom-4 left-4 right-4 max-w-lg mx-auto z-30">
          <div className="rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-white shadow-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                 {validation.validationErrors.length === 0 ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">验证通过</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-medium text-red-400">发现 {validation.validationErrors.length} 个问题</span>
                  </>
                )}
              </div>
              <button onClick={() => {/* validation.setShowValidation(false) */}} className="text-gray-400 hover:text-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>
              {validation.validationErrors.length > 0 && (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                 {validation.validationErrors.map((err, i) => (
                  <li key={i} className="text-xs text-red-400">{err.message}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

    </div>
  );
};