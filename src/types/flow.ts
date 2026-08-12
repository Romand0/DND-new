// D&D DSL 可视化编译器 —— 流程编排类型定义
// 把游戏机制过程编码为可视化流程图，节点=环节，边=衔接关系

// ======================
// 一、节点（Node）—— 游戏环节的原子单元
// ======================

/** 节点类型枚举：每个环节有唯一的语义标签 */
export type FlowNodeType =
  | 'cast_start'          // 施法开始
  | 'check_component'     // 成分检测（V/S/M）
  | 'check_range'         // 距离检测
  | 'select_target'       // 目标指定
  | 'saving_throw'        // 豁免检定
  | 'attack_roll'         // 法术攻击检定
  | 'condition_branch'    // 条件分支
  | 'apply_effect'        // 效果分配（伤害/治疗/状态）
  | 'concentration_check' // 专注检定
  | 'cast_end'            // 法术结束/结算
  | 'custom';             // 自定义节点（开放扩展）

/** 节点在画布上的位置 */
export interface FlowNodePosition {
  x: number;
  y: number;
}

/** 单个节点定义 */
export interface FlowNodeDef {
  id: string;                        // 节点唯一 ID（如 "start" / "check_verbal"）
  type: FlowNodeType;                // 节点语义类型
  label: string;                     // 显示名称（如 "施法开始"）
  position: FlowNodePosition;          // 画布坐标
  config?: Record<string, any>;      // 节点配置（如 range: 60, component: "verbal"）
  notes?: string;                    // 用户备注（自由文本）
}

// ======================
// 二、边（Edge）—— 节点之间的衔接关系
// ======================

/** 触发时机：决定何时从上游节点跳转到下游 */
export type EdgeTrigger =
  | 'on_complete'   // 上游完成后无条件触发（默认）
  | 'on_success'    // 上游成功时触发
  | 'on_failure'    // 上游失败时触发
  | 'on_partial'    // 上游部分成功时触发
  | 'on_true'       // 条件分支 true 分支
  | 'on_false';     // 条件分支 false 分支

/** 单条边定义 */
export interface FlowEdgeDef {
  id: string;                        // 边唯一 ID
  from: string;                      // 上游节点 ID
  to: string;                        // 下游节点 ID
  trigger: EdgeTrigger;              // 触发时机
  label?: string;                    // 显示标签（如 "成功" / "失败"）
  dataMap?: Record<string, string>;  // 数据映射：上游输出 → 下游输入（如 { "failed_targets": "input_targets" }）
  condition?: string;                // 可选守卫条件（如 "target.currentHp > 0"）
}

// ======================
// 三、流程定义（Flow）—— 完整的法术/机制编码
// ======================

/** 流程定义：一段完整的游戏机制编码 */
export interface FlowDefinition {
  id: string;                        // 流程唯一 ID（如 spell:power_word_kill）
  name: string;                      // 流程名称（如 "圣言术"）
  description?: string;              // 流程描述
  nodes: FlowNodeDef[];              // 节点列表
  edges: FlowEdgeDef[];              // 边列表
  tags?: string[];                   // 标签（用于检索和分类）
  version?: number;                  // 版本号（迭代管理）
  createdAt?: number;                // 创建时间戳
  updatedAt?: number;                // 更新时间戳
}

// ======================
// 四、节点类型元信息（注册中心用）
// ======================

/** 节点类型的元信息：用于左侧面板展示和拖放 */
export interface NodeTypeMeta {
  type: FlowNodeType;
  label: string;                     // 显示名称
  description: string;              // 功能描述
  category: string;                  // 分类（如 "核心环节" / "检定" / "效果"）
  color: string;                      // 节点颜色（CSS 类或 hex）
  defaultConfig?: Record<string, any>; // 默认配置
  icon?: string;                     // 图标标识（可选）
}

