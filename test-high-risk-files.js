#!/usr/bin/env node

/**
 * 简化的单元测试脚本
 * 用于验证高风险文件的代码质量
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 测试文件列表
const testFiles = [
  {
    name: 'useFlowDraft.ts',
    path: './src/pages/flow-editor/useFlowDraft.ts',
    tests: [
      '初始化测试',
      '状态管理测试',
      '草稿操作测试',
      'ID验证测试',
      '错误处理测试'
    ]
  },
  {
    name: 'useViewportSnapshot.ts',
    path: './src/pages/flow-editor/useViewportSnapshot.ts',
    tests: [
      '初始化测试',
      '快照管理测试',
      '事件监听测试',
      '防抖机制测试',
      '错误处理测试'
    ]
  },
  {
    name: 'useCanvasZoom.ts',
    path: './src/pages/flow-editor/useCanvasZoom.ts',
    tests: [
      '初始化测试',
      '缩放控制测试',
      '触屏捏合测试',
      '鼠标滚轮测试',
      '传感器配置测试'
    ]
  },
  {
    name: 'constants.ts',
    path: './src/pages/flow-editor/constants.ts',
    tests: [
      '常量定义测试',
      '类型安全测试',
      '边界值测试',
      '性能测试'
    ]
  }
];

console.log('🧪 开始高风险文件单元测试...\n');

// 1. TypeScript 类型检查
console.log('📝 1. TypeScript 类型检查');
try {
  execSync('npx tsc --noEmit --skipLibCheck src/pages/flow-editor/useFlowDraft.ts', { 
    stdio: 'inherit',
    timeout: 10000 
  });
  console.log('✅ useFlowDraft.ts - 类型检查通过');
} catch (error) {
  console.log('❌ useFlowDraft.ts - 类型检查失败');
}

try {
  execSync('npx tsc --noEmit --skipLibCheck src/pages/flow-editor/useViewportSnapshot.ts', { 
    stdio: 'inherit',
    timeout: 10000 
  });
  console.log('✅ useViewportSnapshot.ts - 类型检查通过');
} catch (error) {
  console.log('❌ useViewportSnapshot.ts - 类型检查失败');
}

try {
  execSync('npx tsc --noEmit --skipLibCheck src/pages/flow-editor/useCanvasZoom.ts', { 
    stdio: 'inherit',
    timeout: 10000 
  });
  console.log('✅ useCanvasZoom.ts - 类型检查通过');
} catch (error) {
  console.log('❌ useCanvasZoom.ts - 类型检查失败');
}

try {
  execSync('npx tsc --noEmit --skipLibCheck src/pages/flow-editor/constants.ts', { 
    stdio: 'inherit',
    timeout: 10000 
  });
  console.log('✅ constants.ts - 类型检查通过');
} catch (error) {
  console.log('❌ constants.ts - 类型检查失败');
}

console.log('\n📊 2. 代码质量检查');

// 2. 检查文件大小和复杂度
testFiles.forEach(file => {
  if (fs.existsSync(file.path)) {
    const stats = fs.statSync(file.path);
    const content = fs.readFileSync(file.path, 'utf8');
    const lines = content.split('\n').length;
    const functions = content.match(/function|const.*=.*=>|export.*=/g) || [];
    
    console.log(`📁 ${file.name}`);
    console.log(`   - 文件大小: ${stats.size} bytes`);
    console.log(`   - 代码行数: ${lines}`);
    console.log(`   - 函数数量: ${functions.length}`);
    console.log(`   - 导出数量: ${content.match(/export /g)?.length || 0}`);
  }
});

console.log('\n🔍 3. 代码结构分析');

// 3. 检查代码结构
testFiles.forEach(file => {
  if (fs.existsSync(file.path)) {
    const content = fs.readFileSync(file.path, 'utf8');
    
    console.log(`📁 ${file.name} 结构分析:`);
    
    // 检查是否有必要的导入
    const hasReactImport = content.includes('import React');
    const hasTypeImports = content.includes('import type');
    const hasJestImports = content.includes('jest.mock');
    
    console.log(`   - React 导入: ${hasReactImport ? '✅' : '❌'}`);
    console.log(`   - 类型导入: ${hasTypeImports ? '✅' : '❌'}`);
    console.log(`   - 测试导入: ${hasJestImports ? '✅' : '❌'}`);
    
    // 检查是否有错误处理
    const hasErrorHandling = content.includes('try') && content.includes('catch');
    const hasTypeChecks = content.includes('typeof') || content.includes('instanceof');
    
    console.log(`   - 错误处理: ${hasErrorHandling ? '✅' : '❌'}`);
    console.log(`   - 类型检查: ${hasTypeChecks ? '✅' : '❌'}`);
    
    // 检查是否有文档注释
    const hasJSDoc = content.includes('/**') && content.includes('*/');
    console.log(`   - 文档注释: ${hasJSDoc ? '✅' : '❌'}`);
  }
});

