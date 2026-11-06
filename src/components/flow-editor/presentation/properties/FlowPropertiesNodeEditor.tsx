import React, { useCallback, useEffect, useState } from 'react';
import NodeBasicInfo from './NodeBasicInfo';
import NodeConfigForm from './NodeConfigForm';
import NodeCustomFields from './NodeCustomFields';
import NodeConnections from '../nodes/NodeConnections';
import NodeDescriptionPreview from './NodeDescriptionPreview';
import type { FlowDefinition, FlowNodeDef } from '@/types/flow';

interface FlowPropertiesNodeEditorProps {
  node: FlowNodeDef;
  flow: FlowDefinition;
  isDark: boolean;
  updateNodeConfig: (nodeId: string, key: string, value: any) => void;
  removeNodeConfigKey?: (nodeId: string, key: string) => void;
  updateNodeLabel?: (nodeId: string, label: string) => void;
  updateNodeNotes?: (nodeId: string, notes: string) => void;
  deleteEdge: (edgeId: string) => void;
  selectedEdgeId?: string | null;
  setSelectedEdgeId?: (edgeId: string | null) => void;
}

export default function FlowPropertiesNodeEditor({
  node,
  flow,
  isDark,
  updateNodeConfig,
  removeNodeConfigKey,
  updateNodeLabel,
  updateNodeNotes,
  deleteEdge,
  selectedEdgeId,
  setSelectedEdgeId,
}: FlowPropertiesNodeEditorProps) {
  // 本地即时回显：配置写入由页面防抖落盘，直接读 node 会有 300ms 延迟，
  // 本地副本保证属性摘要与输入同步；node.id 变化或外部值更新时重置。
  const [draftNode, setDraftNode] = useState<FlowNodeDef>(node);
  useEffect(() => {
    setDraftNode(node);
  }, [node]);

  const patchNode = useCallback((patch: Partial<FlowNodeDef>) => {
    setDraftNode(prev => ({ ...prev, ...patch }));
  }, []);

  // 更新节点配置
  const handleUpdateNodeConfig = useCallback((nodeId: string, key: string, value: any) => {
    setDraftNode(prev => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }));
    updateNodeConfig(nodeId, key, value);
  }, [updateNodeConfig]);

  // 删除配置键（自定义字段）
  const handleRemoveNodeConfigKey = useCallback((nodeId: string, key: string) => {
    setDraftNode(prev => {
      const config = { ...prev.config };
      delete config[key];
      return { ...prev, config };
    });
    removeNodeConfigKey?.(nodeId, key);
  }, [removeNodeConfigKey]);

  // 更新节点标签
  const handleUpdateNodeLabel = useCallback((nodeId: string, label: string) => {
    patchNode({ label });
    updateNodeLabel?.(nodeId, label);
  }, [patchNode, updateNodeLabel]);

  // 更新节点备注
  const handleUpdateNodeNotes = useCallback((nodeId: string, notes: string) => {
    patchNode({ notes });
    updateNodeNotes?.(nodeId, notes);
  }, [patchNode, updateNodeNotes]);

  return (
    <div>
      {/* 基本信息组件 */}
      <NodeBasicInfo
        node={draftNode}
        updateNodeLabel={handleUpdateNodeLabel}
        isDark={isDark}
      />

      {/* 配置表单组件 */}
      <NodeConfigForm
        node={draftNode}
        updateNodeConfig={handleUpdateNodeConfig}
        isDark={isDark}
      />

      {/* 属性摘要：与只读视图共用自然语言翻译，随配置实时更新 */}
      <NodeDescriptionPreview node={draftNode} />

      {/* 自定义字段组件 */}
      <NodeCustomFields
        node={draftNode}
        updateNodeConfig={handleUpdateNodeConfig}
        removeNodeConfigKey={handleRemoveNodeConfigKey}
        isDark={isDark}
      />

      {/* 连接管理组件 */}
      <NodeConnections
        flow={flow}
        selectedNode={draftNode}
        deleteEdge={deleteEdge}
        isDark={isDark}
      />
    </div>
  );
}