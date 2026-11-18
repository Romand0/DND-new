/**
 * 特性描述提取器 TS 包装（feature-fullcycle P2）。
 * 核心正则集与置信度规则在 featureExtractCore.mjs（UI 与批量脚本共用单一实现），
 * 此处仅做 TS 类型面与 React 侧便捷封装。
 */
import { extractFeature, REGISTRY_NAMES, SPEC_CHANNEL_SET } from './featureExtractCore.mjs';
import type { ExtractResult, ExtractCandidate, ExtractHit, ExtractGuess, ExtractHighlight } from './featureExtractCore.mjs';
import { validateFeatureSpecDb } from '../../plugins/featureSpecSchema.mjs';

export type { ExtractResult, ExtractCandidate, ExtractHit, ExtractGuess, ExtractHighlight };

/** UI 单项提取（CharacterDetail 特性卡入口） */
export function runFeatureExtract(featureName: string, description: string): ExtractResult {
  return extractFeature(featureName, description ?? '');
}

/** UI 生成前单项校验：draft 条目 → 错误清单（去掉 [name] 前缀） */
export function validateSpecDraft(featureName: string, entry: unknown): string[] {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return ['spec 条目需为 JSON 对象'];
  return validateFeatureSpecDb({ [featureName]: entry }).map(e => e.replace(`[${featureName}] `, ''));
}

export { REGISTRY_NAMES, SPEC_CHANNEL_SET };
