// 特性作用方式分类引擎：CharacterDetail（分类页渲染）与 CombatantInfoPanel（战斗主动技能区）共用
import type { Feature, FeatureRole } from '@/types/character';

export type { FeatureRole };

// 区块渲染顺序：主动技能（最大展示度）→ 被动技能 → 人物设定 → 属性调整（融入数值，压缩在末尾）
export const FEATURE_RENDER_ORDER: FeatureRole[] = ['active', 'passive', 'profile', 'stat'];

export const FEATURE_ROLE_META: Record<FeatureRole, { label: string; hint: string; chip: string }> = {
  active: { label: '主动技能', hint: '需主动运用（激励骰/战技等），战斗中便捷触发', chip: 'bg-primary/15 text-primary' },
  passive: { label: '被动技能', hint: '常规流程中独立生效（天生优劣势/黑暗视觉/偷袭等）', chip: 'bg-sky-500/15 text-sky-500' },
  profile: { label: '人物设定', hint: '年龄/阵营/体型/速度等基本设定信息', chip: 'bg-violet-500/15 text-violet-500' },
  stat: { label: '属性调整', hint: '融入角色数值（熟练/专精/属性等），无需单独关注', chip: 'bg-gray-500/15 text-gray-500' },
};

// 判定顺序：人物设定（名称）→ 主动技能（名称）→ 属性调整（名称或描述）→ 主动技能（描述形态词）。
// active 名称词优先于 stat 描述词：名称已明确动作形态的条目不被描述里的武器/护甲等泛词抢走。
const PROFILE_ROLE_NAME_RE = /年龄|阵营|体型|速度/;
// 属性类只抓标题级字面（属性值/属性加成）：描述里从不直称「属性」，一律称具体属性名，裸「属性」必误伤
const STAT_ROLE_NAME_RE = /属性值|属性加成|熟练|专精|通用语|装备|护甲|武器|工具/;
// 属性调整描述词：比名称版更窄——无属性类词，「语言」收窄为「通用语」（避免描述里任何语言字样误伤）
const STAT_ROLE_DESC_RE = /熟练|专精|通用语|装备|护甲|武器|工具/;
// 主动技能关键词（名称）：激励/战技/骰池等消耗型，以及任何以动作形态施放的能力（决定/动作/附赠动作/反应）
const ACTIVE_ROLE_NAME_RE = /激励|战技|卓越骰|骰池|充能|每回合|每日|次数|决定|动作|附赠动作|反应/;
// 主动技能形态词（描述）：名称不含关键词但描述里以附赠动作/反应/额外动作施放的能力（如回气）
const ACTIVE_DESC_RE = /附赠动作|反应|一个动作|用你的动作|额外动作/;

export function deriveFeatureRole(f: Feature): FeatureRole {
  if (f.role) return f.role;
  const desc = f.description || '';
  if (PROFILE_ROLE_NAME_RE.test(f.name)) return 'profile';
  if (ACTIVE_ROLE_NAME_RE.test(f.name)) return 'active';
  if (STAT_ROLE_NAME_RE.test(f.name) || STAT_ROLE_DESC_RE.test(desc)) return 'stat';
  if (ACTIVE_DESC_RE.test(desc)) return 'active';
  return 'passive';
}
