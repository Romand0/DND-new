/** src/data/featureExtractCore.mjs 的类型声明（UI / 批量脚本共用模块） */
export interface ExtractHit {
  field: string;
  text: string;
  label: string;
}
export interface ExtractHighlight {
  text: string;
  start: number;
}
export interface ExtractCandidate {
  highlight: ExtractHighlight | null;
  channel: 'heal' | 'resource_conv';
  spec: Record<string, unknown>;
  hits: ExtractHit[];
  confidence: number;
  manual: boolean;
  manualReason: string | null;
}
export interface ExtractGuess {
  channel: string;
  reason: string;
}
export interface ExtractResult {
  name: string;
  textLength: number;
  guess: ExtractGuess | null;
  candidates: ExtractCandidate[];
}
export declare function extractFeature(name: string, text: string): ExtractResult;
export declare const REGISTRY_NAMES: string[];
export declare const SPEC_CHANNEL_SET: Set<string>;
