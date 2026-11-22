import type { FlowDefinition, FlowNodeType, EdgeTrigger } from './flow';

// ======================
// 脚本树（Scratch 式积木模型）
// ======================
//
// 方针：重要的是节点之间的拓扑关系而不是位置关系。
// 脚本树用堆叠（顺序）与嵌套（分支）直接编码拓扑，画布坐标不再是模型的一部分。
// 编辑器唯一读写格式为本树；发布时经 flowScriptCompile 编译回 nodes/edges 图，
// 供云端 D1 与 flowCompiler 消费（编译桥接）。

/** 块形状：帽子（唯一入口）/ 堆叠（顺序步骤）/ C 形（双分支体嵌套） */
export type BlockShape = 'hat' | 'stack' | 'c';

/** C 形块的双体 trigger 映射：一次执行中两分支互斥展开（triggerMatches 语义保证） */
export interface CBlockTriggerPair {
  /** 满足体出边 trigger（on_true 或 on_success） */
  trueTrigger: EdgeTrigger;
  /** 否则体出边 trigger（on_false 或 on_failure） */
  falseTrigger: EdgeTrigger;
  /** 满足体插槽标签（如「满足」「通过」「命中」） */
  trueLabel: string;
  /** 否则体插槽标签（如「否则」「未通过」「未命中」） */
  falseLabel: string;
}

/** 节点类型的块形态元数据 */
export interface BlockShapeMeta {
  /** 'c' 表示该类型支持 C 形展开；实际形态由数据决定（无分流出边时按堆叠处理） */
  shape: BlockShape;
  /** shape='c' 时必填：双体 trigger 映射与插槽标签 */
  cPair?: CBlockTriggerPair;
}

/**
 * 块形状注册表 —— 按节点类型索引。
 * 依据 flowCompiler.triggerMatches 的互斥组：on_true/on_false（result === true/false）
 * 与 on_success/on_failure（status === success/failure）各自互斥，与 Scratch if/else 语义一致。
 *
 * 注意：shape 只声明「能力」，实际形态由数据（kind）决定。检定/命中块（saving_throw/
 * attack_roll）默认以堆叠形态创建——结果是沿链传递的信号，由下游效果节点自行消化
 * （如 halfDamageOnSave）；C 形仅在两个结果要走不同效果链时显式使用（convertBlockForm
 * 可切换）。condition_branch 即分流本身，恒为 C 形。
 */
export const BLOCK_SHAPE_REGISTRY: Record<FlowNodeType, BlockShapeMeta> = {
  cast_start: { shape: 'hat' },
  select_target: { shape: 'stack' },
  saving_throw: { shape: 'c', cPair: { trueTrigger: 'on_success', falseTrigger: 'on_failure', trueLabel: '通过', falseLabel: '未通过' } },
  attack_roll: { shape: 'c', cPair: { trueTrigger: 'on_success', falseTrigger: 'on_failure', trueLabel: '命中', falseLabel: '未命中' } },
  condition_branch: { shape: 'c', cPair: { trueTrigger: 'on_true', falseTrigger: 'on_false', trueLabel: '满足', falseLabel: '否则' } },
  apply_effect: { shape: 'stack' },
  scaled_effect: { shape: 'stack' },
  concentration_check: { shape: 'stack' },
  cast_end: { shape: 'stack' },
  custom: { shape: 'stack' },
};

// ======================
// 块定义
// ======================

/** 帽子块：脚本唯一入口（cast_start），只能位于脚本顶部 */
export interface ScriptHat {
  kind: 'hat';
  /** 沿用节点 id：编译后执行日志 nodeId 可对照 */
  id: string;
  label: string;
  config?: Record<string, any>;
  notes?: string;
}

/** 堆叠块：顺序步骤 */
export interface ScriptStep {
  kind: 'step';
  /** 堆叠形状的节点类型；检定类型在无分流边时也以堆叠形态存在（见迁移器退化规则） */
  nodeType: FlowNodeType;
  id: string;
  label: string;
  config?: Record<string, any>;
  notes?: string;
}

/** C 形块：条件/检定结果分流，双分支体嵌套 */
export interface ScriptIf {
  kind: 'if';
  nodeType: FlowNodeType;
  id: string;
  label: string;
  /** 分流条件表达式；仅 condition_branch 使用（检定块由结果状态分流，无条件参数） */
  condition?: string;
  /** 满足体/通过体/命中体 */
  onTrue: ScriptBlock[];
  /** 否则体/未通过体/未命中体 */
  onFalse: ScriptBlock[];
  config?: Record<string, any>;
  notes?: string;
}

export type ScriptBlock = ScriptStep | ScriptIf;

/** 脚本：帽子块 + 顶部序列，一段流程的完整积木结构 */
export interface FlowScript {
  hat: ScriptHat;
  body: ScriptBlock[];
}

/** 迁移告警：图特征无法/无需映射到树时记录（编辑器一次性确认面板消费） */
export interface MigrationWarning {
  kind:
    | 'back_edge'        // 回流边：死代码，丢弃行为等价
    | 'orphan'           // 孤儿节点/多入口子图：不参与执行，丢弃行为等价
    | 'dropped_edge'     // 其他被丢弃出边（on_partial、C 形混入 trigger、歧义多边）
    | 'asymmetric_join'  // 不对称汇合：无法提升公共尾，贪心延续（行为可能变化）
    | 'no_cast_start';   // 缺少入口节点：迁移失败
  nodeId?: string;
  message: string;
}

export interface MigrationResult {
  script: FlowScript | null;
  warnings: MigrationWarning[];
  /** false 表示存在行为可能变化的迁移损失（如不对称汇合） */
  lossless: boolean;
}

/** FlowDefinition 增量：脚本树为编辑器唯一读写格式，发布时编译为 nodes/edges */
export type FlowWithScript = FlowDefinition & { script?: FlowScript };
