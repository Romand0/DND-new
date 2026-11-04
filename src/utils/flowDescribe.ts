import type { FlowNodeDef, ConfigFieldSchema } from '@/types/flow';
import { NODE_CONFIG_SCHEMA, isConfigFieldVisible } from '@/types/flow';

/**
 * 节点配置 → 自然语言描述。
 * 摘要句特判（对齐 flowCompiler 运行语义）+ schema 驱动的通用字段兜底：
 * 字段标签/选项文案全部来自 NODE_CONFIG_SCHEMA，新增字段无需改此文件。
 */

function fieldsOf(node: FlowNodeDef): ConfigFieldSchema[] {
  return NODE_CONFIG_SCHEMA[node.type] || [];
}

function findField(fields: ConfigFieldSchema[], key: string): ConfigFieldSchema | undefined {
  return fields.find(f => f.key === key);
}

/** 查字段选项的中文文案；查不到原样返回 */
function optLabel(fields: ConfigFieldSchema[], key: string, value: any): string {
  const field = findField(fields, key);
  const opt = field?.options?.find(o => o.value === value);
  return opt ? opt.label : String(value ?? '');
}

function isBlank(v: any): boolean {
  return v === undefined || v === null || v === '';
}

function exprText(v: any): string | null {
  return isBlank(v) ? null : String(v);
}

// ── 各类型摘要句 ──

function describeCastStart(c: Record<string, any>, fields: ConfigFieldSchema[]): string | null {
  const checks = c.autoChecks || {};
  const names: string[] = [];
  if (checks.components) names.push('材料成分');
  if (checks.range) names.push('射程');
  if (checks.time) names.push('施法时间');
  let text = names.length > 0 ? `自动检查：${names.join(' / ')}` : '关闭自动检查';
  const overrides: string[] = [];
  if (!isBlank(c.overrideComponents)) overrides.push(`成分改为「${c.overrideComponents}」`);
  if (!isBlank(c.overrideRange)) overrides.push(`射程改为 ${c.overrideRange} 尺`);
  if (!isBlank(c.overrideTime)) overrides.push(`施法时间改为「${c.overrideTime}」`);
  if (overrides.length > 0) text += `；${overrides.join('，')}`;
  void fields;
  return text;
}

function describeSelectTarget(c: Record<string, any>, fields: ConfigFieldSchema[]): string | null {
  const modeText = optLabel(fields, 'mode', c.mode);
  let text = `选择目标：${modeText}`;
  if (c.mode === 'multi' && !isBlank(c.maxCount)) text += `，最多 ${c.maxCount} 个`;
  return text;
}

function describeSavingThrow(c: Record<string, any>, fields: ConfigFieldSchema[]): string | null {
  const ability = optLabel(fields, 'ability', c.ability);
  const dcText = isBlank(c.dc) ? 'DC 取施法者法术豁免 DC' : `DC 固定为 ${c.dc}`;
  return `目标进行${ability}豁免，${dcText}`;
}

function describeDamage(c: Record<string, any>, fields: ConfigFieldSchema[]): string | null {
  const parts: string[] = [];
  const comps = Array.isArray(c.damageComponents) ? c.damageComponents : [];
  if (comps.length > 0) {
    const compText = comps
      .map((x: any) => `${x.value ?? ''}${optLabel(fields, 'damageType', x.type)}`)
      .join(' + ');
    parts.push(`造成 ${compText} 伤害`);
  } else if (!isBlank(c.value)) {
    parts.push(`造成 ${c.value} ${optLabel(fields, 'damageType', c.damageType)}伤害`);
  }
  if (c.halfDamageOnSave) parts.push('豁免成功则伤害减半');
  return parts.length > 0 ? parts.join('，') : null;
}

function describeApplyEffect(c: Record<string, any>, fields: ConfigFieldSchema[]): string | null {
  switch (c.effectType) {
    case 'damage':
      return describeDamage(c, fields);
    case 'healing':
      return isBlank(c.value) ? null : `恢复 ${c.value} 生命值`;
    case 'status': {
      const affinity = optLabel(fields, 'affinityKind', c.affinityKind);
      const types = Array.isArray(c.damageTypes) ? c.damageTypes.map((t: string) => optLabel(fields, 'damageType', t)).join('、') : '';
      let text = `附加状态：${affinity}${types ? `（${types}）` : ''}`;
      if (!isBlank(c.sourceKind)) text += `，来源：${optLabel(fields, 'sourceKind', c.sourceKind)}`;
      if (c.durationType === 'rounds' && !isBlank(c.durationRounds)) text += `，持续 ${c.durationRounds} 回合`;
      else if (c.durationType === 'untilCasterTurn') text += '，持续到施法者回合结束';
      return text;
    }
    case 'check_modifier': {
      const sign = c.modifierMode === 'penalty' ? '-' : '+';
      const dice = exprText(c.modifierDice);
      const flat = isBlank(c.modifierFlat) ? null : String(c.modifierFlat);
      const amount = dice && flat ? `${dice} 和固定 ${sign}${flat}` : dice ? `${sign}${dice}` : flat ? `${sign}${flat}` : '';
      if (!amount) return null;
      let text = `检定${c.modifierMode === 'penalty' ? '减值' : '加值'}：${amount}`;
      if (!isBlank(c.modifierScene)) text += `（${optLabel(fields, 'modifierScene', c.modifierScene)}）`;
      if (!isBlank(c.modifierUses)) text += `，可用 ${c.modifierUses} 次`;
      else text += '，持续到回合结束';
      return text;
    }
    case 'advantage': {
      const mode = c.advantageMode === 'disadvantage' ? '劣势' : '优势';
      const scene = optLabel(fields, 'advantageScene', c.advantageScene);
      let text = `${scene}获得${mode}`;
      if (!isBlank(c.advantageAbility)) text += `（${optLabel(fields, 'advantageAbility', c.advantageAbility)}）`;
      return text;
    }
    case 'zone': {
      const zone = optLabel(fields, 'zoneType', c.zoneType);
      let text = `生成区域：${zone}`;
      if (!isBlank(c.zoneRadius)) text += `，半径 ${c.zoneRadius} 格`;
      if (!isBlank(c.zoneDamageAmount)) text += `，处于区域内每回合受到 ${c.zoneDamageAmount} ${c.zoneDamageType || ''}伤害`;
      return text;
    }
    case 'forced_move': {
      const dir = c.fmDirectionMode === 'toward' ? '朝施法者方向' : '远离施法者方向';
      let text = `强制位移：${dir}`;
      if (!isBlank(c.fmDistanceCells)) text += `，最多 ${c.fmDistanceCells} 格`;
      if (!isBlank(c.fmAvoidRadius) && c.fmAvoidRadius > 0) text += `，规避目标周围 ${c.fmAvoidRadius} 格`;
      return text;
    }
    default:
      return null;
  }
}

