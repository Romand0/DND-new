# 躲藏 per-observer 建模 — 进度

## 阶段状态

- [x] 侦查：hidden 定义 / statusManager API / advantageRules detectUnseen / resourceConvEngine hide 分支 / 三条 hide 入账路径 / 搜索揭晓
- [x] design.md
- [x] 实现 P1：hiddenRules + patchMetadata + searchRules per-observer
- [x] 实现 P2：detectUnseen per-observer 门控
- [x] 实现 P3：三条入账路径 contest 落 unseenBy + DM 明细
- [x] 实现 P4：玩家端渲染 per-observer（幽灵化 / 徽章）
- [x] 探针 probe-hidden-per-observer 19 断言全绿 + 回归（search 20 / projection 11 / reaction 72）全绿
- [x] tsc + build 通过
- [x] 合 main 推送（main 合并后 tsc+build 通过；探针 19 + search 20 + manual-damage 23 全绿）

## 已决策

- unseenBy 缺省 = legacy「对全员隐藏」语义，老数据零迁移
- 平局（stealthTotal === PP）隐藏成立，与搜索平局维持隐蔽一致
- 全部看破仍建实例（DM 可见 + 警告），unseenBy=[] 无机械收益
- 攻击揭晓（breakHidden）保持全局移除，不做逐观察者揭晓
- 玩家端棋盘幽灵化：我方角色全在 unseenBy（或 legacy/无自方角色）才幽灵化
- SpectatorTable 徽章继续不渲染 hidden（防意外渲染）

## 下一步

合 main 推送。后续独立立项：③ 状态持久化进 CombatRecord（hidden 等战斗状态当前只在 statusManager 内存，刷新丢失）。
