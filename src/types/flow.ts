// D&D DSL 可视化编译器 —— 流程编排类型定义
// 把游戏机制过程编码为可视化流程图，节点=环节，边=衔接关系

// ======================
// 一、节点（Node）—— 游戏环节的原子单元
// ======================

/** 节点类型枚举：每个环节有唯一的语义标签 */
export type FlowNodeType =
  | 'cast_start'          // 【重构】施法开始（包含前置检查）
  | 'cast_start_legacy'   // 【保留】旧版施法开始（向后兼容）
  | 'check_component'     // 【标记为废弃】成分检测（V/S/M）
  | 'check_range'         // 【标记为废弃】距离检测
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

/** 节点分组接口 */
export interface NodeGroup {
  id: string;                        // 分组唯一ID
  nodes: FlowNodeDef[];              // 分组内的节点列表
  edges: FlowEdgeDef[];              // 分组内的边列表
  isIsolated: boolean;               // 是否为孤立节点组
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
  /** 正式发布版本号（0 = 未发布/纯草稿） */
  publishedVersion?: number;
  /** 最近一次发布的时间戳（null = 从未发布） */
  publishedAt?: number | null;
  /** 绑定的法术数量 */
  bindingsCount?: number;
  /** 流程类别（spell / class_features / custom） */
  category?: FlowCategory;
  /** 原始存储数据（后端返回时附带） */
  data?: any;
}

// ======================
// 流程类别与合格 ID
// ======================

/** 流程类别枚举 */
export type FlowCategory = 'spell' | 'class_features' | 'custom';

/** 类别预设表 —— 供 UI 下拉选择 */
export const FLOW_CATEGORIES: { value: FlowCategory; label: string; desc: string }[] = [
  { value: 'spell',          label: '法术',     desc: '法术流程（fireball / power_word_kill）' },
  { value: 'class_features', label: '职业特性', desc: '职业特性流程（rage / sneak_attack）' },
  { value: 'custom',         label: '自定义',   desc: '其他机制流程' },
];

/** 合格 ID 前缀映射：类别 → DSL 前缀 */
const CATEGORY_PREFIX: Record<FlowCategory, string> = {
  spell: 'spell',
  class_features: 'class_features',
  custom: 'custom',
};

/** 解析合格 ID：spell:fireball → { category: 'spell', slug: 'fireball' } */
export function parseFlowId(id: string): { category: FlowCategory; slug: string } {
  const idx = id.indexOf(':');
  if (idx === -1) {
    // 旧格式（flow-xxxx）兼容：归为 custom，整串作 slug
    return { category: 'custom', slug: id };
  }
  const raw = id.substring(0, idx);
  const slug = id.substring(idx + 1);
  const category = FLOW_CATEGORIES.some(c => c.value === raw) ? (raw as FlowCategory) : 'custom';
  return { category, slug };
}

/** 构建合格 ID → "spell:fireball" 或 "spell:power_word_kill"
 * 轻洗策略：仅修空格和连续下划线，保留中文/连字符等 */
export function buildFlowId(category: FlowCategory, slug: string): string {
  const prefix = CATEGORY_PREFIX[category];
  const safeSlug = slug.trim()
    .replace(/\s+/g, '_')            // 空格 → 下划线
    .replace(/_+/g, '_')             // 连续下划线合并
    .replace(/^_+|_+$/g, '');        // 去首尾下划线
  return safeSlug ? `${prefix}:${safeSlug}` : `${prefix}:unnamed`;
}

