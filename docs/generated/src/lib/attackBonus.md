# src/lib/attackBonus.ts

## 功能概述

该文件负责计算基于角色熟练项与武器属性的攻击加值。它定义了武器相关数据结构，提供了判断武器是否为远程武器、灵巧武器、扩展武器子分类、判断玩家是否熟练该武器以及计算武器攻击加值的函数。该文件的存在是为了确保攻击加值的计算符合游戏规则，并为游戏逻辑提供必要的支持。

## 主要导出/接口

### 类型

- `WeaponLike`: 武器相关的最小输入结构，包含武器名称、子类型和属性。
- `AttackBonusResult`: 攻击加值计算结果，包含总攻击加值、是否熟练、熟练加值、计算使用的属性、属性调整值、是否灵巧武器、灵巧武器默认选择和加值分解文本。

### 函数

- `isRangedWeapon(weapon: WeaponLike): boolean`: 判断武器是否为远程武器。
- `isFinesseWeapon(weapon: WeaponLike): boolean`: 判断武器是否为灵巧武器。
- `expandWeaponSubtypes(subtype: string): string[]`: 将武器的子类型扩展为有效分类集合。
- `isProficientWith(weapon: WeaponLike, character: Character): boolean`: 判断玩家是否熟练该武器。
- `calcAttackBonus(weapon: WeaponLike, character: Character, finesseChoice?: 'strength' | 'dexterity')`: 计算武器攻击加值。
- `formatAttackBonus(bonus: number): string`: 将数字加值格式化为字符串。

## 核心实现说明

该文件的核心逻辑包括判断武器类型、扩展武器子分类、判断熟练度和计算攻击加值。`isRangedWeapon` 和 `isFinesseWeapon` 函数用于判断武器的类型。`expandWeaponSubtypes` 函数用于处理武器的子类型扩展，以支持游戏规则中的涵盖关系。`isProficientWith` 函数用于判断玩家是否熟练该武器，包括同名匹配和分类匹配。`calcAttackBonus` 函数根据武器类型和角色属性计算攻击加值，并返回详细的计算结果。该文件中的函数被游戏的其他模块引用，以实现攻击加值的计算。

## 注意事项或使用方式

- 使用 `calcAttackBonus` 函数计算攻击加值时，需要提供武器信息和角色信息。
- `finesseChoice` 参数用于指定灵巧武器的属性选择，默认情况下会根据力量和敏捷的调整值选择较高者。
- 使用 `formatAttackBonus` 函数可以将计算得到的攻击加值格式化为字符串形式。
