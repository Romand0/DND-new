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

    // 通用优劣势状态（引擎）：攻击/检定/豁免的优势或劣势载体。具体方向、场景、
    // 属性限制全部由施加方（流程 apply_effect advantage 节点）注入 instance.metadata，
    // 经 advantageRules 的 condition 检测器读入检定结算——新增优劣势类法术
    // （妖火、克敌先机、真知术…）只需配节点参数，引擎与状态库零改动。
    // 约定：instance.metadata.effects: Effect[]（type: 'advantage'，
    // config: AdvantageEffectConfig{mode, scene, ability?, appliesTo?, label?}）。
    this.register({
      id: 'advantage',
      name: '优劣势',
      description: '临时性的攻击/检定/豁免优势或劣势载体，具体方向与范围由施加方定义。',
      shortDescription: '临时优劣势',
      startTrigger: {
        type: 'manual',
        description: '由流程施放（如妖火、克敌先机）或 DM 手动附加。',
      },
      endTrigger: {
        type: 'manual',
        description: '持续时间届满自动消退，或手动解除。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'sky',
        icon: 'trending-up',
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
          description: '攻击检定劣势',
        },
        {
          id: 'poisoned.check_disadvantage',
          type: 'check_disadvantage',
          target: 'self',
          description: '属性检定劣势',
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
          description: '力量和敏捷豁免自动失败',
        },
        {
          id: 'unconscious.incoming_attack_advantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'advantage', scene: 'attack', appliesTo: 'incoming' },
          description: '针对你的攻击检定有优势',
        },
        {
          id: 'unconscious.own_attack_disadvantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'disadvantage', scene: 'attack', appliesTo: 'self' },
          description: '你的攻击检定有劣势',
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
      effects: [
        {
          id: 'paralyzed.incoming_attack_advantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'advantage', scene: 'attack', appliesTo: 'incoming' },
          description: '针对你的攻击检定有优势',
        },
      ],
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
      effects: [
        {
          id: 'petrified.incoming_attack_advantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'advantage', scene: 'attack', appliesTo: 'incoming' },
          description: '针对你的攻击检定有优势',
        },
      ],
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
      effects: [
        {
          id: 'stunned.incoming_attack_advantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'advantage', scene: 'attack', appliesTo: 'incoming' },
          description: '针对你的攻击检定有优势',
        },
      ],
      combatantPatch: { isIncapacitated: true, canGesticulate: false },
      ui: {
        badgeColor: 'yellow',
        icon: 'star',
      },
    });

    // 通用伤害修饰状态（引擎）：抗性/免疫/易伤的载体实例。具体伤害类型、来源限制、
    // 持续时长全部由施加方（流程 apply_effect status 节点）注入 instance.metadata，
    // 经 combatAffinities.buildStatusAffinities 合并进伤害结算——新增防护类法术
    // 只需配节点参数，状态库零改动。
    // 约定：instance.metadata.effects: Effect[]（type: damage_resistance 等，
    // config: { types?, sourceKind?, magical?...}）；durationRounds>0 时注入 expiresAt。
    this.register({
      id: 'damage_affinity',
      name: '伤害修饰',
      description: '临时性的伤害抗性/免疫/易伤效果载体，具体类型由施加方定义。',
      shortDescription: '临时伤害修饰',
      startTrigger: {
        type: 'manual',
        description: '由流程施放（如防护类法术）或 DM 手动附加。',
      },
      endTrigger: {
        type: 'manual',
        description: '持续时间届满自动消退，或手动解除。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'amber',
        icon: 'shield',
      },
    });

    // 检定奖惩（祝福术 / 灾祸术 等）：实例级效果承载具体参数
    // （effect.type='check_modifier'，config 见 types/combat.ts CheckModifierEffectConfig）。
    // 与 damage_affinity 同款通用载体：新增奖惩类法术只需流程节点配参数，状态库零改动。
    this.register({
      id: 'check_modifier',
      name: '检定奖惩',
      description: '临时性的检定数值平移效果载体（如祝福术 1d4），具体参数由施加方定义。',
      shortDescription: '临时检定奖惩',
      startTrigger: {
        type: 'manual',
        description: '由流程施放或 DM 手动附加。',
      },
      endTrigger: {
        type: 'manual',
        description: '持续时间届满自动消退，或手动解除。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'violet',
        icon: 'dice',
      },
    });

    // 狂暴（野蛮人核心机制，主动技能引擎 status 通道挂载）：优劣势效果由施加方以
    // instance.metadata.effects 注入（力量检定/力量豁免优势，AdvantageEffectConfig），
    // 近战伤害加值与物理抗性属数值/结算裁定，走 TurnTodo 提醒 DM 手动结算。
    // 叠加按缺省 replace：再次狂暴刷新持续时间（提前结束规则由待办文案提醒）。
    this.register({
      id: 'rage',
      name: '狂暴',
      description: '力量检定与力量豁免优势；力量近战武器攻击伤害获得加值；对钝击/穿刺/挥砍伤害具备抗性。回合内既未攻击也未受到伤害则提前结束。',
      shortDescription: '力量检定/豁免优势 + 近战伤害加值 + 物理抗性',
      startTrigger: {
        type: 'manual',
        description: '野蛮人用附赠动作发动狂暴。',
      },
      endTrigger: {
        type: 'manual',
        description: '持续 1 分钟（10 轮）；回合内未攻击且未受伤则提前结束，或主动解除。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'red',
        icon: 'flame',
      },
    });

    // 渗透劲·劲力标记（散打宗 17 级）：震慑拳 rider 埋劲后挂载在目标身上的延迟引爆载体。
    // 无任何机械效果——目标只是被标记；引爆（体质豁免 HP0 / 10d10 暗蚀）由 DM 主动发起，
    // metadata.attackerId 记录施劲者（引爆入口按此找目标），同时仅一个生物受影响（挂载前扫旧实例解除）。
    this.register({
      id: 'quivering_palm',
      name: '渗透劲·劲力',
      description: '武僧的劲力已埋入你体内。施劲武僧可用动作终结你（体质豁免失败生命归 0、成功受 10d10 暗蚀伤害），也可无害解除。',
      shortDescription: '劲力埋体：施劲者可动作引爆（体豁 HP0 / 10d10 暗蚀）',
      startTrigger: {
        type: 'manual',
        description: '武僧近战命中时消耗 3 气（伤害结算弹窗「命中触发」勾选）。',
      },
      endTrigger: {
        type: 'manual',
        description: 'DM 引爆（耗施劲者动作）或无害终止（零消耗）；武僧死亡或再埋新目标时旧标记解除。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'amber',
        icon: 'zap',
      },
    });

    // P6-2 战技失败状态（战斗大师 rider 豁免失败挂载；手动声明，DM 可随时解除）
    this.register({
      id: 'prone',
      name: '倒地',
      description: '唯一移动方式为爬行（每尺额外消耗 1 尺移动）。起身需要消耗一半速度。你的攻击检定有劣势；5 尺内对你发动近战攻击的生物有优势；5 尺外对你发动的远程攻击检定有劣势。',
      shortDescription: '倒地：攻击劣势 / 5 尺内近战对你优势 / 远程对你优势',
      startTrigger: {
        type: 'manual',
        description: '手动声明：摔绊类战技/法术/地面效果触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '起身（消耗一半移动）或被扶起（半速）。',
      },
      duration: { type: 'permanent' },
      effects: [
        {
          id: 'prone.own_attack_disadvantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'disadvantage', scene: 'attack', appliesTo: 'self' },
          description: '你倒地：攻击检定有劣势',
        },
        {
          id: 'prone.incoming_melee_advantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'advantage', scene: 'attack_melee', appliesTo: 'incoming' },
          description: '倒地者 5 尺内近战攻击对你有优势',
        },
        {
          id: 'prone.incoming_ranged_advantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'advantage', scene: 'attack_ranged', appliesTo: 'incoming' },
          description: '5 尺外远程攻击对你有优势（倒地）',
        },
      ],
      ui: {
        badgeColor: 'orange',
        icon: 'arrow-down',
      },
    });

    this.register({
      id: 'frightened',
      name: '恐惧',
      description: '你对恐惧源的攻击检定有劣势，且不能自愿向恐惧源移动。',
      shortDescription: '恐惧：对恐惧源攻击劣势 / 不能靠近',
      startTrigger: {
        type: 'manual',
        description: '手动声明：恐惧类战技/法术/威吓效果触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '效果持续时间届满或豁免成功解除。',
      },
      duration: { type: 'permanent' },
      effects: [
        {
          id: 'frightened.attack_disadvantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'disadvantage', scene: 'attack', appliesTo: 'self' },
          description: '你对恐惧源的攻击检定有劣势（距离来源由 DM 把握）',
        },
      ],
      ui: {
        badgeColor: 'purple',
        icon: 'ghost',
      },
    });

    this.register({
      id: 'goaded',
      name: '挑衅',
      description: '挑衅者在你 5 尺内时，你对挑衅者之外的生物攻击检定有劣势。',
      shortDescription: '挑衅：对挑衅者以外目标攻击劣势',
      startTrigger: {
        type: 'manual',
        description: '手动声明：挑衅类战技触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '效果持续时间届满或挑衅者倒地/离场。',
      },
      duration: { type: 'permanent' },
      effects: [
        {
          id: 'goaded.attack_disadvantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'disadvantage', scene: 'attack', appliesTo: 'self' },
          description: '你对挑衅者之外的攻击有劣势（挑衅者位置由 DM 把握）',
        },
      ],
      ui: {
        badgeColor: 'red',
        icon: 'target',
      },
    });

    this.register({
      id: 'disarmed',
      name: '缴械',
      description: '一件手持武器被击落在地（落在目标占据格内或相邻格）。拾取需要自由互动或动作（DM 把握）。',
      shortDescription: '缴械：手持武器落地待拾取',
      startTrigger: {
        type: 'manual',
        description: '手动声明：缴械类战技豁免失败触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '重新拾取武器或换持其他物品。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'zinc',
        icon: 'sword',
      },
    });

    // 散打技巧第三项（武僧散打宗 3 级）：疾风连击命中目标封锁反应至施用者下回合结束。
    // 无优劣势引擎效果——反应可用性由反应通道（reactionRules detectReactions）读取此状态裁决。
    this.register({
      id: 'no_reactions',
      name: '无法反应',
      description: '该目标无法执行反应（散打技巧命中效应），持续至施用者下一回合结束。',
      shortDescription: '无法执行反应',
      startTrigger: {
        type: 'manual',
        description: '手动声明：散打技巧「封锁反应」效应触发。',
      },
      endTrigger: {
        type: 'manual',
        description: '效果持续时间届满（施用者下一回合结束）。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'slate',
        icon: 'shield-off',
      },
    });

    this.register({
      id: 'dodging',
      name: '回避',
      description: '你专注于回避攻击：至你的下一回合开始前，你可见的敌人对你发动的攻击检定（近战/远程/法术攻击）具有劣势；你的敏捷豁免检定具有优势（豁免法术不受影响）。陷入失能或可用速度归零（能力上，缠绕/约束等）时增益立即失效。',
      shortDescription: '回避：攻击对你劣势 / 敏捷豁免优势（失能或速度归零即失效）',
      startTrigger: {
        type: 'manual',
        description: '手动声明：基础动作「回避」（消耗 1 动作）。',
      },
      endTrigger: {
        type: 'manual',
        description: '你的下一回合开始；或陷入失能 / 可用速度归零（增益读取时判定失效）。',
      },
      duration: { type: 'permanent' },
      effects: [
        {
          id: 'dodging.incoming_attack_disadvantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'disadvantage', scene: 'attack', appliesTo: 'incoming', label: '回避（攻击劣势）' },
          description: '可见敌人对你发动的攻击检定具有劣势（含法术攻击，豁免法术除外）',
        },
        {
          id: 'dodging.dex_save_advantage',
          type: 'advantage',
          target: 'self',
          config: { mode: 'advantage', scene: 'saving_throw', ability: 'dexterity', appliesTo: 'self', label: '回避（敏捷豁免优势）' },
          description: '你的敏捷豁免检定具有优势',
        },
      ],
      ui: {
        badgeColor: 'sky',
        icon: 'shield',
      },
    });

    // 撤离（disengage 基础动作）：无优劣势引擎效果——借机攻击抑制由反应通道
    //（reactionRules detectReactions）读取此状态裁决，与 no_reactions 同构。
    // 5e 语义：你的移动不引发借机攻击；本项目按「至你的下回合开始」锚定（与 dodging 一致）。
    this.register({
      id: 'disengaging',
      name: '撤离',
      description: '你采取撤离动作：至你的下回合开始前，你移动离开敌人触及范围不会引发借机攻击。',
      shortDescription: '撤离：移动不引发借机攻击',
      startTrigger: {
        type: 'manual',
        description: '手动声明：基础动作「撤离」（消耗 1 动作），或特性转换（灵巧动作等）。',
      },
      endTrigger: {
        type: 'manual',
        description: '你的下一回合开始解除。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'emerald',
        icon: 'footprints',
      },
    });

    // 躲藏：可见性状态（无自动优劣势 effect——unseen 检测器按目标状态 + 攻方感官裁定）
    this.register({
      id: 'hidden',
      name: '躲藏',
      description: '你已躲藏：未被观察者定位前，针对你的攻击具有劣势、你的攻击具有优势（盲视/真实视觉尺数内不受影响）；首次攻击或被发现后解除。',
      shortDescription: '躲藏：攻方劣势 / 己方优势（一攻揭晓）',
      startTrigger: {
        type: 'manual',
        description: '手动声明：基础动作「躲藏」（消耗 1 动作，隐匿检定对抗观察者被动察觉）。',
      },
      endTrigger: {
        type: 'manual',
        description: '发起攻击结算后；或被观察者搜索察觉（DM 手动解除）。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'violet',
        icon: 'eye-off',
      },
    });

    // 隐形：可见性状态（一攻不揭晓，仅真实视觉可看破）
    this.register({
      id: 'invisible',
      name: '隐形',
      description: '你处于隐形状态：未被真实视觉定位前，针对你的攻击具有劣势、你的攻击具有优势。',
      shortDescription: '隐形：攻方劣势 / 己方优势（真实视觉看破）',
      startTrigger: {
        type: 'manual',
        description: '手动声明：法术或能力效果（如隐形术）。',
      },
      endTrigger: {
        type: 'manual',
        description: '效果结束（DM 手动解除）。',
      },
      duration: { type: 'permanent' },
      effects: [],
      ui: {
        badgeColor: 'indigo',
        icon: 'ghost',
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
