/** plugins/featureSpecSchema.mjs 的类型声明（vite.config.ts 构建期门禁消费） */
export declare function validateFeatureSpecDb(raw: unknown): string[];
export declare function collectSeedFeatureNames(root?: string): Set<string>;
export declare function validateFull(root?: string): string[];
export declare const SPEC_CHANNELS: string[];
export declare const SPEC_SOURCES: string[];
