# src/data/characterStore.ts

## 功能概述

该文件 `src/data/characterStore.ts` 负责管理角色数据，包括角色的创建、读取、更新、删除等操作。它还处理角色数据的持久化，包括将角色数据存储到本地存储（localStorage）和与后端API同步。此外，它还提供了各种工具函数来计算角色属性、处理货币和背包，以及管理角色卡库的导入和导出。

## 主要导出/接口

| 类型/函数/组件/Store/常量 | 签名或结构 |
|---|---|
| `getAuthHeaders` | `function(): Record<string, string>` |
| `STORAGE_KEY`, `BACKUP_KEY`, `BACKUP_INTERVAL` | `const` |
| `charactersCache` | `let charactersCache: Character[] | null` |
| `migrateCharacter` | `function(char: any): Character` |
| `migrateStore` | `function(chars: any[]): Character[]` |
| `getStore` | `function(): Character[]` |
| `saveStore` | `function(store: Character[]): void` |
| `getAllCharacters` | `function(): Character[]` |
| `getCharacter` | `function(charId: string): Character | null` |
| `saveCharacter` | `function(charData: Character): Character` |
| `syncCharacterToBackend` | `async function(char: Character): Promise<void>` |
| `loadAllFromBackend` | `async function(): Promise<Character[]>` |
| `replaceAllFromBackend` | `async function(): Promise<Character[]>` |
| `scheduleBackup` | `function(): void` |
| `createBackup` | `function(): void` |
| `getBackup` | `function(): { timestamp: number; data: Character[] } | null` |
| `restoreFromBackup` | `function(): Character[]` |
| `priceToCopper` | `function(price: { amount: number; unit: 'pp' | 'gp' | 'sp' | 'cp' }): number` |
| `getEquipmentValue` | `function(item: Equipment): number` |
| `currencyToCopper` | `function(c: Currency): number` |
| `copperToCurrency` | `function(totalCp: number): Currency` |
| `canAfford` | `function(c: Currency, totalCp: number): boolean` |
| `deductCurrency` | `function(c: Currency, totalCp: number): Currency` |
| `getEquipmentWeight` | `function(item: Equipment): number` |
| `getTotalWeight` | `function(char: Character): number` |
| `getEquipmentValueCopper` | `function(item: Equipment): number` |
| `getTotalValueCopper` | `function(char: Character): number` |
| `generateId` | `function(): string` |
| `generateFileName` | `function(char: Character): string` |
| `createBlankCharacter` | `function(name?: string): Character` |
| `addCharacter` | `function(characterData: Partial<Character>): Character` |
| `deleteCharacter` | `function(charId: string): void` |
| `updateCharacter` | `function(charId: string, updatedData: Partial<Character>): Character | null` |
| `exportSingleCharacter` | `function(charId: string): void` |
| `exportAllCharacters` | `function(): void` |
| `exportSelectedCharacters` | `function(charIds: string[]): void` |
| `importSingleCharacter` | `function(file: File): Promise<Character>` |
| `importMultipleCharacters` | `function(files: FileList | File[]): Promise<Character[]>` |
| `createImportDialog` | `function(accept = '.json', multiple = true): Promise<Character[]>` |
| `exportAllWithConfirm` | `function(): void` |
| `addAttack` | `function(charId: string, attackData: Partial<Attack>): Attack | null` |
| `updateAttack` | `function(charId: string, attackId: string, updatedData: Partial<Attack>): Attack | null` |
| `deleteAttack` | `function(charId: string, attackId: string): void` |
| `addEquipment` | `function(charId: string, equipData: Partial<Equipment>): Equipment | null` |
| `updateEquipment` | `function(charId: string, equipId: string, updatedData: Partial<Equipment>): Equipment | null` |
| `deleteEquipment` | `function(charId: string, equipId: string): void` |
| `addFeature` | `function(charId: string, featureData: Partial<Feature>): Feature | null` |
| `updateFeature` | `function(charId: string, featureId: string, updatedData: Partial<Feature>): Feature | null` |
| `deleteFeature` | `function(charId: string, featureId: string): void` |
| `addCantrip` | `function(charId: string, cantripName: string): string[] | null` |
| `removeCantrip` | `function(charId: string, index: number): void` |
| `addCustomSpell` | `function(charId: string, spellName: string): string[] | null` |
| `removeCustomSpell` | `function(charId: string, index: number): void` |
| `updateSpellSlots` | `function(charId: string, levelKey: SpellSlotLevel, slotData: { max?: number; used?: number }): { max: number; used: number } | null` |
| `addProficiency` | `function(charId: string, category: ProficiencyCategory, item: string): string[] | null` |
| `removeProficiency` | `function(charId: string, category: ProficiencyCategory, index: number): void` |
| `updateProficiency` | `function(charId: string, category: ProficiencyCategory, index: number, value: string): void` |
| `updateSkill` | `function(charId: string, skillKey: SkillKey, updates: Partial<{ proficient: boolean; extra: number }>): { proficient: boolean; extra: number } | null` |
| `calcModifier` | `function(score: number): number` |
| `calcPassivePerception` | `function(char: Character): number` |
| `recalculateArmorClass` | `function(char: Character, combatInventory?: Equipment[]): void` |
| `isTwoHandedWeapon` | `function(item: Equipment): boolean` |
| `canBeHeld` | `function(char: Character, item: Equipment): boolean` |
| `isWeaponUsable` | `function(char: Character, hand: 'left' | 'right', combatInventory?: Equipment[]): boolean` |
| `holdItem` | `function(charId: string, equipId: string, hand: 'left' | 'right' | 'auto' = 'auto', combatInventory?: Equipment[]): { success: boolean; message: string }` |
| `unholdItem` | `function(charId: string, hand: 'left' | 'right' | 'both'): { success: boolean; message: string }` |
| `setHandAction` | `function(charId: string, hand: 'left' | 'right' | 'both'): { success: boolean; message: string }` |
| `endHandAction` | `function(charId: string, hand: 'left' | 'right' | 'both'): { success: boolean; message: string }` |
| `setHandUnavailable` | `function(charId: string, hand: 'left' | 'right' | 'both'): { success: boolean; message: string }` |
| `restoreHand` | `function(charId: string, hand: 'left' | 'right' | 'both'): { success: boolean; message: string }` |
| `getGroupedSkills` | `function(char: Character): { attribute: AbilityKey; attributeLabel: string; save: { key: AbilityKey; label: string; proficient: boolean; expertise: boolean; bonus: number; modifier: number; overridden: boolean }; skills: { key: SkillKey; label: string; proficient: boolean; expertise: boolean; bonus: number; extra: number }[] }[]` |
| `getSkillBonus` | `function(char: Character, skillKey: SkillKey): number` |
| `getSaveBonus` | `function(char: Character, saveKey: AbilityKey): number` |
| `getAllSkillBonuses` | `function(char: Character): { key: SkillKey; label: string; bonus: number; proficient: boolean }[]` |
| `getAllSaveBonuses` | `function(char: Character): { key: AbilityKey; label: string; bonus: number; proficient: boolean }[]` |
| `toggleSkillProficiency` | `function(charId: string, skillKey: SkillKey): void` |
| `toggleSaveProficiency` | `function(charId: string, saveKey: AbilityKey): void` |
| `toggleSkillExpertise` | `function(charId: string, skillKey: SkillKey): void` |
| `toggleSaveExpertise` | `function(charId: string, saveKey: AbilityKey): void` |
| `setSaveBonusOverride` | `function(charId: string, saveKey: AbilityKey, value: number | null): void` |
| `setSkillProficiencies` | `function(charId: string, skillKeys: SkillKey[]): void` |
| `getSkillsList` | `function(char: Character): { key: SkillKey; name: string; totalBonus: number; proficient: boolean }[]` |
| `getLevelFromExp` | `function(exp: number): number` |
| `getNextLevelInfo` | `function(currentExp: number): { currentLevel: number; nextLevel: number; expNeeded: number; expProgress: number; expRemaining: number }` |
| `calculateLevelsForCharacters` | `function(characters: Character[]): (Character & { level: number })[]` |
| `canLevelUp` | `function(exp: number): boolean` |
| `hasSpellcasting` | `function(char: Character): boolean` |
| `getSpellcastingAbility` | `function(char: Character): AbilityKey | null` |
| `getSpellAttackBonus` | `function(char: Character): number | null` |
| `getSpellSaveDC` | `function(char: Character): number | null` |
| `getCasterType` | `function(char: Character): string` |
| `getCasterTypeLabel` | `function(char: Character): string | null` |
| `getSpellSlotsByLevel` | `function(char: Character): { slots: number[]; maxLevel: number; casterType: string; ability: AbilityKey; slotLevel?: number; knownSpells?: number; mysticArcanum?: number } | null` |
| `getSpellSlotDisplayData` | `function(char: Character): { ability: AbilityKey; abilityLabel: string; casterTypeLabel: string; spellSlots: { level: number; label: string; max: number; used: number; available: number; isWarlock?: boolean }[]; maxLevel: number; casterType: string; knownSpells?: number; mysticArcanum?: number } | null` |
| `resetSpellSlots` | `function(charId: string): void` |
| `shouldShowSpellSlots` | `function(char: Character): boolean` |
| `addEquipment` | `function(charId: string, equipData: Partial<Equipment>): Equipment | null` |
| `updateEquipment` | `function(charId: string, equipId: string, updatedData: Partial<Equipment>): Equipment | null` |
| `deleteEquipment` | `function(charId: string, equipId: string): void` |
| `addFeature` | `function(charId: string, featureData: Partial<Feature>): Feature | null` |
| `updateFeature` | `function(charId: string, featureId: string, updatedData: Partial<Feature>): Feature | null` |
| `deleteFeature` | `function(charId: string, featureId: string): void` |
| `addCantrip` | `function(charId: string, cantripName: string): string[] | null` |
| `removeCantrip` | `function(charId: string, index: number): void` |
| `addCustomSpell` | `function(charId: string, spellName: string): string[] | null` |
| `removeCustomSpell` | `function(charId: string, index: number): void` |
| `updateSpellSlots` | `function(charId: string, levelKey: SpellSlotLevel, slotData: { max?: number; used?: number }): { max: number; used: number } | null` |
| `addProficiency` | `function(charId: string, category: ProficiencyCategory, item: string): string[] | null` |
| `removeProficiency` | `function(charId: string, category: ProficiencyCategory, index: number): void` |
| `updateProficiency` | `function(charId: string, category: ProficiencyCategory, index: number, value: string): void` |
| `updateSkill` | `function(charId: string, skillKey: SkillKey, updates: Partial<{ proficient: boolean; extra: number }>): { proficient: boolean; extra: number } | null` |
| `syncCharacterToBackend` | `async function(char: Character): Promise<void>` |
| `loadAllFromBackend` | `async function(): Promise<Character[]>` |
| `replaceAllFromBackend` | `async function(): Promise<Character[]>` |
| `wearEquipment` | `function(charId: string, equipId: string): void` |
| `unwearEquipment` | `function(charId: string, equipId: string): void` |
| `holdItem` | `function(charId: string, equipId: string, hand: 'left' | 'right' | 'auto' = 'auto', combatInventory?: Equipment[]): { success: boolean; message: string }` |
| `unholdItem` | `function(charId: string, hand: 'left' | 'right' | 'both'): { success: boolean; message: string }` |

