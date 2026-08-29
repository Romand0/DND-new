import React, { useCallback, useReducer } from 'react';
import NodeBasicInfo from './NodeBasicInfo';
import NodeConfigForm from './NodeConfigForm';
import NodeCustomFields from './NodeCustomFields';
import NodeConnections from '../nodes/NodeConnections';
import type { FlowDefinition, FlowNodeDef } from '@/types/flow';

// 定义节点状态类型
interface NodeState {
  node: FlowNodeDef;
}

// 定义reducer的类型
type FlowAction = 
  | { type: 'UPDATE_NODE_CONFIG'; nodeId: string; key: string; value: any }
  | { type: 'UPDATE_NODE_LABEL'; nodeId: string; label: string }
  | { type: 'UPDATE_NODE_NOTES'; nodeId: string; notes: string };

// reducer函数
function nodeReducer(state: NodeState, action: FlowAction): NodeState {
  switch (action.type) {
    case 'UPDATE_NODE_CONFIG':
      if (state.node.id === action.nodeId) {
        return {
          ...state,
          node: {
            ...state.node,
            config: {
              ...state.node.config,
              [action.key]: action.value
            }
          }
        };
      }
      return state;
    
    case 'UPDATE_NODE_LABEL':
      if (state.node.id === action.nodeId) {
        return {
          ...state,
          node: {
            ...state.node,
            label: action.label
          }
        };
      }
      return state;
    
    case 'UPDATE_NODE_NOTES':
      if (state.node.id === action.nodeId) {
        return {
          ...state,
          node: {
            ...state.node,
            notes: action.notes
          }
        };
      }
      return state;
    
    default:
      return state;
  }
}

interface FlowPropertiesNodeEditorProps {
  node: FlowNodeDef;
  flow: FlowDefinition;
  isDark: boolean;
  updateNodeConfig: (nodeId: string, key: string, value: any) => void;
  deleteEdge: (edgeId: string) => void;
  selectedEdgeId?: string | null;
  setSelectedEdgeId?: (edgeId: string | null) => void;
}

export default function FlowPropertiesNodeEditor({
  node,
  flow,
  isDark,
  updateNodeConfig,
  deleteEdge,
  selectedEdgeId,
  setSelectedEdgeId,
}: FlowPropertiesNodeEditorProps) {
  // 使用reducer管理节点状态
  const [nodeState, dispatch] = useReducer(nodeReducer, { node });

  // 更新节点配置
  const handleUpdateNodeConfig = useCallback((nodeId: string, key: string, value: any) => {
    dispatch({
      type: 'UPDATE_NODE_CONFIG',
      nodeId,
      key,
      value,
    });
  }, []);

  // 更新节点标签
  const handleUpdateNodeLabel = useCallback((nodeId: string, label: string) => {
    dispatch({
      type: 'UPDATE_NODE_LABEL',
      nodeId,
      label,
    });
  }, []);

  // 更新节点备注
  const handleUpdateNodeNotes = useCallback((nodeId: string, notes: string) => {
    dispatch({
      type: 'UPDATE_NODE_NOTES',
      nodeId,
      notes,
    });
  }, []);

  return (
    <div>
      {/* 基本信息组件 */}
      <NodeBasicInfo
        node={nodeState.node}
        updateNodeLabel={handleUpdateNodeLabel}
        isDark={isDark}
      />

      {/* 配置表单组件 */}
      <NodeConfigForm
        node={nodeState.node}
        updateNodeConfig={handleUpdateNodeConfig}
        isDark={isDark}
      />

      {/* 自定义字段组件 */}
      <NodeCustomFields
        node={nodeState.node}
        updateNodeConfig={handleUpdateNodeConfig}
        isDark={isDark}
      />

      {/* 连接管理组件 */}
      <NodeConnections
        flow={flow}
        selectedNode={nodeState.node}
        deleteEdge={deleteEdge}
        isDark={isDark}
      />
    </div>
  );
}