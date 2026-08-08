// src/data/advantageRules.ts
// 注册式优劣势引擎：纯函数模块，无 React / store 依赖
import type {
  Combatant,
  NpcAttack,
  CheckScene,
  AdvantageReason,
  AdvantageResult,
  ManualMode,
  PendingAdvantageSource,
} from '@/types/combat';
import type { Attack, Character } from '@/types/character';

// =======================
// 上下文 & 检测器类型
// =======================

export interface AdvantageContext {
  scene: CheckScene;
  currentRound?: number;
  attacker?: Combatant | null;
  target?: Combatant | null;
  attackerCharacter?: Character | null;
  targetCharacter?: Character | null;
  attack?: Attack | NpcAttack | null;
  usageMode?: 'melee' | 'thrown';
  attackerPos?: { col: number; row: number } | null;
  targetPos?: { col: number; row: number } | null;
  distanceCells?: number;
  saveAbility?: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma';
  /** 所有参战者沙盘位置映射（combatantId → 坐标）。
   *  跨参战者相对距离判定（如协助：攻击对象在发出者 5 尺内）时需要；
   *  未传入时 requireTargetNearFromId 标记将无法命中。 */
  combatantPositions?: Record<string, { col: number; row: number } | null | undefined> | null;
}

export type AdvantageDetector = (ctx: AdvantageContext) => AdvantageResult;

// =======================
// 武器辅助函数（内部使用，从 CombatAttackModal 迁移）
// =======================

// 判断是否远程武器
function isRangedWeapon(attack: Attack | NpcAttack): boolean {
  if (attack.subtype) {
    if (attack.subtype.includes('远程') || attack.subtype.includes('弹药')) return true;
  }
  if (attack.normalRange !== undefined && attack.normalRange > 0) return true;
  if (attack.maxRange !== undefined && attack.maxRange > 0) return true;
  return false;
}

// 判断是否投掷武器
function isThrownWeapon(attack: Attack | NpcAttack): boolean {
  if (attack.properties && attack.properties.some(p => p.includes('弹药'))) return false;
  if (attack.subtype && attack.subtype.includes('弹药')) return false;
  if (attack.subtype && attack.subtype.includes('投掷')) return true;
  if (attack.properties) {
    return attack.properties.some(p => p.includes('投掷'));
  }
  return false;
}

// 射程段判定（简化版）
type RangeTier = 'melee' | 'normal' | 'max' | 'outOfRange';
function getRangeTier(attack: Attack | NpcAttack, distanceCells: number): RangeTier {
  // 简化版：基于 normalRange/maxRange 判断
  const distanceFeet = distanceCells * 5;
  const normalRange = attack.normalRange ?? 0;
  const maxRange = attack.maxRange ?? 0;
  // 近战范围（5尺内）
  if (distanceFeet <= 5) return 'melee';
  // 常规射程内
  if (normalRange > 0 && distanceFeet <= normalRange) return 'normal';
  // 最大射程内
  if (maxRange > 0 && distanceFeet <= maxRange) return 'max';
  // 超出射程
  if (normalRange > 0 || maxRange > 0) return 'outOfRange';
  return 'melee';
}

// =======================
// 注册表 + 注册 API
// =======================

const detectors = new Map<string, AdvantageDetector>();

export function registerDetector(name: string, fn: AdvantageDetector): void {
  detectors.set(name, fn);
}

export function unregisterDetector(name: string): void {
  detectors.delete(name);
}

export function listDetectors(): string[] {
  return Array.from(detectors.keys());
}

// =======================
// 内置检测器 1：equipment（不熟练护甲劣势）
// =======================

function detectEquipment(ctx: AdvantageContext): AdvantageResult {
  const advantage: AdvantageReason[] = [];
  const disadvantage: AdvantageReason[] = [];
  // 仅攻击/法术攻击场景适用
  const applicableScenes: CheckScene[] = ['attack_melee', 'attack_ranged', 'attack_thrown', 'spell_attack'];
  if (!applicableScenes.includes(ctx.scene)) return { advantage, disadvantage };

  const character = ctx.attackerCharacter;
  if (character) {
    const armorId = character.wornArmorId;
    if (armorId) {
      const armor = (character.equipment as any[] | undefined)?.find((e: any) => (e.childId || e.id) === armorId);
      if (armor && armor.subtype) {
        const profs = character.proficiencies?.armor || [];
        if (!profs.includes(armor.subtype)) {
          disadvantage.push({ kind: 'equipment', label: '不熟练的护甲' });
        }
      }
    }
  }
  return { advantage, disadvantage };
}

// =======================
// 内置检测器 2：positional（5尺远程 + 投掷最大射程段劣势）
// =======================

