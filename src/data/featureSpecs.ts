/**
 * 特性 spec 数据层（feature-fullcycle P1，决策 1/4：技能为核心，spec 硬编码入库）。
 * JSON 侧只承载可静态表达的纯数据渠道（heal/resource_conv）；带推导函数的通道
 * （checkModifier/aoeSave/attackRider 等）留在 featureCapabilities REGISTRY。
 * spec 文件构建期由 plugins/featureSpecSchema.mjs 校验（vite buildStart 门禁），
 * 运行时信任数据合法性，重复校验靠探针 14 段兜底。
 */
import specData from './featureSpecs/phb2014.json';

/** B3 heal 渠道 spec：恢复量 = 骰式 + 固定值 + 等级系数（回气 1d10+战士等级） */
export interface HealSpec {
  /** 恢复骰（'1d10'）；与 flat/levelFactor 求和 */
  dice?: string;
  /** 固定值 */
  flat?: number;
  /** 等级系数（levelAttr 指定的属性等级 × 此系数） */
  levelFactor?: number;
  /** 等级来源标签（'战士等级' 等，仅用于展示与结算推导） */
  levelAttr?: string;
  /** hp = 恢复生命；temp = 临时生命 */
  type: 'hp' | 'temp';
}

/** B7 resource_conv 渠道 spec：资源转换（动作如潮 附赠→主动作；灵巧动作 附赠→疾走/撤消/躲藏三选一） */
export interface ResourceConvSpec {
  convert: {
    from: 'bonus' | 'action';
    /** 可转换目标集（多元素时结算端提供选择） */
    to: ('action' | 'dash' | 'disengage' | 'hide' | 'bonus')[];
  };
}

export type FeatureSpecChannel = 'heal' | 'resource_conv';
export type FeatureSpecBody = HealSpec | ResourceConvSpec;

/** spec 文件单条 entry：键 = 特性名（与种子/角色卡特性名同源） */
export interface FeatureSpecEntry {
  channel: FeatureSpecChannel;
  spec: FeatureSpecBody;
  /** 提取来源（extractor/seed_batch/manual），供 review */
  source?: string;
  /** 提取置信度 0-1 */
  confidence?: number;
}

export type FeatureSpecDb = Record<string, FeatureSpecEntry>;

/** 仓库静态 spec 数据（构建期已校验；缺字段按 entry 原样透传） */
export const SPEC_DB = specData as unknown as FeatureSpecDb;
