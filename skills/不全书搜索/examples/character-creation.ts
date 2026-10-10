// 在 DND 5e DM Toolkit 项目中使用 DND5e 权威数据源技能的示例

import { dndDataSource } from '@/skills/dnd-data-integration/src/index';
import { normalizeCharacter } from '@/data/characterStore';
import type { Character } from '@/types';

// 示例1：创建角色时使用权威数据
export async function createCharacterWithAuthoritativeData(
  className: string,
  subclassId?: string,
  level: number = 1
): Promise<Character> {
  // 获取权威的职业数据
  const classData = await dndDataSource.getClass(className);
  if (!classData) {
    throw new Error(`无法找到职业数据: ${className}`);
  }

  // 获取子职业数据
  let subclassData = null;
  if (subclassId) {
    subclassData = await dndDataSource.getSubclass(className, subclassId);
    if (!subclassData) {
      throw new Error(`无法找到子职业数据: ${subclassId}`);
    }
  }

  // 获取该职业可用的法术
  const availableSpells = await dndDataSource.getSpells({
    classes: [className],
    level: level
  });

  // 创建角色数据
  const characterData: Character = {
    id: `char_${Date.now()}`,
    name: '新角色',
    level: level,
    profession: {
      class: classData.id,
      subclass: subclassData?.id
    },
    spells: availableSpells.slice(0, 4), // 根据职业等级选择法术数量
    features: [...classData.features, ...(subclassData?.features || [])],
    equipment: [],
    inventory: [],
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    },
    hitPoints: classData.hitDice === 'd8' ? 8 : 10,
    maxHitPoints: classData.hitDice === 'd8' ? 8 : 10,
    armorClass: 10,
    speed: 30,
    alignment: '中立善良',
    background: '旅者',
    appearance: '普通的外表',
    personality: '友善的性格',
    ideals: '帮助他人',
    bonds: '忠于朋友',
    flaws: '有时过于信任他人'
  };

  // 规范化数据
  return normalizeCharacter(characterData);
}

// 示例2：验证和修复现有角色数据
export async function validateAndFixCharacter(character: Character): Promise<Character> {
  // 验证角色数据
  const validation = await dndDataSource.validateCharacter(character);
  
  if (!validation.valid) {
    console.warn('角色数据验证失败，尝试修复:', validation.errors);
    
    // 修复职业数据
    if (validation.errors.some(error => error.includes('职业数据无效'))) {
      const classData = await dndDataSource.getClass(character.profession?.class || '');
      if (classData) {
        character.profession = {
          ...character.profession!,
          class: classData.id
        };
      }
    }

    // 修复子职业数据
    if (character.profession?.subclass) {
      const subclassData = await dndDataSource.getSubclass(
        character.profession?.class || '',
        character.profession?.subclass
      );
      if (!subclassData) {
        character.profession.subclass = undefined;
        console.warn('移除了无效的子职业');
      }
    }

    // 修复法术数据
    if (character.spells && character.spells.length > 0) {
      const validSpells = [];
      for (const spell of character.spells) {
        const spellData = await dndDataSource.getSpell(spell.id);
        if (spellData) {
          validSpells.push(spell);
        } else {
          console.warn(`移除了无效的法术: ${spell.id}`);
        }
      }
      character.spells = validSpells;
    }
  }

  // 重新规范化数据
  return normalizeCharacter(character);
}

// 示例3：生成角色报告
export async function generateCharacterReport(character: Character): Promise<{
  summary: string;
  details: Record<string, any>;
  validation: any;
}> {
  // 获取权威数据
  const classData = await dndDataSource.getClass(character.profession?.class || '');
  const subclassData = character.profession?.subclass 
    ? await dndDataSource.getSubclass(character.profession?.class || '', character.profession?.subclass)
    : null;

  // 获取法术详情
  const spellDetails = await Promise.all(
    character.spells.map(async spell => {
      const spellData = await dndDataSource.getSpell(spell.id);
      return spellData;
    })
  );

  // 生成报告
  const report = {
    summary: `${classData?.displayName} ${subclassData ? `(${subclassData.displayName})` : ''} - ${character.level}级`,
    details: {
      class: classData,
      subclass: subclassData,
      spells: spellDetails.filter(spell => spell !== null),
      features: [...(classData?.features || []), ...(subclassData?.features || [])],
      level: character.level,
      hitPoints: character.hitPoints,
      armorClass: character.armorClass
    },
    validation: await dndDataSource.validateCharacter(character)
  };

  return report;
}

