// 状态效果库 —— 状态定义注册中心
// 设计理念：状态是数据，不是代码。所有状态定义在此注册，运行时通过 StatusManager 操作。

import type { StatusDefinition, StatusLibrary, EffectType } from '@/types/status';

/** 状态定义存储（内存 + localStorage 持久化） */
class StatusLibraryImpl implements StatusLibrary {
  private definitions = new Map<string, StatusDefinition>();

  constructor() {
    // 初始化：注册核心状态定义
    this.registerCoreStatuses();
    // 从 localStorage 加载自定义状态（未来扩展）
    this.loadCustomStatuses();
  }

  register(definition: StatusDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  get(id: string): StatusDefinition | undefined {
    return this.definitions.get(id);
  }

  list(): StatusDefinition[] {
    return Array.from(this.definitions.values());
  }

  findByEffect(effectType: EffectType): StatusDefinition[] {
    return this.list().filter(def =>
      def.effects.some(effect => effect.type === effectType)
    );
  }

  // --- 核心状态定义注册 ---

  private registerCoreStatuses(): void {
    // 失能（Incapacitated）
    this.register({
      id: 'incapacitated',
      name: '失能',
      description: '无法执行任何动作、附赠动作或反应。无法专注，已有的专注被打断。无法说话。先攻掷骰劣势。',
      shortDescription: '无法行动、专注、说话；先攻劣势',

      startTrigger: {
        type: 'manual',
        description: '手动声明：通常由特定效果（如法术、能力）触发，或由 DM 直接施加。',
      },
      endTrigger: {
        type: 'manual',
        description: '手动声明：当引发失能的效果结束时（如法术持续时间届满、治愈），或由 DM 解除。',
      },

      duration: {
        type: 'permanent',  // 默认永久，实际持续时间由触发源决定
      },

      effects: [
        {
          id: 'incapacitated.action_block',
          type: 'action_block',
          target: 'self',
          description: '无法执行动作',
        },
        {
          id: 'incapacitated.bonus_action_block',
          type: 'bonus_action_block',
          target: 'self',
          description: '无法执行附赠动作（预留）',
        },
        {
          id: 'incapacitated.reaction_block',
          type: 'reaction_block',
          target: 'self',
          description: '无法执行反应（预留）',
        },
        {
          id: 'incapacitated.concentration_break',
          type: 'concentration_break',
          target: 'self',
          description: '已有的专注被打断',
        },
        {
          id: 'incapacitated.concentration_block',
          type: 'concentration_block',
          target: 'self',
          description: '无法开始新的专注（预留）',
        },
        {
          id: 'incapacitated.speech_block',
          type: 'speech_block',
          target: 'self',
          description: '无法说话或发出声音',
        },
        {
          id: 'incapacitated.initiative_disadvantage',
          type: 'initiative_disadvantage',
          target: 'self',
          description: '先攻掷骰劣势',
        },
      ],

      combatantPatch: { isIncapacitated: true, canGesticulate: false, canSpeak: false },

      ui: {
        badgeColor: 'purple',
        icon: 'zap-off',
      },
    });

    // 预留：中毒（Poisoned）
    this.register({
      id: 'poisoned',
      name: '中毒',
      description: '攻击检定和属性检定劣势。',
      shortDescription: '攻击和检定劣势',
      startTrigger: {
        type: 'manual',
        description: '由毒素、法术或生物能力触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '通常通过治愈或豁免成功后解除。',
      },
      duration: { type: 'permanent' },
      effects: [
        {
          id: 'poisoned.attack_disadvantage',
          type: 'attack_disadvantage',
          target: 'self',
          description: '攻击检定劣势（预留）',
        },
        {
          id: 'poisoned.check_disadvantage',
          type: 'check_disadvantage',
          target: 'self',
          description: '属性检定劣势（预留）',
        },
      ],
      ui: {
        badgeColor: 'green',
        icon: 'skull',
      },
    });

    // 预留：昏迷（Unconscious）
    this.register({
      id: 'unconscious',
      name: '昏迷',
      description: '无法行动、无法说话、无法移动。倒地。攻击检定对抗你的生物有优势；你对其攻击有劣势。你自动失败的敏捷和力量豁免。对 5 尺内的攻击有致命一击。',
      shortDescription: '无法行动、倒地、自动失败豁免',
      startTrigger: {
        type: 'hp_threshold',
        config: { threshold: 0, condition: '<=' },
        description: 'HP 降至 0 时自动触发（可由规则配置）。',
      },
      endTrigger: {
        type: 'hp_threshold',
        config: { threshold: 0, condition: '>' },
        description: 'HP 恢复至大于 0 时自动解除。',
      },
      duration: { type: 'permanent' },
      effects: [
        {
          id: 'unconscious.action_block',
          type: 'action_block',
          target: 'self',
          description: '无法执行动作',
        },
        {
          id: 'unconscious.speech_block',
          type: 'speech_block',
          target: 'self',
          description: '无法说话',
        },
        {
          id: 'unconscious.speed_zero',
          type: 'speed_zero',
          target: 'self',
          description: '无法移动（预留）',
        },
        {
          id: 'unconscious.save_auto_fail',
          type: 'custom',
          target: 'self',
          config: { autoFail: ['strength', 'dexterity'] },
          description: '力量和敏捷豁免自动失败（预留）',
        },
      ],

      combatantPatch: { isUnconscious: true, canGesticulate: false, canSpeak: false },

      ui: {
        badgeColor: 'gray',
        icon: 'moon',
      },
    });

    // 预留：擒抱（Grappled）
    this.register({
      id: 'grappled',
      name: '擒抱',
      description: '速度变为 0，无法从擒抱中获益。',
      shortDescription: '速度归零',
      startTrigger: {
        type: 'manual',
        description: '手动声明：由擒抱攻击或能力触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '手动声明：挣脱擒抱或擒抱者被控制时结束。',
      },
      duration: { type: 'permanent' },
      effects: [],
      combatantPatch: { canGesticulate: false },
      ui: {
        badgeColor: 'orange',
        icon: 'grab',
      },
    });

    // 预留：麻痹（Paralyzed）
    this.register({
      id: 'paralyzed',
      name: '麻痹',
      description: '无法行动，自动失败力量和敏捷豁免。攻击者对其有优势，5 尺内的攻击为致命一击。',
      shortDescription: '无法行动、自动失败豁免',
      startTrigger: {
        type: 'manual',
        description: '手动声明：由法术或生物能力触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '手动声明：法术持续时间届满或解除。',
      },
      duration: { type: 'permanent' },
      effects: [],
      combatantPatch: { isIncapacitated: true, canGesticulate: false, canSpeak: false },
      ui: {
        badgeColor: 'purple',
        icon: 'disable',
      },
    });

    // 预留：石化（Petrified）
    this.register({
      id: 'petrified',
      name: '石化',
      description: '变成无生命实体，无法移动或感知。攻击检定自动成功，其受到的伤害变为易伤。',
      shortDescription: '化作石像、无法行动',
      startTrigger: {
        type: 'manual',
        description: '手动声明：由石化类效果触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '手动声明：解除石化效果后恢复。',
      },
      duration: { type: 'permanent' },
      effects: [],
      combatantPatch: { isIncapacitated: true, canGesticulate: false, canSpeak: false },
      ui: {
        badgeColor: 'gray',
        icon: 'stone',
      },
    });

    // 预留：震慑（Stunned）
    this.register({
      id: 'stunned',
      name: '震慑',
      description: '无法行动，自动失败力量和敏捷豁免。攻击者对其有优势。',
      shortDescription: '无法行动、自动失败豁免',
      startTrigger: {
        type: 'manual',
        description: '手动声明：由震慑类效果触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '手动声明：效果持续时间届满或豁免成功解除。',
      },
      duration: { type: 'permanent' },
      effects: [],
      combatantPatch: { isIncapacitated: true, canGesticulate: false },
      ui: {
        badgeColor: 'yellow',
        icon: 'star',
      },
    });
  }

  private loadCustomStatuses(): void {
    // TODO: 未来从 localStorage 或云端 API 加载 DM 自定义状态
    try {
      const raw = localStorage.getItem('dnd-custom-statuses');
      if (raw) {
        const custom: StatusDefinition[] = JSON.parse(raw);
        custom.forEach(def => this.register(def));
      }
    } catch {
      // 忽略加载错误
    }
  }
}

/** 全局单例 */
const statusLibrary = new StatusLibraryImpl();
export default statusLibrary;
