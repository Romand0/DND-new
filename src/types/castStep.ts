// 战斗施法步骤契约 —— 流程 DSL 节点的战斗侧镜像
// 类型名与 types/flow.ts 的 FlowNodeType 子集一一对应，
// 三态语义与 NodeExecutionResult.status 一致，日志形状与 FlowLogEntry 兼容。
// Phase 3 流程引擎接管施法时，按 stepType 直接映射到节点执行器。

/** 施法步骤类型（FlowNodeType 战斗侧子集，见 types/flow.ts L11-20） */
export type CastStepType =
  | 'cast_start'       // 前置检查（成分 / 施法时间 / 射程明细）
  | 'select_target'    // 目标确认（距离检算 / 更换目标）
  | 'attack_roll'      // 法术攻击检定
  | 'saving_throw'     // 豁免检定
  | 'apply_effect'     // 效果结算（伤害 / 治疗）
  | 'cast_end';        // 收尾确认（副作用在此一次性应用）

/** 步骤三态，语义对齐 NodeExecutionResult.status（types/flow.ts L691） */
export type CastStepStatus = 'success' | 'failure' | 'partial';

/** 单步骤日志，字段形状对齐 FlowLogEntry（types/flow.ts L680-687，stepType ↔ nodeType） */
export interface CastStepLog {
  id: string;                       // crypto.randomUUID()
  castId: string;                   // 同一次施法的所有步骤共享
  stepType: CastStepType;
  status: CastStepStatus;
  message: string;
  data?: Record<string, unknown>;   // 强制施放时含 forced: true
  timestamp: number;
}
