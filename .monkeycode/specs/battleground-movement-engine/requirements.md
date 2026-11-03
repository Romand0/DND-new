# Requirements Document — 沙盘移动引擎（方位判定 × 定向移动 × 路线规划）

## Introduction

为战斗沙盘补齐三项空间计算能力，形成统一的网格几何引擎：

1. **方位判定**：以 8 方位体系（含斜向，与切比雪夫网格对齐）描述棋子之间的相对方位，支持「敌方棋子远离我方棋子的一侧」裁决；
2. **定向移动**：强制位移引擎——DM 手动入口与流程节点（apply_effect 扩展参数）双入口，共用同一落位引擎；
3. **路线规划**：强制位移途中对禁行格的绕行搜索，绕行全程保持定向原则不变。

现状边界（侦查结论）：沙盘现有能力为切比雪夫距离计算（`chebyDist`）、落点式移动（`attemptMove` 直线计费）、终点级边界墙校验（`isCellBlocked`）；三项新能力均为零实现。本立项保持普通自愿移动的计费语义不变。

## Glossary

- **沙盘（Battleground）**：战斗的网格场地，small/medium/large 三档预设，数据挂 `battlegroundStore`
- **棋子（Token）**：参战者在沙盘上的位置表示（`TokenPosition`）
- **方位（Bearing）**：目标棋子相对参照棋子的 8 向扇区分类（正北/东北/正东/东南/正南/西南/正西/西北），同格单列
- **参照棋子（Origin）**：方位判定与方向裁决的基准棋子
- **强制位移（Forced Move）**：非自愿地把棋子沿裁决方向移动指定距离；消耗目标移动力为 0
- **落位引擎（Placement Engine）**：定向移动的核心执行体——沿方向逐格推进 + 落点合法性校验 + 绕行搜索，手动入口与流程绑定共用
- **禁行格（Blocked Cell）**：棋子不可进入的格子；来源包括边界墙涂白格（`paintedCells`）与流程禁行区
- **流程禁行区（Avoidance Zone）**：强制位移操作自带的规避区域属性——随单次位移生效、随位移结束消亡；流程绑定时由 forcedMove 配置参数定义，手动入口由 DM 点选
- **定向原则（Directional Invariant）**：绕行路径的每一步步向量属于主方向扇区（主方向及其两个相邻 45° 方向），保证净位移方向不变

## Requirements

### Requirement 1 — 方位判定引擎

**User Story:** AS DM，我希望系统以统一的 8 方位体系描述任意两棋子的相对方位，并直接给出「远离参照棋子的一侧」，以便推离类效果的裁决有单一权威实现。

#### Acceptance Criteria

1. THE system SHALL 将目标棋子相对参照棋子的位置分类为 8 方位扇区之一（正北/东北/正东/东南/正南/西南/正西/西北）；两棋子同格时分类为「同格」。
2. THE system SHALL 以切比雪夫网格 8 向（含斜向）作为方位体系，与 5 尺/格网格标准对齐。
3. WHEN 方向裁决请求为「远离参照棋子」，THE system SHALL 返回「参照棋子指向目标棋子」方位的相反扇区作为位移主方向。
4. WHEN 方向裁决请求为「朝向参照棋子」，THE system SHALL 返回「参照棋子指向目标棋子」方位作为位移主方向。
5. THE system SHALL 以纯函数形式提供方位判定，供手动入口、流程绑定与自审测试共用。

### Requirement 2 — 强制位移手动入口

**User Story:** AS DM，我想在沙盘上手动把一个棋子沿「远离/朝向参照棋子」方向推离指定距离，以便战技与怪物能力的推离效果有桌面可操作的载体。

#### Acceptance Criteria

1. WHEN DM 在沙盘选中棋子并触发强制位移操作，THE system SHALL 展示参照棋子选择、方向裁决（远离/朝向）与距离（格数）输入。
2. WHEN DM 确认强制位移，THE system SHALL 通过落位引擎沿裁决方向逐格移动目标棋子至多指定格数。
3. THE system SHALL 使强制位移消耗目标棋子的剩余移动力为 0（剩余移动力保持不变）。
4. WHEN 强制位移发生在放映模式，THE system SHALL 将位移纳入回滚快照与移动历史。
5. IF 目标棋子处于昏迷/死亡/失能状态，THE system SHALL 阻断强制位移并提示原因。

### Requirement 3 — 强制位移流程绑定

**User Story:** AS DM，我希望法术/战技流程能在效果结算时自动推离目标，以便推离效果随流程一键执行、无需二次手动操作。

#### Acceptance Criteria

1. THE system SHALL 在 apply_effect 节点配置中支持 forcedMove 参数组（参照来源 originMode、方向裁决、距离格数）。
2. WHEN 流程执行到含 forcedMove 配置的 apply_effect 节点，THE system SHALL 以效果目标为被位移棋子、按配置裁决方向，并调用与手动入口同一落位引擎执行位移。
3. THE system SHALL 保持手动入口与流程绑定共用同一落位引擎（单一事实源，零双轨实现）。

### Requirement 4 — 强制位移路线规划（绕行搜索）

**User Story:** AS DM，我希望强制位移途中自动绕开禁行格并保持推进方向不变，以便位移不被边界墙与效果区域直接截断。

#### Acceptance Criteria

1. WHEN 落位引擎推进的前方格为禁行格或被占用，THE system SHALL 在保持定向原则的前提下搜索绕行路径继续位移。
2. THE system SHALL 将定向原则定义为：绕行路径的每一步步向量属于主方向扇区（主方向及其两个相邻 45° 方向）。
3. THE system SHALL 使绕行消耗的步数计入强制位移总格数上限。
4. IF 绕行搜索在剩余距离内无可行路径，THE system SHALL 将棋子停在最后一个合法格，并在位移结果中标注截断位置。
5. THE system SHALL 在绕行搜索中把边界墙涂白格、规避区域格子与其他棋子占用格一律作为禁行格处理。

### Requirement 5 — 规避区域（forcedMove 自带属性）

**User Story:** AS DM，我希望强制位移在执行时可附带「本次规避区域」，以便推离路径自动绕开指定区域（如法术效果区、危险地形）。

#### Acceptance Criteria

1. THE system SHALL 将规避区域作为强制位移操作自身的属性（forcedMove 参数组的组成部分），随单次位移生效、随位移结束消亡。
2. WHEN 流程绑定强制位移，THE system SHALL 由 forcedMove 配置参数定义规避区域（区域中心 + 半径，运行时展开为格子集合）。
3. WHEN DM 使用手动入口，THE system SHALL 在弹窗中提供规避格点选（加入/移出本次规避集合）。
4. THE system SHALL 保持规避区域的生命周期与单次位移一致：位移完成后规避集合即失效，沙盘持久数据零残留。

## 范围外（Out of Scope）

- 普通自愿移动的计费语义改造（维持直线切比雪夫计费）
- 移动路径的 UI 预览动画
- 扩大推离距离的体型差规则（大型生物推不动等）——进待确认项
- 神奇倒退（fall prone）、拉拽（pull）方向反演以外的其他位移种类
