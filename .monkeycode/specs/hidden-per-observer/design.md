# 躲藏 per-observer 建模 + 入账被动察觉自动对抗 — 技术设计

## 背景

项目 1（状态投影 + roundsDm 双通道）已落地。当前 hidden 的剩余缺陷：
1. hide 入账只把观察者被动察觉写进提示文本，不做机械对抗（DM 脑内对抗）
2. hidden 是全局单实例：要么所有人看不见，要么所有人看得见，无 per-observer 粒度
3. 攻击优劣势（detectUnseen）只看感官（盲视/真实视觉），不看观察者被动察觉是否看破

## 模型

hidden 实例 `metadata` 增加可选 `unseenBy: string[]`（对该躲藏者无法定位的参战者 ID 列表）：
- **缺省（legacy）** = 对所有无法靠感官看破的观察者隐藏（本次改造前的行为，老数据兼容）
- **数组** = 只对这些观察者隐藏；不在列表中的观察者已看破位置

### 被动对抗规则（入账时自动结算）

观察者 O 的隐藏成立条件：`stealthTotal >= PP(O)`

- PP(O) = `combatant.passiveChecks?.perception ?? 10`
- 隐匿检定对抗 DC=被动察觉，达成 DC 即成功（平局隐藏成立）；与搜索「平局维持隐蔽」一致
- 观察者集合 = 除躲藏者外、存活且清醒的参战者（昏死观察者不参与）
- 全部看破（unseenBy 为空）仍创建实例（DM 可见 + 警告），但无任何机械收益；搜索也找不到目标

### 消费（优势劣势）

`advantageRules.detectUnseen` 增加 per-observer 门控：
- 攻击者躲藏：优势 iff `isHiddenFrom(attacker, target)`（target ∈ unseenBy，legacy=全部）且目标感官未看破
- 目标躲藏：劣势 iff `isHiddenFrom(target, attacker)` 且攻方感官未看破
- invisible 保持现状（无 passive 对抗，仅真实视觉看破）

### 搜索（per-observer 揭晓）

`resolveSearch` 成功时（total > stealthTotal）：
- 实例带 unseenBy → 仅把搜索者从 unseenBy 移除；移除后为空则 declareEnd
- legacy 实例（无 unseenBy）→ declareEnd（旧行为）

新增 `statusManager.patchMetadata(instanceId, partial)`（emit 'update' 事件），用于就地更新 unseenBy。

## 落点

| 文件 | 改动 |
|------|------|
| `src/data/hiddenRules.ts`（新） | `contestHide` / `collectHideObservers` / `isHiddenFrom` / `getHiddenInstance`（从 searchRules 迁入） |
| `src/types/status.ts` | StatusChangeEvent.type 加 `'update'` |
| `src/data/statusManager.ts` | `patchMetadata(instanceId, partial)`（接口+实现，emit 'update'） |
| `src/data/searchRules.ts` | resolveSearch per-observer 揭晓；getHiddenInstance 改从 hiddenRules 导入 |
| `src/data/advantageRules.ts` | detectUnseen 加 `isHiddenFrom` 门控（hidden 分支；invisible 不变） |
| `src/types/realtime.ts` | RosterStatusEntry 加 `unseenBy?: string[]` |
| `src/hooks/combat/useCombatBroadcast.ts` | projectStatuses 透传 unseenBy |
| `src/lib/turnCommitApply.ts` | hide 分支：collect+contest → metadata.unseenBy；opCtx.hide 观察者带 unseen 标记 |
| `src/lib/combatActionSummary.ts` | hide DM 明细：观察者逐项「未察觉/看破（PP X）」 |
| `src/pages/CombatSession.tsx` | hideFor：contest → unseenBy + 逐项明细/警告；搜索走新 resolveSearch |
| `src/data/engines/resourceConvEngine.ts` | hide 转换路径同样 contest |
| `src/components/spectate/SpectatorBoard.tsx` | 幽灵化 per-observer：我方角色全在 unseenBy（或 legacy/无自方角色）才幽灵化 |
| `src/components/spectate/MyCombatantPanel.tsx` | hidden 徽章附「对 N 个观察者隐蔽 / 已被全部看破」 |

## 不做

- 隐形（invisible）per-observer 化（无 passive 对抗语义）
- 中途加入参战者的自动重对抗（DM 手动重开躲藏即可）
- 玩家端按观察者拆表（表格徽章保持隐藏不显示，透传数据已在线）

## 验证

- 新探针 `probe-hidden-per-observer.cjs`：contestHide 平局/看破、hide op 落 unseenBy、DM 明细逐项、detectUnseen per-observer 优势差异、resolveSearch 逐观察者揭晓与空集结束、legacy 兼容、patchMetadata 生效
- 回归：probe-search（legacy 路径）/ probe-status-projection / probe-reaction
- `npx tsc -p tsconfig.app.json --noEmit && npm run build`
