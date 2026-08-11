# src/types/equipment.ts

## 功能概述
该文件定义了 `EquipmentItem` 接口，用于描述游戏中的装备项。该接口包含了装备的基本属性，如名称、分类、重量、价格、伤害等，以及一些可选属性，如子分类、描述、属性标签等。该接口的存在是为了统一装备项的数据结构，方便在项目中管理和使用装备数据。

## 主要导出/接口
```typescript
export interface EquipmentItem {
  id: string;
  name: string;
  category: string; // 分类：武器/护甲/药水/法器/工具/杂物/自定义
  subtype?: string; // 子分类：简易武器/军用武器/重甲/中甲/轻甲/盾牌
  weight: number; // 重量（数字，单位固定为"磅"）
  packSize?: number; // 每份默认包装所含个体数
  unit?: string; // 个体单位名称
  price: {
    amount: number; // 价格数值
    unit: 'pp' | 'gp' | 'sp' | 'cp'; // 单位：紫晶/金币/银币/铜币
  };
  damageDice?: string; // 伤害骰子
  damageType?: string; // 伤害类型
  acBase?: string; // 护甲基础 AC
  strengthReq?: number; // 力量需求
  stealthDisadvantage?: boolean; // 隐匿劣势
  description: string; // 描述
  properties?: string[]; // 属性标签
  isCustom: boolean; // 是否为用户自定义装备
  tags: { key: string; value: string }[]; // 自由标签
  source?: string; // 出版来源
  dataResource?: string; // 数据来源网站
}
```

## 核心实现说明
`EquipmentItem` 接口包含了装备的基本属性，如 `id`、`name`、`category` 等，以及一些可选属性，如 `subtype`、`weight`、`price` 等。该接口的设计考虑了装备的多样性和复杂性，使得装备项的数据结构更加清晰和统一。

该接口与项目其他模块的关系主要体现在数据传递和状态管理上。例如，在装备管理模块中，可能会使用到 `EquipmentItem` 接口来存储和管理装备数据。同时，该接口也可能被引用在其他模块中，如战斗模块、商店模块等。

## 注意事项或使用方式
- 使用该接口时，需要确保传入的属性符合接口定义。
- 可通过 `id` 来唯一标识一个装备项。
- 可通过 `category` 和 `subtype` 来筛选特定类型的装备。
- 可通过 `price` 来获取装备的价格信息。
- 可通过 `description` 来获取装备的详细描述。
