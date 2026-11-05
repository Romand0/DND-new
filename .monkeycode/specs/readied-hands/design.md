# 备战槽（Readied Hands）技术设计

Feature Name: readied-hands
Updated: 2026-11-05

## Description

角色卡上的手持属性（heldLeft/heldRight）重构为备战槽（readiedLeft/readiedRight，纯 childId 引用）；战斗层手持整体迁移到 Combatant（heldLeft/heldRight 含 HandState），进战时从备战槽初始化，战斗中读写全走参战者，放映快照自动覆盖，战斗结束不结算（武器本来就在背包）。角色卡 AC 重算移除持盾 +2。

## Architecture

```
┌─ 角色卡（持久） ─────────────────────────────┐
│  readiedLeft / readiedRight: string | null   │
│  （背包 childId 引用，备战互斥规则）          │
│  recalculateArmorClass：移除持盾分支          │
└──────────────┬───────────────────────────────┘
               │ 进战斗初始化（useInitiative.handleConfirmInitiative）
               ▼
┌─ Combatant（战斗临时，随 CombatRecord） ─────┐
│  heldLeft / heldRight: HandSlot              │
│  （state: ready|action|unavailable + id）    │
│  攻击弹窗 / 参战者弹窗 / 施法材料 / 投掷 /    │
│  computeCombatantAc 盾牌 → 全部读写此处       │
│  放映快照：combatant 整体快照自动覆盖         │
└──────────────────────────────────────────────┘
               │ 战斗结束
               ▼
        手持随记录保留，结算排除；角色卡只读备战槽
```

## Components and Interfaces

### 数据层

| 文件 | 改动 |
|------|------|
| `types/character.ts` | Character.heldLeft/heldRight → readiedLeft/readiedRight: string \| null；HandSlot/HandState 保留（战斗层复用，可迁至 combat.ts 或原地保留导出） |
| `types/combat.ts` | Combatant 新增 heldLeft?: HandSlot、heldRight?: HandSlot（可选字段，旧记录缺省视为空手） |
| `characterStore.ts` | load 兜底迁移（旧 held→readied、引用失效置 null、删除旧字段）；create 默认 null×2；removeEquipment 清备战槽；holdItem/unholdItem → setReadied/readiedLeftSlot 等备战版 API（互斥规则照搬）；recalculateArmorClass 删盾牌分支；isWeaponUsable 改为备战判定参数化（接收槽 id 对）供详情页攻击条目使用 |
| `combatStore.ts` | computeCombatantAc 盾牌读 combatant.heldLeft/heldRight；新增 setCombatantHand(recordId, combatantId, hand, slot)（写参战者 + update + notify）；新增 initCombatantHands(character): { heldLeft, heldRight }（备战→手持复制，双手武器同物品双手） |
| `spellFocus.ts` | getHeldIds 改收 Combatant（读 combatant.held） |

### 交互层

| 文件 | 改动 |
|------|------|
| `hooks/combat/useInitiative.ts` | handleConfirmInitiative 添加 PC 时调 initCombatantHands 写入参战者 |
| `CombatAttackModal.tsx` | 手持读取从 character.held → combatant.held；handleHoldSelect 改调 combatStore.setCombatantHand；悬空引用清理改在参战者槽上 |
| `CombatantInfoPanel.tsx` | 手持区读写改 combatant 层 |
| `useThrownDrop.ts` | 掉落判定读 combatant.held |
| `CombatSession.tsx` | 沙盘试验场 sandbox-longsword 装饰手持：移到 NPC 试验场参战者（或删除，行为不变） |

### 展示层

| 文件 | 改动 |
|------|------|
| `CharacterInventory.tsx` | 双手格 UI → 备战槽 UI（点选背包武器/盾牌设入，互斥规则沿用）；L/R 徽标 → 备 |
| `CharacterEquipmentCard.tsx` | 手持按钮 → 备战按钮（holdItem → 备战 API） |
| `CharacterDetail.tsx` | L/R 徽标 → 备；攻击条目可用性按备战匹配 |

## Data Models

```ts
// types/character.ts（替换）
/** 备战槽：进战斗时自动手持的背包物品 childId；null=空 */
readiedLeft: string | null;
readiedRight: string | null;

// types/combat.ts（Combatant 新增，可选字段保旧记录兼容）
heldLeft?: HandSlot;    // { state: 'ready'|'action'|'unavailable', equipmentId: string|null }
heldRight?: HandSlot;
```

### 备战互斥规则（照搬现有 holdItem 语义）

- 双手武器：设入任一槽 → 两槽同物品；已有双手武器时设入其他物品 → 先清两槽
- 盾牌/单手武器：占一手；另一手持双手武器 → 先清双手
- 设入物品已在该槽 → no-op
- 移除物品 / 物品从背包删除 → 对应槽置 null（双手物品两槽同清）

## Correctness Properties

1. 角色卡字段不变量：战斗期间 readiedLeft/readiedRight 值恒等于进战前的值（战斗操作只写 combatant.held）。
2. 迁移幂等性：load 兜底对同一份旧数据重复执行结果一致（旧字段被删、新字段已存在时跳过）。
3. AC 一致性：战斗参战者 AC 的盾牌判定与参战者手持严格同步（换手/卸盾后 AC 立即重算）。
4. 回溯一致性：放映回溯还原的 combatant 手持与该回合快照逐字节一致。
5. 结算无关性：buildSettlementPreview 与 settleCombat 的输出不包含手持槽条目。

## Error Handling

- 旧数据引用的物品已从背包删除 → 备战槽置 null（迁移与 removeEquipment 双保险）。
- 旧战斗记录无 combatant.held → 视为空手（可选字段缺省）；攻击弹窗的悬空引用清理逻辑照常工作。
- 备战引用指向非武器/盾牌物品（异常数据） → 备战操作入口只对武器/盾牌类目展示，读取侧按 childId 查背包失败时视为空手。

## Test Strategy

项目无自动化测试框架（此前已裁决跳过 vitest）。验证路径：

1. `npm run build` 类型 + 打包通过
2. 手动 E2E：
   - 旧角色卡加载 → 备战槽自动迁移 → 详情页「备」徽标正确
   - 背包页备战操作：单手/双手/盾牌互斥、卸下
   - 角色卡 AC：穿甲+盾备战 → AC 无 +2；进战斗 → 参战者 AC 含 +2
   - 攻击弹窗：默认武器可攻击；换手 → 写战斗层；角色卡 readied 字段不变
   - 放映回溯 → 手持还原
   - 结算 → 预览无手持条目
   - NPC 攻击链路不受影响；试验场正常

## References

[^1]: `src/data/combatStore.ts#L291` computeCombatantAc 盾牌分支
[^2]: `src/data/characterStore.ts#L1155` holdItem 互斥语义
[^3]: `src/components/CombatAttackModal.tsx#L118` 手持读取与切换
[^4]: `src/data/spellFocus.ts#L88` 施法材料持握判定
[^5]: `src/hooks/combat/useThrownDrop.ts#L131` 投掷掉落手持判定
[^6]: `.monkeycode/specs/combat-settlement/design.md` 延迟结算惯例（本设计沿用其「战斗临时数据挂 CombatRecord」思想）