/** 节点类型注册表 —— 内置环节库 */
export const NODE_TYPE_REGISTRY: NodeTypeMeta[] = [
  {
    type: 'cast_start',
    label: '施法开始',
    description: '初始化施法上下文，消耗施法资源',
    category: '核心环节',
    color: '#6366f1',
    defaultConfig: {},
  },
  {
    type: 'check_component',
    label: '成分检测',
    description: '检测 V/S/M 成分是否满足（ verbal / somatic / material ）',
    category: '核心环节',
    color: '#8b5cf6',
    defaultConfig: { component: 'verbal' },
  },
  {
    type: 'check_range',
    label: '距离检测',
    description: '检测施法者与目标是否在射程内',
    category: '核心环节',
    color: '#a855f7',
    defaultConfig: { range: 60, targetMode: 'sight' },
  },
  {
    type: 'select_target',
    label: '目标指定',
    description: '选择法术目标（自身/单体/多体/区域）',
    category: '核心环节',
    color: '#ec4899',
    defaultConfig: { mode: 'single', maxCount: 1 },
  },
  {
    type: 'saving_throw',
    label: '豁免检定',
    description: '目标进行属性豁免检定（力/敏/体/智/感/魅）',
    category: '检定',
    color: '#f59e0b',
    defaultConfig: { ability: 'dexterity', dc: '${caster.spellSaveDc}' },
  },
  {
    type: 'attack_roll',
    label: '法术攻击',
    description: '施法者进行法术攻击检定（对抗目标 AC）',
    category: '检定',
    color: '#f97316',
    defaultConfig: {},
  },
  {
    type: 'condition_branch',
    label: '条件分支',
    description: '根据条件分流到不同分支（如 HP 阈值、豁免成败）',
    category: '控制流',
    color: '#10b981',
    defaultConfig: { condition: 'target.currentHp <= 100' },
  },
  {
    type: 'apply_effect',
    label: '效果分配',
    description: '应用伤害/治疗/状态效果到目标',
    category: '效果',
    color: '#ef4444',
    defaultConfig: { effectType: 'damage', value: '8d6' },
  },
  {
    type: 'concentration_check',
    label: '专注检定',
    description: '施法者进行专注豁免（体质检定 vs DC 10 或伤害半数）',
    category: '检定',
    color: '#06b6d4',
    defaultConfig: {},
  },
  {
    type: 'cast_end',
    label: '施法结束',
    description: '结算最终状态，写日志，释放临时资源',
    category: '核心环节',
    color: '#64748b',
    defaultConfig: {},
  },
  {
    type: 'custom',
    label: '自定义节点',
    description: '开放扩展的自定义逻辑节点',
    category: '扩展',
    color: '#6b7280',
    defaultConfig: { code: '' },
  },
];

/** 按分类分组节点类型 */
export function groupNodeTypesByCategory(): Record<string, NodeTypeMeta[]> {
  const groups: Record<string, NodeTypeMeta[]> = {};
  for (const meta of NODE_TYPE_REGISTRY) {
    if (!groups[meta.category]) groups[meta.category] = [];
    groups[meta.category].push(meta);
  }
  return groups;
}

// ======================
// 五、执行相关（运行时接口）
// ======================

/** 执行上下文 —— 运行时环境快照 */
export interface FlowExecutionContext {
  casterId: string;                  // 施法者 ID
  spellId?: string;                  // 当前法术 ID
  targets: string[];                 // 已选目标 ID 列表
  results: Map<string, any>;         // 各节点输出缓存（key=节点 ID）
  stateSnapshot: Record<string, any>; // 游戏状态快照（只读）
  log: FlowLogEntry[];               // 执行日志
}

/** 单条执行日志 */
export interface FlowLogEntry {
  timestamp: number;
  nodeId: string;
  nodeType: FlowNodeType;
  status: 'success' | 'failure' | 'partial' | 'skipped';
  message: string;
  data?: Record<string, any>;
}

/** 节点执行结果 */
export interface NodeExecutionResult {
  status: 'success' | 'failure' | 'partial';
  output: Record<string, any>;
  sideEffects?: StateMutation[];
}

/** 状态变更操作（待提交） */
export interface StateMutation {
  targetId: string;                  // 目标对象 ID
  property: string;                  // 属性路径（如 "currentHp" / "status.stunned"）
  oldValue: any;
  newValue: any;
  reason: string;                    // 变更原因（日志用）
}

// ======================
// 六、序列化与存储
// ======================

/** 将 FlowDefinition 序列化为 JSON 字符串 */
export function serializeFlow(flow: FlowDefinition): string {
  return JSON.stringify(flow, null, 2);
}

/** 从 JSON 字符串反序列化 */
export function deserializeFlow(json: string): FlowDefinition {
  return JSON.parse(json) as FlowDefinition;
}

/** 验证流程定义的基础合法性 */
export function validateFlow(flow: FlowDefinition): string[] {
  const errors: string[] = [];

  // 1. 检查节点 ID 唯一性
  const nodeIds = new Set<string>();
  for (const node of flow.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`节点 ID 重复: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  // 2. 检查边引用的节点是否存在
  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`边 ${edge.id} 引用了不存在的源节点: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`边 ${edge.id} 引用了不存在的目标节点: ${edge.to}`);
    }
  }

  // 3. 检查是否有入口节点（至少一个 cast_start 或没有入边的节点）
  const nodesWithIncomingEdge = new Set(flow.edges.map(e => e.to));
  const entryNodes = flow.nodes.filter(n => !nodesWithIncomingEdge.has(n.id));
  if (entryNodes.length === 0) {
    errors.push('流程缺少入口节点（所有节点都有入边，可能存在循环）');
  }

  // 4. 检查条件分支节点是否有 true/false 出边
  const branchNodes = flow.nodes.filter(n => n.type === 'condition_branch');
  for (const branch of branchNodes) {
    const outEdges = flow.edges.filter(e => e.from === branch.id);
    const hasTrue = outEdges.some(e => e.trigger === 'on_true');
    const hasFalse = outEdges.some(e => e.trigger === 'on_false');
    if (!hasTrue) errors.push(`条件分支节点 ${branch.id} 缺少 on_true 出边`);
    if (!hasFalse) errors.push(`条件分支节点 ${branch.id} 缺少 on_false 出边`);
  }

  return errors;
}
