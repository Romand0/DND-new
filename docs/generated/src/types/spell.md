# src/types/spell.ts

## 功能概述
`src/types/spell.ts` 文件定义了一个 TypeScript 接口 `Spell`，用于描述一个法术（Spell）的数据结构。该接口包含了法术的基本属性，如名称、等级、学派、施法时间、施法距离、成分、持续时间、描述、所属职业等，以及一些可选属性，如是否为仪式法术、是否需要专注、来源等。该文件的存在是为了提供统一的法术数据模型，方便项目中的其他模块对法术进行操作和引用。

## 主要导出/接口
```typescript
export interface Spell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
  };
  duration: string;
  description: string;
  classes: string[];
  notes?: string;
  ritual?: boolean;         // 是否为仪式法术
  concentration?: boolean;  // 是否需要专注
  source?: string;          // 来源书，如 "PHB"、"TCE"
  hasHeightened?: boolean;
  heightenedEffect?: string;
  materialInfo?: string;
}
```

## 核心实现说明
`Spell` 接口包含了以下关键属性：

- `id`: 法术的唯一标识符，通常为字符串类型。
- `name`: 法术的名称，通常为字符串类型。
- `level`: 法术的等级，通常为数字类型。
- `school`: 法术所属的学派，通常为字符串类型。
- `castingTime`: 施法时间，描述施法所需的时间，通常为字符串类型。
- `range`: 施法距离，描述施法所能达到的距离，通常为字符串类型。
- `components`: 法术的成分，包括言语、姿势和材料，每个成分都是一个布尔值。
- `duration`: 法术的持续时间，描述法术持续的时间，通常为字符串类型。
- `description`: 法术的详细描述，通常为字符串类型。
- `classes`: 法术所属的职业，通常为字符串数组类型。
- `notes`: 法术的备注信息，为可选属性，通常为字符串类型。
- `ritual`: 是否为仪式法术，为可选布尔属性。
- `concentration`: 是否需要专注，为可选布尔属性。
- `source`: 法术来源书籍，为可选字符串类型。
- `hasHeightened`: 是否有增强效果，为可选布尔属性。
- `heightenedEffect`: 增强效果描述，为可选字符串类型。
- `materialInfo`: 材料信息，为可选字符串类型。

`Spell` 接口被项目中的多个模块引用，如法术列表、法术详情页等，用于展示和操作法术数据。

## 注意事项或使用方式
在使用 `Spell` 接口时，应确保传入的数据符合接口定义的属性类型和结构。在创建法术实例时，可以按照以下方式调用：

```typescript
const spell: Spell = {
  id: '1',
  name: '火焰球',
  level: 2,
  school: '火系',
  castingTime: '1动作',
  range: '120英尺',
  components: {
    verbal: true,
    somatic: true,
    material: true,
  },
  duration: '1轮',
  description: '投掷一个火球，对目标造成火焰伤害。',
  classes: ['法师', '术士'],
  notes: '需要火焰材料。',
  ritual: false,
  concentration: true,
  source: 'PHB',
  hasHeightened: false,
  heightenedEffect: '',
  materialInfo: '火焰材料：一小瓶火焰油。',
};
```

在使用前，请确保已正确安装 TypeScript 和相关依赖。