// 示例4：为角色推荐法术
export async function recommendSpellsForCharacter(
  character: Character,
  options: {
    level?: number;
    school?: string;
    onlyAvailable?: boolean;
  } = {}
): Promise<Array<{
  spell: any;
  reason: string;
}>> {
  const recommendations = [];

  // 获取角色职业
  const classData = await dndDataSource.getClass(character.profession?.class || '');
  if (!classData) {
    return recommendations;
  }

  // 获取符合条件的法术
  const availableSpells = await dndDataSource.getSpells({
    classes: [classData.name],
    level: options.level || character.level,
    school: options.school
  });

  // 过滤角色已有的法术
  const newSpells = availableSpells.filter(spell => 
    !character.spells.some(existingSpell => existingSpell.id === spell.id)
  );

  // 生成推荐理由
  for (const spell of newSpells) {
    let reason = '';

    // 根据法术等级推荐
    if (spell.level <= character.level) {
      reason += `适合${character.level}级角色，`;
    }

    // 根据法术学派推荐
    if (spell.school) {
      reason += `${spell.school}系法术，`;
    }

    // 根据职业推荐
    if (classData.name) {
      reason += `${classData.displayName}可学习的法术`;
    }

    recommendations.push({
      spell,
      reason: reason.trim()
    });
  }

  return recommendations;
}

// 示例5：批量处理角色数据
export async function batchProcessCharacters(characters: Character[]): Promise<{
  processed: Character[];
  errors: Array<{ character: Character; error: string }>;
  validationResults: Array<{ character: Character; validation: any }>;
}> {
  const processed: Character[] = [];
  const errors: Array<{ character: Character; error: string }> = [];
  const validationResults: Array<{ character: Character; validation: any }> = [];

  for (const character of characters) {
    try {
      // 验证角色数据
      const validation = await dndDataSource.validateCharacter(character);
      validationResults.push({ character, validation });

      if (!validation.valid) {
        // 尝试修复数据
        const fixedCharacter = await validateAndFixCharacter(character);
        processed.push(fixedCharacter);
      } else {
        processed.push(character);
      }
    } catch (error) {
      errors.push({
        character,
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  }

  return {
    processed,
    errors,
    validationResults
  };
}

// 示例6：创建角色创建向导
export async function createCharacterWizard(): Promise<Character> {
  console.log('=== 角色创建向导 ===');
  
  // 1. 选择职业
  console.log('可选职业:');
  const classes = ['吟游诗人', '牧师', '德鲁伊', '战士', '法师'];
  classes.forEach((className, index) => {
    console.log(`${index + 1}. ${className}`);
  });

  // 这里应该有用户输入，我们模拟选择吟游诗人
  const selectedClass = '吟游诗人';
  console.log(`选择职业: ${selectedClass}`);

  // 2. 选择子职业
  const classData = await dndDataSource.getClass(selectedClass);
  const subclasses = classData?.subclasses || [];
  
  if (subclasses.length > 0) {
    console.log('可选子职业:');
    subclasses.forEach((subclass, index) => {
      console.log(`${index + 1}. ${subclass.displayName}`);
    });

    // 模拟选择逸闻学院
    const selectedSubclass = 'college_of_lore';
    console.log(`选择子职业: ${selectedSubclass}`);
  }

  // 3. 设置等级
  const level = 1;
  console.log(`设置等级: ${level}`);

  // 4. 创建角色
  const character = await createCharacterWithAuthoritativeData(
    selectedClass,
    'college_of_lore',
    level
  );

  console.log('角色创建完成!');
  return character;
}

// 示例7：数据质量检查
export async function performDataQualityCheck(): Promise<{
  classes: number;
  subclasses: number;
  spells: number;
  equipment: number;
  validationErrors: number;
}> {
  let validationErrors = 0;

  // 检查职业数据
  const classes = ['吟游诗人', '牧师', '德鲁伊', '战士', '法师'];
  for (const className of classes) {
    const classData = await dndDataSource.getClass(className);
    if (!classData) {
      validationErrors++;
      console.error(`职业数据缺失: ${className}`);
    }
  }

  // 检查法术数据
  const spells = await dndDataSource.getSpells({ level: 1 });
  if (spells.length === 0) {
    validationErrors++;
    console.error('1级法术数据缺失');
  }

  // 检查装备数据
  const equipment = await dndDataSource.getEquipmentByCategory('武器');
  if (equipment.length === 0) {
    validationErrors++;
    console.error('武器装备数据缺失');
  }

  return {
    classes: classes.length,
    subclasses: 0, // 需要实际计算
    spells: spells.length,
    equipment: equipment.length,
    validationErrors
  };
}

// 导出所有工具函数
export const characterUtils = {
  createCharacterWithAuthoritativeData,
  validateAndFixCharacter,
  generateCharacterReport,
  recommendSpellsForCharacter,
  batchProcessCharacters,
  createCharacterWizard,
  performDataQualityCheck
};