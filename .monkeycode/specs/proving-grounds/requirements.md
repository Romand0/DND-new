# Requirements Document — 试验场（Proving Grounds）

Updated: 2026-10-24
Status: CONFIRMED（用户已裁定三分叉：影子角色卡 / 普通列表带徽标 / 无建队概念）

## Introduction

为 DM 提供一个开发者试验场，用于随时打开、随时测试个别功能点：一键生成敌对/己方人偶（无需考虑具体数值），人偶可操控（攻击/施法/检定），试验体拥有全库调用能力（武器/护甲/法术），可为任意参战者附加任意状态。核心配套是一块精密仪表盘，实时展示参战者各项实际生效数值（尤其被状态影响的），数据源与真实战斗引擎完全同源、高度同步可信。模拟与放映两种模式与正式战斗一致。

## Glossary

- **试验场**：面向 DM 的沙盒战斗会话，一条常驻特殊战斗记录（isProvingGround），入口即开即用
- **人偶**：试验场中快速生成的参战者，默认数值（属性 10、HP/AC 适中），当沙包或行为测试载体
- **影子角色卡**：生成人偶时自动创建的隐藏角色卡（isSandbox 标记），使人偶复用完整 PC 装备/法术链路
- **试验体**：拥有全库调用权限的参战者（试验场内所有人偶均为试验体）
- **全库调用**：绕过「角色卡已拥有」限制，直接从装备库/法术库选用任意条目
- **仪表盘**：参战者详情面板中的试验场专属区块，只读展示实际生效数值 + 快捷豁免掷骰
- **模拟模式**：record.mode='simulation'，动作无限、可随意推演（试验场默认）
- **放映模式**：record.mode='playback'，回合制推进、动作消耗、待办、回溯，与正式战斗一致

## Requirements

### R1 入口与常驻试验场

**User Story:** AS DM，I want 随时一键进入试验场，so that 测试一个功能点时无需任何前置准备。

#### Acceptance Criteria

1. WHEN DM 点击试验场入口，THE system SHALL 打开常驻试验场战斗会话（首次进入自动创建记录与沙盘，后续进入复用同一条记录）。
2. THE system SHALL 在战斗列表中以可见标识区分试验场记录。
3. WHEN DM 删除试验场记录，THE system SHALL 执行与普通战斗一致的删除；下次进入时重新自动创建。

### R2 一键生成人偶

**User Story:** AS DM，I want 一键生成敌对/己方人偶，so that 秒级搭好测试对象而无需关心数值。

#### Acceptance Criteria

1. WHEN DM 点击「生成敌对人偶」，THE system SHALL 以默认数值（属性全 10、HP 20、AC 10、速度 30、基础徒手攻击）生成敌对参战者并立即入队。
2. WHEN DM 点击「生成己方人偶」，THE system SHALL 以同样默认数值生成己方参战者并立即入队。
3. WHEN DM 从图鉴选择模板添加，THE system SHALL 以模板全字段快照生成敌对参战者（用于测试真实怪物数据）。
4. WHEN DM 从角色列表选择角色卡导入，THE system SHALL 以角色卡引用（characterId）生成己方参战者。
5. WHEN 人偶生成，THE system SHALL 同步创建影子角色卡（isSandbox 标记）并建立 characterId 引用；影子卡在角色列表中隐藏且不参与云端同步。
6. WHEN 人偶入队，THE system SHALL 同步在沙盘放置对应棋子（复用会话内加人逻辑）。

### R3 全库调用——武器与护甲

**User Story:** AS DM，I want 试验场参战者调用装备库任意武器与护甲，so that 测试攻击/伤害/AC 链路时无需预先制备装备。

#### Acceptance Criteria

1. WHEN 人偶打开装备调用面板，THE system SHALL 展示装备库全部条目（支持筛选）。
2. WHEN DM 为人偶选用武器，THE system SHALL 将装备实例加入人偶背包并可直接手持（走现有手持/攻击链路，含弹药/装填属性）。
3. WHEN DM 为人偶选用护甲，THE system SHALL 将装备实例加入人偶背包并可穿戴（AC 按现有穿戴规则重算）。

### R4 全库调用——法术

**User Story:** AS DM，I want 试验场参战者施放法术库任意法术，so that 可验证任意法术流程与效果结算（含施法者与受术者双向测试）。

#### Acceptance Criteria

1. WHILE 战斗记录为试验场，THE system SHALL 在法术弹窗列出法术库全部法术（支持搜索），对所有参战者生效。
2. WHEN DM 从列表选择法术施放，THE system SHALL 走现有施放管线（手动步骤化或绑定流程，与正式战斗一致）。

### R5 状态附加

**User Story:** AS DM，I want 为任意参战者附加状态库任意状态，so that 可测试状态对攻防/伤害修饰/回合推进的影响。

#### Acceptance Criteria

1. WHEN DM 在参战者详情打开状态附加面板，THE system SHALL 列出状态库全部状态并支持一键附加/解除。
2. WHEN DM 附加伤害修饰类效果，THE system SHALL 走通用 damage_affinity 状态（可选伤害类型/来源/优劣势方向/持续回合）。
3. IF 目标参战者已持有同名状态，THE system SHALL 按现有 stacking 规则（replace，刷新时长）处理。
4. WHEN 参战者被附加状态，THE system SHALL 在仪表盘立即回显生效状态清单（含剩余回合）。

### R6 试验仪表盘

**User Story:** AS DM，I want 一块精密仪表盘展示人偶各项实际生效数值，so that 特殊效果（尤其状态影响）是否真正生效一目了然且可信任。

#### Acceptance Criteria

1. THE system SHALL 在试验场参战者详情面板展示仪表盘区块，数据源与战斗引擎同源（combatStore/globalStatusManager/combatAffinities），纯只读派生。
2. THE system SHALL 展示六属性与调整值、AC 实际生效值、速度实际生效值（含 speedModifier）、动作/附赠动作余量。
3. THE system SHALL 展示六项豁免的实际加值（属性调整值 + 熟练 × PB + 状态修饰，与法术豁免检定同一计算路径）。
4. THE system SHALL 展示当前状态清单（名称/剩余回合/实例效果摘要）、伤害亲和合集（模板快照 + 状态注入合并视图）、待消费优劣势标记。
5. WHEN DM 点击任一豁免项，THE system SHALL 以该豁免实际加值掷 d20 并显示结果（操控人偶接受检定，如魅惑后的魅力豁免）。
6. WHEN 任一数据源变更（状态附加/过期/装备变更/回合推进），THE system SHALL 实时刷新仪表盘展示。

### R7 模式

1. THE system SHALL 在试验场创建时默认使用模拟模式。
2. WHEN DM 切换到放映模式，THE system SHALL 启用与正式战斗一致的回合推进/动作恢复/回合待办/回溯机制。

## Key Decisions（用户裁定）

1. **影子角色卡**：人偶底层自动创建 isSandbox 影子卡，装备/穿戴/AC/弹药/背包派生全复用现有 PC 链路。
2. **普通列表带徽标**：试验场记录与正式战斗同列表，卡片加「试验场」标识。
3. **无建队概念**：入口即进会话，人偶会话内随时生成；无事前编排页。