/** 名称 → slug 建议（仅用于新建流程的默认值，不强制） */
export function nameToSlug(name: string): string {
  return name.trim().replace(/\s+/g, '_') || 'unnamed';
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
    description: '【重构】智能施法开始，包含前置检查功能',
    category: '核心环节',
    color: '#6366f1',
    defaultConfig: {
      autoChecks: {
        components: true,
        range: true,
        time: true
      }
    },
    icon: 'zap',
  },
  {
    type: 'cast_start_legacy',
    label: '施法开始（旧版）',
    description: '【保留】初始化施法上下文，消耗施法资源',
    category: '核心环节',
    color: '#94a3b8',
    defaultConfig: {},
    icon: 'zap',
  },
  {
    type: 'check_component',
    label: '成分检测',
    description: '【已废弃】检测 V/S/M 成分是否满足（ verbal / somatic / material ）',
    category: '核心环节',
    color: '#8b5cf6',
    defaultConfig: { component: 'verbal' },
    icon: 'shield',
  },
  {
    type: 'check_range',
    label: '距离检测',
    description: '【已废弃】检测施法者与目标是否在射程内',
    category: '核心环节',
    color: '#a855f7',
    defaultConfig: { range: 60, targetMode: 'sight' },
    icon: 'target',
  },
  {
    type: 'select_target',
    label: '目标指定',
    description: '选择法术目标（自身/单体/多体/区域）',
    category: '核心环节',
    color: '#ec4899',
    defaultConfig: { mode: 'single', maxCount: 1 },
    icon: 'mouse-pointer',
  },
  {
    type: 'saving_throw',
    label: '豁免检定',
    description: '目标进行属性豁免检定（力/敏/体/智/感/魅）',
    category: '检定',
    color: '#f59e0b',
    defaultConfig: { ability: 'dexterity', dc: '${caster.spellSaveDc}' },
    icon: 'shield',
  },
  {
    type: 'attack_roll',
    label: '法术攻击',
    description: '施法者进行法术攻击检定（对抗目标 AC）',
    category: '检定',
    color: '#f97316',
    defaultConfig: {},
    icon: 'zap',
  },
  {
    type: 'condition_branch',
    label: '条件分支',
    description: '根据条件分流到不同分支（如 HP 阈值、豁免成败）',
    category: '控制流',
    color: '#10b981',
    defaultConfig: { condition: 'target.currentHp <= 100' },
    icon: 'git-branch',
  },
  {
    type: 'apply_effect',
    label: '效果分配',
    description: '应用伤害/治疗/状态效果到目标',
    category: '效果',
    color: '#ef4444',
    defaultConfig: { effectType: 'damage', value: '8d6' },
    icon: 'heart',
  },
  {
    type: 'concentration_check',
    label: '专注检定',
    description: '施法者进行专注豁免（体质检定 vs DC 10 或伤害半数）',
    category: '检定',
    color: '#06b6d4',
    defaultConfig: {},
    icon: 'shield',
  },
  {
    type: 'cast_end',
    label: '施法结束',
    description: '结算最终状态，写日志，释放临时资源',
    category: '核心环节',
    color: '#64748b',
    defaultConfig: {},
    icon: 'skull',
  },
  {
    type: 'custom',
    label: '自定义节点',
    description: '开放扩展的自定义逻辑节点',
    category: '扩展',
    color: '#6b7280',
    defaultConfig: { code: '' },
    icon: 'zap',
  },
];

// ===== 节点配置 Schema：中文标签 + 控件类型 + 候选选项 =====

/** 字段输入控件类型 */
export type ConfigFieldType =
  | 'select'     // 下拉单选（中文 → DSL 值）
  | 'number'     // 数字输入
  | 'text'       // 自由文本
  | 'dice'       // 骰子表达式（如 8d6）
  | 'template';  // 模板变量（如 ${caster.spellSaveDc}）

/** 下拉选项：中文标签 → DSL 值 */
export interface SelectOption {
  label: string;   // 用户看到的中文
  value: string;   // 存入 config 的 DSL 编码
}

/** 单个配置字段的 Schema */
export interface ConfigFieldSchema {
  key: string;                    // config 中的键名（DSL 层）
  label: string;                  // 中文标签（展示层）
  type: ConfigFieldType;          // 控件类型
  options?: SelectOption[];       // select 候选列表
  placeholder?: string;           // 输入提示
  required?: boolean;             // 是否必填
  defaultValue?: any;             // 默认值
}