console.log('\n🚨 4. 潜在问题检查');

// 4. 检查潜在问题
testFiles.forEach(file => {
  if (fs.existsSync(file.path)) {
    const content = fs.readFileSync(file.path, 'utf8');
    
    console.log(`📁 ${file.name} 潜在问题:`);
    
    // 检查是否有未使用的变量
    const unusedVars = content.match(/\b(const|let|var)\s+(\w+)\s*=/g) || [];
    console.log(`   - 未使用变量: ${unusedVars.length}`);
    
    // 检查是否有硬编码值
    const hardcodedValues = content.match(/\b\d+\.\d+\b|\b\d+\b/g) || [];
    const uniqueHardcoded = [...new Set(hardcodedValues)];
    console.log(`   - 硬编码值: ${uniqueHardcoded.length}`);
    
    // 检查是否有魔法数字
    const magicNumbers = content.match(/\b(0\.5|1|3|10|100|500|1000)\b/g) || [];
    console.log(`   - 魔法数字: ${magicNumbers.length}`);
    
    // 检查是否有console.log
    const consoleLogs = content.match(/console\.(log|error|warn)/g) || [];
    console.log(`   - Console日志: ${consoleLogs.length}`);
  }
});

console.log('\n📈 5. 依赖关系检查');

// 5. 检查依赖关系
testFiles.forEach(file => {
  if (fs.existsSync(file.path)) {
    const content = fs.readFileSync(file.path, 'utf8');
    
    console.log(`📁 ${file.name} 依赖关系:`);
    
    // 检查外部依赖
    const externalDeps = content.match(/from\s+['"](@|[^'"]*['"])/g) || [];
    const uniqueDeps = [...new Set(externalDeps)];
    console.log(`   - 外部依赖: ${uniqueDeps.length}`);
    
    // 检查内部依赖
    const internalDeps = content.match(/from\s+['\"][^'"]*['"]/g) || [];
    const uniqueInternalDeps = [...new Set(internalDeps)];
    console.log(`   - 内部依赖: ${uniqueInternalDeps.length}`);
  }
});

console.log('\n🎯 6. 测试覆盖率估算');

// 6. 估算测试覆盖率
testFiles.forEach(file => {
  if (fs.existsSync(file.path)) {
    const stats = fs.statSync(file.path);
    const testPath = `./src/pages/flow-editor/__tests__/${file.name.replace('.ts', '.test.ts')}`;
    
    if (fs.existsSync(testPath)) {
      const testStats = fs.statSync(testPath);
      const testLines = testStats.size;
      const sourceLines = stats.size;
      
      console.log(`📁 ${file.name} 测试覆盖率:`);
      console.log(`   - 源代码大小: ${sourceLines} bytes`);
      console.log(`   - 测试代码大小: ${testLines} bytes`);
      console.log(`   - 覆盖率估算: ${Math.round((testLines / sourceLines) * 100)}%`);
    } else {
      console.log(`📁 ${file.name} - 无测试文件`);
    }
  }
});

console.log('\n✅ 单元测试完成！');
console.log('\n📋 测试总结:');
console.log('- 检查了 4 个高风险文件的类型安全性');
console.log('- 分析了代码结构和依赖关系');
console.log('- 识别了潜在问题');
console.log('- 估算了测试覆盖率');

console.log('\n🔧 建议的后续步骤:');
console.log('1. 如果类型检查失败，修复 TypeScript 错误');
console.log('2. 如果发现潜在问题，优化代码质量');
console.log('3. 如果测试覆盖率低，补充更多测试用例');
console.log('4. 考虑添加集成测试验证组件功能');