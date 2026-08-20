// DSL 编译器 - 节点执行引擎
// 将流程图中的节点转换为可执行的逻辑
import type { 
  FlowDefinition, 
  FlowNodeDef, 
  FlowExecutionContext, 
  NodeExecutionResult,
  PreCastCheckReport,
  CastStartConfig,
  CheckResult,
  SavingThrowConfig
} from '@/types/flow';
import type { Character } from '@/types/character';
import type { CombatRecord, Combatant } from "@/types/combat";
import { combatStore } from "@/data/combatStore";
import type { Spell } from '@/types/spell';
import { characterStore } from "@/data/characterStore";
import { spellStore } from "@/data/spellStore";
import { rollDie } from '@/data/diceService';

// DSL 编译器 - 节点执行引擎
// 将流程图中的节点转换为可执行的逻辑
import type { 
  FlowDefinition, 
  FlowNodeDef, 
  FlowExecutionContext, 
  NodeExecutionResult,
  PreCastCheckReport,
  CastStartConfig,
  CheckResult,
  SavingThrowConfig
} from '@/types/flow';
import type { Character } from '@/types/character';
import type { CombatRecord, Combatant } from "@/types/combat";
import { combatStore } from "@/data/combatStore";
import type { Spell } from '@/types/spell';
import { characterStore } from "@/data/characterStore";
import { spellStore } from "@/data/spellStore";
import { rollDie } from '@/data/diceService';

export interface SavingThrowConfig {
  ability: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
  dc: number;
}

export interface PreCastCheckReport {
  success: boolean;
  message: string;
  autoChecks: string[]; // 新增字段:自动生成的检查代码
  saveConfig?: SavingThrowConfig; // 可选的豁免检定配置
  requiredComponents: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    materialComponents?: string;
  };
  distance: {
    current: number;
    required: number;
    valid: boolean;
  };
  time: {
    actionType: 'action' | 'bonus' | 'reaction' | 'minute' | 'hour' | 'day';
    available: boolean;
  };
}

/** 施法开始节点配置 */
export interface CastStartConfig {
  spellId?: string;                    // 绑定的法术ID
  autoChecks: {                       // 自动检查配置
    components: boolean;              // 自动检查法术成分
    range: boolean;                   // 自动检查施法距离
    time: boolean;                    // 自动检查施法时间
  };
  // 手动覆盖配置(可选)
  overrideComponents?: string;       // 手动指定成分要求
  overrideRange?: number;           // 手动指定射程
  overrideTime?: string;             // 手动指定施法时间
}

export interface ComponentsCheckResult {
  verbal: boolean;      // 言语成分检查结果
  somatic: boolean;     // 手势成分检查结果
  material: boolean;    // 材料成分检查结果
  message: string;      // 检查结果消息
}

export interface RangeCheckResult {
  current: number;      // 当前距离
  required: number;    // 要求距离
  valid: boolean;       // 是否有效
  message: string;      // 检查结果消息
}

export interface TimeCheckResult {
  actionType: 'action' | 'bonus' | 'reaction' | 'minute' | 'hour' | 'day';
  available: boolean;    // 是否可用
  message: string;      // 检查结果消息
}

export interface CheckResult {
  success: boolean;     // 总体检查结果
  message: string;      // 总体消息
  details: {            // 详细检查结果
    components: ComponentsCheckResult;
    range: RangeCheckResult;
    time: TimeCheckResult;
  };
}

export interface FlowExecutionContext {
  id: string;
  casterId: string;
  spellId?: string;
  targetId?: string;
  stateSnapshot?: any;  // 状态快照,包含战斗记录等
  metadata?: Record<string, any>;
}

export interface NodeExecutionResult {
  status: 'success' | 'failure' | 'pending';
  output?: any;
  error?: string;
  nextNodeId?: string;
  metadata?: Record<string, any>;
}

export interface FlowDefinition {
  id: string;
  name: string;
  nodes: FlowNodeDef[];
  edges: any[];
  metadata?: Record<string, any>;
}

export interface FlowNodeDef {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  data: any;
  config?: any;
}