/** 节点类型 → 配置字段列表 */
export const NODE_CONFIG_SCHEMA: Record<FlowNodeType, ConfigFieldSchema[]> = {
  // ── 核心环节 ──
  cast_start: [
    {
      key: 'spellId',
      label: '绑定法术',
      type: 'select',
      required: true,
      placeholder: '选择要施放的法术',
      defaultValue: undefined,
    },
    {
      key: 'autoChecks',
      label: '自动检查',
      type: 'object',
      children: [
        {
          key: 'components',
          label: '法术成分检查',
          type: 'boolean',
          defaultValue: true,
        },
        {
          key: 'range',
          label: '施法距离检查',
          type: 'boolean',
          defaultValue: true,
        },
        {
          key: 'time',
          label: '施法时间检查',
          type: 'boolean',
          defaultValue: true,
        },
      ],
    },
    {
      key: 'overrideComponents',
      label: '手动成分覆盖',
      type: 'text',
      placeholder: '如 "verbal,somatic"',
      description: '留空则使用法术默认成分要求',
    },
    {
      key: 'overrideRange',
      label: '手动射程覆盖',
      type: 'number',
      placeholder: '留空则使用法术默认射程',
    },
    {
      key: 'overrideTime',
      label: '手动施法时间覆盖',
      type: 'select',
      options: [
        { label: '1 动作', value: '1 action' },
        { label: '1 附赠动作', value: '1 bonus action' },
        { label: '1 反应', value: '1 reaction' },
        { label: '1 分钟', value: '1 minute' },
        { label: '10 分钟', value: '10 minutes' },
        { label: '1 小时', value: '1 hour' },
      ],
      placeholder: '留空则使用法术默认施法时间',
    },
  ],
  cast_start_legacy: [],
  check_component: [
    {
      key: 'component',
      label: '施法成分',
      type: 'select',
      required: true,
      options: [
        { label: '言语 (V)', value: 'verbal' },
        { label: '姿势 (S)', value: 'somatic' },
        { label: '材料 (M)', value: 'material' },
      ],
      defaultValue: 'verbal',
    },
  ],
  check_range: [
    {
      key: 'range',
      label: '射程（尺）',
      type: 'number',
      required: true,
      placeholder: '触碰法术填 0',
      defaultValue: 60,
    },
    {
      key: 'targetMode',
      label: '定位模式',
      type: 'select',
      required: true,
      options: [
        { label: '视线',   value: 'sight' },
        { label: '触碰',   value: 'touch' },
        { label: '自身',   value: 'self' },
        { label: '指定点', value: 'point' },
      ],
      defaultValue: 'sight',
    },
  ],
  select_target: [
    {
      key: 'mode',
      label: '目标模式',
      type: 'select',
      required: true,
      options: [
        { label: '自身', value: 'self' },
        { label: '单体', value: 'single' },
        { label: '多体', value: 'multi' },
        { label: '区域', value: 'area' },
      ],
      defaultValue: 'single',
    },
    {
      key: 'maxCount',
      label: '最大目标数',
      type: 'number',
      required: true,
      placeholder: '多体模式时生效',
      defaultValue: 1,
    },
  ],
  cast_end: [],

  // ── 检定 ──
  saving_throw: [
    {
      key: 'ability',
      label: '豁免属性',
      type: 'select',
      required: true,
      options: [
        { label: '力量', value: 'strength' },
        { label: '敏捷', value: 'dexterity' },
        { label: '体质', value: 'constitution' },
        { label: '智力', value: 'intelligence' },
        { label: '感知', value: 'wisdom' },
        { label: '魅力', value: 'charisma' },
      ],
      defaultValue: 'dexterity',
    },
    {
      key: 'dc',
      label: '难度等级 (DC)',
      type: 'template',
      required: true,
      placeholder: '如 ${caster.spellSaveDc} 或固定值 15',
      defaultValue: '${caster.spellSaveDc}',
    },
  ],
  attack_roll: [],
  concentration_check: [],

  // ── 控制流 ──
  condition_branch: [
    {
      key: 'condition',
      label: '分支条件',
      type: 'template',
      required: true,
      placeholder: '如 target.currentHp <= 100',
      defaultValue: 'target.currentHp <= 100',
    },
  ],

  // ── 效果 ──
  apply_effect: [
    {
      key: 'effectType',
      label: '效果类型',
      type: 'select',
      required: true,
      options: [
        { label: '伤害',     value: 'damage' },
        { label: '治疗',     value: 'healing' },
        { label: '状态附加', value: 'status' },
      ],
      defaultValue: 'damage',
    },
    {
      key: 'value',
      label: '骰子表达式',
      type: 'dice',
      required: true,
      placeholder: '如 8d6、3d8+5',
      defaultValue: '8d6',
    },
    {
      key: 'damageType',
      label: '伤害类型',
      type: 'select',
      required: false,
      options: [
        { label: '火焰', value: 'fire' },
        { label: '寒冷', value: 'cold' },
        { label: '闪电', value: 'lightning' },
        { label: '酸蚀', value: 'acid' },
        { label: '毒素', value: 'poison' },
        { label: '力场', value: 'force' },
        { label: '黯蚀', value: 'necrotic' },
        { label: '光耀', value: 'radiant' },
        { label: '心灵', value: 'psychic' },
        { label: '雷鸣', value: 'thunder' },
        { label: '穿刺', value: 'piercing' },
        { label: '挥砍', value: 'slashing' },
        { label: '钝击', value: 'bludgeoning' },
      ],
    },
  ],

  // ── 扩展 ──
  custom: [
    {
      key: 'code',
      label: '自定义脚本',
      type: 'text',
      required: false,
      placeholder: '输入自定义逻辑代码',
      defaultValue: '',
    },
  ],
};

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

  // 5. 检查边 ID 唯一性
  const edgeIds = new Set<string>();
  for (const edge of flow.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push(`边 ID 重复: ${edge.id}`);
    }
    edgeIds.add(edge.id);
  }

  // 6. 检查无自环边（from === to，逻辑上无意义）
  for (const edge of flow.edges) {
    if (edge.from === edge.to) {
      errors.push(`边 ${edge.id} 形成自环（from === to: ${edge.from}）`);
    }
  }

  // 7. 检查平行边（同一 from→to + 同一 trigger 的重复边）
  const edgeSignatures = new Set<string>();
  for (const edge of flow.edges) {
    const sig = `${edge.from}->${edge.to}@${edge.trigger}`;
    if (edgeSignatures.has(sig)) {
      errors.push(`存在重复连线: ${edge.from} → ${edge.to}（${edge.trigger}）`);
    }
    edgeSignatures.add(sig);
  }

  return errors;
}

