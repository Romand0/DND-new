import type { ReactionTrigger, ReactionResolution } from '@/types/combat';

/**
 * 法术材料成分的结构化描述。
 * 缺省时由 materialInfo 文本惰性解析（价值/耗材关键字），见 data/spellMaterials.ts。
 */
export interface SpellMaterial {
  id: string;
  /** 材料名（如「一小块羊毛」） */
  name: string;
  /** 补充说明（可空） */
  description?: string;
  /** 作为耗材：施放后消失 */
  consumed?: boolean;
  /** 最低金币价值；>0 表示材料包不可替代 */
  costGp?: number;
}

/**
 * 法术作为反应触发的声明（数据驱动，见 data/reactionRules.ts 检测器）。
 * 只声明「何时能反应、用哪种解决方式」，具体效果沿用既有法术流程/状态库结算，
 * 引擎不内置任何具体法术名或效果逻辑。
 */
export interface SpellReaction {
  /** 触发时机（attack_targeted：被指定为攻击目标；spell_cast：他人施法） */
  trigger: ReactionTrigger;
  /** 解决方式，缺省 'spell'（提示 DM 走法术流程） */
  resolution?: ReactionResolution;
  /** 可使用者范围：self = 被攻击者本人（缺省）；ally = 同阵营（不含本人） */
  scope?: 'self' | 'ally';
  /** 弹窗提示文案（DM 结算指引） */
  prompt?: string;
  /** 消耗法术位环级；0 = 不耗环（缺省 = 法术自身环级） */
  slotLevel?: number;
}

export interface Spell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  /** 反应触发声明（可选；仅声明式数据，不含效果逻辑） */
  reaction?: SpellReaction;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
  };
  duration: string;
  description: string;
  classes: string[];
  notes?: string;
  ritual?: boolean;         // 是否为仪式法术
  concentration?: boolean;  // 是否需要专注
  source?: string;          // 来源书，如 "PHB"、"TCE"
  campaignId?: string | null; // 归属团组（null/缺省 = 出版物条目，团组无关全局共享）
  hasHeightened?: boolean;
  heightenedEffect?: string;
  materialInfo?: string;
  /** 结构化材料清单；缺省时按 materialInfo 解析为单条需求 */
  materials?: SpellMaterial[];
  bindingsCount?: number;  // 绑定的流程数量
  /** 伤害类型（可选；缺省时施法弹窗会尝试从描述推断，DM 可手动改） */
  damageType?: string;
  /** 法术描述内嵌表格（Wikidot 语法：`|| 表头 ||` + `| 行 |`，导入器自动提取 / 手动维护） */
  table?: string;
}