function describeScaledEffect(c: Record<string, any>, fields: ConfigFieldSchema[]): string | null {
  const scaleBy = optLabel(fields, 'scaleBy', c.scaleBy);
  const hasFormula = !isBlank(c.baseLevel) && !isBlank(c.baseDice) && !isBlank(c.perLevelDice);
  let text = `按${scaleBy}缩放：`;
  if (hasFormula) {
    text += `${c.baseDice} 为基准，每高 1 环追加 ${c.perLevelDice}`;
  } else if (Array.isArray(c.tiers) && c.tiers.length > 0) {
    text += `共 ${c.tiers.length} 档分档表`;
  } else {
    return null;
  }
  if (c.effectType === 'damage') {
    text += `，造成${optLabel(fields, 'damageType', c.damageType)}伤害`;
    if (c.halfDamageOnSave) text += '，豁免成功减半';
  } else if (c.effectType === 'healing') {
    text += '，恢复生命值';
  }
  return text;
}

// ── schema 驱动的通用字段行 ──

function formatFieldValue(field: ConfigFieldSchema, value: any): string | null {
  if (isBlank(value)) return null;
  if (field.type === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value
      .map((item: any) => {
        if (typeof item === 'object') {
          return Object.entries(item)
            .filter(([, v]) => !isBlank(v))
            .map(([k, v]) => {
              const child = field.children?.find(c => c.key === k);
              return `${child ? child.label : k} ${optLabel(field.children || [], k, v)}`;
            })
            .join(' ');
        }
        const opt = field.options?.find(o => o.value === item);
        return opt ? opt.label : String(item);
      })
      .join('、');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => !isBlank(v));
    if (entries.length === 0) return null;
    return entries
      .map(([k, v]) => {
        const child = field.children?.find(c => c.key === k);
        return `${child ? child.label : k}：${optLabel(field.children || [], k, v)}`;
      })
      .join('，');
  }
  const opt = field.options?.find(o => o.value === value);
  return opt ? opt.label : String(value);
}

function describeGenericFields(node: FlowNodeDef, skipKeys: Set<string>): string[] {
  const fields = fieldsOf(node);
  const config = node.config || {};
  const lines: string[] = [];
  for (const field of fields) {
    if (field.hidden) continue;
    if (skipKeys.has(field.key)) continue;
    if (!isConfigFieldVisible(field, config)) continue;
    const value = config[field.key];
    if (isBlank(value)) continue;
    const text = formatFieldValue(field, value);
    if (text) lines.push(`${field.label}：${text}`);
  }
  return lines;
}

// ── 对外入口 ──

/** 返回该节点的自然语言描述（多行）；无配置的节点返回空数组 */
export function describeNodeConfig(node: FlowNodeDef): string[] {
  const config = node.config || {};
  const fields = fieldsOf(node);

  let summary: string | null = null;
  switch (node.type) {
    case 'cast_start':
      summary = describeCastStart(config, fields);
      break;
    case 'select_target':
      summary = describeSelectTarget(config, fields);
      break;
    case 'saving_throw':
      summary = describeSavingThrow(config, fields);
      break;
    case 'apply_effect':
      summary = describeApplyEffect(config, fields);
      break;
    case 'scaled_effect':
      summary = describeScaledEffect(config, fields);
      break;
    case 'condition_branch':
      summary = isBlank(config.condition) ? null : `条件分流：${config.condition}`;
      break;
    case 'attack_roll':
      summary = '进行法术攻击检定（加值取施法加值，对比目标 AC）';
      break;
    case 'concentration_check':
      summary = '进行专注检定（体质豁免，DC 取伤害来源的一半向上取整，最低 10）';
      break;
    default:
      break;
  }

  // 摘要句已覆盖的核心键不再重复输出
  const coveredKeys = new Set(
    node.type === 'saving_throw' ? ['ability', 'dc']
    : node.type === 'select_target' ? ['mode', 'maxCount']
    : node.type === 'cast_start' ? ['autoChecks', 'overrideComponents', 'overrideRange', 'overrideTime']
    : []
  );
  const generic = describeGenericFields(node, coveredKeys);
  const lines: string[] = [];
  if (summary) lines.push(summary);
  lines.push(...generic);
  return lines;
}