// ======================
// 七、施法开始节点相关类型定义
// ======================

/** 检查结果类型 */
export type CheckResult = 'pass' | 'fail' | 'partial';

/** 法术成分检查结果 */
export interface ComponentsCheckResult {
  required: string[];              // 需要的成分
  available: boolean;               // 是否可用
  missing?: string[];               // 缺少的成分
}

/** 施法距离检查结果 */
export interface RangeCheckResult {
  required: number;                 // 需要的射程
  current: number;                  // 当前距离
  inRange: boolean;                 // 是否在射程内
}

/** 施法时间检查结果 */
export interface TimeCheckResult {
  required: string;                 // 需要的施法时间
  available: boolean;               // 是否可用（动作点数检查）
}

/** 前置检查报告 */
export interface PreCastCheckReport {
  components: ComponentsCheckResult; // 成分检查结果
  range: RangeCheckResult;          // 距离检查结果
  time: TimeCheckResult;            // 时间检查结果
  overall: CheckResult;             // 总体结果
}

/** 施法开始节点配置 */
export interface CastStartConfig {
  spellId?: string;                    // 绑定的法术ID
  autoChecks: {                       // 自动检查配置
    components: boolean;              // 自动检查法术成分
    range: boolean;                   // 自动检查施法距离
    time: boolean;                    // 自动检查施法时间
  };
  // 手动覆盖配置（可选）
  overrideComponents?: string;       // 手动指定成分要求
  overrideRange?: number;           // 手动指定射程
  overrideTime?: string;             // 手动指定施法时间
}
