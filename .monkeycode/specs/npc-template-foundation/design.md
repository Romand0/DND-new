# NPC 模板前置开发（怪物图鉴 2014 自动入库）— 技术设计

Feature Name: npc-template-foundation
Updated: 2026-10-19

## Description

把《怪物图鉴》（Monster Manual 2014，`data/DND5e_chm/怪物图鉴/`）的 ~300 张数据卡通过 build-time 解析器转成种子 JSON，补全 `NpcTemplate` 类型（熟练加值、豁免熟练、技能、抗性/免疫、骰式 HP、结构化特性），经首启种子预置 + 数据管理页手动重导进入 `npcTemplateStore`，最终让 NPC 参战者携带 Phase 3 流程引擎所需的完整身份数据（templateId / proficiencyBonus / savingThrows）。

关键现实：图鉴 HTML 为 Word 导出的脏标记（`MsoNormal` 类 + 内联样式 + `FONT` 标签），GBK/GB18030 编码；单文件可能含多张数据卡；源书存在笔误（如「魅（12」漏字）。解析器以「剥标签 → 行模式匹配 → 缺失进报告」为总策略，禁止臆造数值。

## Architecture

```mermaid
graph LR
    A["怪物图鉴 2014 HTML（只读）"] --> B["scripts/parse-monsters.mjs"]
    B --> C["src/data/npcTemplates.json"]
    B --> D["scripts/parse-monsters-report.md"]
    C --> E["npcTemplateStore.ensureSeeded（首启预置）"]
    C --> F["DataManagement 重新导入（templateId 去重）"]
    E --> G["NpcCreator 模板搜索/筛选"]
    F --> G
    G --> H["Combatant（templateId + PB + 豁免熟练）"]
    H --> I["Phase 3 flowCompiler 身份映射（预留）"]
```

数据流单向：图鉴（只读）→ 解析器 → 种子 JSON → store。解析器零 npm 依赖（Node 内置 `TextDecoder('gb18030')` + 正则），与仓库「不全书搜索零依赖」纪律一致。

## Components and Interfaces

### 1. `scripts/parse-monsters.mjs`（新增，build-time）

Node ESM 脚本，CLI：`node scripts/parse-monsters.mjs [--check]`。

- 输入目录：`data/DND5e_chm/怪物图鉴/{不死生物,元素生物,天界生物,巨人,异怪,怪兽,构装生物,植物,泥怪,类人生物,精类,邪魔,野兽,龙类,非玩家角色}/**/*.htm|.html`；`资料/`、`模板生物/` 与前言/附录排除。
- 解析管线：
  1. `Buffer` 读文件 → `TextDecoder('gb18030', { fatal: false })` 解码（失败自动降级 latin1 并记报告）
  2. 结构化剥标签：`<br>`/`</P>`/`</TR>`/`<LI>` → 换行；其余标签剔除；实体解码（`&nbsp;` 等）；连续空行折叠
  3. 数据卡切分：以「护甲等级：」为锚，向前回溯找名称行与体型/阵营行，向后收集至「挑战等级：」行；单文件多锚即多卡
  4. 字段行匹配（按 §Data Models 的正则表）；六维采用「标签正则优先、位置序兜底」双策略消化源书笔误
  5. 动作条目解析：`近战/远程武器攻击：命中+N，触及/射程 A/B 尺…命中：K（XdY+Z）点[伤害类型]伤害` → `NpcAttack`；多重攻击等非攻击条目进 traits
- 输出：
  - `src/data/npcTemplates.json`：按 templateId 排序、固定键序（构造对象顺序即键序）、`JSON.stringify(v, null, 2)`，幂等
  - `scripts/parse-monsters-report.md`：文件级统计（处理/成功/多卡/失败）+ 字段级缺失清单（文件、字段、原文片段）
- `--check` 模式：重跑并与现有 JSON 比对字节一致性，供 CI/回归
- 硬约束：对 DND5e_chm 只读；解析器不写任何运行时代码路径

### 2. `src/types/combat.ts` — NpcTemplate v2（只增不改）

```ts
export interface NpcTemplate {
  // ... 既有字段全部保持
  proficiencyBonus?: number;
  savingThrows?: AbilityName[];            // 复用 character.ts 的六维联合类型
  skills?: { name: string; bonus: number }[];
  hpDice?: string;                          // "11d8+44"
  damageResistances?: string[];             // 中文标签数组，如 ["火焰","毒素"]
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  conditionImmunities?: string[];
  speedNotes?: string;                      // "飞行 90 尺，游泳 30 尺"
  traits?: { name: string; text: string }[];
  xp?: number;
  source?: string;                          // 种子写入 "怪物图鉴 2014"
}
// NpcAttack 增：
note?: string;                              // 条目附加文本（如"若勇士剩余一半以上生命值则外加 7（2d6）点"）
```

