export interface EquipmentItem {
  id: string;
  name: string;
  /** 英文名（魔法物品等双语条目），显示在详情页标题旁 */
  nameEn?: string;
  category: string; // 分类：武器/护甲/药水/法器/工具/杂物/自定义
   subtype?: string; // 子分类：如"军用近战"、"军用远程"、"简易近战"、"简易远程"、"轻甲"、"中甲"、"重甲"、"盾牌"等
  weight: number; // 重量（数字，单位固定为"磅"）
/** 每份默认包装所含个体数（如 50 发/袋、4 oz/瓶）。背包实例继承此值作为 packSize。 */
  packSize?: number;
/** 个体单位名称（如 "发"、"oz"、"瓶"）。背包实例继承此值作为 unit。 */
  unit?: string;
  price: {
    amount: number; // 价格数值
    unit: 'pp' | 'gp' | 'ep' | 'sp' | 'cp'; // 单位：紫晶/金币/金币/银币/铜币
  };
  damageDice?: string; // 如 "1d8"
  damageType?: string; // 如 "穿刺"
  acBase?: string; // 护甲基础 AC，如 "11"、"14"、"+2"（盾牌）
  strengthReq?: number; // 力量需求，如 13/15
  stealthDisadvantage?: boolean; // 隐匿劣势
  description: string; // 描述（支持 Markdown）
  properties?: string[]; // 属性标签，如 ["轻型", "灵巧"] / ["轻甲"]
  isCustom: boolean; // 是否为用户自定义装备
  tags: { key: string; value: string }[]; // 自由标签
  source?: string; // 出版来源，如 "玩家手册 2014"
  campaignId?: string | null; // 归属团组（null/缺省 = 出版物条目，团组无关全局共享）
  /** 覆盖/墓碑行指回种子条目的 id（种子与自建条目无此字段） */
  seedId?: string | null;
  /** 墓碑标记：仅删除种子的墓碑行含此字段，合并时剔除对应种子 */
  deleted?: boolean;
  dataResource?: string; // 数据来源网站，如 "5E不全书"

  /** ② 魔法体系：魔法物品 / 非魔法物品。缺省 = '非魔法物品' */
  magicCategory?: '魔法物品' | '非魔法物品';

  /** ③ 交易体系：冒险物品 / 贵重物品。缺省 = '冒险物品' */
  tradeCategory?: '贵重物品' | '冒险物品';

  /** 稀有度：普通 / 非普通 / 珍稀 / 极珍稀 / 传说 / 特殊 / 多种稀有度，复合稀有度存原文（如 "极珍稀或传说"） */
  rarity?: string;

  // ---- 魔法物品专属属性（库存储层；战斗消耗链后续接入）----
  /** 是否需要同调。缺省 = false */
  attunement?: boolean;
  /** 同调先决条件原文，如 "法师"、"施法者"、"善良阵营生物"（attunement=true 时有意义） */
  attunePrereq?: string;
  /** 魔法加值（攻击检定/伤害掷骰/AC 的 +1/+2/+3），数值链后续接入 attackBonus / recalculateArmorClass */
  magicBonus?: number;
  /** 初始充能数。缺省 = 无充能 */
  charges?: number;
  /** 充能恢复规则原文，如 "每天黎明恢复1d3发已消耗的充能" */
  chargeRegen?: string;
  /** 是否被诅咒（描述含「诅咒Curse.」子段） */
  cursed?: boolean;
  /** 激活方式原文，如 "命令词"、"用一个动作"、"附赠动作" */
  activation?: string;

  // ---- 法术卷轴（虚拟条目：由法术库生成，不落 D1）----
  /** 卷轴对应的法术 id */
  scrollSpellId?: string;
  /** 卷轴对应的法术名称 */
  scrollSpellName?: string;
  /** 卷轴法术环级 */
  scrollSpellLevel?: number;

  // ---- 法术材料（虚拟条目：由法术需求生成）----
  /** 材料归一化匹配键 */
  materialKey?: string;
  /** 材料展示名 */
  materialName?: string;
  /** 材料价值（gp） */
  materialCostGp?: number;
  /** 是否为耗材 */
  materialConsumed?: boolean;
}