## 核心实现说明

该文件的核心功能是管理角色数据，包括：

* **存储层**：使用本地存储（localStorage）来存储角色数据，并提供缓存机制来提高性能。
* **数据迁移**：将旧格式的角色数据迁移到新格式，以支持新的功能和改进的数据结构。
* **后端 API 同步**：与后端 API 进行交互，以同步角色数据。
* **工具函数**：提供各种工具函数来计算角色属性、处理货币和背包，以及管理角色卡库的导入和导出。
* **角色卡库 CRUD**：提供创建、读取、更新、删除角色卡的功能。
* **子项 CRUD**：提供创建、读取、更新、删除角色攻击、装备、特性等子项的功能。
* **计算辅助**：提供计算角色属性、技能、豁免等辅助函数。
* **法术位系统**：管理角色法术位，包括计算法术位数量、重置法术位等。
* **手持/放下**：管理角色手持装备，包括拿起、放下、设置动作等操作。

## 注意事项或使用方式

* 所有写操作都必须经过 `saveStore()` 或 `saveCharacter()` 函数，否则缓存不会失效。
* 使用 `getCharacter()` 函数时，需要传入角色的 ID。
* 使用 `saveCharacter()` 函数时，需要传入角色的数据。
* 使用 `syncCharacterToBackend()` 函数时，需要传入角色的数据。
* 使用 `loadAllFromBackend()` 函数时，可以从后端加载所有角色。
* 使用 `replaceAllFromBackend()` 函数时，可以从后端加载所有角色并替换本地缓存。
* 使用 `createBackup()` 函数时，可以创建角色数据的备份。
* 使用 `getBackup()` 函数时，可以获取角色数据的备份。
* 使用 `restoreFromBackup()` 函数时，可以从备份中恢复角色数据。
* 使用 `exportSingleCharacter()` 函数时，可以导出单个角色卡。
* 使用 `exportAllCharacters()` 函数时，可以导出所有角色卡。
* 使用 `exportSelectedCharacters()` 函数时，可以导出选中的角色卡。
* 使用 `importSingleCharacter()` 函数时，可以导入单个角色卡。
* 使用 `importMultipleCharacters()` 函数时，可以导入多个角色卡。
* 使用 `createImportDialog()` 函数时，可以创建导入对话框。
* 使用 `exportAllWithConfirm()` 函数时，可以导出所有角色卡，并提示用户确认。
* 使用 `addAttack()` 函数时，可以添加角色攻击。
* 使用 `updateAttack()` 函数时，可以更新角色攻击。
* 使用 `deleteAttack()` 函数时，可以删除角色攻击。
* 使用 `addEquipment()` 函数时，可以添加角色装备。
* 使用 `updateEquipment()` 函数时，可以更新角色装备。
* 使用 `deleteEquipment()` 函数时，可以删除角色装备。
* 使用 `addFeature()` 函数时，可以添加角色特性。
* 使用 `updateFeature()` 函数时，可以更新角色特性。
* 使用 `deleteFeature()` 函数时，可以删除角色特性。
* 使用 `addCantrip()` 函数时，可以添加角色戏法。
* 使用 `removeCantrip()` 函数时，可以删除角色戏法。
* 使用 `addCustomSpell()` 函数时，可以添加角色自定义法术。
* 使用 `removeCustomSpell()` 函数时，可以删除角色自定义法术。
* 使用 `updateSpellSlots()` 函数时，可以更新角色法术位。
* 使用 `addProficiency()` 函数时，可以添加角色熟练项。
* 使用 `removeProficiency()` 函数时，可以删除角色熟练项。
* 使用 `updateProficiency()` 函数时，可以更新角色熟练项。
* 使用 `updateSkill()` 函数时，可以更新角色技能。
* 使用 `syncCharacterToBackend()` 函数时，可以将角色数据同步到后端。
* 使用 `loadAllFromBackend()` 函数时，可以从后端加载所有角色。
* 使用 `replaceAllFromBackend()` 函数时，可以从后端加载所有角色并替换本地缓存。
* 使用 `wearEquipment()` 函数时，可以将装备穿戴到角色身上。
* 使用 `unwearEquipment()` 函数时，可以将装备从角色身上卸下。
* 使用 `holdItem()` 函数时，可以将物品拿起。
* 使用 `unholdItem()` 函数时，可以将物品放下。
* 使用 `isTwoHandedWeapon()` 函数时，可以判断装备是否为双手武器。
* 使用 `canBeHeld()` 函数时，可以判断装备是否可以手持。
* 使用 `isWeaponUsable()` 函数时，可以判断武器是否可用。
* 使用 `setHandAction