`npcTemplateStore.load()` 兜底表同步扩展：全部新字段 `?? undefined` / 数组 `?? []`，旧 localStorage 数据零报错（承接既有 `savingThrows`/`skills` 透传行为并正式入类型）。

### 3. `src/data/npcTemplateStore.ts` — 种子与导入

- `ensureSeeded()`：`localStorage` 键 `dnd-npc-templates` 为空且 `dnd-npc-templates-seeded` 标记不存在时，将种子 JSON 全量写入并置标记；标记存在则跳过（用户删除后不被复活）。在 `load()` 首次调用前由模块顶层触发一次。
- `importSeed(options: { overwrite?: boolean }): ImportStats`：按 `templateId` 匹配现有模板；默认只补缺失（`skipped` 计数）；`overwrite: true` 时覆盖解析自有字段、保留 `id`/`createdAt`；返回 `{ created, updated, skipped }`。
- 种子经静态 `import seed from '@/data/npcTemplates.json'`（与 equipments.json 同模式进主 chunk；体积上涨在可接受范围，构建时观察 vite chunk 警告）。

### 4. `src/pages/DataManagement.tsx` — 重导入入口

新增「怪物图鉴」卡片：按钮触发 `npcTemplateStore.importSeed({ overwrite })`（覆盖开关为页内 checkbox），结果行展示「新增 N / 更新 N / 跳过 N」。无云端调用。

### 5. 复用既有怪物图鉴模块（用户裁决修正）

**概念修正**：NPC 模板库的本质即「怪物图鉴」模块，且 UI 已存在——`/monsters` 路由的 `MonsterList` 页（搜索 + 类型/CR/体型筛选 + sessionStorage 持久化 + `MonsterCard` 网格 + `MonsterEditor` 维护）读的就是 `npcTemplateStore`。种子入库后图鉴页自动呈现 ~300 条目，零改动。

**新增 `src/components/MonsterPicker.tsx`（从 MonsterList 抽取筛选机制）**：props `{ onSelect(template), selectedId?, emptyHint? }`，内含名称搜索 + 类型/CR/体型筛选（sessionStorage key 独立命名空间 `npcCreator.monsterPicker.*`）+ MonsterCard 网格。

**`NpcCreator` choose 阶段改造**：朴素模板列表替换为 `<MonsterPicker onSelect={handleSelectTemplate} />`，交互主文案改为「从怪物图鉴选取」；「自定义 NPC」按钮保留为次入口（家养怪物）。MonsterList 本体本期保持不动（逻辑以 MonsterPicker 为后续统一目标，另起任务）。

## Data Models

种子 JSON 条目示例（键序固定）：

```json
{
  "templateId": "orc-war-chief",
  "name": "兽人军官",
  "nameEn": "Orc War Chief",
  "cr": "2",
  "xp": 450,
  "proficiencyBonus": 2,
  "size": "中型",
  "type": "类人生物",
  "alignment": "任意混乱阵营",
  "ac": 16,
  "acNote": "链甲",
  "maxHp": 93,
  "hpDice": "11d8+44",
  "speed": 30,
  "speedNotes": "",
  "strength": 18, "dexterity": 11, "constitution": 16,
  "intelligence": 8, "wisdom": 9, "charisma": 9,
  "savingThrows": [],
  "skills": [{ "name": "威吓", "bonus": 3 }],
  "senses": "黑暗视觉 60 尺，被动察觉 9",
  "languages": "通用语，兽人语",
  "damageResistances": [],
  "damageImmunities": [],
  "damageVulnerabilities": [],
  "conditionImmunities": [],
  "traits": [{ "name": "凶猛冲锋", "text": "……" }],
  "attacks": [{
    "name": "兽人巨斧", "attackBonus": "+4", "damage": "1d12+2",
    "damageType": "挥砍", "range": "触及5尺", "properties": [],
    "normalRange": 5, "maxRange": 5, "note": "……"
  }],
  "source": "怪物图鉴 2014",
  "creatureSize": 2,
  "creatureType": 8
}
```

