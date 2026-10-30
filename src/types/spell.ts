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

export interface Spell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
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
  hasHeightened?: boolean;
  heightenedEffect?: string;
  materialInfo?: string;
  /** 结构化材料清单；缺省时按 materialInfo 解析为单条需求 */
  materials?: SpellMaterial[];
  bindingsCount?: number;  // 绑定的流程数量
  /** 伤害类型（可选；缺省时施法弹窗会尝试从描述推断，DM 可手动改） */
  damageType?: string;
}
