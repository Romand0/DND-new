import React, { useCallback, useReducer } from 'react';
import { useTextInput } from '@/hooks/useInput';
import { NODE_CONFIG_SCHEMA } from '@/types/flow';
import NodeBasicInfo from './NodeBasicInfo';
import NodeConfigForm from './NodeConfigForm';
import NodeCustomFields from './NodeCustomFields';
import NodeConnections from './NodeConnections';
import type { FlowDefinition, FlowNodeDef } from '@/types/flow';

// 定义reducer的类型
type FlowAction = 
  | { type: 'UPDATE_NODE_CONFIG'; nodeId: string; key: string; value: any }
  | { type: 'UPDATE_NODE_LABEL'; nodeId: string; label: string }
  | { type: 'UPDATE_NODE_NOTES'; nodeId: string; notes: string }
  | { type: 'DELETE_EDGE'; edgeId: string };

// reducer函数
function flowReducer(state: FlowDefinition, action: FlowAction): FlowDefinition {
  switch (action.type) {
    case 'UPDATE_NODE_CONFIG':
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === action.nodeId
            ? { ...n, config: { ...n.config, [action.key]: action.value } }
            : n
        ),
        updatedAt: Date.now(),
      };
    case 'UPDATE_NODE_LABEL':
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === action.nodeId ? { ...n, label: action.label } : n
        ),
        updatedAt: Date.now(),
      };
    case 'UPDATE_NODE_NOTES':
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === action.nodeId ? { ...n, notes: action.notes } : n
        ),
        updatedAt: Date.now(),
      };
    case 'DELETE_EDGE':
      return {
        ...state,
        edges: state.edges.filter(e => e.id !== action.edgeId),
        updatedAt: Date.now(),
      };
    default:
      return state;
  }
}

interface FlowPropertiesNodeEditorProps {
  flow: FlowDefinition;
  selectedNode: FlowNodeDef | null;
  setFlow: (flow: FlowDefinition) => void;
  isDark: boolean;
}

export default function FlowPropertiesNodeEditor({
  flow,
  selectedNode,
  setFlow,
  isDark,
}: FlowPropertiesNodeEditorProps) {
  const [state, dispatch] = useReducer(flowReducer, flow);
  
  // 节点标签输入状态
  const nodeLabelInput = useTextInput(selectedNode?.label || '');
  
  // 节点备注输入状态
  const nodeNotesInput = useTextInput(selectedNode?.notes || '');

  // 更新节点配置
  const updateNodeConfig = useCallback((nodeId: string, key: string, value: any) => {
    dispatch({
      type: 'UPDATE_NODE_CONFIG',
      nodeId,
      key,
      value
    });
  }, []);

  // 更新节点标签
  const updateNodeLabel = useCallback((nodeId: string, label: string) => {
    dispatch({
      type: 'UPDATE_NODE_LABEL',
      nodeId,
      label
    });
  }, []);

  // 更新节点备注
  const updateNodeNotes = useCallback((nodeId: string, notes: string) => {
    dispatch({
      type: 'UPDATE_NODE_NOTES',
      nodeId,
      notes
    });
  }, []);

  // 删除边
  const deleteEdge = useCallback((edgeId: string) => {
    dispatch({
      type: 'DELETE_EDGE',
      edgeId
    });
  }, []);

  if (!selectedNode) {
    return (
      <div className="text-center text-gray-400 text-sm">
        未选择节点
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 节点基本信息 */}
      <NodeBasicInfo
        node={selectedNode}
        nodeLabelInput={nodeLabelInput}
        nodeNotesInput={nodeNotesInput}
        updateNodeLabel={updateNodeLabel}
        updateNodeNotes={updateNodeNotes}
        isDark={isDark}
      />

      {/* 节点配置表单 */}
      <NodeConfigForm
        node={selectedNode}
        updateNodeConfig={updateNodeConfig}
        isDark={isDark}
      />

      {/* 节点自定义字段 */}
      <NodeCustomFields
        node={selectedNode}
        updateNodeConfig={updateNodeConfig}
        isDark={isDark}
      />

      {/* 节点连接线 */}
      <NodeConnections
        flow={flow}
        selectedNode={selectedNode}
        deleteEdge={deleteEdge}
        isDark={isDark}
      />
    </div>
  );
}