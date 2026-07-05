export interface EquipmentItem {
  id: string;
  name: string;
  category: string; // 分类：武器/护甲/药水/法器/工具/杂物/自定义
  subtype?: string; // 子分类：简易武器/军用武器/重甲/中甲/轻甲/盾牌
  weight: number; // 重量（数字，单位固定为"磅"）
  price: {
    amount: number; // 价格数值
    unit: 'gp' | 'sp' | 'cp'; // 单位：金币/银币/铜币
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
  dataResource?: string; // 数据来源网站，如 "5E不全书"
}