function detectPositional(ctx: AdvantageContext): AdvantageResult {
  const advantage: AdvantageReason[] = [];
  const disadvantage: AdvantageReason[] = [];
  // 仅远程攻击场景适用
  const applicableScenes: CheckScene[] = ['attack_ranged', 'attack_thrown'];
  if (!applicableScenes.includes(ctx.scene)) return { advantage, disadvantage };
  if (!ctx.attack) return { advantage, disadvantage };

  const thrown = isThrownWeapon(ctx.attack);
  const rangedOnly = isRangedWeapon(ctx.attack) && !thrown;
  const treatAsRanged = rangedOnly || (thrown && ctx.scene === 'attack_thrown');
  const distanceCells = ctx.distanceCells ?? 0;

  // 劣势：从 5 尺距离发动远程攻击
  if (treatAsRanged && distanceCells === 1) {
    disadvantage.push({ kind: 'positional', label: '从 5 尺距离发动远程攻击' });
  }
  // 劣势：投掷武器处于最大射程段
  if (thrown && ctx.scene === 'attack_thrown' && getRangeTier(ctx.attack, distanceCells) === 'max') {
    disadvantage.push({ kind: 'positional', label: '投掷武器处于最大射程段' });
  }
  return { advantage, disadvantage };
}

// =======================
// 内置检测器 3：pending（扫描待消费标记）
// =======================

function detectPending(ctx: AdvantageContext): AdvantageResult {
  const advantage: AdvantageReason[] = [];
  const disadvantage: AdvantageReason[] = [];
  if (!ctx.attacker) return { advantage, disadvantage };
  const sources: PendingAdvantageSource[] = ctx.attacker.pendingAdvantageSources || [];
  const currentRound = ctx.currentRound;
  for (const s of sources) {
    if (s.consumed) continue;
    // 过期检查（expireRound 与 expireOnCombatantId 任一命中即跳过；
    // expireOnCombatantId 过期由 useRoundTurn 在回合推进时清理，此处兜底避免未清理时误命中）
    if (s.expireRound !== -1 && currentRound !== undefined && currentRound > s.expireRound) continue;
    // 场景匹配
    if (s.scene !== 'any' && s.scene !== ctx.scene) continue;
    // 目标限制（仅针对指定目标生效）
    if (s.targetId && ctx.target && s.targetId !== ctx.target.id) continue;
    // requireTargetNearFromId：必须 ctx.target 与 fromId（发出者）切比雪夫距离 ≤ 1
    if (s.requireTargetNearFromId) {
      if (!s.fromId || !ctx.target) continue;
      const fromPos = ctx.combatantPositions?.[s.fromId] ?? null;
      const toPos = ctx.targetPos ?? ctx.combatantPositions?.[ctx.target.id] ?? null;
      if (!fromPos || !toPos) continue;
      const dist = Math.max(Math.abs(fromPos.col - toPos.col), Math.abs(fromPos.row - toPos.row));
      if (dist > 1) continue;
    }
    const reason: AdvantageReason = {
      kind: 'pending',
      label: s.fromName ? `${s.reason}（来自 ${s.fromName}）` : s.reason,
      pendingSourceId: s.id,
    };
    if (s.mode === 'advantage') advantage.push(reason);
    else disadvantage.push(reason);
  }
  return { advantage, disadvantage };
}

// =======================
// 核心函数：detectAdvantage
// =======================

export function detectAdvantage(ctx: AdvantageContext): AdvantageResult {
  const result: AdvantageResult = { advantage: [], disadvantage: [] };
  for (const fn of detectors.values()) {
    const r = fn(ctx);
    result.advantage.push(...r.advantage);
    result.disadvantage.push(...r.disadvantage);
  }
  return result;
}

// =======================
// resolveRollMode（手动优先 > 自动检测，优劣势互斥抵消）
// =======================

export function resolveRollMode(
  manual: ManualMode,
  auto: AdvantageResult,
): { mode: 'none' | 'advantage' | 'disadvantage'; reasons: AdvantageReason[] } {
  if (manual !== 'none') {
    return { mode: manual, reasons: [{ kind: 'manual', label: '手动指定' }] };
  }
  // D&D 5e：同时存在优劣势则互相抵消
  if (auto.advantage.length > 0 && auto.disadvantage.length > 0) {
    return { mode: 'none', reasons: [] };
  }
  if (auto.advantage.length > 0) {
    return { mode: 'advantage', reasons: auto.advantage };
  }
  if (auto.disadvantage.length > 0) {
    return { mode: 'disadvantage', reasons: auto.disadvantage };
  }
  return { mode: 'none', reasons: [] };
}

// =======================
// getMatchedPendingSourceIds（从 auto 结果中提取 kind='pending' 的 id）
// =======================

export function getMatchedPendingSourceIds(auto: AdvantageResult): string[] {
  const ids: string[] = [];
  for (const r of auto.advantage) {
    if (r.kind === 'pending' && r.pendingSourceId) ids.push(r.pendingSourceId);
  }
  for (const r of auto.disadvantage) {
    if (r.kind === 'pending' && r.pendingSourceId) ids.push(r.pendingSourceId);
  }
  return ids;
}

// =======================
// 模块初始化：注册内置检测器
// =======================

registerDetector('equipment', detectEquipment);
registerDetector('positional', detectPositional);
registerDetector('pending', detectPending);

// 预留接入点注释（不实现，仅说明）：
// - action: dodge（被攻击者回避 → 攻击劣势）、hide（隐匿检定）
//   registerDetector('action', (ctx) => { ... });
// - condition: 中毒/束缚/倒地/隐形等状态（待 condition 系统建立后注册）
//   registerDetector('condition', (ctx) => { ... });
// - environment: 光照/遮蔽（待光照系统建立后注册）
