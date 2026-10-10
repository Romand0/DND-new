// 实践使用 DND5e 权威数据源技能查询鸟妖信息
import { dndDataSource } from './skills/dnd-data-integration/src/index';

async function queryHarpyInfo() {
  console.log('=== 查询鸟妖信息 ===');
  
  try {
    // 1. 查询鸟妖详细信息
    console.log('\n1. 查询鸟妖详细信息...');
    const harpy = await dndDataSource.getMonster('harpy');
    
    if (!harpy) {
      console.log('未找到鸟妖数据');
      return;
    }
    
    console.log('鸟妖基本信息:');
    console.log(`- 名称: ${harpy.displayName}`);
    console.log(`- 类型: ${harpy.size} ${harpy.type}`);
    console.log(`- 阵营: ${harpy.alignment}`);
    console.log(`- AC: ${harpy.armorClass}`);
    console.log(`- HP: ${harpy.hitPoints}`);
    console.log(`- 生命骰: ${harpy.hitDice}`);
    console.log(`- 速度: ${harpy.speed}`);
    console.log(`- 挑战等级: ${harpy.challengeRating}`);
    console.log(`- 经验值: ${harpy.experience}`);
    
    // 2. 属性值
    console.log('\n2. 属性值:');
    const abilities = harpy.abilities;
    console.log(`- 力量: ${abilities.strength}`);
    console.log(`- 敏捷: ${abilities.dexterity}`);
    console.log(`- 体质: ${abilities.constitution}`);
    console.log(`- 智力: ${abilities.intelligence}`);
    console.log(`- 感知: ${abilities.wisdom}`);
    console.log(`- 魅力: ${abilities.charisma}`);
    
    // 3. 豁免和技能
    console.log('\n3. 豁免和技能:');
    console.log('豁免:');
    Object.entries(harpy.savingThrows).forEach(([ability, bonus]) => {
      console.log(`- ${ability}: +${bonus}`);
    });
    
    console.log('技能:');
    Object.entries(harpy.skills).forEach(([skill, bonus]) => {
      console.log(`- ${skill}: +${bonus}`);
    });
    
    // 4. 特殊能力
    console.log('\n4. 特殊能力:');
    harpy.specialAbilities.forEach((ability, index) => {
      console.log(`${index + 1}. ${ability.name}`);
      console.log(`   ${ability.description}`);
    });
    
    // 5. 攻击行动
    console.log('\n5. 攻击行动:');
    harpy.actions.forEach((action, index) => {
      console.log(`${index + 1}. ${action.name}`);
      if (action.attackBonus) {
        console.log(`   命中: +${action.attackBonus}`);
      }
      if (action.damage) {
        console.log(`   伤害: ${action.damage}`);
      }
      console.log(`   描述: ${action.description}`);
    });
    
    // 6. 生成战术建议
    console.log('\n6. 战术建议:');
    const tactics = [
      '利用飞行能力保持距离，避免近战',
      '使用迷人歌声魅惑远程攻击的敌人',
      '优先攻击看起来最弱的敌人',
      '如果生命值过低，优先撤退',
      '配合其他怪物进行围攻'
    ];
    tactics.forEach((tactic, index) => {
      console.log(`${index + 1}. ${tactic}`);
    });
    
    // 7. 战利品建议
    console.log('\n7. 战利品建议:');
    const loot = [
      '鸟妖可能携带金币和装备',
      '鸟妖的羽毛可用于制作魔法物品',
      '鸟妖的歌声可能被记录用于魔法研究',
      '鸟妖的爪子可用于制作武器或护身符'
    ];
    loot.forEach((item, index) => {
      console.log(`${index + 1}. ${item}`);
    });
    
    // 8. 生成战斗卡
    console.log('\n8. 战斗卡:');
    const combatCard = generateCombatCard(harpy);
    console.log(combatCard);
    
  } catch (error) {
    console.error('查询鸟妖信息时出错:', error);
  }
}

// 生成战斗卡
function generateCombatCard(monster: any): string {
  return `
# ${monster.displayName}

**类型**: ${monster.size} ${monster.type}  
**阵营**: ${monster.alignment}  
**AC**: ${monster.armorClass}  
**HP**: ${monster.hitPoints} (${monster.hitDice})  
**速度**: ${monster.speed}

## 属性值
| 力量 | 敏捷 | 体质 | 智力 | 感知 | 魅力 |
|------|------|------|------|------|------|
| ${monster.abilities.strength} | ${monster.abilities.dexterity} | ${monster.abilities.constitution} | ${monster.abilities.intelligence} | ${monster.abilities.wisdom} | ${monster.abilities.charisma} |

## 攻击
${monster.actions.map(action => 
  `- **${action.name}**: +${action.attackBonus || 0} 命中，伤害 ${action.damage || '无'}`
).join('\n')}

## 特殊能力
${monster.specialAbilities.map(ability => 
  `- **${ability.name}**: ${ability.description}`
).join('\n')}

## 挑战等级: ${monster.challengeRating} (经验值: ${monster.experience})
`;
}

// 按条件查询怪物
async function queryMonstersByConditions() {
  console.log('\n=== 按条件查询怪物 ===');
  
  try {
    // 查询所有中型怪物
    console.log('\n1. 查询所有中型怪物...');
    const mediumMonsters = await dndDataSource.getMonsters({ size: '中型' });
    console.log(`找到 ${mediumMonsters.length} 个中型怪物`);
    
    // 查询混乱邪恶的怪物
    console.log('\n2. 查询混乱邪恶的怪物...');
    const evilMonsters = await dndDataSource.getMonsters({ alignment: '混乱邪恶' });
    console.log(`找到 ${evilMonsters.length} 个混乱邪恶的怪物`);
    
    // 查询挑战等级为1的怪物
    console.log('\n3. 查询挑战等级为1的怪物...');
    const cr1Monsters = await dndDataSource.getMonsters({ challengeRating: '1' });
    console.log(`找到 ${cr1Monsters.length} 个挑战等级为1的怪物`);
    
  } catch (error) {
    console.error('按条件查询怪物时出错:', error);
  }
}

// 获取怪物类型列表
async function getMonsterTypes() {
  console.log('\n=== 获取怪物类型列表 ===');
  
  try {
    const types = await dndDataSource.getMonsterTypes();
    console.log('所有怪物类型:');
    types.forEach((type, index) => {
      console.log(`${index + 1}. ${type}`);
    });
  } catch (error) {
    console.error('获取怪物类型时出错:', error);
  }
}

// 执行查询
async function main() {
  await queryHarpyInfo();
  await queryMonstersByConditions();
  await getMonsterTypes();
}

// 运行主函数
main().catch(console.error);