报告格式：`| 文件 | 数据卡 | 状态 | 缺失字段 | 片段 |` 表 + 顶部汇总行。

字段正则表（解析器内部，键名即字段）：

| 字段 | 行锚与抽取 |
|------|-----------|
| ac | `护甲等级[:：]\s*(\d{1,2})`；括号内为 acNote |
| maxHp/hpDice | `生命值[:：]\s*(\d+)\s*（([0-9d+\-]+)）` |
| speed | `速度[:：]\s*(\d+)\s*尺`；余文进 speedNotes |
| 六维 | `(力量|敏捷|体质|智力|感知|魅力?)\s*（?（?\s*(\d{1,2})`，位置序兜底第 6 值 |
| savingThrows | `豁免[:：]` 后按 `(力量|敏捷|体质|智力|感知|魅力)\s*[+\-]` 扫 |
| skills | `技能[:：]` 后按 `([\u4e00-\u9fa5]{2,6})\s*([+\-]\d+)` 扫 |
| CR/PB/XP | `挑战等级[:：]\s*([\d/]+)` + `(\d[\d,]*)\s*XP` + `熟练加值\s*[+\-]?(\d+)`；PB 缺失按 CR 标准表推导并标 derived |
| 抗性组 | `(伤害抗性|伤害免疫|伤害易伤|状态免疫|免疫)[:：]` 按 `、/，/；` 切 |
| 攻击 | `（近战|远程|法器）武器攻击[:：]` 起，抽 `命中([+\-]\d+)`、`触及(\d+)尺`、`射程(\d+)/(\d+)尺`、`（([0-9d+\-]+)）点(.+?)伤害` |

## Correctness Properties

1. 幂等性：解析器重复运行产出字节一致的 JSON（`--check` 可验证）。
2. 完备性：处理的数据卡总数 = 报告中成功 + 失败条数；284+ 文件全覆盖（排除目录除外）。
3. 忠实性：抽查条目（≥3 个不同目录）逐字段等于原文；已知基准：兽人军官 AC 16（链甲）/ HP 93（11d8+44）/ 速度 30 尺。
4. 无臆造：任何字段解析失败即留空 + 报告，禁止占位猜测值。
5. 向后兼容：类型只增不改；旧 localStorage 数据经 load() 兜底打开零报错。
6. 只读性：解析器对 DND5e_chm 零写入。
7. 唯一性：templateId 全局唯一，撞名以目录前缀消歧。

## Error Handling

| 场景 | 处理 |
|------|------|
| GB18030 解码失败 | 降级 latin1 + 报告标注乱码风险 |
| 数据卡缺「护甲等级」锚 | 该卡不产出，文件级报告记「无法定位数据卡」 |
| 单字段正则未命中 | 字段留空 + 报告（文件/字段/原文片段），卡继续 |
| 六维标签残缺（笔误） | 位置序兜底；若仍不满 6 值则缺失值记 10 + 报告 |
| PB 缺失 | 按 CR 标准表推导 + 报告标 derived |
| 同文件无英文名 | templateId 用拼音化中文名 + 目录前缀 |
| 种子导入撞 templateId | 默认 skip；overwrite 模式仅覆盖解析字段 |
| 用户已删全部模板 | seeded 标记阻止复活 |

## Test Strategy

1. 解析器单测（脚本内建 `--check` + 抽查断言）：兽人军官、另选 2 个不同目录条目（龙类/怪兽各一），断言核心字段。
2. 报告人工走查：所有失败条目归类为「源书笔误可接受」或「正则需改进」，改进后重跑至失败清单收敛。
3. `npx tsc --noEmit` + `npm run build` 通过；观察 chunk 体积告警。
4. 浏览器走查：清空 localStorage 首启 → 模板自动预置；DataManagement 重导 → 统计正确；NpcCreator 搜索「兽人」→ 从模板创建参战者 → 参战者卡带 PB/豁免熟练；旧数据（改前导出样本）打开无报错。
5. 回归：战斗会话与既有 NPC 攻击流程（手持/弹药不受影响，NpcAttack 仅增 note）。

## References

- `src/types/combat.ts#L84` — NpcTemplate 现有定义
- `src/data/npcTemplateStore.ts#L32` — load() 兜底模式
- `src/data/equipmentStore.ts#L3` — 种子 JSON 静态导入先例
- `data/DND5e_chm/怪物图鉴/` — 数据源（只读）
- `.monkeycode/specs/npc-template-foundation/requirements.md` — 需求文档
